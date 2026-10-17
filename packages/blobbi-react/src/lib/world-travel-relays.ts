/**
 * World travel's relays (`WorldTravelRelays`, `@blobbi-kit/core`) over a
 * Nostrify-style pool, without importing Nostrify: any pool with
 * `relay(url)` returning `query`, `event` and `req` fits (Nostrify's `NPool`
 * does). Each relay is asked and written to on its own, which a complete read
 * and an honest count of acceptances need; the pool's own fan-out cannot say
 * which relay answered.
 *
 * The live stream is one `req` per relay. A relay whose stream ends (closed,
 * dropped, refused) is subscribed again after a growing pause, and the
 * session is told to look again (`onReconnect`), so a move made while it was
 * gone is found. Events are passed on untrusted: the session checks them.
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
}

const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

export function poolWorldTravelRelays(pool: TravelPoolLike, urls: readonly string[], o: PoolWorldTravelOptions = {}): WorldTravelRelays {
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
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
      const timers = new Set<unknown>();
      const follow = async (url: string, attempt: number): Promise<void> => {
        if (stopped) return;
        const controller = new AbortController();
        controllers.add(controller);
        let got = false;
        try {
          for await (const msg of pool.relay(url).req(filters.map((f) => ({ ...f })), { signal: controller.signal })) {
            if (stopped) break;
            if (!Array.isArray(msg)) continue;
            if (msg[0] === 'EVENT') onEvent(msg[2]);
            else if (msg[0] === 'EOSE') {
              got = true;
              if (attempt > 0) o.onReconnect?.();
            } else if (msg[0] === 'CLOSED') break;
          }
        } catch {
          /* the stream ended: subscribed again below */
        } finally {
          controllers.delete(controller);
        }
        if (stopped) return;
        const next = got ? 1 : attempt + 1;
        const t = setTimer(() => {
          timers.delete(t);
          void follow(url, next);
        }, BACKOFF_MS[Math.min(next - 1, BACKOFF_MS.length - 1)]);
        timers.add(t);
      };
      for (const url of urls) void follow(url, 0);
      return () => {
        stopped = true;
        for (const c of controllers) c.abort();
        for (const t of timers) clearTimer(t);
        controllers.clear();
        timers.clear();
      };
    },
  };
}
