import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@blobbi-kit/core/nostr-protocol';

import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  isModernBlobbiEvent,
  parseModernBlobbiEvent,
  type BlobbiCompanion,
  type BlobbiStage,
} from '@blobbi-kit/core/blobbi';

/** Maximum number of d-tags per query chunk to avoid relay issues */
const CHUNK_SIZE = 20;

/**
 * Consumer-side shaping of the collection. Options never change WHAT is
 * fetched or cached (every caller shares one query per owner), only which of
 * the modern companions the caller sees, so two hooks with different options
 * stay in sync through the same cache and the same optimistic updates.
 */
export interface UseBlobbisCollectionOptions {
  /**
   * Keep only these lifecycle stages. Omit for every stage. A product that
   * shows eggs in a hatchery and only hatched Blobbis in the world passes
   * `['baby', 'adult']` to the latter.
   */
  stages?: readonly BlobbiStage[];
  /** Arbitrary extra predicate over modern companions, applied after `stages`. */
  filter?: (companion: BlobbiCompanion) => boolean;
}

/**
 * Where the collection stands, as one word a consumer can switch on.
 *
 * - `'idle'`: the read has not been asked for (no owner pubkey, or an empty
 *   d-list). Nothing is known; do NOT treat the empty `companions` as "owns
 *   none".
 * - `'loading'`: the first read is in flight and nothing is known yet.
 * - `'empty'`: a read COMPLETED and yielded no modern companion matching the
 *   options. This is the confirmed-empty state: the relay adapter resolved its
 *   query (end of stored events, or the requested limit) rather than timing
 *   out or failing; a timeout or failure ends in `'error'`, never here.
 *   Confirmation is exactly as strong as the adapter's own resolution; the
 *   kit does not re-read to double-check, a host that wants that adds it.
 * - `'ready'`: a read completed with at least one matching companion.
 * - `'error'`: the read failed after retries. `companions` is empty and
 *   `error` is set; do not treat it as "owns none".
 */
export type BlobbiCollectionStatus = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

/**
 * Pure mapping from the query's state to {@link BlobbiCollectionStatus}.
 * Exported so the mapping can be pinned independently of relay timing.
 */
export function resolveBlobbiCollectionStatus(input: {
  enabled: boolean;
  status: 'pending' | 'error' | 'success';
  count: number;
}): BlobbiCollectionStatus {
  if (input.status === 'error') return 'error';
  if (input.status === 'pending') return input.enabled ? 'loading' : 'idle';
  return input.count > 0 ? 'ready' : 'empty';
}

/** The legacy policy at the collection layer: modern events only, no exceptions. */
export const BLOBBI_COLLECTION_KEEPS = isModernBlobbiEvent;

/**
 * Stable, deterministic owned-Blobbi ordering, by d-tag.
 *
 * Callers use `companions[0]` as the default-selection fallback, so the order
 * must not depend on relay return order or optimistic-update insertion order.
 * The d-tag is the only per-Blobbi identifier stable across the replaceable
 * event's republishes (`created_at` and event `id` both change per care
 * action). This replaces the former reliance on the profile `has` list.
 */
function sortCompanions(companions: BlobbiCompanion[]): BlobbiCompanion[] {
  return [...companions].sort((a, b) => a.d.localeCompare(b.d));
}

/**
 * Split an array into chunks of a given size.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Hook to fetch Blobbi companions (Kind 31124) owned by the given pubkey.
 * 
 * Two modes:
 * - **No dList** (default): Fetches ALL the user's blobbi events by author +
 *   ecosystem namespace tag. This is the authoritative source of truth —
 *   the user authored these events, so we don't need a secondary index.
 * - **With dList**: Fetches only the specified d-tags. Use this when you only
 *   need a specific subset (e.g. the companion layer needs just one blobbi).
 * 
 * Features:
 * - Chunks large d-lists into multiple queries for relay compatibility
 * - Keeps only the newest event per d-tag
 * - Returns both a lookup record and array of companions
 * - Provides invalidation and optimistic update helpers
 *
 * Legacy policy: only modern events (`isModernBlobbiEvent`: schema-valid and
 * not historical) ever enter the collection. Legacy events are identified and
 * dropped here, at the single source of truth; nothing downstream sees them
 * and nothing migrates them. There is no option to admit them.
 *
 * @param dList   - Optional list of d-tags to fetch. Omit to fetch all.
 * @param pubkey  - The owner's hex pubkey. When absent (logged out), the query
 *                  stays disabled (`status: 'idle'`) and returns an empty collection.
 * @param options - Consumer-side shaping, see {@link UseBlobbisCollectionOptions}.
 */
export function useBlobbisCollection(
  dList?: string[] | undefined,
  pubkey?: string,
  options?: UseBlobbisCollectionOptions,
) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const stages = options?.stages;
  const filter = options?.filter;
  
  // Determine the mode: 'all' fetches everything, 'dlist' fetches by specific d-tags
  const mode = dList === undefined ? 'all' : 'dlist';
  
  // Create a stable query key based on sorted d-tags (for dlist mode)
  const sortedDList = useMemo(() => {
    if (mode === 'all' || !dList || dList.length === 0) return null;
    return [...dList].sort();
  }, [mode, dList]);
  
  // Query key segment: 'all' for fetch-all mode, comma-joined d-tags for dlist mode
  const queryKeySegment = mode === 'all' ? 'all' : (sortedDList?.join(',') ?? '');
  
  const enabled = !!pubkey && (mode === 'all' || (!!sortedDList && sortedDList.length > 0));

  // Main query to fetch companions from relays
  const query = useQuery({
    queryKey: ['blobbi-collection', pubkey, queryKeySegment],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        console.log('[useBlobbisCollection] No pubkey, returning empty');
        return { companionsByD: {}, companions: [] };
      }
      
      let allEvents: NostrEvent[];
      
      if (mode === 'all') {
        // Fetch ALL the user's blobbi events — author is the source of truth
        const filter = {
          kinds: [KIND_BLOBBI_STATE],
          authors: [pubkey],
          '#b': [BLOBBI_ECOSYSTEM_NAMESPACE],
        };
        
        console.log('[Blobbi] 31124 query filter (all):', JSON.stringify(filter, null, 2));
        
        allEvents = await nostr.query([filter], { signal });
        
        console.log('[useBlobbisCollection] Fetch-all returned', allEvents.length, 'events');
      } else {
        // Fetch by specific d-tags (for companion layer etc.)
        if (!sortedDList || sortedDList.length === 0) {
          console.log('[useBlobbisCollection] Empty dList, returning empty');
          return { companionsByD: {}, companions: [] };
        }
        
        console.log('[Blobbi] dList:', sortedDList);
        
        const chunks = chunkArray(sortedDList, CHUNK_SIZE);
        console.log('[useBlobbisCollection] Splitting into', chunks.length, 'chunk(s)');
        
        allEvents = [];
        
        for (const chunk of chunks) {
          const filter = {
            kinds: [KIND_BLOBBI_STATE],
            authors: [pubkey],
            '#d': chunk,
          };
          
          console.log('[Blobbi] 31124 query filter:', JSON.stringify(filter, null, 2));
          
          const events = await nostr.query([filter], { signal });
          allEvents.push(...events);
          
          console.log('[useBlobbisCollection] Chunk returned', events.length, 'events');
        }
      }
      
      console.log('[useBlobbisCollection] Total events received:', allEvents.length);
      
      // Modern events only (schema-valid and not historical), decided by the
      // core predicate so every consumer of the kit agrees on what a Blobbi is.
      // Legacy Blobbis are unsupported: they never reach the UI, are never
      // selected or republished, and are never migrated. A user with only
      // legacy events is a user with no current Blobbi (confirmed empty).
      const validEvents = allEvents.filter(BLOBBI_COLLECTION_KEEPS);

      console.log('[useBlobbisCollection] Modern events:', validEvents.length);
      
      // Group events by d-tag and keep only the newest per d
      const eventsByD = new Map<string, NostrEvent>();
      
      for (const event of validEvents) {
        const dTag = event.tags.find(([name]) => name === 'd')?.[1];
        if (!dTag) continue;
        
        const existing = eventsByD.get(dTag);
        if (!existing || event.created_at > existing.created_at) {
          eventsByD.set(dTag, event);
        }
      }
      
      // Parse all events into BlobbiCompanion objects
      const companionsByD: Record<string, BlobbiCompanion> = {};
      const companions: BlobbiCompanion[] = [];
      
      for (const [dTag, event] of eventsByD) {
        // parseModernBlobbiEvent returns undefined for legacy or invalid input,
        // so the filter above and this parse can never disagree.
        const parsed = parseModernBlobbiEvent(event);
        if (parsed) {
          companionsByD[dTag] = parsed;
          companions.push(parsed);
        }
      }

      // Stable, deterministic ordering by d-tag (see sortCompanions). This
      // replaces the former reliance on the profile `has` list as the
      // ownership-order source of truth.
      const sortedCompanions = sortCompanions(companions);

      console.log('[useBlobbisCollection] Parsed companions:', {
        count: sortedCompanions.length,
        dTags: Object.keys(companionsByD),
      });

      return { companionsByD, companions: sortedCompanions };
    },
    enabled,
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
  
  // Helper to invalidate and refetch after publishing.
  // NOTE: In most mutation paths this is no longer needed — the read-modify-write
  // pattern (fetch fresh → mutate → optimistic update) keeps the cache correct.
  // Only call this when the set of d-tags itself changes (e.g. adoption, deletion).
  const invalidate = useCallback(() => {
    if (pubkey) {
      queryClient.invalidateQueries({
        queryKey: ['blobbi-collection', pubkey, queryKeySegment],
      });
    }
  }, [queryClient, pubkey, queryKeySegment]);
  
  // Update a single companion event in the query cache (optimistic update).
  // CRITICAL: Updates ALL blobbi-collection queries for this user, not just the
  // one matching the current queryKeySegment. This ensures the BlobbiPage cache
  // and companion layer cache stay in sync (they use different query modes).
  const updateCompanionEvent = useCallback((event: NostrEvent) => {
    // Same gate as the query: a legacy or invalid event never enters the cache,
    // even through the optimistic path.
    const parsed = parseModernBlobbiEvent(event);
    if (!parsed || !pubkey) return;
    
    type CollectionData = { companionsByD: Record<string, BlobbiCompanion>; companions: BlobbiCompanion[] };
    const matchingQueries = queryClient.getQueriesData<CollectionData>({
      queryKey: ['blobbi-collection', pubkey],
    });

    for (const [queryKey, data] of matchingQueries) {
      if (!data) continue;
      const newCompanionsByD = { ...data.companionsByD, [parsed.d]: parsed };
      queryClient.setQueryData<CollectionData>(queryKey, {
        companionsByD: newCompanionsByD,
        companions: sortCompanions(Object.values(newCompanionsByD)),
      });
    }

    // If no existing queries matched (first load), set our own query key
    if (matchingQueries.length === 0) {
      queryClient.setQueryData<CollectionData>(
        ['blobbi-collection', pubkey, queryKeySegment],
        {
          companionsByD: { [parsed.d]: parsed },
          companions: [parsed],
        },
      );
    }
  }, [queryClient, pubkey, queryKeySegment]);
  
  // Consumer-side shaping. Applied on top of the shared cache so callers with
  // different options share one read and one optimistic-update path.
  const { companions, companionsByD } = useMemo(() => {
    const all = query.data?.companions ?? [];
    const kept = all.filter((c) => (!stages || stages.includes(c.stage)) && (!filter || filter(c)));
    const byD: Record<string, BlobbiCompanion> = {};
    for (const c of kept) byD[c.d] = c;
    return { companions: kept, companionsByD: byD };
  }, [query.data, stages, filter]);

  const status = resolveBlobbiCollectionStatus({ enabled, status: query.status, count: companions.length });

  return {
    /** Record of companions keyed by d-tag (after `options`) */
    companionsByD,
    /** Array of all companions (newest per d-tag, after `options`) */
    companions,
    /**
     * One-word standing of the collection: idle | loading | empty | ready |
     * error. `'empty'` is the confirmed-empty state; `'idle'`, `'loading'` and
     * `'error'` also come with an empty `companions` but mean "unknown".
     */
    status,
    /** True once a read has completed successfully (status is `empty` or `ready`) */
    isResolved: status === 'empty' || status === 'ready',
    /** True only when query is loading and no data available */
    isLoading: query.isLoading,
    /** True when actively fetching */
    isFetching: query.isFetching,
    /** True when data is stale */
    isStale: query.isStale,
    /** Query error if any */
    error: query.error,
    /** Invalidate and refetch the collection (use only when d-tag set changes, not after mutations) */
    invalidate,
    /** Optimistically update a single companion in the cache */
    updateCompanionEvent,
  };
}
