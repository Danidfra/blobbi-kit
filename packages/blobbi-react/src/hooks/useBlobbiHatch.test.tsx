/**
 * Hatch (egg -> baby): the same Blobbi comes out of the shell. Identity and
 * seed survive, stats reset, egg tags are cleaned, evolution begins, and the
 * hook publishes exactly once through the host adapter.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  KIND_BLOBBI_STATE,
  buildEggTags,
  getTagValue,
  getTagValues,
  parseModernBlobbiEvent,
  type BlobbiCompanion,
  type BlobbonautProfile,
} from '@blobbi-kit/core/blobbi';
import type { NostrEvent } from '@blobbi-kit/core/nostr-protocol';
import { parseEvolutionContent, serializeEvolutionContent } from '@blobbi-kit/core/missions';

import { planHatchTransition, useBlobbiHatch } from './useBlobbiHatch';
import { createHatchMissions } from '../lib/evolution-missions';
import { readEvolutionFromStorage, clearEvolutionFromStorage } from '../lib/daily-mission-tracker';
import type { CanonicalActionResult } from './useBlobbiEvolve';

const PUBKEY = 'a'.repeat(64);
const PET_ID = '0000000042';
const CREATED_AT = 1_757_000_000;
const NOW = CREATED_AT + 86_400;

function incubatingEgg(extra: string[][] = []): NostrEvent {
  const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Shell')
    .map((t) => (t[0] === 'progression_state' ? ['progression_state', 'incubating'] : t))
    .concat([['progression_started_at', String(CREATED_AT + 60)], ['visual_generation', 'v2'], ['custom_host_tag', 'keep-me'], ...extra]);
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT + 60,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: serializeEvolutionContent(JSON.stringify({ social_checkpoint: { processed_until: 1 } }), createHatchMissions()),
    sig: '0'.repeat(128),
  };
}

function canonicalFor(event: NostrEvent): CanonicalActionResult {
  const companion = parseModernBlobbiEvent(event);
  if (!companion) throw new Error('fixture must be modern');
  return { companion, content: event.content, allTags: companion.allTags, profileAllTags: [] };
}

describe('planHatchTransition', () => {
  it('keeps identity: same d, same seed, same visual generation, unknown tags kept', () => {
    const egg = incubatingEgg();
    const plan = planHatchTransition(canonicalFor(egg), NOW);
    const t = plan.event.tags;
    expect(getTagValue(t, 'd')).toBe(getTagValue(egg.tags, 'd'));
    expect(getTagValue(t, 'seed')).toBe(getTagValue(egg.tags, 'seed'));
    expect(getTagValue(t, 'name')).toBe('Shell');
    expect(getTagValue(t, 'visual_generation')).toBe('v2');
    expect(getTagValue(t, 'custom_host_tag')).toBe('keep-me');
    expect(getTagValue(t, 'base_color')).toBe(getTagValue(egg.tags, 'base_color'));
    expect(plan.event.prev).toBe(egg);
  });

  it('flips the stage, resets stats, cleans the egg tags and starts evolution', () => {
    const egg = incubatingEgg();
    const plan = planHatchTransition(canonicalFor(egg), NOW);
    const t = plan.event.tags;
    expect(getTagValue(t, 'stage')).toBe('baby');
    expect(getTagValue(t, 'state')).toBe('active');
    for (const stat of ['hunger', 'happiness', 'health', 'hygiene', 'energy']) expect(getTagValue(t, stat)).toBe('100');
    expect(getTagValue(t, 'progression_state')).toBe('evolving');
    expect(getTagValue(t, 'progression_started_at')).toBe(String(NOW));
    expect(getTagValue(t, 'last_decay_at')).toBe(String(NOW));
    expect(getTagValues(t, 'task')).toEqual([]);
    expect(getTagValue(t, 'adult_type')).toBeUndefined();
    const content = JSON.parse(plan.event.content);
    expect(content.social_checkpoint).toBeUndefined();
    expect(parseEvolutionContent(plan.event.content).map((m) => m.id)).toEqual(plan.evolution.map((m) => m.id));
    expect(plan.evolution.length).toBeGreaterThan(0);
  });

  it('can leave evolution unstarted', () => {
    const plan = planHatchTransition(canonicalFor(incubatingEgg()), NOW, { startEvolution: false });
    expect(getTagValue(plan.event.tags, 'progression_state')).toBe('none');
    expect(getTagValue(plan.event.tags, 'progression_started_at')).toBeUndefined();
    expect(plan.evolution).toEqual([]);
  });

  it('refuses anything that is not an egg', () => {
    const baby = incubatingEgg().tags.map((t) => (t[0] === 'stage' ? ['stage', 'baby'] : t));
    const event = { ...incubatingEgg(), tags: baby };
    expect(() => planHatchTransition(canonicalFor(event), NOW)).toThrow(/already hatched/);
  });

  it('is deterministic for the same input and time', () => {
    const a = planHatchTransition(canonicalFor(incubatingEgg()), NOW);
    const b = planHatchTransition(canonicalFor(incubatingEgg()), NOW);
    expect(a.event.tags).toEqual(b.event.tags);
    expect(a.event.content).toBe(b.event.content);
  });
});

describe('useBlobbiHatch', () => {
  const wrapper = ({ children }: { children: ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
  const profile = { has: [], xp: 0 } as unknown as BlobbonautProfile;

  beforeEach(() => clearEvolutionFromStorage(PUBKEY, `blobbi-${PUBKEY.slice(0, 12)}-${PET_ID}`));

  it('reads fresh, publishes once, updates the cache and seeds the evolve missions', async () => {
    const egg = incubatingEgg();
    const companion = parseModernBlobbiEvent(egg) as BlobbiCompanion;
    const ensureCanonicalBeforeAction = vi.fn().mockResolvedValue(canonicalFor(egg));
    const publish = vi.fn(async (template: { kind: number; content?: string; tags?: string[][] }) => ({
      ...template,
      content: template.content ?? '',
      tags: template.tags ?? [],
      id: 'f'.repeat(64),
      pubkey: PUBKEY,
      created_at: NOW,
      sig: '0'.repeat(128),
    }));
    const updateCompanionEvent = vi.fn();
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () => useBlobbiHatch({ companion, profile, pubkey: PUBKEY, publish, ensureCanonicalBeforeAction, updateCompanionEvent, onSuccess }),
      { wrapper },
    );
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(ensureCanonicalBeforeAction).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    const published = publish.mock.calls[0][0];
    expect(published.kind).toBe(KIND_BLOBBI_STATE);
    expect(getTagValue(published.tags ?? [], 'stage')).toBe('baby');
    expect(getTagValue(published.tags ?? [], 'seed')).toBe(companion.seed);
    expect(updateCompanionEvent).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0]).toMatchObject({ previousStage: 'egg', newStage: 'baby', name: 'Shell' });
    expect(readEvolutionFromStorage(PUBKEY, companion.d)?.map((m) => m.id)).toContain('interactions');
  });

  it('a failed publish surfaces as an error and changes nothing', async () => {
    const egg = incubatingEgg();
    const companion = parseModernBlobbiEvent(egg) as BlobbiCompanion;
    const ensureCanonicalBeforeAction = vi.fn().mockResolvedValue(canonicalFor(egg));
    const publish = vi.fn().mockRejectedValue(new Error('relay rejected'));
    const updateCompanionEvent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(
      () => useBlobbiHatch({ companion, profile, pubkey: PUBKEY, publish, ensureCanonicalBeforeAction, updateCompanionEvent, onError }),
      { wrapper },
    );
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(updateCompanionEvent).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('relay rejected');
    expect(readEvolutionFromStorage(PUBKEY, companion.d)).toBeUndefined();
  });

  it('refuses a baby and a missing fresh read', async () => {
    const egg = incubatingEgg();
    const babyEvent = { ...egg, tags: egg.tags.map((t) => (t[0] === 'stage' ? ['stage', 'baby'] : t)) };
    const baby = parseModernBlobbiEvent(babyEvent) as BlobbiCompanion;
    const publish = vi.fn();
    const { result } = renderHook(
      () => useBlobbiHatch({ companion: baby, profile, pubkey: PUBKEY, publish, ensureCanonicalBeforeAction: vi.fn().mockResolvedValue(null), updateCompanionEvent: vi.fn() }),
      { wrapper },
    );
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/already hatched/);
    expect(publish).not.toHaveBeenCalled();

    const companion = parseModernBlobbiEvent(egg) as BlobbiCompanion;
    const { result: r2 } = renderHook(
      () => useBlobbiHatch({ companion, profile, pubkey: PUBKEY, publish, ensureCanonicalBeforeAction: vi.fn().mockResolvedValue(null), updateCompanionEvent: vi.fn() }),
      { wrapper },
    );
    act(() => r2.current.mutate());
    await waitFor(() => expect(r2.current.isError).toBe(true));
    expect(r2.current.error?.message).toMatch(/prepare/);
    expect(publish).not.toHaveBeenCalled();
  });
});
