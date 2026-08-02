import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import * as coreBarrel from './index';
import * as blobbiModule from './blobbi';
import {
  KIND_BLOBBONAUT_PROFILE,
  buildBlobbonautTags,
  buildNormalizedProfileTags,
  parseBlobbonautEvent,
  updateBlobbonautTags,
  type BlobbonautProfile,
} from './blobbi';

/**
 * Removal of the deprecated kind:11125 consumable-inventory API (0.3.0).
 *
 * The kit no longer models consumable inventory on the Blobbonaut profile. It
 * does not parse, expose, create, update, normalize, or delete `storage` tags.
 * Pre-existing `storage` tags are ordinary unknown host extension tags: they
 * reach callers only via `allTags`/`event.tags` and survive republish verbatim,
 * exactly like `inv`.
 *
 * These tests are behavioral: they exercise the parse/build/normalize/republish
 * paths and the runtime export surface, rather than grepping source text.
 */

const PUBKEY = 'b'.repeat(64);

/** A legacy profile event carrying consumable `storage` tags plus host extensions. */
function legacyProfileEvent(extraTags: string[][] = []): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    created_at: 1_700_000_000,
    kind: KIND_BLOBBONAUT_PROFILE,
    tags: [
      ...buildBlobbonautTags(PUBKEY),
      ['coins', '250'],
      ['xp', '1200'],
      ['level', '5'],
      ['has', 'blobbi-abc'],
      ['storage', 'food_cake:3'],
      ['storage', 'medicine-basic:1'],
      ['inv', 'hat-001'],
      ...extraTags,
    ],
    content: '',
    sig: '0'.repeat(128),
  };
}

describe('kind 11125 profile parsing no longer exposes consumable storage', () => {
  it('does not surface a `storage` field on the parsed profile', () => {
    const profile = parseBlobbonautEvent(legacyProfileEvent());
    expect(profile).toBeDefined();

    // No `storage` key at all — not undefined-valued, not empty-array-valued.
    expect(Object.keys(profile!)).not.toContain('storage');
    expect('storage' in profile!).toBe(false);
    expect((profile as unknown as Record<string, unknown>).storage).toBeUndefined();
  });

  it('still parses every non-inventory profile field', () => {
    const profile = parseBlobbonautEvent(legacyProfileEvent())!;

    expect(profile.xp).toBe(1200);
    expect(profile.level).toBe(5);
    expect(profile.has).toEqual(['blobbi-abc']);
    expect(profile.pettingLevel).toBe(0);
    expect(profile.onboardingDone).toBe(false);
  });

  it('exposes legacy storage tags only as opaque entries in allTags', () => {
    const event = legacyProfileEvent();
    const profile = parseBlobbonautEvent(event)!;

    // allTags is the raw tag list — storage is visible there and nowhere else.
    expect(profile.allTags).toEqual(event.tags);
    expect(profile.allTags.filter(([n]) => n === 'storage')).toEqual([
      ['storage', 'food_cake:3'],
      ['storage', 'medicine-basic:1'],
    ]);
  });
});

describe('profile republish preserves legacy storage opaquely', () => {
  it('survives a full parse → update → republish round trip tag-for-tag', () => {
    const event = legacyProfileEvent();
    const profile = parseBlobbonautEvent(event)!;
    const before = event.tags.filter(([n]) => n === 'storage');

    const republished = updateBlobbonautTags(profile.allTags, {
      xp: '1500',
      level: '6',
    });

    expect(republished.filter(([n]) => n === 'storage')).toEqual(before);
    // The `inv` accessory tag is untouched by the same republish.
    expect(republished.filter(([n]) => n === 'inv')).toEqual([['inv', 'hat-001']]);
    // The legacy `coins` tag rides through opaquely, exactly like storage.
    expect(republished.filter(([n]) => n === 'coins')).toEqual([['coins', '250']]);
    // ...and the managed updates actually landed.
    expect(republished.find(([n]) => n === 'level')?.[1]).toBe('6');
  });

  it('survives repeated republishes without drift or duplication', () => {
    let tags = legacyProfileEvent().tags;
    const expected = tags.filter(([n]) => n === 'storage');

    for (let i = 0; i < 5; i++) {
      tags = updateBlobbonautTags(tags, { xp: String(1000 + i) });
    }

    expect(tags.filter(([n]) => n === 'storage')).toEqual(expected);
    expect(tags.filter(([n]) => n === 'inv')).toEqual([['inv', 'hat-001']]);
  });
});

describe('profile normalization does not manage storage', () => {
  it('preserves legacy storage while normalizing a missing pettingLevel tag', () => {
    // Build a profile whose tags lack pettingLevel so normalization actually runs.
    const event = legacyProfileEvent();
    event.tags = event.tags.filter(([n]) => n !== 'pettingLevel');
    const profile = parseBlobbonautEvent(event)!;

    const normalized = buildNormalizedProfileTags(profile);

    expect(normalized.find(([n]) => n === 'pettingLevel')?.[1]).toBe('0');
    expect(normalized.filter(([n]) => n === 'storage')).toEqual([
      ['storage', 'food_cake:3'],
      ['storage', 'medicine-basic:1'],
    ]);
    expect(normalized.filter(([n]) => n === 'inv')).toEqual([['inv', 'hat-001']]);
  });

  it('preserves legacy storage while migrating onboarding_done → blobbi_onboarding_done', () => {
    const event = legacyProfileEvent();
    event.tags = [
      ...event.tags.filter(([n]) => n !== 'blobbi_onboarding_done'),
      ['onboarding_done', 'true'],
    ];
    const profile = parseBlobbonautEvent(event)!;

    const normalized = buildNormalizedProfileTags(profile);

    expect(normalized.find(([n]) => n === 'blobbi_onboarding_done')?.[1]).toBe('true');
    expect(normalized.some(([n]) => n === 'onboarding_done')).toBe(false);
    expect(normalized.filter(([n]) => n === 'storage')).toEqual([
      ['storage', 'food_cake:3'],
      ['storage', 'medicine-basic:1'],
    ]);
  });

  it('does not add a storage tag when normalizing a profile that has none', () => {
    const event = legacyProfileEvent();
    event.tags = event.tags.filter(([n]) => n !== 'storage' && n !== 'pettingLevel');
    const profile = parseBlobbonautEvent(event)!;

    const normalized = buildNormalizedProfileTags(profile);

    expect(normalized.some(([n]) => n === 'storage')).toBe(false);
  });
});

describe('the kit cannot create or actively update kind 11125 storage', () => {
  it('drops a `storage` write on a profile that has none', () => {
    const tags = buildBlobbonautTags(PUBKEY);
    const updated = updateBlobbonautTags(tags, { xp: '10', storage: 'food_cake:5' });

    expect(updated.some(([n]) => n === 'storage')).toBe(false);
    expect(updated.find(([n]) => n === 'xp')?.[1]).toBe('10');
  });

  it('drops a `storage` write without disturbing pre-existing storage tags', () => {
    const before = legacyProfileEvent().tags.filter(([n]) => n === 'storage');
    const updated = updateBlobbonautTags(legacyProfileEvent().tags, {
      xp: '10',
      storage: ['food_cake:99', 'toy-ball:99'],
    });

    expect(updated.filter(([n]) => n === 'storage')).toEqual(before);
  });

  it('never deletes pre-existing storage, even via an empty-array write', () => {
    const before = legacyProfileEvent().tags.filter(([n]) => n === 'storage');
    const updated = updateBlobbonautTags(legacyProfileEvent().tags, { storage: [] });

    expect(updated.filter(([n]) => n === 'storage')).toEqual(before);
  });
});

describe('removed public API surface', () => {
  it('does not export the consumable-storage helpers from the core barrel', () => {
    for (const name of ['parseStorageTags', 'createStorageTags']) {
      expect(coreBarrel).not.toHaveProperty(name);
      expect(blobbiModule).not.toHaveProperty(name);
      expect((coreBarrel as unknown as Record<string, unknown>)[name]).toBeUndefined();
    }
  });

  // NOTE: only *runtime* exports can be checked here. `StorageItem` was an
  // interface, so it never appears in `Object.keys` and its removal is proven
  // solely by the `@ts-expect-error` assertions at the bottom of this file.
  it('exports no runtime member named after the storage-tag helpers', () => {
    const offenders = Object.keys(coreBarrel).filter((k) => /StorageTags$/.test(k));
    expect(offenders).toEqual([]);
  });

  it('still exports the non-inventory profile API it must keep', () => {
    for (const name of [
      'parseBlobbonautEvent',
      'buildBlobbonautTags',
      'buildNormalizedProfileTags',
      'updateBlobbonautTags',
      'mergeBlobbonautTagsForRepublish',
      'MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES',
      'KIND_BLOBBONAUT_PROFILE',
    ]) {
      expect(coreBarrel).toHaveProperty(name);
    }
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

// @ts-expect-error `StorageItem` was removed from the public API in 0.3.0.
export type _RemovedStorageItem = import('./blobbi').StorageItem;

// @ts-expect-error `BlobbonautProfile.storage` was removed from the profile model in 0.3.0.
export type _RemovedProfileStorage = BlobbonautProfile['storage'];

// @ts-expect-error `StorageItem` is no longer reachable from the package barrel.
export type _RemovedBarrelStorageItem = import('./index').StorageItem;

describe('type-level removals', () => {
  it('keeps the compile-time assertions above wired into a running suite', () => {
    // The assertions are the @ts-expect-error directives; this case exists so
    // the file's type-level intent is visible in test output too.
    const profile = parseBlobbonautEvent(legacyProfileEvent())!;
    const keys = Object.keys(profile);
    expect(keys).toContain('allTags');
    expect(keys).not.toContain('storage');
  });
});
