/**
 * The visual generation is identity from birth and never changes on a
 * lifecycle transition. Pinned at the hook level, where the events are
 * actually built: a V2 egg hatches into a V2 baby and evolves into a V2
 * adult; a V1 Blobbi (no tag, born before the marker or on request) stays
 * V1 through both, and neither transition invents or drops the tag.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  KIND_BLOBBI_STATE,
  NEW_BLOBBI_VISUAL_GENERATION,
  VISUAL_GENERATION_TAG,
  buildEggTags,
  getTagValue,
  parseModernBlobbiEvent,
  type BlobbiCompanion,
  type BlobbiVisualGeneration,
  type BlobbonautProfile,
} from '@blobbi-kit/core/blobbi';
import type { NostrEvent } from '@blobbi-kit/core/nostr-protocol';
import { serializeEvolutionContent } from '@blobbi-kit/core/missions';
import { deriveAdultFormFromSeed } from '@blobbi-kit/core/types/adult';
import { planHatchTransition, useBlobbiHatch } from './useBlobbiHatch';
import { useBlobbiEvolve, type CanonicalActionResult } from './useBlobbiEvolve';
import { createEvolveMissions, createHatchMissions } from '../lib/evolution-missions';
import { clearEvolutionFromStorage } from '../lib/daily-mission-tracker';

const PUBKEY = 'a'.repeat(64);
const PET_ID = '0000000042';
const CREATED_AT = 1_757_000_000;
const NOW = CREATED_AT + 86_400;

function event(tags: string[][], content = ''): NostrEvent {
  return { id: 'e'.repeat(64), pubkey: PUBKEY, created_at: CREATED_AT + 60, kind: KIND_BLOBBI_STATE, tags, content, sig: '0'.repeat(128) };
}

/** An incubating egg of the given generation, exactly as a creating host builds it. */
function egg(generation: BlobbiVisualGeneration): NostrEvent {
  const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Shell', { visualGeneration: generation })
    .map((t) => (t[0] === 'progression_state' ? ['progression_state', 'incubating'] : t))
    .concat([['progression_started_at', String(CREATED_AT + 60)]]);
  return event(tags, serializeEvolutionContent('', createHatchMissions()));
}

/** An evolving baby of the given generation: the egg hatched, as `planHatchTransition` writes it. */
function baby(generation: BlobbiVisualGeneration): NostrEvent {
  const plan = planHatchTransition(canonicalFor(egg(generation)), NOW - 3_600);
  return event(plan.event.tags, serializeEvolutionContent('', createEvolveMissions()));
}

function canonicalFor(ev: NostrEvent): CanonicalActionResult {
  const companion = parseModernBlobbiEvent(ev);
  if (!companion) throw new Error('fixture must be modern');
  return { companion, content: ev.content, allTags: companion.allTags, profileAllTags: [] };
}

const generationOf = (tags: string[][]) => getTagValue(tags, VISUAL_GENERATION_TAG);

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
const profile = { has: [], xp: 0 } as unknown as BlobbonautProfile;
const publisher = () =>
  vi.fn(async (template: { kind: number; content?: string; tags?: string[][] }) => ({
    ...template,
    content: template.content ?? '',
    tags: template.tags ?? [],
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    created_at: NOW,
    sig: '0'.repeat(128),
  }));

beforeEach(() => clearEvolutionFromStorage(PUBKEY, `blobbi-${PUBKEY.slice(0, 12)}-${PET_ID}`));

describe('creation', () => {
  it('a new egg is born into the current generation (v2) and parses as such; a v1 egg on request carries no tag', () => {
    expect(NEW_BLOBBI_VISUAL_GENERATION).toBe('v2');
    expect(parseModernBlobbiEvent(egg('v2'))!.visualGeneration).toBe('v2');
    expect(generationOf(egg('v2').tags)).toBe('v2');
    expect(parseModernBlobbiEvent(egg('v1'))!.visualGeneration).toBe('v1');
    expect(generationOf(egg('v1').tags)).toBeUndefined();
  });
});

describe('hatch preserves the generation', () => {
  it('v2 egg -> v2 baby (plan and hook), with one tag, not two', async () => {
    const plan = planHatchTransition(canonicalFor(egg('v2')), NOW);
    expect(generationOf(plan.event.tags)).toBe('v2');
    expect(plan.event.tags.filter((t) => t[0] === VISUAL_GENERATION_TAG)).toHaveLength(1);
    expect(parseModernBlobbiEvent(event(plan.event.tags, plan.event.content))!.visualGeneration).toBe('v2');

    const source = egg('v2');
    const companion = parseModernBlobbiEvent(source) as BlobbiCompanion;
    const publish = publisher();
    const { result } = renderHook(() => useBlobbiHatch({ companion, profile, pubkey: PUBKEY, publish, ensureCanonicalBeforeAction: vi.fn().mockResolvedValue(canonicalFor(source)), updateCompanionEvent: vi.fn() }), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const published = publish.mock.calls[0][0];
    expect(getTagValue(published.tags ?? [], 'stage')).toBe('baby');
    expect(generationOf(published.tags ?? [])).toBe('v2');
  });

  it('v1 egg -> v1 baby: the tag is never invented', async () => {
    const plan = planHatchTransition(canonicalFor(egg('v1')), NOW);
    expect(generationOf(plan.event.tags)).toBeUndefined();
    expect(parseModernBlobbiEvent(event(plan.event.tags, plan.event.content))!.visualGeneration).toBe('v1');

    const source = egg('v1');
    const companion = parseModernBlobbiEvent(source) as BlobbiCompanion;
    const publish = publisher();
    const { result } = renderHook(() => useBlobbiHatch({ companion, profile, pubkey: PUBKEY, publish, ensureCanonicalBeforeAction: vi.fn().mockResolvedValue(canonicalFor(source)), updateCompanionEvent: vi.fn() }), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(generationOf(publish.mock.calls[0][0].tags ?? [])).toBeUndefined();
  });
});

describe('evolve preserves the generation', () => {
  const evolve = async (source: NostrEvent) => {
    const companion = parseModernBlobbiEvent(source) as BlobbiCompanion;
    const publish = publisher();
    const { result } = renderHook(() => useBlobbiEvolve({ companion, profile, pubkey: PUBKEY, publish, ensureCanonicalBeforeAction: vi.fn().mockResolvedValue(canonicalFor(source)), updateCompanionEvent: vi.fn() }), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(publish).toHaveBeenCalledTimes(1);
    return publish.mock.calls[0][0].tags ?? [];
  };

  it('v2 baby -> v2 adult: the tag rides through, once', async () => {
    const tags = await evolve(baby('v2'));
    expect(getTagValue(tags, 'stage')).toBe('adult');
    expect(generationOf(tags)).toBe('v2');
    expect(tags.filter((t) => t[0] === VISUAL_GENERATION_TAG)).toHaveLength(1);
    expect(parseModernBlobbiEvent(event(tags))!.visualGeneration).toBe('v2');
  });

  it('v1 baby -> v1 adult: no tag appears; evolution never upgrades the artwork', async () => {
    const tags = await evolve(baby('v1'));
    expect(getTagValue(tags, 'stage')).toBe('adult');
    expect(generationOf(tags)).toBeUndefined();
    expect(parseModernBlobbiEvent(event(tags))!.visualGeneration).toBe('v1');
  });

  it('the adult form is the seed\'s on both generations: the transition writes only the mirror of the seed, and the parser reads the seed', async () => {
    for (const generation of ['v1', 'v2'] as const) {
      const tags = await evolve(baby(generation));
      const seed = getTagValue(tags, 'seed')!;
      expect(getTagValue(tags, 'adult_type')).toBe(deriveAdultFormFromSeed(seed));
      expect(parseModernBlobbiEvent(event(tags))!.adultType).toBe(deriveAdultFormFromSeed(seed));
    }
  });
});
