/**
 * The canonical order of a player's Blobbonaut profile events (kind 11125, and
 * the legacy kind 31125), shared by every reader and writer in the ecosystem.
 *
 * The profile is replaceable: relays keep one version, chosen by NIP-01. Every
 * app must pick the same "newest profile" from the same events, or a writer
 * could build over a version another app considers replaced:
 *
 *   1. only events by the owner, of a profile kind, structurally valid
 *      (`isValidBlobbonautEvent`) and, when a verifier is given, correctly
 *      signed;
 *   2. a kind 11125 profile before any legacy 31125;
 *   3. then the higher `created_at`;
 *   4. then, on equal `created_at`, the LOWER event id (NIP-01).
 *
 * Signature verification is injected: this package depends on no Nostr
 * library. Hosts pass their own (`verifyEvent` from nostr-tools, a relay
 * transport that already verifies, ...).
 */
import { KIND_BLOBBONAUT_PROFILE, KIND_BLOBBONAUT_PROFILE_LEGACY, isValidBlobbonautEvent } from './blobbi';
import type { NostrEvent } from './nostr-protocol';

/** A profile event as far as ordering goes (`createdAt` in seconds, NIP-01). */
export interface ProfileStamp {
  id: string;
  createdAt: number;
}

/** Checks an event's id and signature. Must not throw; a throw counts as invalid. */
export type EventVerifier = (event: NostrEvent) => boolean;

/** NIP-01 for replaceable events: whether `a` replaces `b` (newer, or as new with the lower id). */
export function replacesProfile(a: ProfileStamp, b: ProfileStamp): boolean {
  return a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);
}

/** The stamp of a profile event. */
export const profileStamp = (event: NostrEvent): ProfileStamp => ({ id: event.id, createdAt: event.created_at });

/**
 * Sort comparator: negative when `a` is the newer profile. Kind 11125 before
 * 31125, then the higher `created_at`, then the lower id. A total order, so
 * every app sorts the same events the same way.
 */
export function compareBlobbonautProfiles(a: NostrEvent, b: NostrEvent): number {
  const kindRank = (e: NostrEvent) => (e.kind === KIND_BLOBBONAUT_PROFILE ? 0 : 1);
  return kindRank(a) - kindRank(b) || b.created_at - a.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function safeVerify(verify: EventVerifier, event: NostrEvent): boolean {
  try {
    return verify(event);
  } catch {
    return false;
  }
}

/**
 * The owner's newest valid profile among `events` (rules in the header), or
 * null. With `verify`, events whose signature does not check are ignored.
 */
export function pickNewestBlobbonautProfile(events: readonly NostrEvent[], owner: string, verify?: EventVerifier): NostrEvent | null {
  const valid = events.filter(
    (e) =>
      e.pubkey === owner &&
      (e.kind === KIND_BLOBBONAUT_PROFILE || e.kind === KIND_BLOBBONAUT_PROFILE_LEGACY) &&
      isValidBlobbonautEvent(e) &&
      (!verify || safeVerify(verify, e)),
  );
  return [...valid].sort(compareBlobbonautProfiles)[0] ?? null;
}
