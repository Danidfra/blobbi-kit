/**
 * World travel's relays (`WorldTravelRelays`, `@blobbi-kit/core`) over a
 * Nostrify-style pool, without importing Nostrify: any pool with
 * `relay(url)` returning `query`, `event` and `req` fits (Nostrify's `NPool`
 * does). Each relay is asked and written to on its own, which a complete read
 * and an honest count of acceptances need; the pool's own fan-out cannot say
 * which relay answered.
 *
 * The live stream is one `req` per relay. A relay whose stream ends (closed,
 * dropped, refused) is subscribed again after a pause, and the session is
 * told to look again (`onReconnect`), so a move made while it was gone is
 * found. Events are passed on untrusted: the session checks them.
 *
 * The pause (B3): a stream counts as healthy only when it stayed open
 * `TRAVEL_STREAM_HEALTHY_MS` after its EOSE. A healthy stream that ends is
 * followed again after the shortest step; one that ends sooner (a relay that
 * closes subscriptions right after EOSE, drops idle ones, or a proxy that cuts
 * long REQs), or never reached EOSE, grows the pause step by step
 * (`TRAVEL_STREAM_BACKOFF_MS`, capped at 5 minutes). Every pause has equal
 * jitter (between half and all of its step), so relays and devices do not
 * reconnect in step. While the page is hidden nothing is re-subscribed (open
 * streams stay open); when it is shown again, or the device comes back
 * online, every relay that is not streaming is followed at once with the
 * pause reset.
 */
import type { NostrEvent, NostrFilter } from '@blobbi-kit/core/nostr-protocol';
import type { WorldTravelRelays } from '@blobbi-kit/core/world-travel-session';

export interface TravelRelayLike {
  query(filters: NostrFilter[], opts: { signal: AbortSignal }): Promise<NostrEvent[]>;
  event(event: NostrEvent, opts: { signal: AbortSignal }): Promise<unknown>;
  req(filters: NostrFilter[], opts: { signal: AbortSignal }): AsyncIterable<unknown>;
}

export interface TravelPoolLike {
  relay(url: string): TravelRelayLike;
}

export interface PoolWorldTravelOptions {
  /** A relay's stream came back after ending: look again (a move may have been missed). */
  onReconnect?: () => void;
  /** Test seams. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** The clock (ms). Default `Date.now`. */
  now?: () => number;
  /** A number in [0, 1) for the jitter. Default `Math.random`. */
  random?: () => number;
  /** Whether the page is hidden. Default: `document.visibilityState === 'hidden'`; never hidden outside a browser. */
  isHidden?: () => boolean;
  /**
   * Calls `wake` whenever following should resume at once (the page is shown,
   * the device is back online); returns an unsubscribe. Default: the
   * document's `visibilitychange` (when visible) and the window's `online`.
   */
  onWake?: (wake: () => void) => () => void;
}

/** The pause before following a relay again, by consecutive failed streams (ms); the last is the cap. Each is jittered to between half and all of it. */
export const TRAVEL_STREAM_BACKOFF_MS: readonly number[] = [2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000];

/** How long a stream must stay open after its EOSE to count as healthy, so that its end resets the pause (ms). */
export const TRAVEL_STREAM_HEALTHY_MS = 30_000;

const defaultIsHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function defaultOnWake(wake: () => void): () => void {
  const doc = typeof document !== 'undefined' ? document : null;
  const win = typeof window !== 'undefined' ? window : null;
  const onVisible = () => {
    if (doc?.visibilityState === 'visible') wake();
  };
  doc?.addEventListener('visibilitychange', onVisible);
  win?.addEventListener('online', wake);
  return () => {
    doc?.removeEventListener('visibilitychange', onVisible);
    win?.removeEventListener('online', wake);
  };
}

export function poolWorldTravelRelays(pool: TravelPoolLike, urls: readonly string[], o: PoolWorldTravelOptions = {}): WorldTravelRelays {
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const now = o.now ?? (() => Date.now());
  const random = o.random ?? (() => Math.random());
  const isHidden = o.isHidden ?? defaultIsHidden;
  const onWake = o.onWake ?? defaultOnWake;
  return {
    urls,
    query: (url, filter, signal) => pool.relay(url).query([{ ...filter }], { signal }),
    async publish(url, event, signal) {
      try {
        await pool.relay(url).event(event, { signal });
      } catch (error) {
        // NIP-01: the relay already holds this very event
        if (error instanceof Error && /^duplicate:/i.test(error.message)) return;
        throw error;
      }
    },
    subscribe(filters, onEvent) {
      let stopped = false;
      const controllers = new Set<AbortController>();
      /** Per relay: consecutive failed streams, the pending timer, whether a stream is open, whether one was ever opened. */
      const state = new Map(urls.map((url) => [url, { failures: 0, timer: null as unknown, open: false, opened: false }]));
      const follow = async (url: string): Promise<void> => {
        const st = state.get(url)!;
        if (stopped || st.open) return;
        const reconnect = st.opened;
        // Hidden: nothing is re-subscribed (the first stream still opens); the next wake follows this relay again
        if (reconnect && isHidden()) return;
        st.open = true;
        st.opened = true;
        const controller = new AbortController();
        controllers.add(controller);
        let eoseAt: number | null = null;
        try {
          for await (const msg of pool.relay(url).req(filters.map((f) => ({ ...f })), { signal: controller.signal })) {
            if (stopped) break;
            if (!Array.isArray(msg)) continue;
            if (msg[0] === 'EVENT') onEvent(msg[2]);
            else if (msg[0] === 'EOSE') {
              if (eoseAt === null) eoseAt = now();
              if (reconnect) o.onReconnect?.();
            } else if (msg[0] === 'CLOSED') break;
          }
        } catch {
          /* the stream ended: subscribed again below */
        } finally {
          controllers.delete(controller);
          st.open = false;
        }
        if (stopped) return;
        const healthy = eoseAt !== null && now() - eoseAt >= TRAVEL_STREAM_HEALTHY_MS;
        st.failures = healthy ? 1 : st.failures + 1;
        const step = TRAVEL_STREAM_BACKOFF_MS[Math.min(st.failures - 1, TRAVEL_STREAM_BACKOFF_MS.length - 1)];
        const wait = Math.round(step / 2 + random() * (step / 2));
        st.timer = setTimer(() => {
          st.timer = null;
          void follow(url);
        }, wait);
      };
      const wake = () => {
        if (stopped) return;
        for (const [url, st] of state) {
          if (st.open) continue;
          if (st.timer !== null) clearTimer(st.timer);
          st.timer = null;
          st.failures = 0;
          void follow(url);
        }
      };
      const unwake = onWake(wake);
      for (const url of urls) void follow(url);
      return () => {
        stopped = true;
        unwake();
        for (const c of controllers) c.abort();
        for (const st of state.values()) {
          if (st.timer !== null) clearTimer(st.timer);
          st.timer = null;
        }
        controllers.clear();
      };
    },
  };
}
