import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';

import * as coreBarrel from './index';
import * as blobbiModule from './blobbi';
import {
  KIND_BLOBBONAUT_PROFILE,
  KIND_BLOBBONAUT_PROFILE_LEGACY,
  MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES,
  buildBlobbonautTags,
  buildNormalizedProfileTags,
  mergeBlobbonautTagsForRepublish,
  parseBlobbonautEvent,
  updateBlobbonautTags,
  type BlobbonautProfile,
} from './blobbi';

/**
 * Removal of the obsolete profile-Coin economy surface (0.4.0).
 *
 * The kit owns no Blobbi Coin economy. The onboarding economy constants
 * (INITIAL_BLOBBONAUT_COINS, BLOBBI_PREVIEW_REROLL_COST, BLOBBI_ADOPTION_COST)
 * and the typed `BlobbonautProfile.coins` field are gone. Legacy kind:11125
 * `coins` tags are ordinary unknown host extension tags: tolerated on parse,
 * reachable only via `allTags`/`event.tags`, preserved verbatim on republish,
 * and never written or modified by the kit — the same terminal state the
 * consumable-storage removal (0.3.0) established for `storage` tags.
 *
 * These tests are behavioral: they exercise the parse/build/normalize/republish
 * paths and the runtime export surface, rather than grepping source text.
 */

const PUBKEY = 'c'.repeat(64);

const REMOVED_ECONOMY_CONSTANTS = [
  'INITIAL_BLOBBONAUT_COINS',
  'BLOBBI_PREVIEW_REROLL_COST',
  'BLOBBI_ADOPTION_COST',
];

/** A legacy profile event carrying a `coins` tag plus host extensions. */
function legacyCoinProfileEvent(
  coinTags: string[][] = [['coins', '200']],
  extraTags: string[][] = [],
): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: 1_700_000_000,
    kind: KIND_BLOBBONAUT_PROFILE,
    tags: [
      ...buildBlobbonautTags(PUBKEY),
      ...coinTags,
      ['xp', '1200'],
      ['level', '5'],
      ['has', 'blobbi-abc'],
      ['inv', 'hat-001'],
      ...extraTags,
    ],
    content: '',
    sig: '0'.repeat(128),
  };
}

describe('removed economy constants', () => {
  it('exports none of the three economy constants from the core barrel or the blobbi module', () => {
    for (const name of REMOVED_ECONOMY_CONSTANTS) {
      expect(coreBarrel).not.toHaveProperty(name);
      expect(blobbiModule).not.toHaveProperty(name);
      expect((coreBarrel as unknown as Record<string, unknown>)[name]).toBeUndefined();
    }
  });

  it('exports no runtime member that mentions Coins at all', () => {
    const offenders = Object.keys(coreBarrel).filter((k) => /coin/i.test(k));
    expect(offenders).toEqual([]);
  });
});

describe('kind 11125 parsing tolerates legacy coins tags without exposing them', () => {
  it('parses a profile carrying ["coins", "200"]', () => {
    const profile = parseBlobbonautEvent(legacyCoinProfileEvent());
    expect(profile).toBeDefined();
    expect(profile!.xp).toBe(1200);
    expect(profile!.level).toBe(5);
    expect(profile!.has).toEqual(['blobbi-abc']);
  });

  it('parses a profile carrying ["coins", "50000"]', () => {
    const profile = parseBlobbonautEvent(legacyCoinProfileEvent([['coins', '50000']]));
    expect(profile).toBeDefined();
  });

  it('has no `coins` key on the parsed profile — not even undefined-valued', () => {
    const profile = parseBlobbonautEvent(legacyCoinProfileEvent())!;
    expect(Object.keys(profile)).not.toContain('coins');
    expect('coins' in profile).toBe(false);
    expect((profile as unknown as Record<string, unknown>).coins).toBeUndefined();
  });

  it('tolerates malformed and duplicate coins tags without breaking general parsing', () => {
    const hostile = [
      ['coins', 'not-a-number'],
      ['coins', ''],
      ['coins'],
      ['coins', '10', 'extra-element'],
      ['coins', '-5'],
    ];
    const profile = parseBlobbonautEvent(legacyCoinProfileEvent(hostile))!;
    expect(profile).toBeDefined();
    expect(profile.xp).toBe(1200);
    // Raw tags remain available for republish, byte-for-byte.
    expect(profile.allTags.filter(([n]) => n === 'coins')).toEqual(hostile);
  });

  it('parses a legacy kind 31125 profile carrying a coins tag', () => {
    const event = { ...legacyCoinProfileEvent(), kind: KIND_BLOBBONAUT_PROFILE_LEGACY };
    const profile = parseBlobbonautEvent(event);
    expect(profile).toBeDefined();
    expect('coins' in profile!).toBe(false);
    expect(profile!.allTags.filter(([n]) => n === 'coins')).toEqual([['coins', '200']]);
  });

  it('exposes legacy coins tags only as opaque entries in allTags', () => {
    const event = legacyCoinProfileEvent();
    const profile = parseBlobbonautEvent(event)!;
    expect(profile.allTags).toEqual(event.tags);
    expect(profile.allTags.filter(([n]) => n === 'coins')).toEqual([['coins', '200']]);
  });
});

describe('coins is no longer a managed profile tag', () => {
  it('is absent from MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES', () => {
    expect(MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES.has('coins')).toBe(false);
  });

  it('never emits a coins tag when building a fresh profile', () => {
    expect(buildBlobbonautTags(PUBKEY).some(([n]) => n === 'coins')).toBe(false);
  });
});

describe('the kit cannot write kind 11125 coins', () => {
  it('drops a `coins` write on a profile that has none', () => {
    const tags = buildBlobbonautTags(PUBKEY);
    const updated = updateBlobbonautTags(tags, { coins: '10', xp: '42' });

    expect(updated.some(([n]) => n === 'coins')).toBe(false);
    expect(updated.find(([n]) => n === 'xp')?.[1]).toBe('42');
  });

  it('drops a `coins` write without modifying the pre-existing coins tag', () => {
    const before = legacyCoinProfileEvent([['coins', '5000']]).tags.filter(([n]) => n === 'coins');
    const updated = updateBlobbonautTags(legacyCoinProfileEvent([['coins', '5000']]).tags, {
      coins: '999999',
      xp: '42',
    });

    expect(updated.filter(([n]) => n === 'coins')).toEqual(before);
  });

  it('never deletes pre-existing coins, even via an empty-array write', () => {
    const before = legacyCoinProfileEvent().tags.filter(([n]) => n === 'coins');
    const updated = updateBlobbonautTags(legacyCoinProfileEvent().tags, { coins: [] });

    expect(updated.filter(([n]) => n === 'coins')).toEqual(before);
  });

  it('ignores a stale JS-bypass `{ coins: 9999 }` input without emitting a tag', () => {
    // JavaScript callers can bypass the Record<string, string | string[]> type.
    const bypass = { coins: 9999 } as unknown as Record<string, string | string[]>;
    const fresh = updateBlobbonautTags(buildBlobbonautTags(PUBKEY), bypass);
    expect(fresh.some(([n]) => n === 'coins')).toBe(false);

    const existing = updateBlobbonautTags(legacyCoinProfileEvent().tags, bypass);
    expect(existing.filter(([n]) => n === 'coins')).toEqual([['coins', '200']]);
  });
});

describe('republish preserves legacy coins opaquely', () => {
  const coinTagsOf = (tags: string[][]) => tags.filter(([n]) => n === 'coins');

  it.each([
    ['a name update', { name: 'Nova' }],
    ['a has[] merge', { has: ['blobbi-abc', 'blobbi-def'] }],
    ['a companion update', { current_companion: 'blobbi-def' }],
    ['an onboarding update', { blobbi_onboarding_done: 'true' }],
    ['a progression update', { xp: '9000', level: '9', pettingLevel: '3' }],
  ])('survives %s verbatim', (_label, updates) => {
    const event = legacyCoinProfileEvent([['coins', '5000']]);
    const before = coinTagsOf(event.tags);

    const republished = mergeBlobbonautTagsForRepublish(event.tags, updates);

    expect(coinTagsOf(republished)).toEqual(before);
    // Other host extension tags ride along untouched too.
    expect(republished.filter(([n]) => n === 'inv')).toEqual([['inv', 'hat-001']]);
  });

  it('preserves duplicate and malformed coins tags tag-for-tag without normalizing', () => {
    const hostile = [
      ['coins', '200'],
      ['coins', '0050'],
      ['coins', 'not-a-number'],
      ['coins', '10', 'extra-element'],
    ];
    const republished = mergeBlobbonautTagsForRepublish(legacyCoinProfileEvent(hostile).tags, {
      name: 'Nova',
    });

    expect(coinTagsOf(republished)).toEqual(hostile);
  });

  it('survives repeated republishes without drift or duplication', () => {
    let tags = legacyCoinProfileEvent().tags;
    for (let i = 0; i < 5; i++) {
      tags = updateBlobbonautTags(tags, { xp: String(1000 + i) });
    }
    expect(coinTagsOf(tags)).toEqual([['coins', '200']]);
  });

  it('survives profile normalization (pettingLevel backfill and onboarding migration)', () => {
    const event = legacyCoinProfileEvent();
    event.tags = [
      ...event.tags.filter(([n]) => n !== 'pettingLevel' && n !== 'blobbi_onboarding_done'),
      ['onboarding_done', 'true'],
    ];
    const profile = parseBlobbonautEvent(event)!;

    const normalized = buildNormalizedProfileTags(profile);

    expect(normalized.find(([n]) => n === 'pettingLevel')?.[1]).toBe('0');
    expect(normalized.find(([n]) => n === 'blobbi_onboarding_done')?.[1]).toBe('true');
    expect(coinTagsOf(normalized)).toEqual([['coins', '200']]);
  });
});

/**
 * Type-level removal assertions.
 *
 * These are checked by `npm run typecheck` (the package tsconfig includes
 * `src`, so `*.test.ts` is type-checked). Each `@ts-expect-error` FAILS the
 * typecheck as an unused directive (TS2578) if the symbol ever comes back,
 * which is exactly the regression we want to catch.
 *
 * The aliases are `export`ed on purpose: an unexported unused type alias would
 * itself trip `noUnusedLocals`, and the directive would then be "used" by that
 * error whether or not the symbol still exists — silently defeating the check.
 */

// @ts-expect-error `BlobbonautProfile.coins` was removed from the profile model in 0.4.0.
export type _RemovedProfileCoins = BlobbonautProfile['coins'];

// @ts-expect-error `INITIAL_BLOBBONAUT_COINS` was removed from the public API in 0.4.0.
export type _RemovedInitialCoins = (typeof import('./blobbi'))['INITIAL_BLOBBONAUT_COINS'];

// @ts-expect-error `BLOBBI_PREVIEW_REROLL_COST` was removed from the public API in 0.4.0.
export type _RemovedRerollCost = (typeof import('./blobbi'))['BLOBBI_PREVIEW_REROLL_COST'];

// @ts-expect-error `BLOBBI_ADOPTION_COST` was removed from the public API in 0.4.0.
export type _RemovedAdoptionCost = (typeof import('./blobbi'))['BLOBBI_ADOPTION_COST'];

// @ts-expect-error the constants are no longer reachable from the package barrel either.
export type _RemovedBarrelInitialCoins = (typeof import('./index'))['INITIAL_BLOBBONAUT_COINS'];

describe('type-level removals', () => {
  it('keeps the compile-time assertions above wired into a running suite', () => {
    const profile = parseBlobbonautEvent(legacyCoinProfileEvent())!;
    const keys = Object.keys(profile);
    expect(keys).toContain('allTags');
    expect(keys).not.toContain('coins');
  });
});
