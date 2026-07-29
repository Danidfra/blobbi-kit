import { describe, it, expect } from 'vitest';

import {
  buildEggTags,
  updateBlobbiTags,
  mergeBlobbiStateTagsForRepublish,
  updateBlobbonautTags,
  mergeBlobbonautTagsForRepublish,
  buildBlobbonautTags,
  getTagValues,
  MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES,
} from './blobbi';
import { validateAndRepairBlobbiTags } from './blobbi-tag-schema';

/**
 * These tests lock in a protocol invariant, NOT current-app behavior:
 *
 *   Unknown / unmanaged extension tags MUST survive core's generic
 *   republish/update flows. Host apps (e.g. Blobbi Island) attach their own
 *   tags to Blobbi events — future accessories, `equip` on kind 31124, `inv`
 *   on kind 11125. Core does not understand these tags but must never clobber
 *   them.
 *
 * We are intentionally NOT standardizing `equip`/`inv`, not adding an accessory
 * schema, and not adding an inventory kind. These tests exist so a future
 * change that would silently drop host extension tags fails loudly here.
 */

const PUBKEY = 'a'.repeat(64);
const PET_ID = '0123456789';
const CREATED_AT = 1_700_000_000;

/** Collect all values for a given tag name, order-preserving. */
function valuesFor(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map((t) => t[1]);
}

describe('extension tag preservation — kind 31124 (Blobbi state)', () => {
  it('preserves repeated equip tags through updateBlobbiTags', () => {
    const base = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
    const withEquip = [
      ...base,
      ['equip', 'hat-001'],
      ['equip', 'scarf-002'],
    ];

    const updated = updateBlobbiTags(withEquip, { happiness: '80' });

    expect(valuesFor(updated, 'equip')).toEqual(['hat-001', 'scarf-002']);
    // sanity: the managed update we asked for was applied
    expect(updated.find(([n]) => n === 'happiness')?.[1]).toBe('80');
  });

  it('preserves repeated equip tags through mergeBlobbiStateTagsForRepublish', () => {
    const base = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
    const withEquip = [...base, ['equip', 'hat-001'], ['equip', 'scarf-002']];

    const merged = mergeBlobbiStateTagsForRepublish(withEquip, { hunger: '50' });

    expect(valuesFor(merged, 'equip')).toEqual(['hat-001', 'scarf-002']);
  });

  it('preserves equip tags through the stage-transition cleanup path (cleanupTaskTags: true)', () => {
    // Simulate a baby event mid-progression carrying host equip tags + task tags.
    const base = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
    const babyTags = base
      .map((t) => (t[0] === 'stage' ? ['stage', 'baby'] : t))
      .filter(([n]) => n !== 'progression_state');
    const withExtras = [
      ...babyTags,
      ['progression_state', 'evolving'],
      ['progression_started_at', String(CREATED_AT)],
      ['task', 'feed:3'],
      ['task_completed', 'feed'],
      ['equip', 'hat-001'],
      ['equip', 'scarf-002'],
    ];

    const result = validateAndRepairBlobbiTags(withExtras, withExtras, {
      cleanupTaskTags: true,
    });

    // Task tags were cleaned up (expected)...
    expect(valuesFor(result.tags, 'task')).toEqual([]);
    expect(valuesFor(result.tags, 'progression_state')).toEqual([]);
    // ...but host extension tags MUST survive the cleanup.
    expect(valuesFor(result.tags, 'equip')).toEqual(['hat-001', 'scarf-002']);
  });

  it('does not invent or strip equip tags when none are present', () => {
    const base = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');
    const updated = updateBlobbiTags(base, { energy: '90' });
    expect(valuesFor(updated, 'equip')).toEqual([]);
  });
});

describe('extension tag preservation — kind 11125 (Blobbonaut profile)', () => {
  it('preserves repeated inv tags through updateBlobbonautTags', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withInv = [
      ...base,
      ['inv', 'potion:3'],
      ['inv', 'key:1'],
    ];

    const updated = updateBlobbonautTags(withInv, { coins: '150' });

    expect(valuesFor(updated, 'inv')).toEqual(['potion:3', 'key:1']);
    expect(updated.find(([n]) => n === 'coins')?.[1]).toBe('150');
  });

  it('preserves repeated inv tags through mergeBlobbonautTagsForRepublish', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withInv = [...base, ['inv', 'potion:3'], ['inv', 'key:1']];

    const merged = mergeBlobbonautTagsForRepublish(withInv, { xp: '42' });

    expect(valuesFor(merged, 'inv')).toEqual(['potion:3', 'key:1']);
  });

  it('still deduplicates managed has tags while preserving inv', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withDup = [
      ...base,
      ['has', 'blobbi-x'],
      ['has', 'blobbi-x'],
      ['inv', 'potion:3'],
    ];

    const merged = updateBlobbonautTags(withDup, {});

    expect(getTagValues(merged, 'has')).toEqual(['blobbi-x']);
    expect(valuesFor(merged, 'inv')).toEqual(['potion:3']);
  });
});

/**
 * Consumable inventory removal (product decision, @blobbi-kit/core 0.3.0):
 *
 *   Consumable inventory is not modeled on kind 11125 at all. Legacy `storage`
 *   tags must be:
 *     - treated as opaque, host-owned extension tags (NOT managed),
 *     - preserved verbatim when an existing profile is rewritten,
 *     - never generated or mutated by the kit (no dual write, no backfill).
 *
 *   `inv` (accessory/cosmetic host data) is unrelated and must keep behaving
 *   exactly as before — the tests above already lock that in.
 */
describe('consumable storage decoupling — kind 11125 (Blobbonaut profile)', () => {
  it('no longer treats `storage` as a managed tag', () => {
    expect(MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES.has('storage')).toBe(false);
  });

  it('preserves legacy storage tags verbatim through updateBlobbonautTags', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withStorage = [
      ...base,
      ['storage', 'food_cake:3'],
      ['storage', 'medicine-basic:1'],
    ];

    const updated = updateBlobbonautTags(withStorage, { coins: '150' });

    // Legacy storage passes through opaquely (like inv), unchanged and unordered-merged.
    expect(valuesFor(updated, 'storage')).toEqual(['food_cake:3', 'medicine-basic:1']);
    expect(updated.find(([n]) => n === 'coins')?.[1]).toBe('150');
  });

  it('preserves legacy storage tags through mergeBlobbonautTagsForRepublish', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withStorage = [...base, ['storage', 'food_cake:3'], ['storage', 'toy-ball:2']];

    const merged = mergeBlobbonautTagsForRepublish(withStorage, { xp: '42' });

    expect(valuesFor(merged, 'storage')).toEqual(['food_cake:3', 'toy-ball:2']);
    expect(merged.find(([n]) => n === 'xp')?.[1]).toBe('42');
  });

  it('refuses to WRITE new storage tags: a `storage` update key is dropped', () => {
    const base = buildBlobbonautTags(PUBKEY);

    const updated = updateBlobbonautTags(base, {
      coins: '10',
      storage: 'food_cake:5',
    });

    // The kit never generates new consumable storage tags on kind 11125.
    expect(valuesFor(updated, 'storage')).toEqual([]);
    // The non-storage update still applied.
    expect(updated.find(([n]) => n === 'coins')?.[1]).toBe('10');
  });

  it('drops a `storage` update key but still preserves pre-existing storage tags', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withStorage = [...base, ['storage', 'food_cake:3']];

    // Attempt to overwrite storage AND update coins.
    const updated = updateBlobbonautTags(withStorage, {
      coins: '20',
      storage: 'food_cake:99',
    });

    // The update value is ignored; the original legacy tag survives unchanged.
    expect(valuesFor(updated, 'storage')).toEqual(['food_cake:3']);
    expect(updated.find(([n]) => n === 'coins')?.[1]).toBe('20');
  });

  it('keeps `inv` and legacy `storage` independent and both untouched', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const withBoth = [
      ...base,
      ['inv', 'hat-001'],
      ['storage', 'food_cake:3'],
    ];

    const merged = mergeBlobbonautTagsForRepublish(withBoth, { xp: '7' });

    expect(valuesFor(merged, 'inv')).toEqual(['hat-001']);
    expect(valuesFor(merged, 'storage')).toEqual(['food_cake:3']);
  });

  it('preserves legacy storage tags tag-for-tag, including malformed and extra-element tags', () => {
    // Deliberately hostile shapes: values the removed `parseStorageTags` would
    // have dropped (bad quantity, zero quantity, no separator) and tags with
    // extra elements the old `['storage','id:qty']` model could not express.
    // As opaque unknown tags these must survive byte-for-byte regardless.
    const base = buildBlobbonautTags(PUBKEY);
    const legacyStorage = [
      ['storage', 'food_cake:3'],
      ['storage', 'toy-ball:not-a-number'],
      ['storage', 'medicine-basic:0'],
      ['storage', 'malformed-no-colon'],
      ['storage', 'hygiene-soap:2', 'extra-element', 'another'],
      ['storage', ''],
    ];
    const withStorage = [...base, ...legacyStorage];

    const merged = mergeBlobbonautTagsForRepublish(withStorage, { xp: '9', coins: '12' });

    // Identical tags, identical order, identical arity — nothing normalized away.
    expect(merged.filter(([n]) => n === 'storage')).toEqual(legacyStorage);
  });

  it('preserves arbitrary host extension tags alongside legacy storage', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const extensions = [
      ['inv', 'hat-001'],
      ['storage', 'food_cake:3'],
      ['room_layout', '{"couch":[1,2]}'],
      ['island_quest', 'q-42', 'in-progress'],
      ['x-vendor-thing', 'anything at all'],
    ];

    const merged = mergeBlobbonautTagsForRepublish([...base, ...extensions], { name: 'Nova' });

    for (const tag of extensions) {
      expect(merged).toContainEqual(tag);
    }
    expect(merged.find(([n]) => n === 'name')?.[1]).toBe('Nova');
  });

  it('updates normal profile fields without clobbering unknown tags', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const extensions = [
      ['inv', 'hat-001'],
      ['inv', 'scarf-002'],
      ['storage', 'food_cake:3'],
      ['room_layout', '{"couch":[1,2]}'],
    ];

    // Every managed field the kit actually writes, in one republish.
    const merged = mergeBlobbonautTagsForRepublish([...base, ...extensions], {
      coins: '999',
      xp: '4200',
      level: '7',
      room: 'kitchen',
      name: 'Nova',
      current_companion: 'blobbi-abc',
      has: ['blobbi-abc', 'blobbi-def'],
      blobbi_onboarding_done: 'true',
      pettingLevel: '11',
    });

    expect(merged.find(([n]) => n === 'coins')?.[1]).toBe('999');
    expect(merged.find(([n]) => n === 'xp')?.[1]).toBe('4200');
    expect(merged.find(([n]) => n === 'level')?.[1]).toBe('7');
    expect(merged.find(([n]) => n === 'room')?.[1]).toBe('kitchen');
    expect(getTagValues(merged, 'has')).toEqual(['blobbi-abc', 'blobbi-def']);

    for (const tag of extensions) {
      expect(merged).toContainEqual(tag);
    }
    // ...and exactly once each — no duplication from the passthrough.
    expect(valuesFor(merged, 'inv')).toEqual(['hat-001', 'scarf-002']);
    expect(valuesFor(merged, 'storage')).toEqual(['food_cake:3']);
  });

  it('never emits a storage tag when building a fresh profile', () => {
    expect(valuesFor(buildBlobbonautTags(PUBKEY), 'storage')).toEqual([]);
  });

  it('never invents a storage tag on a profile that has none', () => {
    const base = buildBlobbonautTags(PUBKEY);
    const merged = mergeBlobbonautTagsForRepublish([...base, ['inv', 'hat-001']], {
      coins: '5',
      xp: '10',
    });
    expect(valuesFor(merged, 'storage')).toEqual([]);
  });
});
