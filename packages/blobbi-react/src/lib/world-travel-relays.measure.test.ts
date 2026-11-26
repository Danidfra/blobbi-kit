/**
 * B3 measurement: REQs per relay over fixed simulated windows (fake timers),
 * for relays that end the stream right after EOSE and for relays that keep it
 * open. Prints a table with `RELAY_MEASURE=1`; the assertions are the
 * regression bounds. Uses only the public API and default seams, so the same
 * harness measured the code before the fix.
 *
 *   RELAY_MEASURE=1 npx vitest run packages/blobbi-react/src/lib/world-travel-relays.measure.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NostrFilter } from '@blobbi-kit/core/nostr-protocol';
import { poolWorldTravelRelays, type TravelPoolLike } from './world-travel-relays';

type Behavior = 'close-after-eose' | 'keep-open';

/** A pool whose relays answer every REQ with EOSE, then either CLOSE at once or stay open. Counts REQs per relay. */
function fakePool(behavior: Record<string, Behavior>) {
  const reqs: Record<string, number> = {};
  const pool: TravelPoolLike = {
    relay(url) {
      return {
        query: async () => [],
        event: async () => undefined,
        req(_filters: NostrFilter[], { signal }: { signal: AbortSignal }) {
          reqs[url] = (reqs[url] ?? 0) + 1;
          return {
            async *[Symbol.asyncIterator]() {
              yield ['EOSE', 's'];
              if (behavior[url] === 'close-after-eose') {
                yield ['CLOSED', 's', 'error: idle subscription closed'];
                return;
              }
              await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
            },
          };
        },
      };
    },
  };
  return { pool, reqs };
}

const WINDOWS_S = [60, 600, 3_600];

async function measure(behavior: Record<string, Behavior>) {
  const { pool, reqs } = fakePool(behavior);
  const looks = { n: 0 };
  const relays = poolWorldTravelRelays(pool, Object.keys(behavior), { onReconnect: () => looks.n++ });
  const stop = relays.subscribe!([{ kinds: [31126] }], () => {});
  const out: Record<number, Record<string, number>> = {};
  let elapsed = 0;
  for (const w of WINDOWS_S) {
    await vi.advanceTimersByTimeAsync((w - elapsed) * 1000);
    elapsed = w;
    out[w] = { ...reqs, 'onReconnect (looks)': looks.n };
  }
  stop();
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2027, 0, 1));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('B3 measurement: REQs per relay', () => {
  for (const [label, r] of [
    ['jitter at its longest (random = 1)', 0.999_999],
    ['jitter at its shortest (random = 0)', 0],
  ] as const) {
    it(`a relay that ends the stream after EOSE settles to the cap; one that keeps it open is asked once (${label})`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const result = await measure({ 'wss://closes-1': 'close-after-eose', 'wss://closes-2': 'close-after-eose', 'wss://open': 'keep-open' });
      if (process.env.RELAY_MEASURE) {
        console.log(`B3 REQs per relay, ${label}`);
        console.table(Object.fromEntries(WINDOWS_S.map((w) => [`${w} s`, result[w]])));
      }
      const closes = (w: number) => result[w]['wss://closes-1'];
      expect(result[3_600]['wss://open']).toBe(1);
      expect(result[3_600]['wss://closes-1']).toBe(result[3_600]['wss://closes-2']);
      // Bounds: before the fix, 31 per minute and 1,801 per hour per relay
      expect(closes(60)).toBeLessThanOrEqual(8);
      expect(closes(3_600)).toBeLessThanOrEqual(40);
      // Every reopen that reached EOSE asked the session to look again: before the fix, 3,600 an hour for two relays
      expect(result[3_600]['onReconnect (looks)']).toBeLessThanOrEqual(80);
    });
  }
});
