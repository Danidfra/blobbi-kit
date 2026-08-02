import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBONAUT_PROFILE,
  buildBlobbonautTags,
  parseBlobbonautEvent,
  updateBlobbonautTags,
  type BlobbonautProfile,
} from '@blobbi-kit/core/blobbi';

import * as reactBarrel from '../index';

/**
 * Removal of the obsolete profile-Coin economy surface (0.4.0) — React side.
 *
 * @blobbi-kit/react consumes `BlobbonautProfile` straight from core, so the
 * removal of `coins` (and the onboarding economy constants) must hold here
 * identically: no re-export, no typed field, and legacy `coins` tags flowing
 * through hook-shaped republishes as opaque unknown tags — the same pattern
 * profile-storage-removal.test.tsx locks in for `storage`.
 */

const PUBKEY = 'd'.repeat(64);

function legacyCoinProfileEvent(): NostrEvent {
  return {
    id: 'b'.repeat(64),
    pubkey: PUBKEY,
    created_at: 1_700_000_000,
    kind: KIND_BLOBBONAUT_PROFILE,
    tags: [
      ...buildBlobbonautTags(PUBKEY),
      ['coins', '200'],
      ['inv', 'hat-001'],
    ],
    content: '',
    sig: '0'.repeat(128),
  };
}

describe('removed economy surface — @blobbi-kit/react', () => {
  it('re-exports nothing that mentions Coins', () => {
    const offenders = Object.keys(reactBarrel).filter((k) => /coin/i.test(k));
    expect(offenders).toEqual([]);
  });

  it('does not re-export the removed core economy constants transitively', () => {
    for (const name of [
      'INITIAL_BLOBBONAUT_COINS',
      'BLOBBI_PREVIEW_REROLL_COST',
      'BLOBBI_ADOPTION_COST',
    ]) {
      expect(reactBarrel).not.toHaveProperty(name);
    }
  });

  it('receives a coins-free profile from core for a coin-carrying event', () => {
    // The exact object react hooks are handed as `profile: BlobbonautProfile`.
    const profile: BlobbonautProfile = parseBlobbonautEvent(legacyCoinProfileEvent())!;
    expect('coins' in profile).toBe(false);
    // The raw tag survives for hosts that republish via allTags.
    expect(profile.allTags.filter(([n]) => n === 'coins')).toEqual([['coins', '200']]);
  });

  it('preserves the legacy coins tag through the canonical host republish pattern', () => {
    const profile = parseBlobbonautEvent(legacyCoinProfileEvent())!;
    const republished = updateBlobbonautTags(profile.allTags, { xp: '900' });

    expect(republished.filter(([n]) => n === 'coins')).toEqual([['coins', '200']]);
    expect(republished.filter(([n]) => n === 'inv')).toEqual([['inv', 'hat-001']]);
  });
});

/**
 * Type-level removal assertions, checked by `npm run typecheck`. Each directive
 * fails as TS2578 "Unused '@ts-expect-error' directive" if the removed member
 * ever returns. Exported on purpose — see profile-storage-removal.test.tsx.
 */

// @ts-expect-error `BlobbonautProfile.coins` was removed from the profile model in 0.4.0.
export type _RemovedProfileCoins = BlobbonautProfile['coins'];

// @ts-expect-error `INITIAL_BLOBBONAUT_COINS` is gone from the core module react consumes.
export type _RemovedInitialCoins = (typeof import('@blobbi-kit/core/blobbi'))['INITIAL_BLOBBONAUT_COINS'];

describe('type-level removals', () => {
  it('keeps the compile-time assertions above wired into a running suite', () => {
    const profile = parseBlobbonautEvent(legacyCoinProfileEvent())!;
    expect(Object.keys(profile)).not.toContain('coins');
  });
});
