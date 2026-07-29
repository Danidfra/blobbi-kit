import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  buildEggTags,
  buildBlobbonautTags,
  parseBlobbiEvent,
  parseBlobbonautEvent,
  updateBlobbonautTags,
  type BlobbiCompanion,
  type BlobbonautProfile,
} from '@blobbi-kit/core/blobbi';

import * as reactBarrel from '../index';
import { useStartIncubation, type CanonicalIncubationResult } from './useBlobbiIncubation';
import { useBlobbiEvolve, type CanonicalActionResult } from './useBlobbiEvolve';
import type { FreshBlobbiResult } from './useFreshBlobbiBeforeAction';

/**
 * Removal of `profileStorage` from the public hook result types (0.3.0).
 *
 * The deprecated consumable-inventory model is gone from @blobbi-kit/react:
 * incubation, evolve, and fresh-profile results no longer carry (or require)
 * `profileStorage`, and nothing in the package imports `StorageItem`.
 *
 * `profileAllTags` is the only profile channel these results expose, and it is
 * the raw tag list — so legacy `storage` and host `inv` tags still flow through
 * hosts untouched, as opaque unknown tags.
 */

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query: vi.fn().mockResolvedValue([]) } }),
}));

const PUBKEY = 'a'.repeat(64);
const PET_ID = '0123456789';
const CREATED_AT = 1_700_000_000;

const publish = vi.fn<(...args: unknown[]) => Promise<NostrEvent>>();

/**
 * Profile tags carrying legacy consumable `storage` plus host `inv`.
 *
 * A factory, not a shared const: these arrays are handed to hooks as
 * `profile.allTags` / `profileAllTags`, and a shared instance would let an
 * in-place mutation leak between cases — including into the "byte-for-byte
 * intact" assertion, which would then compare a mutated value against itself.
 */
function legacyProfileTags(): string[][] {
  return [
    ...buildBlobbonautTags(PUBKEY),
    ['coins', '100'],
    ['storage', 'food_cake:3'],
    ['storage', 'medicine-basic:1'],
    ['inv', 'hat-001'],
  ];
}

function makeEggEvent(): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky'),
    content: '',
    sig: '0'.repeat(128),
  };
}

function makeCompanion(): BlobbiCompanion {
  const parsed = parseBlobbiEvent(makeEggEvent());
  if (!parsed) throw new Error('fixture did not parse');
  return parsed;
}

/** The same Blobbi at baby stage, the only stage `useBlobbiEvolve` accepts. */
function makeBabyEvent(): NostrEvent {
  const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky').map((t) =>
    t[0] === 'stage' ? ['stage', 'baby'] : t,
  );
  return { ...makeEggEvent(), tags };
}

function makeBabyCompanion(): BlobbiCompanion {
  const parsed = parseBlobbiEvent(makeBabyEvent());
  if (!parsed) throw new Error('baby fixture did not parse');
  return parsed;
}

function makeProfileEvent(): NostrEvent {
  return {
    id: 'a'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBONAUT_PROFILE,
    tags: legacyProfileTags(),
    content: '',
    sig: '0'.repeat(128),
  };
}

/**
 * A profile parsed from an event that still carries legacy `storage` tags.
 * It satisfies `BlobbonautProfile` with no inventory field of any kind.
 */
function makeProfile(): BlobbonautProfile {
  const parsed = parseBlobbonautEvent(makeProfileEvent());
  if (!parsed) throw new Error('profile fixture did not parse');
  return parsed;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('incubation works with a canonical result that has no profileStorage', () => {
  beforeEach(() => {
    publish.mockReset();
    publish.mockResolvedValue(makeEggEvent());
  });

  it('starts incubation and publishes when ensureCanonicalBeforeAction omits profileStorage', async () => {
    const companion = makeCompanion();

    // The object a host builds today: no `profileStorage` anywhere. This must
    // satisfy CanonicalIncubationResult and drive the flow to a publish.
    const canonical: CanonicalIncubationResult = {
      companion,
      content: companion.event.content,
      allTags: companion.allTags,
      profileAllTags: legacyProfileTags(),
    };

    const updateCompanionEvent = vi.fn();
    const { result } = renderHook(
      () =>
        useStartIncubation({
          companion,
          profile: makeProfile(),
          pubkey: PUBKEY,
          publish,
          ensureCanonicalBeforeAction: vi.fn().mockResolvedValue(canonical),
          updateCompanionEvent,
        }),
      { wrapper },
    );

    await result.current.mutateAsync({ mode: 'start' });

    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));

    const published = publish.mock.calls[0][0] as { kind: number; tags: string[][] };
    expect(published.kind).toBe(KIND_BLOBBI_STATE);
    // The incubation publish targets kind 31124 and must not emit profile
    // inventory of any kind.
    expect(published.tags.some(([n]) => n === 'storage')).toBe(false);
    expect(updateCompanionEvent).toHaveBeenCalled();
  });

  it('leaves the profile tags it was handed byte-for-byte intact', async () => {
    const companion = makeCompanion();
    const profileAllTags = legacyProfileTags();

    const canonical: CanonicalIncubationResult = {
      companion,
      content: companion.event.content,
      allTags: companion.allTags,
      profileAllTags,
    };

    const { result } = renderHook(
      () =>
        useStartIncubation({
          companion,
          profile: makeProfile(),
          pubkey: PUBKEY,
          publish,
          ensureCanonicalBeforeAction: vi.fn().mockResolvedValue(canonical),
          updateCompanionEvent: vi.fn(),
        }),
      { wrapper },
    );

    await result.current.mutateAsync({ mode: 'start' });

    // Incubation never touches the profile tag list it was given.
    expect(profileAllTags).toEqual(legacyProfileTags());
  });
});

describe('evolve works with a canonical result that has no profileStorage', () => {
  beforeEach(() => {
    publish.mockReset();
    publish.mockResolvedValue(makeBabyEvent());
  });

  it('evolves baby → adult and publishes when the result omits profileStorage', async () => {
    const companion = makeBabyCompanion();

    const canonical: CanonicalActionResult = {
      companion,
      content: companion.event.content,
      allTags: companion.allTags,
      profileAllTags: legacyProfileTags(),
    };

    const updateCompanionEvent = vi.fn();
    const { result } = renderHook(
      () =>
        useBlobbiEvolve({
          companion,
          profile: makeProfile(),
          pubkey: PUBKEY,
          publish,
          ensureCanonicalBeforeAction: vi.fn().mockResolvedValue(canonical),
          updateCompanionEvent,
        }),
      { wrapper },
    );

    await result.current.mutateAsync();

    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));

    const published = publish.mock.calls[0][0] as { kind: number; tags: string[][] };
    expect(published.kind).toBe(KIND_BLOBBI_STATE);
    expect(published.tags.find(([n]) => n === 'stage')?.[1]).toBe('adult');
    // The evolve publish targets kind 31124 and must never emit profile inventory.
    expect(published.tags.some(([n]) => n === 'storage')).toBe(false);
    expect(updateCompanionEvent).toHaveBeenCalled();
  });

  it('leaves the profile tags it was handed intact', async () => {
    const companion = makeBabyCompanion();
    const profileAllTags = legacyProfileTags();

    const { result } = renderHook(
      () =>
        useBlobbiEvolve({
          companion,
          profile: makeProfile(),
          pubkey: PUBKEY,
          publish,
          ensureCanonicalBeforeAction: vi.fn().mockResolvedValue({
            companion,
            content: companion.event.content,
            allTags: companion.allTags,
            profileAllTags,
          } satisfies CanonicalActionResult),
          updateCompanionEvent: vi.fn(),
        }),
      { wrapper },
    );

    await result.current.mutateAsync();

    expect(profileAllTags).toEqual(legacyProfileTags());
  });
});

describe('profile republish from a hook result preserves legacy storage and inv', () => {
  it('round-trips profileAllTags through the core merge helper untouched', () => {
    const canonical: CanonicalActionResult = {
      companion: makeCompanion(),
      content: '',
      allTags: [],
      profileAllTags: legacyProfileTags(),
    };

    // The canonical host pattern: take profileAllTags, apply managed updates,
    // republish kind 11125.
    const republished = updateBlobbonautTags(canonical.profileAllTags, {
      coins: '250',
      xp: '900',
    });

    expect(republished.filter(([n]) => n === 'storage')).toEqual([
      ['storage', 'food_cake:3'],
      ['storage', 'medicine-basic:1'],
    ]);
    expect(republished.filter(([n]) => n === 'inv')).toEqual([['inv', 'hat-001']]);
    expect(republished.find(([n]) => n === 'coins')?.[1]).toBe('250');
    expect(KIND_BLOBBONAUT_PROFILE).toBe(11125);
  });
});

describe('removed public API surface — @blobbi-kit/react', () => {
  it('re-exports nothing named after the consumable-storage model', () => {
    const offenders = Object.keys(reactBarrel).filter((k) =>
      /StorageItem|StorageTags|profileStorage/i.test(k),
    );
    expect(offenders).toEqual([]);
  });

  // `StorageItem` is type-only and can never appear as a runtime key, so its
  // removal is asserted by the `@ts-expect-error` block below, not here.
  it('does not re-export the removed core helpers transitively', () => {
    for (const name of ['parseStorageTags', 'createStorageTags']) {
      expect(reactBarrel).not.toHaveProperty(name);
    }
  });
});

/**
 * Type-level removal assertions, checked by `npm run typecheck` (the package
 * tsconfig includes `src`, so `*.test.tsx` is type-checked). Each directive
 * fails as TS2578 "Unused '@ts-expect-error' directive" if the removed member
 * ever returns.
 *
 * The aliases are `export`ed on purpose — an unexported unused alias would trip
 * `noUnusedLocals`, and the directive would then be satisfied by that error
 * regardless of whether the member still exists.
 */

// @ts-expect-error `FreshBlobbiResult.profileStorage` was removed in 0.3.0.
export type _RemovedFreshProfileStorage = FreshBlobbiResult['profileStorage'];

// @ts-expect-error `CanonicalIncubationResult.profileStorage` was removed in 0.3.0.
export type _RemovedIncubationProfileStorage = CanonicalIncubationResult['profileStorage'];

// @ts-expect-error `CanonicalActionResult.profileStorage` was removed in 0.3.0.
export type _RemovedActionProfileStorage = CanonicalActionResult['profileStorage'];

describe('type-level removals', () => {
  it('accepts hook results built without profileStorage', () => {
    const companion = makeCompanion();

    // All three public result shapes construct cleanly with no inventory field.
    const fresh: FreshBlobbiResult = {
      companion,
      allTags: companion.allTags,
      content: companion.event.content,
      profileAllTags: legacyProfileTags(),
      profileEvent: makeProfileEvent(),
    };
    const incubation: CanonicalIncubationResult = {
      companion,
      content: '',
      allTags: [],
      profileAllTags: legacyProfileTags(),
    };
    const action: CanonicalActionResult = {
      companion,
      content: '',
      allTags: [],
      profileAllTags: legacyProfileTags(),
    };

    for (const shape of [fresh, incubation, action]) {
      expect(Object.keys(shape)).not.toContain('profileStorage');
    }
  });
});
