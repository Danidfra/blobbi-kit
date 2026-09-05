/**
 * Collection semantics a standalone consumer relies on: the four standings a
 * caller must be able to tell apart (unresolved, confirmed empty, non-empty,
 * error), stage shaping, and the legacy policy at the collection layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { NostrEvent, NostrFilter } from '@blobbi-kit/core/nostr-protocol';
import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  buildEggTags,
  getCanonicalBlobbiD,
} from '@blobbi-kit/core/blobbi';

import {
  useBlobbisCollection,
  resolveBlobbiCollectionStatus,
  BLOBBI_COLLECTION_KEEPS,
} from './useBlobbisCollection';

// ─── Relay adapter double ────────────────────────────────────────────────────
//
// `useNostr()` is the only relay access the hook has. The double resolves each
// `query` with whatever the test enqueued, so "a completed read" is exactly a
// resolved promise and "a failed read" a rejected one.

const query = vi.fn<(filters: NostrFilter[], opts?: unknown) => Promise<NostrEvent[]>>();
vi.mock('@nostrify/react', () => ({ useNostr: () => ({ nostr: { query } }) }));

const PUBKEY = 'a'.repeat(64);
const CREATED_AT = 1_757_000_000;

function blobbi(petId: string, stage: 'egg' | 'baby' | 'adult', name = 'Pet', extra: string[][] = []): NostrEvent {
  const tags = buildEggTags(PUBKEY, petId, CREATED_AT, name).map((t) => (t[0] === 'stage' ? ['stage', stage] : t));
  return {
    id: petId.padEnd(64, '0'),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: [...tags, ...extra],
    content: '',
    sig: '0'.repeat(128),
  };
}

const EGG = blobbi('0000000001', 'egg', 'Shell');
const BABY = blobbi('0000000002', 'baby', 'Brook');
const ADULT = blobbi('0000000003', 'adult', 'Elder');
/** Old-app schema on a canonical-looking d: identified and dropped. */
const LEGACY_MARKER = blobbi('0000000004', 'baby', 'Old', [['incubation_time', '3600']]);
/** The historical progression-in-state schema: dropped too. */
const LEGACY_STATE: NostrEvent = {
  ...blobbi('0000000005', 'egg', 'Older'),
  tags: blobbi('0000000005', 'egg', 'Older').tags
    .filter(([n]) => n !== 'progression_state')
    .map((t) => (t[0] === 'state' ? ['state', 'incubating'] : t)),
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  query.mockReset();
});

// ─── The status mapping, independent of relay timing ─────────────────────────

describe('resolveBlobbiCollectionStatus', () => {
  it('a disabled read is idle: nothing is known, not "owns none"', () => {
    expect(resolveBlobbiCollectionStatus({ enabled: false, status: 'pending', count: 0 })).toBe('idle');
  });
  it('an in-flight first read is loading', () => {
    expect(resolveBlobbiCollectionStatus({ enabled: true, status: 'pending', count: 0 })).toBe('loading');
  });
  it('a completed read with nothing matching is the confirmed-empty state', () => {
    expect(resolveBlobbiCollectionStatus({ enabled: true, status: 'success', count: 0 })).toBe('empty');
  });
  it('a completed read with companions is ready', () => {
    expect(resolveBlobbiCollectionStatus({ enabled: true, status: 'success', count: 2 })).toBe('ready');
  });
  it('a failed read is error, never empty', () => {
    expect(resolveBlobbiCollectionStatus({ enabled: true, status: 'error', count: 0 })).toBe('error');
  });
});

// ─── Loading, ready, confirmed empty, idle ───────────────────────────────────

describe('useBlobbisCollection standings', () => {
  it('starts loading, then is ready with every modern companion sorted by d', async () => {
    query.mockResolvedValueOnce([ADULT, EGG, BABY]);
    const { result } = renderHook(() => useBlobbisCollection(undefined, PUBKEY), { wrapper });

    expect(result.current.status).toBe('loading');
    expect(result.current.isResolved).toBe(false);
    expect(result.current.companions).toEqual([]);

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isResolved).toBe(true);
    expect(result.current.companions.map((c) => c.name)).toEqual(['Shell', 'Brook', 'Elder']);
    expect(Object.keys(result.current.companionsByD)).toHaveLength(3);
    // The fetch-all filter is by owner and ecosystem marker, the protocol-level index.
    expect(query.mock.calls[0][0]).toEqual([
      { kinds: [KIND_BLOBBI_STATE], authors: [PUBKEY], '#b': [BLOBBI_ECOSYSTEM_NAMESPACE] },
    ]);
  });

  it('a completed read that returns nothing is confirmed empty', async () => {
    query.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBlobbisCollection(undefined, PUBKEY), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('empty'));
    expect(result.current.isResolved).toBe(true);
    expect(result.current.companions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('a user with only legacy events is confirmed empty, and nothing is migrated', async () => {
    query.mockResolvedValueOnce([LEGACY_MARKER, LEGACY_STATE]);
    const { result } = renderHook(() => useBlobbisCollection(undefined, PUBKEY), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('empty'));
    expect(result.current.companions).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('legacy events next to modern ones are dropped, the modern ones kept', async () => {
    query.mockResolvedValueOnce([LEGACY_MARKER, BABY, LEGACY_STATE]);
    const { result } = renderHook(() => useBlobbisCollection(undefined, PUBKEY), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.companions.map((c) => c.d)).toEqual([getCanonicalBlobbiD(PUBKEY, '0000000002')]);
    expect(BLOBBI_COLLECTION_KEEPS(LEGACY_MARKER)).toBe(false);
    expect(BLOBBI_COLLECTION_KEEPS(BABY)).toBe(true);
  });

  it('without a pubkey the read is idle: not loading, not empty, and the relay is never asked', async () => {
    const { result } = renderHook(() => useBlobbisCollection(undefined, undefined), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.status).toBe('idle');
    expect(result.current.isResolved).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.companions).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('an empty d-list is idle too', async () => {
    const { result } = renderHook(() => useBlobbisCollection([], PUBKEY), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.status).toBe('idle');
    expect(query).not.toHaveBeenCalled();
  });

  it('a failed read is error, with no companions and never confirmed empty', async () => {
    query.mockRejectedValue(new Error('relay unavailable'));
    // The hook retries three times with backoff; a QueryClient cannot override
    // a per-query `retry`, so the error surfaces only after the backoff. Use
    // fake timers to get there without waiting.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result } = renderHook(() => useBlobbisCollection(undefined, PUBKEY), { wrapper });
      expect(result.current.status).toBe('loading');
      for (let i = 0; i < 6 && result.current.status !== 'error'; i++) {
        await vi.advanceTimersByTimeAsync(8_000);
      }
      expect(result.current.status).toBe('error');
      expect(result.current.isResolved).toBe(false);
      expect(result.current.companions).toEqual([]);
      expect(result.current.error).toBeInstanceOf(Error);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── Stage shaping ───────────────────────────────────────────────────────────

describe('options.stages and options.filter', () => {
  it('excludes eggs when asked, without changing what is fetched', async () => {
    query.mockResolvedValue([EGG, BABY, ADULT]);
    const { result } = renderHook(
      () => useBlobbisCollection(undefined, PUBKEY, { stages: ['baby', 'adult'] }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.companions.map((c) => c.stage)).toEqual(['baby', 'adult']);
    expect(result.current.companionsByD[EGG.tags.find(([n]) => n === 'd')![1]]).toBeUndefined();
    expect(query.mock.calls[0][0]).toEqual([
      { kinds: [KIND_BLOBBI_STATE], authors: [PUBKEY], '#b': [BLOBBI_ECOSYSTEM_NAMESPACE] },
    ]);
  });

  it('includes eggs by default', async () => {
    query.mockResolvedValue([EGG, BABY]);
    const { result } = renderHook(() => useBlobbisCollection(undefined, PUBKEY), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.companions.map((c) => c.stage)).toEqual(['egg', 'baby']);
  });

  it('an owner with only eggs is confirmed empty for a hatched-only view, ready for the default view', async () => {
    query.mockResolvedValue([EGG]);
    const hatched = renderHook(() => useBlobbisCollection(undefined, PUBKEY, { stages: ['baby', 'adult'] }), { wrapper });
    await waitFor(() => expect(hatched.result.current.isResolved).toBe(true));
    expect(hatched.result.current.status).toBe('empty');

    const all = renderHook(() => useBlobbisCollection(undefined, PUBKEY), { wrapper });
    await waitFor(() => expect(all.result.current.status).toBe('ready'));
    expect(all.result.current.companions).toHaveLength(1);
  });

  it('a filter predicate composes with stages', async () => {
    query.mockResolvedValue([EGG, BABY, ADULT]);
    const { result } = renderHook(
      () => useBlobbisCollection(undefined, PUBKEY, { stages: ['baby', 'adult'], filter: (c) => c.name === 'Elder' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.companions.map((c) => c.name)).toEqual(['Elder']);
  });

  it('an optimistic update through updateCompanionEvent respects the legacy gate and the options', async () => {
    query.mockResolvedValue([BABY]);
    const { result } = renderHook(
      () => useBlobbisCollection(undefined, PUBKEY, { stages: ['baby', 'adult'] }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    result.current.updateCompanionEvent(LEGACY_MARKER);
    result.current.updateCompanionEvent(EGG);
    result.current.updateCompanionEvent(ADULT);
    await waitFor(() => expect(result.current.companions).toHaveLength(2));
    expect(result.current.companions.map((c) => c.name)).toEqual(['Brook', 'Elder']);
  });
});
