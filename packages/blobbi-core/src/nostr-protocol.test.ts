import { describe, it, expect } from 'vitest';
import type { NPool } from '@nostrify/nostrify';
import type {
  NostrEvent as NostrifyEvent,
  NostrFilter as NostrifyFilter,
  NRelay,
  NStore,
} from '@nostrify/types';

import type { NostrEvent, NostrFilter, NostrQuerier } from './nostr-protocol';
import { fetchFreshEvent } from './fetchFreshEvent';
import { fetchFreshBlobbonautProfile } from './fetchFreshBlobbonautProfile';

/**
 * Structural-compatibility contract for the kit's own Nostr types.
 *
 * `@blobbi-kit/core` declares `NostrEvent`, `NostrFilter`, and `NostrQuerier`
 * locally so consumers never have to install or version-match a Nostr library.
 * That is only safe while those declarations stay *structurally interchangeable*
 * with the ecosystem's — otherwise the kit would silently reject values every
 * host already has.
 *
 * `@nostrify/nostrify` and `@nostrify/types` are used here as a **dev-only
 * compatibility fixture**. They are root devDependencies of the monorepo and
 * appear in neither published manifest, and this file is a test — tsup's entry
 * globs exclude `*.test.ts`, so nothing here reaches `dist/`.
 * `package-manifest.test.ts` enforces that separately.
 *
 * ## How the assertions work
 *
 * Each check is a compile-time assignment or conditional type. If a contract
 * regresses, `npm run typecheck` fails at this file rather than in a consumer's
 * app. The runtime `expect` calls exist so the checks are also *reported* by the
 * suite — and so `noUnusedLocals` keeps them honest.
 */

/** `true` only when `A` is assignable to `B`. */
type Extends<A, B> = A extends B ? true : false;

/** `true` only when `A` and `B` are assignable in both directions. */
type MutuallyAssignable<A, B> = Extends<A, B> extends true
  ? Extends<B, A> extends true
    ? true
    : false
  : false;

const NOSTRIFY_EVENT = null as unknown as NostrifyEvent;
const NOSTRIFY_FILTER = null as unknown as NostrifyFilter;

describe('NostrEvent is interchangeable with the ecosystem type', () => {
  it('accepts a Nostrify event where the kit expects its own', () => {
    const kitEvent: NostrEvent = NOSTRIFY_EVENT;
    expect(kitEvent).toBeNull(); // the value is a type-level stand-in
  });

  it('is accepted where a Nostrify event is expected', () => {
    // The other direction matters just as much: hosts pass kit-typed events
    // (e.g. `BlobbonautProfile.event`) straight back into Nostrify APIs.
    const nostrifyEvent: NostrifyEvent = null as unknown as NostrEvent;
    expect(nostrifyEvent).toBeNull();
  });

  it('is mutually assignable, with no excess or missing fields', () => {
    const mutual: MutuallyAssignable<NostrEvent, NostrifyEvent> = true;
    expect(mutual).toBe(true);
  });

  it('adds no brand, nominal marker, or readonly constraint', () => {
    // A branded or readonly variant would fail mutual assignability above, but
    // assert the practical consequence too: host values stay mutable.
    const event: NostrEvent = {
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      created_at: 1,
      kind: 1,
      tags: [['d', 'x']],
      content: '',
      sig: '0'.repeat(128),
    };
    event.tags.push(['b', 'y']);
    event.content = 'mutated';
    expect(event.tags).toHaveLength(2);
    expect(event.content).toBe('mutated');
  });
});

describe('NostrFilter is interchangeable with the ecosystem type', () => {
  it('accepts a Nostrify filter where the kit expects its own', () => {
    const kitFilter: NostrFilter = NOSTRIFY_FILTER;
    expect(kitFilter).toBeNull();
  });

  it('is accepted where a Nostrify filter is expected', () => {
    const nostrifyFilter: NostrifyFilter = null as unknown as NostrFilter;
    expect(nostrifyFilter).toBeNull();
  });

  it('is mutually assignable', () => {
    const mutual: MutuallyAssignable<NostrFilter, NostrifyFilter> = true;
    expect(mutual).toBe(true);
  });

  it('still permits dynamic tag filters', () => {
    // The kit's own queries use `#d`; interaction queries use `#a` and `#p`.
    // Losing the template-literal index signature would reject them silently.
    const filter: NostrFilter = {
      kinds: [31124],
      authors: ['a'.repeat(64)],
      '#d': ['blobbi-1'],
      '#a': ['31124:pubkey:d'],
      '#p': ['b'.repeat(64)],
      since: 1,
      until: 2,
      limit: 3,
      search: 'q',
      ids: ['c'.repeat(64)],
    };
    expect(filter['#d']).toEqual(['blobbi-1']);
    expect(filter['#a']).toEqual(['31124:pubkey:d']);
  });
});

describe('NostrQuerier accepts real Nostrify implementations', () => {
  it('is satisfied by NPool', () => {
    // The whole point of the refactor. `NPool` is a class with `private`
    // members, so it is nominally typed — but *it* satisfying a structural
    // interface is fine; only the reverse was ever impossible.
    const pool: NostrQuerier = null as unknown as NPool;
    expect(pool).toBeNull();
  });

  it('is satisfied by any NRelay', () => {
    const relay: NostrQuerier = null as unknown as NRelay;
    expect(relay).toBeNull();
  });

  it('is satisfied by any NStore (caches, IndexedDB, NSet)', () => {
    const store: NostrQuerier = null as unknown as NStore;
    expect(store).toBeNull();
  });

  it('accepts NPool at both public core entry points', () => {
    // Guards the exported signatures directly, not just the interface: this is
    // what Ditto relies on when it passes `useNostr()`'s pool straight through.
    const freshEvent: Extends<NPool, Parameters<typeof fetchFreshEvent>[0]> = true;
    const freshProfile: Extends<NPool, Parameters<typeof fetchFreshBlobbonautProfile>[0]> = true;
    expect(freshEvent).toBe(true);
    expect(freshProfile).toBe(true);
  });
});

describe('NostrQuerier accepts plain structural objects', () => {
  it('is satisfied by an object literal with only query', () => {
    // The regression this protects against: reintroducing nominal coupling by
    // widening the interface back toward a concrete pool class.
    const plain: NostrQuerier = { query: async () => [] };
    expect(plain).toHaveProperty('query');
  });

  it('lets a plain object drive fetchFreshEvent end to end', async () => {
    const event: NostrEvent = {
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      created_at: 42,
      kind: 30078,
      tags: [],
      content: '',
      sig: '0'.repeat(128),
    };

    const result = await fetchFreshEvent({ query: async () => [event] }, { kinds: [30078] });
    expect(result).toBe(event);
  });

  it('does not require the optional opts parameter to be declared', () => {
    // Implementations that ignore abort signals are still valid queriers.
    const ignoresOpts: NostrQuerier = { query: async (_filters) => [] };
    expect(ignoresOpts).toHaveProperty('query');
  });

  it('permits implementations that accept extra options', () => {
    // NPool.query also takes `relays`; the kit passes only what it needs.
    const extraOpts: NostrQuerier = {
      query: async (_filters, _opts?: { signal?: AbortSignal; relays?: string[] }) => [],
    };
    expect(extraOpts).toHaveProperty('query');
  });
});
