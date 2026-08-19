import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { NostrEvent, NostrFilter, NostrQuerier } from './nostr-protocol';

import { fetchFreshBlobbonautProfile } from './fetchFreshBlobbonautProfile';
import {
  BLOBBI_ECOSYSTEM_NAMESPACE,
  KIND_BLOBBONAUT_PROFILE,
  KIND_BLOBBONAUT_PROFILE_LEGACY,
  getBlobbonautQueryDValues,
} from './blobbi';

/**
 * Behavior tests for `fetchFreshBlobbonautProfile`.
 *
 * Uses the same hand-rolled structural double as `fetchFreshEvent.test.ts`: the
 * helper touches exactly one pool method (`query`), and the `NostrQuerier`
 * contract lets a plain object stand in for a relay pool without a cast.
 */

/** A `NostrQuerier` whose single method is a spy, so calls can be inspected. */
interface QuerierDouble extends NostrQuerier {
  query: Mock<NostrQuerier['query']>;
}

function querier(events: NostrEvent[]): QuerierDouble {
  return { query: vi.fn<NostrQuerier['query']>().mockResolvedValue(events) };
}

/** The single filter the helper sent on its one query call. */
const sentFilter = (nostr: QuerierDouble): NostrFilter => nostr.query.mock.calls[0][0][0];

/** The abort signal the helper attached to its one query call. */
const sentSignal = (nostr: QuerierDouble): AbortSignal => nostr.query.mock.calls[0][1]!.signal!;

const PUBKEY = 'a'.repeat(64);

/** A structurally valid profile event: requires a `d` tag and the ecosystem `b` tag. */
function makeProfile(
  overrides: { kind?: number; created_at?: number; id?: string; tags?: string[][] } = {},
): NostrEvent {
  const { kind = KIND_BLOBBONAUT_PROFILE, created_at = 1_700_000_000, id = 'f'.repeat(64) } =
    overrides;
  return {
    id,
    pubkey: PUBKEY,
    created_at,
    kind,
    tags: overrides.tags ?? [
      ['d', `blobbonaut-${PUBKEY.slice(0, 12)}`],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
      ['name', 'Astro'],
    ],
    content: '',
    sig: '0'.repeat(128),
  };
}

describe('fetchFreshBlobbonautProfile', () => {
  describe('query delegation', () => {
    it('issues exactly one query', async () => {
      const nostr = querier([]);
      await fetchFreshBlobbonautProfile(nostr, PUBKEY);
      expect(nostr.query).toHaveBeenCalledTimes(1);
    });

    it('queries both the current and legacy profile kinds', async () => {
      const nostr = querier([]);
      await fetchFreshBlobbonautProfile(nostr, PUBKEY);

      expect(sentFilter(nostr).kinds).toEqual([
        KIND_BLOBBONAUT_PROFILE,
        KIND_BLOBBONAUT_PROFILE_LEGACY,
      ]);
    });

    it('scopes the query to the requested author', async () => {
      const nostr = querier([]);
      await fetchFreshBlobbonautProfile(nostr, PUBKEY);

      expect(sentFilter(nostr).authors).toEqual([PUBKEY]);
    });

    it('queries every canonical and legacy d-tag value', async () => {
      const nostr = querier([]);
      await fetchFreshBlobbonautProfile(nostr, PUBKEY);

      expect(sentFilter(nostr)['#d']).toEqual(getBlobbonautQueryDValues(PUBKEY));
    });

    it('does not constrain the query with a limit', async () => {
      // All candidate versions are needed so the newest can be chosen locally.
      const nostr = querier([]);
      await fetchFreshBlobbonautProfile(nostr, PUBKEY);

      expect(sentFilter(nostr)).not.toHaveProperty('limit');
    });

    it('passes an abort signal', async () => {
      const nostr = querier([]);
      await fetchFreshBlobbonautProfile(nostr, PUBKEY);

      expect(sentSignal(nostr)).toBeInstanceOf(AbortSignal);
      expect(sentSignal(nostr).aborted).toBe(false);
    });
  });

  describe('empty and invalid results', () => {
    it('returns null when no events come back', async () => {
      await expect(
        fetchFreshBlobbonautProfile(querier([]), PUBKEY),
      ).resolves.toBeNull();
    });

    it('returns null when every event fails validation', async () => {
      const noDTag = makeProfile({ tags: [['b', BLOBBI_ECOSYSTEM_NAMESPACE]] });
      const wrongNamespace = makeProfile({ tags: [['d', 'x'], ['b', 'not-blobbi']] });

      await expect(
        fetchFreshBlobbonautProfile(querier([noDTag, wrongNamespace]), PUBKEY),
      ).resolves.toBeNull();
    });

    it('ignores events of an unrelated kind', async () => {
      const unrelated = makeProfile({ kind: 31124 });
      await expect(
        fetchFreshBlobbonautProfile(querier([unrelated]), PUBKEY),
      ).resolves.toBeNull();
    });

    it('skips invalid events but still returns a valid sibling', async () => {
      const invalid = makeProfile({ id: '1'.repeat(64), tags: [['d', 'x']] });
      const valid = makeProfile({ id: '2'.repeat(64) });

      const result = await fetchFreshBlobbonautProfile(
        querier([invalid, valid]),
        PUBKEY,
      );
      expect(result?.event).toBe(valid);
    });
  });

  describe('kind preference and version selection', () => {
    it('returns a parsed profile, not the raw event', async () => {
      const event = makeProfile();
      const result = await fetchFreshBlobbonautProfile(querier([event]), PUBKEY);

      expect(result).toMatchObject({ event, name: 'Astro', d: `blobbonaut-${PUBKEY.slice(0, 12)}` });
    });

    it('prefers the current kind over legacy', async () => {
      const legacy = makeProfile({ kind: KIND_BLOBBONAUT_PROFILE_LEGACY, id: '1'.repeat(64) });
      const current = makeProfile({ kind: KIND_BLOBBONAUT_PROFILE, id: '2'.repeat(64) });

      const result = await fetchFreshBlobbonautProfile(
        querier([legacy, current]),
        PUBKEY,
      );
      expect(result?.event).toBe(current);
    });

    it('prefers the current kind even when a legacy event is newer', async () => {
      const newerLegacy = makeProfile({
        kind: KIND_BLOBBONAUT_PROFILE_LEGACY,
        id: '1'.repeat(64),
        created_at: 1_800_000_000,
      });
      const olderCurrent = makeProfile({
        kind: KIND_BLOBBONAUT_PROFILE,
        id: '2'.repeat(64),
        created_at: 1_700_000_000,
      });

      const result = await fetchFreshBlobbonautProfile(
        querier([newerLegacy, olderCurrent]),
        PUBKEY,
      );
      expect(result?.event).toBe(olderCurrent);
    });

    it('picks the newest among several current-kind events', async () => {
      const older = makeProfile({ id: '1'.repeat(64), created_at: 1_700_000_000 });
      const newest = makeProfile({ id: '2'.repeat(64), created_at: 1_700_000_900 });
      const middle = makeProfile({ id: '3'.repeat(64), created_at: 1_700_000_400 });

      const result = await fetchFreshBlobbonautProfile(
        querier([older, newest, middle]),
        PUBKEY,
      );
      expect(result?.event).toBe(newest);
    });

    it('falls back to legacy when no current-kind event exists', async () => {
      const legacy = makeProfile({ kind: KIND_BLOBBONAUT_PROFILE_LEGACY, id: '1'.repeat(64) });

      const result = await fetchFreshBlobbonautProfile(querier([legacy]), PUBKEY);
      expect(result?.event).toBe(legacy);
    });

    it('picks the newest among several legacy events', async () => {
      const older = makeProfile({
        kind: KIND_BLOBBONAUT_PROFILE_LEGACY,
        id: '1'.repeat(64),
        created_at: 1_700_000_000,
      });
      const newest = makeProfile({
        kind: KIND_BLOBBONAUT_PROFILE_LEGACY,
        id: '2'.repeat(64),
        created_at: 1_700_000_900,
      });

      const result = await fetchFreshBlobbonautProfile(
        querier([older, newest]),
        PUBKEY,
      );
      expect(result?.event).toBe(newest);
    });
  });

  it('propagates a rejected query rather than swallowing it', async () => {
    const nostr: QuerierDouble = {
      query: vi.fn<NostrQuerier['query']>().mockRejectedValue(new Error('relay down')),
    };
    await expect(fetchFreshBlobbonautProfile(nostr, PUBKEY)).rejects.toThrow(
      'relay down',
    );
  });
});
