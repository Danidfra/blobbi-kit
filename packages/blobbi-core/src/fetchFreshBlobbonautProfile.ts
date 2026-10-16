import type { NostrQuerier } from './nostr-protocol';

import {
  BLOBBONAUT_PROFILE_KINDS,
  getBlobbonautQueryDValues,
  parseBlobbonautEvent,
  type BlobbonautProfile,
} from './blobbi';
import { pickNewestBlobbonautProfile } from './profile-order';

/**
 * Fetch the freshest Blobbonaut profile (kind 11125) directly from relays,
 * bypassing any local TanStack Query cache.
 *
 * Prefers the current kind (11125) over legacy (31125), then the newest, then
 * (NIP-01) the lower event id on equal `created_at`; only the owner's events
 * count (`pickNewestBlobbonautProfile`). Returns a fully-parsed
 * `BlobbonautProfile` including `.event` (the raw NostrEvent) so callers can
 * pass it as `prev` to `useNostrPublish`.
 *
 * Use this inside every mutation that performs a read-modify-write on the
 * Blobbonaut profile to avoid overwriting content (daily missions JSON) or
 * tags with stale cached data.
 */
export async function fetchFreshBlobbonautProfile(
  nostr: NostrQuerier,
  pubkey: string,
): Promise<BlobbonautProfile | null> {
  const dValues = getBlobbonautQueryDValues(pubkey);

  const signal = AbortSignal.timeout(10_000);

  const events = await nostr.query([{
    kinds: [...BLOBBONAUT_PROFILE_KINDS],
    authors: [pubkey],
    '#d': dValues,
  }], { signal });

  // The canonical order (`profile-order.ts`): the owner's valid events, 11125 before 31125, newest, then the lower id
  const newest = pickNewestBlobbonautProfile(events, pubkey);
  return newest ? (parseBlobbonautEvent(newest) ?? null) : null;
}
