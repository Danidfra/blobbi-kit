/**
 * B3: the live world-travel stream's re-subscription. A relay that ends the
 * stream right after EOSE must slow down to the cap instead of being asked
 * again every 2 s; a well-behaved relay keeps its short wait.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NostrFilter } from '@blobbi-kit/core/nostr-protocol';
import { TRAVEL_STREAM_BACKOFF_MS, TRAVEL_STREAM_HEALTHY_MS, poolWorldTravelRelays, type PoolWorldTravelOptions, type TravelPoolLike } from './world-travel-relays';

/** One live REQ the test controls: it answers EOSE at once, then ends when told (or on abort). */
interface Stream {
  url: string;
  end: () => void;
  push: (m: unknown) => void;
  aborted: boolean;
}

/** A pool whose REQs are recorded; `closeAfterEose` relays end every stream right after EOSE (a CLOSED). */
function controlledPool(closeAfterEose: ReadonlySet<string> = new Set()) {
  const streams: Stream[] = [];
  const pool: TravelPoolLike = {
    relay(url) {
      return {
        query: async () => [],
        event: async () => undefined,
        req(_filters: NostrFilter[], { signal }: { signal: AbortSignal }) {
          const queue: unknown[] = [['EOSE', 's']];
          if (closeAfterEose.has(url)) queue.push(['CLOSED', 's', 'error: idle']);
          let wake: (() => void) | null = null;
          let ended = false;
          const s: Stream = {
            url,
            aborted: false,
            end: () => {
              ended = true;
              wake?.();
            },
            push: (m) => {
              queue.push(m);
              wake?.();
            },
          };
          signal.addEventListener('abort', () => {
            s.aborted = true;
            s.end();
          });
          streams.push(s);
          return {
            async *[Symbol.asyncIterator]() {
              while (true) {
                if (queue.length) yield queue.shift();
                else if (ended) return;
                else await new Promise<void>((res) => (wake = res));
                wake = null;
              }
            },
          };
        },
      };
    },
  };
  const reqs = (url: string) => streams.filter((s) => s.url === url).length;
  const open = (url: string) => streams.filter((s) => s.url === url).at(-1)!;
  return { pool, streams, reqs, open };
}

/** The waits the relays module asked for, in order, through its timer seam (real fake timers underneath). */
function recordingTimers() {
  const waits: number[] = [];
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const seams: Pick<PoolWorldTravelOptions, 'setTimer' | 'clearTimer'> = {
    setTimer: (fn, ms) => {
      waits.push(ms);
      const h = setTimeout(() => {
        pending.delete(h);
        fn();
      }, ms);
      pending.add(h);
      return h;
    },
    clearTimer: (h) => {
      pending.delete(h as ReturnType<typeof setTimeout>);
      clearTimeout(h as ReturnType<typeof setTimeout>);
    },
  };
  return { waits, pending, seams };
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const CAP = TRAVEL_STREAM_BACKOFF_MS[TRAVEL_STREAM_BACKOFF_MS.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2027, 0, 1));
});
afterEach(() => vi.useRealTimers());

describe('poolWorldTravelRelays: re-subscription (B3)', () => {
  it('slows a relay that ends every stream right after EOSE down to the 5-minute cap, step by step', async () => {
    const { pool, reqs } = controlledPool(new Set(['wss://closes']));
    const t = recordingTimers();
    const stop = poolWorldTravelRelays(pool, ['wss://closes'], { ...t.seams, random: () => 0.999_999 }).subscribe!([{ kinds: [31126] }], () => {});
    await tick(2 * 60 * 60 * 1000);
    expect(CAP).toBe(300_000);
    // Every step of the ladder, once, then the cap for good (no reset: no stream was healthy)
    expect(t.waits.slice(0, TRAVEL_STREAM_BACKOFF_MS.length)).toEqual([...TRAVEL_STREAM_BACKOFF_MS]);
    expect(new Set(t.waits.slice(TRAVEL_STREAM_BACKOFF_MS.length))).toEqual(new Set([CAP]));
    expect(reqs('wss://closes')).toBe(t.waits.length);
    stop();
  });

  it('jitters every wait to between half and all of its step', async () => {
    for (const [r, factor] of [[0, 0.5], [0.5, 0.75]] as const) {
      const { pool } = controlledPool(new Set(['wss://closes']));
      const t = recordingTimers();
      const stop = poolWorldTravelRelays(pool, ['wss://closes'], { ...t.seams, random: () => r }).subscribe!([{ kinds: [31126] }], () => {});
      await tick(30 * 60 * 1000);
      stop();
      const steps = t.waits.map((_, i) => TRAVEL_STREAM_BACKOFF_MS[Math.min(i, TRAVEL_STREAM_BACKOFF_MS.length - 1)]);
      expect(t.waits).toEqual(steps.map((s) => Math.round(s * factor)));
    }
  });

  it('a stream that lived long after EOSE resets the wait to the shortest step; one that ended sooner grows it', async () => {
    const { pool, reqs, open } = controlledPool();
    const t = recordingTimers();
    const stop = poolWorldTravelRelays(pool, ['wss://r'], { ...t.seams, random: () => 0.999_999 }).subscribe!([{ kinds: [31126] }], () => {});
    // Three short-lived streams: the wait grows
    for (let i = 0; i < 3; i++) {
      await tick(1_000);
      open('wss://r').end();
      await tick(TRAVEL_STREAM_BACKOFF_MS[i]);
    }
    expect(t.waits).toEqual(TRAVEL_STREAM_BACKOFF_MS.slice(0, 3));
    // Then a healthy one, cut after it stayed open the healthy time: back to the shortest step
    await tick(TRAVEL_STREAM_HEALTHY_MS);
    open('wss://r').end();
    await tick(0);
    expect(t.waits.at(-1)).toBe(TRAVEL_STREAM_BACKOFF_MS[0]);
    await tick(TRAVEL_STREAM_BACKOFF_MS[0]);
    expect(reqs('wss://r')).toBe(5);
    stop();
  });

  it('a well-behaved relay is asked once, and gets its events and the look-again after a drop', async () => {
    const { pool, reqs, open } = controlledPool();
    const reconnects = vi.fn();
    const got: unknown[] = [];
    const stop = poolWorldTravelRelays(pool, ['wss://r'], { onReconnect: reconnects, random: () => 0.999_999 }).subscribe!([{ kinds: [31126] }], (e) => got.push(e));
    await tick(60 * 60 * 1000);
    expect(reqs('wss://r')).toBe(1);
    open('wss://r').push(['EVENT', 's', { id: 'x' }]);
    await tick(0);
    expect(got).toEqual([{ id: 'x' }]);
    expect(reconnects).not.toHaveBeenCalled();
    open('wss://r').end();
    await tick(TRAVEL_STREAM_BACKOFF_MS[0]);
    expect(reqs('wss://r')).toBe(2);
    expect(reconnects).toHaveBeenCalledTimes(1);
    stop();
  });

  it('re-subscribes nothing while the page is hidden; showing it follows every idle relay at once with the wait reset', async () => {
    const { pool, reqs } = controlledPool(new Set(['wss://closes']));
    const t = recordingTimers();
    let hidden = false;
    let wake = () => {};
    const unwake = vi.fn();
    const stop = poolWorldTravelRelays(pool, ['wss://closes'], {
      ...t.seams,
      random: () => 0.999_999,
      isHidden: () => hidden,
      onWake: (w) => ((wake = w), unwake),
    }).subscribe!([{ kinds: [31126] }], () => {});
    await tick(30_000);
    const before = reqs('wss://closes');
    expect(before).toBe(4); // 0, 2, 7, 22 s
    hidden = true;
    await tick(60 * 60 * 1000);
    expect(reqs('wss://closes')).toBe(before);
    // Shown again: at once, and the ladder starts over
    hidden = false;
    const waitsBefore = t.waits.length;
    wake();
    await tick(0);
    expect(reqs('wss://closes')).toBe(before + 1);
    expect(t.waits.slice(waitsBefore)).toEqual([TRAVEL_STREAM_BACKOFF_MS[0]]);
    // A wake with a timer pending cancels it and follows now
    wake();
    await tick(0);
    expect(reqs('wss://closes')).toBe(before + 2);
    expect(t.pending.size).toBe(1);
    stop();
    expect(unwake).toHaveBeenCalledTimes(1);
    expect(t.pending.size).toBe(0);
    await tick(60 * 60 * 1000);
    expect(reqs('wss://closes')).toBe(before + 2);
  });

  it('opens the first stream even when the page starts hidden, and never touches a stream that is open', async () => {
    const { pool, reqs, open } = controlledPool();
    let wake = () => {};
    const stop = poolWorldTravelRelays(pool, ['wss://r'], { isHidden: () => true, onWake: (w) => ((wake = w), () => {}) }).subscribe!([{ kinds: [31126] }], () => {});
    await tick(0);
    expect(reqs('wss://r')).toBe(1);
    wake();
    await tick(0);
    expect(reqs('wss://r')).toBe(1);
    expect(open('wss://r').aborted).toBe(false);
    stop();
    expect(open('wss://r').aborted).toBe(true);
  });

  it('by default, wakes on the document becoming visible and on the window going online', async () => {
    const { pool, reqs } = controlledPool(new Set(['wss://closes']));
    const stop = poolWorldTravelRelays(pool, ['wss://closes'], { random: () => 0.999_999 }).subscribe!([{ kinds: [31126] }], () => {});
    await tick(30_000);
    const n = reqs('wss://closes');
    window.dispatchEvent(new Event('online'));
    await tick(0);
    expect(reqs('wss://closes')).toBe(n + 1);
    document.dispatchEvent(new Event('visibilitychange'));
    await tick(0);
    expect(reqs('wss://closes')).toBe(n + 2);
    stop();
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    await tick(60 * 60 * 1000);
    expect(reqs('wss://closes')).toBe(n + 2);
  });
});
