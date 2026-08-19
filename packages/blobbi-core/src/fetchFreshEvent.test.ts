import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { NostrEvent, NostrFilter, NostrQuerier } from './nostr-protocol';

import { fetchFreshEvent } from './fetchFreshEvent';

/**
 * Behavior tests for `fetchFreshEvent`.
 *
 * Written against a hand-rolled structural double rather than a real relay pool:
 * the helper calls exactly one method (`query`), so a real pool would only add
 * machinery the assertions never touch.
 *
 * That the double can be passed at all — with no cast — is the point of the
 * `NostrQuerier` contract. `nostr-protocol.test.ts` pins that boundary directly.
 */

/** A `NostrQuerier` whose single method is a spy, so calls can be inspected. */
interface QuerierDouble extends NostrQuerier {
  query: Mock<NostrQuerier['query']>;
}

/** Build a double whose `query` resolves to `events`. */
function querier(events: NostrEvent[]): QuerierDouble {
  return { query: vi.fn<NostrQuerier['query']>().mockResolvedValue(events) };
}

/** The single filter the helper sent on its one query call. */
const sentFilter = (nostr: QuerierDouble): NostrFilter => nostr.query.mock.calls[0][0][0];

/** The abort signal the helper attached to its one query call. */
const sentSignal = (nostr: QuerierDouble): AbortSignal => nostr.query.mock.calls[0][1]!.signal!;

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: 1_700_000_000,
    kind: 30078,
    tags: [],
    content: '',
    sig: '0'.repeat(128),
    ...overrides,
  };
}

const FILTER: NostrFilter = { kinds: [10003], authors: ['c'.repeat(64)] };

describe('fetchFreshEvent', () => {
  describe('query delegation', () => {
    it('issues exactly one query', async () => {
      const nostr = querier([]);
      await fetchFreshEvent(nostr, FILTER);
      expect(nostr.query).toHaveBeenCalledTimes(1);
    });

    it('passes the caller filter through, wrapped in an array', async () => {
      const nostr = querier([]);
      await fetchFreshEvent(nostr, FILTER);

      const [filters] = nostr.query.mock.calls[0];
      expect(filters).toHaveLength(1);
      expect(filters[0]).toMatchObject({ kinds: [10003], authors: ['c'.repeat(64)] });
    });

    it('forces limit: 1 onto the filter', async () => {
      const nostr = querier([]);
      await fetchFreshEvent(nostr, FILTER);

      expect(sentFilter(nostr).limit).toBe(1);
    });

    it('overrides a caller-supplied limit rather than honoring it', async () => {
      const nostr = querier([]);
      await fetchFreshEvent(nostr, { ...FILTER, limit: 50 });

      expect(sentFilter(nostr).limit).toBe(1);
    });

    it('does not mutate the caller filter', async () => {
      const nostr = querier([]);
      const filter: NostrFilter = { ...FILTER };
      await fetchFreshEvent(nostr, filter);

      expect(filter).toEqual(FILTER);
      expect(filter).not.toHaveProperty('limit');
    });

    it('preserves dynamic tag filters such as #d', async () => {
      const nostr = querier([]);
      await fetchFreshEvent(nostr, { kinds: [31124], '#d': ['abc', 'def'] });

      expect(sentFilter(nostr)['#d']).toEqual(['abc', 'def']);
    });
  });

  describe('abort signal', () => {
    it('always passes a signal, even with no caller options', async () => {
      const nostr = querier([]);
      await fetchFreshEvent(nostr, FILTER);

      expect(sentSignal(nostr)).toBeInstanceOf(AbortSignal);
      expect(sentSignal(nostr).aborted).toBe(false);
    });

    it('merges a caller signal, so aborting the caller aborts the query', async () => {
      const nostr = querier([]);
      const controller = new AbortController();
      await fetchFreshEvent(nostr, FILTER, { signal: controller.signal });

      expect(sentSignal(nostr).aborted).toBe(false);
      controller.abort();
      expect(sentSignal(nostr).aborted).toBe(true);
    });

    it('does not hand the caller signal straight through (a timeout is merged in)', async () => {
      const nostr = querier([]);
      const controller = new AbortController();
      await fetchFreshEvent(nostr, FILTER, { signal: controller.signal });

      expect(sentSignal(nostr)).not.toBe(controller.signal);
    });

    it('propagates an already-aborted caller signal', async () => {
      const nostr = querier([]);
      await fetchFreshEvent(nostr, FILTER, { signal: AbortSignal.abort() });

      expect(sentSignal(nostr).aborted).toBe(true);
    });
  });

  describe('result selection', () => {
    it('returns null when no events come back', async () => {
      await expect(fetchFreshEvent(querier([]), FILTER)).resolves.toBeNull();
    });

    it('returns the only event when exactly one comes back', async () => {
      const only = makeEvent({ id: 'f'.repeat(64) });
      await expect(fetchFreshEvent(querier([only]), FILTER)).resolves.toBe(only);
    });

    it('picks the newest created_at when relays disagree', async () => {
      const old = makeEvent({ id: '1'.repeat(64), created_at: 1_700_000_000 });
      const newest = makeEvent({ id: '2'.repeat(64), created_at: 1_700_000_500 });
      const middle = makeEvent({ id: '3'.repeat(64), created_at: 1_700_000_200 });

      const result = await fetchFreshEvent(querier([old, newest, middle]), FILTER);
      expect(result).toBe(newest);
    });

    it('picks the newest regardless of the order relays returned them in', async () => {
      const newest = makeEvent({ id: '2'.repeat(64), created_at: 1_700_000_500 });
      const old = makeEvent({ id: '1'.repeat(64), created_at: 1_700_000_000 });

      const result = await fetchFreshEvent(querier([newest, old]), FILTER);
      expect(result).toBe(newest);
    });

    it('keeps the first event on a created_at tie', async () => {
      const first = makeEvent({ id: '1'.repeat(64), created_at: 1_700_000_000 });
      const second = makeEvent({ id: '2'.repeat(64), created_at: 1_700_000_000 });

      const result = await fetchFreshEvent(querier([first, second]), FILTER);
      expect(result).toBe(first);
    });

    it('does not validate or filter the events it receives', async () => {
      // The helper is protocol-level: kind/tag validation is the caller's job.
      const unrelated = makeEvent({ kind: 1, id: '9'.repeat(64) });
      const result = await fetchFreshEvent(querier([unrelated]), FILTER);
      expect(result).toBe(unrelated);
    });
  });

  it('propagates a rejected query rather than swallowing it', async () => {
    const nostr: QuerierDouble = {
      query: vi.fn<NostrQuerier['query']>().mockRejectedValue(new Error('relay down')),
    };
    await expect(fetchFreshEvent(nostr, FILTER)).rejects.toThrow('relay down');
  });
});
