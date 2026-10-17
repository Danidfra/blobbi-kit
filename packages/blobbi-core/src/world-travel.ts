/**
 * WORLD TRAVEL (M16): where a Blobbi is, across Blobbi worlds and devices.
 *
 * Two separate Nostr events (the full specification is `WORLD-TRAVEL.md` at
 * the package root):
 *
 *   World Location  kind 31126, addressable, one per owner + Blobbi. "Where
 *                   was this Blobbi last?" The canonical, last-known World.
 *                   Never expires, never renewed: one transfer, one event.
 *   Active Presence kind 21124, ephemeral, optional, short-lived (NIP-40).
 *                   "Is there recent evidence of play in that World?" It
 *                   never changes, and never revives, a World Location.
 *
 * This module is pure: schemas, validation, NIP-01 ordering, resolution,
 * freshness and transition timing. No clock, no relay, no signer, no DOM. The
 * operations that use them (`world-travel-session.ts`) take them injected.
 *
 * PROVISIONAL KINDS. 31126 and 21124 were chosen after a collision search
 * (no NIP, no public registry entry, no public code found, no events on the
 * relays probed, 2026-10-17), which is evidence, not a registry. They stay
 * provisional until the owner approves them for release.
 */
import { BLOBBI_ECOSYSTEM_NAMESPACE, KIND_BLOBBI_STATE, buildBlobbiAddress, getPubkeyPrefix12, isCanonicalBlobbiD } from './blobbi';
import type { NostrEvent, NostrFilter } from './nostr-protocol';
import type { EventVerifier } from './profile-order';

// ─── Kinds and constants ──────────────────────────────────────────────────────

/** World Location: addressable (30000–39999), beside 31124 (pet state) and 31125 (the legacy profile). Provisional. */
export const KIND_WORLD_LOCATION = 31126;
/** Active Presence: ephemeral (20000–29999), the 1124 / 31124 family. Provisional. */
export const KIND_ACTIVE_PRESENCE = 21124;
/** Whether the two kinds above are approved for release (they are not yet). */
export const WORLD_TRAVEL_KINDS_STATUS: 'provisional' | 'approved' = 'provisional';

/** The schema version both events carry (`["v", "1"]`); any other version is ignored, never guessed at. */
export const WORLD_TRAVEL_VERSION = '1';

/** The Blobbi Standalone (the Blobbi's home). */
export const WORLD_HOME = 'blobbi-home';
/** Blobbi Pixel. */
export const WORLD_PIXEL = 'blobbi-pixel';
/** Where a Blobbi with no World Location at all is: home, where every Blobbi starts. */
export const DEFAULT_WORLD = WORLD_HOME;

/**
 * The relays both Blobbi worlds read and write World Locations on: the two
 * every Blobbi app already writes profiles to, so whichever app moved the
 * Blobbi, the other finds it. A host may add relays; it should keep these.
 */
export const BLOBBI_WORLD_TRAVEL_RELAYS: readonly string[] = ['wss://relay.ditto.pub', 'wss://relay.primal.net'];

/** `arrival_after` may ask a destination to wait at most this long after the event (s); more is clamped. */
export const MAX_TRANSITION_S = 6;
/**
 * The departure window a destination asks for when the previous World was recently active (s): long enough for the
 * origin to see the move on its live stream (well under a second) and play its departure (about a second) before
 * the arrival starts, so the Blobbi is never shown arriving here while still standing there.
 */
export const DEPARTURE_WINDOW_S = 2;
/** The departure window when the previous World shows no recent activity (s): arrive at once. */
export const NO_DEPARTURE_WINDOW_S = 0;

/** How long an Active Presence lasts (its NIP-40 `expiration` is this after `created_at`). */
export const PRESENCE_TTL_S = 120;
/** A presence claiming to last longer than this is malformed. */
export const MAX_PRESENCE_TTL_S = 300;
/** At most one presence per World session this often (s). */
export const PRESENCE_RENEW_S = 60;
/** A presence dated this far ahead of the reader's clock is not believed (s). */
export const MAX_CLOCK_SKEW_S = 60;
/**
 * A World Location dated this far ahead of the reader's clock is ignored, until the reader's clock reaches it (s).
 * The same bound common relays put on `created_at` (strfry's default rejects events more than 15 minutes ahead), so
 * an event a relay would refuse anyway never decides a place. Without it, one event from a device whose clock is
 * years ahead would win every NIP-01 comparison, and every later move would have to be dated after it (timestamp
 * inflation), or be refused by the relays.
 */
export const MAX_LOCATION_SKEW_S = 900;

// ─── World identifiers ──────────────────────────────────────────────────────

/**
 * A World identifier: 3–32 characters, lowercase letters and digits in
 * dash-separated words, starting with a letter (`blobbi-home`, `nostr-farm`).
 * It names a World; it is not a URL, a host or an application identity, and
 * nothing may navigate to it or trust it.
 */
const WORLD_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isWorldId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 3 && value.length <= 32 && WORLD_ID.test(value);
}

/** A World the ecosystem knows. Display only: being listed grants nothing. */
export interface WorldInfo {
  id: string;
  name: string;
}

const KNOWN_WORLDS = new Map<string, WorldInfo>([
  [WORLD_HOME, { id: WORLD_HOME, name: 'Blobbi Home' }],
  [WORLD_PIXEL, { id: WORLD_PIXEL, name: 'Blobbi Pixel' }],
]);

/**
 * Let a host know of another World (Blobbi Island, Nostr Farm, ...) for its
 * display name. Core rules never change with the registry: any valid World id
 * is a place a Blobbi can be. Returns false for an invalid id.
 */
export function registerWorld(info: WorldInfo): boolean {
  if (!isWorldId(info.id) || typeof info.name !== 'string' || !info.name.trim()) return false;
  KNOWN_WORLDS.set(info.id, { id: info.id, name: info.name.trim().slice(0, 40) });
  return true;
}

/** The registered World, or null for one this page does not know (show it as "another Blobbi world"). */
export function knownWorld(id: string): WorldInfo | null {
  return KNOWN_WORLDS.get(id) ?? null;
}

// ─── Blobbi identity ────────────────────────────────────────────────────────

/** A legacy (pre-canonical) Blobbi d: short, printable, no whitespace or separators that could forge an address. */
const LEGACY_D = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * Whether `d` names a Blobbi that `owner` may move: a canonical d must carry
 * the owner's own pubkey prefix (`blobbi-<pubkey12>-<petId10>`); a legacy d
 * is accepted when it is plainly printable (it is still scoped to the owner
 * by the event's author).
 */
export function isTravelBlobbiD(d: unknown, owner: string): d is string {
  if (typeof d !== 'string') return false;
  if (d.startsWith('blobbi-') && /^blobbi-[0-9a-f]{12}-/.test(d)) return isCanonicalBlobbiD(d) && d.slice(7, 19) === getPubkeyPrefix12(owner);
  return LEGACY_D.test(d);
}

const HEX64 = /^[0-9a-f]{64}$/;
const isPubkey = (v: unknown): v is string => typeof v === 'string' && HEX64.test(v);
const isUnixSeconds = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function single(tags: string[][], name: string): string | null | undefined {
  const found = tags.filter((t) => Array.isArray(t) && t[0] === name);
  if (found.length === 0) return undefined;
  if (found.length > 1 || typeof found[0][1] !== 'string') return null; // duplicated or malformed: invalid
  return found[0][1];
}

function safeVerify(verify: EventVerifier, event: NostrEvent): boolean {
  try {
    return verify(event);
  } catch {
    return false;
  }
}

function wellFormed(event: unknown): event is NostrEvent {
  const e = event as NostrEvent | null;
  return (
    !!e &&
    typeof e === 'object' &&
    typeof e.id === 'string' &&
    HEX64.test(e.id) &&
    isPubkey(e.pubkey) &&
    isUnixSeconds(e.created_at) &&
    typeof e.kind === 'number' &&
    Array.isArray(e.tags) &&
    e.tags.every((t) => Array.isArray(t) && t.every((x) => typeof x === 'string')) &&
    typeof e.content === 'string' &&
    typeof e.sig === 'string'
  );
}

// ─── World Location ─────────────────────────────────────────────────────────

/** A valid World Location, as read from its event. */
export interface WorldLocation {
  /** The event id. */
  id: string;
  /** The owner (the event's author; the Blobbi's 31124 author). */
  owner: string;
  /** The Blobbi's d (the same d as its 31124 state). */
  d: string;
  /** Where it is. */
  world: string;
  /** Where it came from, when the writer said so. */
  from: string | null;
  /** The event's `created_at` (s). */
  createdAt: number;
  /** The earliest intended arrival (s), a visual hint only, clamped to [createdAt, createdAt + MAX_TRANSITION_S]. */
  arrivalAfter: number;
  /** The World Location this one replaced, when the writer named it. */
  prev: string | null;
  event: NostrEvent;
}

/** The addressable coordinate of a Blobbi's World Location. */
export function worldLocationAddress(owner: string, d: string): string {
  return `${KIND_WORLD_LOCATION}:${owner}:${d}`;
}

export interface ParseOptions {
  /** Checks id and signature (core depends on no Nostr library). Without it the signature is NOT checked. */
  verify?: EventVerifier;
}

/**
 * The World Location an event states, or null when it is not a valid one:
 * the right kind and version; one `d` naming a Blobbi of the author; one `a`
 * that is exactly that Blobbi's 31124 address; one valid `world`; an optional
 * valid `from` other than `world`; an optional integer `arrival_after`; a
 * valid signature when a verifier is given. Unknown tags are ignored.
 */
export function parseWorldLocation(event: unknown, opts: ParseOptions = {}): WorldLocation | null {
  if (!wellFormed(event) || event.kind !== KIND_WORLD_LOCATION) return null;
  const { tags, pubkey } = event;
  if (single(tags, 'v') !== WORLD_TRAVEL_VERSION) return null;
  const d = single(tags, 'd');
  if (!isTravelBlobbiD(d, pubkey)) return null;
  if (single(tags, 'a') !== buildBlobbiAddress(pubkey, d)) return null;
  const world = single(tags, 'world');
  if (!isWorldId(world)) return null;
  const from = single(tags, 'from');
  if (from === null || (from !== undefined && (!isWorldId(from) || from === world))) return null;
  const after = single(tags, 'arrival_after');
  if (after === null || (after !== undefined && !/^\d{1,12}$/.test(after))) return null;
  const prev = single(tags, 'prev');
  if (prev === null || (prev !== undefined && !HEX64.test(prev))) return null;
  if (opts.verify && !safeVerify(opts.verify, event)) return null;
  const created = event.created_at;
  const hinted = after === undefined ? created : Number(after);
  return {
    id: event.id,
    owner: pubkey,
    d,
    world,
    from: from ?? null,
    createdAt: created,
    arrivalAfter: Math.min(Math.max(hinted, created), created + MAX_TRANSITION_S),
    prev: prev ?? null,
    event,
  };
}

/** NIP-01 for addressable events: whether `a` replaces `b` (newer; or as new, with the lower id). */
export function replacesLocation(a: Pick<WorldLocation, 'id' | 'createdAt'>, b: Pick<WorldLocation, 'id' | 'createdAt'>): boolean {
  return a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);
}

/** Sort comparator, newest first (a total order: every app sorts the same events the same way). */
export function compareLocations(a: WorldLocation, b: WorldLocation): number {
  return b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface ResolveOptions {
  owner: string;
  d: string;
  /** Required: an event is trusted for its signature, never for the relay it came from. */
  verify: EventVerifier;
  /**
   * The reader's clock (ms). With it, a location dated more than `MAX_LOCATION_SKEW_S` ahead is ignored (it is not
   * a place yet). Without it, every valid event counts (pure NIP-01, as before 0.11).
   */
  now?: number;
}

/** Whether a location is dated too far ahead of `now` (ms) to be believed yet (`MAX_LOCATION_SKEW_S`). */
export function isFutureLocation(loc: Pick<WorldLocation, 'createdAt'>, now: number): boolean {
  return loc.createdAt > Math.floor(now / 1000) + MAX_LOCATION_SKEW_S;
}

/**
 * The canonical World Location of one Blobbi among any events (several
 * relays, a cache, a live stream, in any order): the newest valid one by its
 * owner for its d (NIP-01), or null when there is none.
 */
export function resolveWorldLocation(events: Iterable<unknown>, { owner, d, verify, now }: ResolveOptions): WorldLocation | null {
  let best: WorldLocation | null = null;
  for (const e of events) {
    const loc = parseWorldLocation(e, { verify });
    if (!loc || loc.owner !== owner || loc.d !== d) continue;
    if (now !== undefined && isFutureLocation(loc, now)) continue;
    if (!best || replacesLocation(loc, best)) best = loc;
  }
  return best;
}

/** Where the Blobbi is, by its canonical location (none at all: `DEFAULT_WORLD`). */
export function currentWorld(location: WorldLocation | null): string {
  return location ? location.world : DEFAULT_WORLD;
}

/** The filter for one Blobbi's World Location. */
export function worldLocationFilter(owner: string, d: string): NostrFilter {
  return { kinds: [KIND_WORLD_LOCATION], authors: [owner], '#d': [d], limit: 5 };
}

/** What a World signs to move a Blobbi. */
export interface WorldTravelTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface LocationTemplateInput {
  owner: string;
  d: string;
  /** The World it moves to. */
  world: string;
  /** The canonical location it replaces (null: none known after a complete look). */
  latest: WorldLocation | null;
  /** The writer's clock (ms). */
  now: number;
  /** How long the destination intends to wait for the departure to play (s), clamped to [0, MAX_TRANSITION_S]. */
  departureWindowS?: number;
}

/**
 * The World Location event a World signs to move the Blobbi to itself.
 * `created_at` is after the location it replaces even when this clock is
 * behind (NIP-01 would otherwise keep the old one), so the newest act wins.
 * `latest` must come from a resolution with `now` (no location beyond
 * `MAX_LOCATION_SKEW_S`), which bounds the result to `now + MAX_LOCATION_SKEW_S
 * + 1`: a run of moves never inflates timestamps further than that.
 */
export function buildWorldLocationTemplate({ owner, d, world, latest, now, departureWindowS = NO_DEPARTURE_WINDOW_S }: LocationTemplateInput): WorldTravelTemplate {
  const createdAt = Math.max(Math.floor(now / 1000), latest ? latest.createdAt + 1 : 0);
  const window = Math.min(Math.max(Math.round(departureWindowS), 0), MAX_TRANSITION_S);
  const from = latest ? latest.world : DEFAULT_WORLD;
  const tags: string[][] = [
    ['d', d],
    ['a', buildBlobbiAddress(owner, d)],
    ['v', WORLD_TRAVEL_VERSION],
    ['world', world],
  ];
  if (from !== world) tags.push(['from', from]);
  tags.push(['arrival_after', String(createdAt + window)]);
  if (latest) tags.push(['prev', latest.id]);
  tags.push(['b', BLOBBI_ECOSYSTEM_NAMESPACE]);
  const name = knownWorld(world)?.name ?? 'another Blobbi world';
  tags.push(['alt', `Blobbi world location: this Blobbi is now in ${name}`]);
  return { kind: KIND_WORLD_LOCATION, created_at: createdAt, tags, content: '' };
}

export type TransferPlan =
  /** The canonical location already names this World: nothing is published. */
  | { kind: 'already-here'; location: WorldLocation | null }
  /** The Blobbi moved moments ago and the request was not explicit: nothing is published (no ping-pong). */
  | { kind: 'contended'; location: WorldLocation }
  | { kind: 'transfer'; template: WorldTravelTemplate; from: string };

/** A move younger than this is not undone by a casual input, only by an explicit request. */
export const MIN_STAY_MS = 5_000;

export interface TransferPlanInput {
  owner: string;
  d: string;
  world: string;
  latest: WorldLocation | null;
  now: number;
  /** A deliberate request (a "call home" button), not a press anywhere on the page. */
  explicit: boolean;
  /** The previous World showed recent Active Presence: give its departure a moment. */
  previousRecentlyActive: boolean;
  /**
   * When this reader first saw `latest` (ms). The stay is measured from the earlier of this and its `created_at`, so
   * an event dated ahead of the reader's clock does not stretch `MIN_STAY_MS` (a move is "just made" for 5 s,
   * whatever its date says).
   */
  observedAt?: number;
}

/** Whether, and how, a World moves the Blobbi to itself (the rules in `WORLD-TRAVEL.md`, "Transfer rules"). */
export function planTransfer(input: TransferPlanInput): TransferPlan {
  const { latest, world, now, explicit } = input;
  if (currentWorld(latest) === world) return { kind: 'already-here', location: latest };
  if (latest && !explicit) {
    const since = Math.min(latest.createdAt * 1000, input.observedAt ?? Number.POSITIVE_INFINITY);
    if (now - since < MIN_STAY_MS) return { kind: 'contended', location: latest };
  }
  return {
    kind: 'transfer',
    from: currentWorld(latest),
    template: buildWorldLocationTemplate({ ...input, departureWindowS: input.previousRecentlyActive ? DEPARTURE_WINDOW_S : NO_DEPARTURE_WINDOW_S }),
  };
}

// ─── Transition timing ──────────────────────────────────────────────────────

/** A remote location this much older than the reader's clock is history, not a journey (s). */
export const LIVE_TRANSITION_MAX_AGE_S = 600;

/**
 * How a change of location is shown:
 *   live        a journey (departure, arrival), as the event just happened
 *   historical  shown as it is, no journey (the page just loaded; the event is old)
 *
 * A change met on the page's first look (load, a new account, a new Blobbi)
 * is always historical: a page never replays an old transfer. After that,
 * an event the live stream brings is live unless it is ancient by this
 * clock; arrival order, not `created_at`, decides, so a skewed clock on the
 * writer's side does not turn a fresh move into history.
 */
export function transitionKind(o: { initial: boolean; createdAt: number; now: number }): 'live' | 'historical' {
  if (o.initial) return 'historical';
  return o.now / 1000 - o.createdAt > LIVE_TRANSITION_MAX_AGE_S ? 'historical' : 'live';
}

/**
 * How long the destination waits after its move was published before the
 * arrival plays (ms): what `arrival_after` asked for, measured on the
 * destination's own clock from its own `created_at` (it wrote both, so no
 * skew), never more than `MAX_TRANSITION_S`.
 */
export function arrivalDelayMs(location: Pick<WorldLocation, 'createdAt' | 'arrivalAfter'>): number {
  return Math.min(Math.max(location.arrivalAfter - location.createdAt, 0), MAX_TRANSITION_S) * 1000;
}

// ─── Active Presence ────────────────────────────────────────────────────────

export interface ActivePresence {
  id: string;
  owner: string;
  d: string;
  world: string;
  createdAt: number;
  /** NIP-40 `expiration` (s). */
  expiresAt: number;
  event: NostrEvent;
}

/**
 * The Active Presence an event states, or null: kind 21124, version 1, one
 * `a` naming a Blobbi of the author, one valid `world`, and a NIP-40
 * `expiration` after `created_at` by at most `MAX_PRESENCE_TTL_S`.
 */
export function parseActivePresence(event: unknown, opts: ParseOptions = {}): ActivePresence | null {
  if (!wellFormed(event) || event.kind !== KIND_ACTIVE_PRESENCE) return null;
  const { tags, pubkey } = event;
  if (single(tags, 'v') !== WORLD_TRAVEL_VERSION) return null;
  const a = single(tags, 'a');
  if (typeof a !== 'string') return null;
  const parts = a.split(':');
  if (parts.length !== 3 || parts[0] !== String(KIND_BLOBBI_STATE) || parts[1] !== pubkey || !isTravelBlobbiD(parts[2], pubkey)) return null;
  const world = single(tags, 'world');
  if (!isWorldId(world)) return null;
  const exp = single(tags, 'expiration');
  if (typeof exp !== 'string' || !/^\d{1,12}$/.test(exp)) return null;
  const expiresAt = Number(exp);
  if (expiresAt <= event.created_at || expiresAt - event.created_at > MAX_PRESENCE_TTL_S) return null;
  if (opts.verify && !safeVerify(opts.verify, event)) return null;
  return { id: event.id, owner: pubkey, d: parts[2], world, createdAt: event.created_at, expiresAt, event };
}

/** Whether a presence still counts at `now` (ms): not expired, not dated beyond the clock skew allowed. */
export function isPresenceFresh(p: Pick<ActivePresence, 'createdAt' | 'expiresAt'>, now: number): boolean {
  const s = now / 1000;
  return p.expiresAt > s && p.createdAt <= s + MAX_CLOCK_SKEW_S;
}

export interface PresenceQuery {
  owner: string;
  d: string;
  world: string;
  now: number;
  verify: EventVerifier;
}

/**
 * The newest fresh presence of one Blobbi in one World, or null: "unknown",
 * never "offline" (a presence is optional, ephemeral and may be dropped).
 */
export function freshPresence(events: Iterable<unknown>, q: PresenceQuery): ActivePresence | null {
  let best: ActivePresence | null = null;
  for (const e of events) {
    const p = parseActivePresence(e, { verify: q.verify });
    if (!p || p.owner !== q.owner || p.d !== q.d || p.world !== q.world || !isPresenceFresh(p, q.now)) continue;
    if (!best || p.createdAt > best.createdAt || (p.createdAt === best.createdAt && p.id < best.id)) best = p;
  }
  return best;
}

/**
 * Whether a presence says anything about the canonical location: only a
 * presence for the World the location names counts as "active there". A
 * presence for any other World (an old device still renewing, a delayed
 * event) is ignored; it never moves the Blobbi back.
 */
export function presenceSupports(p: ActivePresence | null, location: WorldLocation | null): boolean {
  return !!p && p.world === currentWorld(location);
}

/** The Active Presence event a World signs while the Blobbi is played there. */
export function buildPresenceTemplate(o: { owner: string; d: string; world: string; now: number; ttlS?: number }): WorldTravelTemplate {
  const createdAt = Math.floor(o.now / 1000);
  const ttl = Math.min(Math.max(Math.round(o.ttlS ?? PRESENCE_TTL_S), 1), MAX_PRESENCE_TTL_S);
  const name = knownWorld(o.world)?.name ?? 'a Blobbi world';
  return {
    kind: KIND_ACTIVE_PRESENCE,
    created_at: createdAt,
    tags: [
      ['a', buildBlobbiAddress(o.owner, o.d)],
      ['v', WORLD_TRAVEL_VERSION],
      ['world', o.world],
      ['expiration', String(createdAt + ttl)],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
      ['alt', `Blobbi active presence: this Blobbi was recently played in ${name}`],
    ],
    content: '',
  };
}

/** The live filter for one Blobbi's presence events (relays do not store them: subscribe, do not query). */
export function activePresenceFilter(owner: string, d: string, since: number): NostrFilter {
  return { kinds: [KIND_ACTIVE_PRESENCE], authors: [owner], '#a': [buildBlobbiAddress(owner, d)], since };
}
