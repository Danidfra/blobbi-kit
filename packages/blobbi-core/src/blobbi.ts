import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { NostrEvent } from './nostr-protocol';

import { blobbiLogger } from '@blobbi-kit/core/logger';

import { ADULT_FORMS, type AdultForm, deriveAdultFormFromSeed } from '@blobbi-kit/core/types/adult';
import {
  BLOBBI_V3_ABSENT_TAG_NAMES,
  BLOBBI_V3_RETIRED_TAG_NAMES,
  canonicalBlobbiV3Seed,
  deriveBlobbiV3Seed,
  getBlobbiV3Seed,
  parseBlobbiV3Identity,
  type ParsedBlobbiV3Identity,
} from './blobbi-v3-identity';

import { validateAndRepairBlobbiTags } from './blobbi-tag-schema';
import { applyColorGuardrails, hexToHsl, hslToHex } from './color-guardrails';
import type { Mission } from './missions';
import { parseEvolutionContent } from './missions';

// ─── Constants ────────────────────────────────────────────────────────────────

export const BLOBBI_ECOSYSTEM_NAMESPACE = 'blobbi:ecosystem:v1';

export const KIND_BLOBBI_STATE = 31124;
export const KIND_BLOBBONAUT_PROFILE = 11125;

/** @deprecated Legacy kind for Blobbonaut profiles. Use KIND_BLOBBONAUT_PROFILE (11125) instead. */
export const KIND_BLOBBONAUT_PROFILE_LEGACY = 31125;

/**
 * All Blobbonaut profile kinds to query for profile compatibility.
 * Used by profile normalization/compatibility only; unrelated to old-app
 * Blobbi migration.
 */
export const BLOBBONAUT_PROFILE_KINDS = [KIND_BLOBBONAUT_PROFILE, KIND_BLOBBONAUT_PROFILE_LEGACY] as const;

// ─── Stat Bounds ──────────────────────────────────────────────────────────────

/**
 * Minimum stat value - stats can never go below this.
 * The minimum of 1 (instead of 0) ensures:
 * - Blobbi is never in an unrecoverable state
 * - Visual feedback shows critical state without being "dead"
 * - Recovery is always possible with any healing item
 */
export const STAT_MIN = 1;

/**
 * Maximum stat value - stats can never exceed this.
 */
export const STAT_MAX = 100;

// Default stats for a new egg
export const DEFAULT_EGG_STATS = {
  hunger: 100,
  happiness: 100,
  health: 100,
  hygiene: 100,
  energy: 100,
};

/**
 * @deprecated No longer used. Task system uses progression_started_at instead.
 * Kept for backwards compatibility with older code that may reference it.
 */
export const DEFAULT_INCUBATION_TIME = 345600;

// NOTE: the onboarding economy constants (INITIAL_BLOBBONAUT_COINS,
// BLOBBI_PREVIEW_REROLL_COST, BLOBBI_ADOPTION_COST) were removed in 0.4.0.
// The kit owns no Coin economy: active Blobbi Coin balances are host-owned
// and live outside blobbi-kit entirely, and adoption/onboarding here is not
// coupled to currency. Do NOT re-add economy constants to this package.

// ─── Date/Time Utilities ──────────────────────────────────────────────────────

/**
 * Get the current local day as a YYYY-MM-DD string.
 * Uses the user's local timezone for day boundary calculation.
 */
export function getLocalDayString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string into a Date object (at midnight local time).
 */
export function parseLocalDayString(dayString: string): Date {
  const [year, month, day] = dayString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get the number of days between two local day strings.
 * Returns 0 if same day, 1 if consecutive days, etc.
 */
export function getDaysDifference(dayA: string, dayB: string): number {
  const dateA = parseLocalDayString(dayA);
  const dateB = parseLocalDayString(dayB);
  const diffMs = Math.abs(dateB.getTime() - dateA.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlobbiStage = 'egg' | 'baby' | 'adult';
export type BlobbiState = 'active' | 'sleeping' | 'hibernating';

/**
 * The only values the `state` tag may carry in a modern event. Progression
 * (`incubating`, `evolving`) lives in `progression_state` since 2026-04; an
 * event that still stores it in `state` follows the schema that preceded that
 * split and is unsupported (see {@link isUnsupportedLegacyBlobbiEvent}).
 */
export const BLOBBI_ACTIVITY_STATES: readonly BlobbiState[] = ['active', 'sleeping', 'hibernating'];

/**
 * Visual generation: WHICH FAMILY OF ARTWORK a Blobbi is drawn with.
 *
 * - `'v1'`: the original generation, sixteen independent adult forms.
 * - `'v2'`: the standardized canonical anatomy with directional artwork.
 * - `'v3'`: the procedural generation: no authored drawing per Blobbi, each
 *   one an individual generated from its own identity (its seed, its
 *   explicit colours and trait kinds; see `blobbi-v3-identity.ts`).
 *
 * This is a property of the Blobbi's IDENTITY, carried in its kind 31124
 * event, never of the application or renderer version: the same event draws
 * the same generation in every client, today and later. An event with no
 * marker is `'v1'`; every Blobbi that existed before the marker did is V1
 * without any migration.
 */
export type BlobbiVisualGeneration = 'v1' | 'v2' | 'v3';

/** The kind 31124 tag that names a Blobbi's visual generation: `["visual_generation", "v2"]`. */
export const VISUAL_GENERATION_TAG = 'visual_generation';

/** The generation of every event that carries no {@link VISUAL_GENERATION_TAG}. */
export const DEFAULT_VISUAL_GENERATION: BlobbiVisualGeneration = 'v1';

/**
 * The generation a NEW Blobbi is born with, today. This is the creation rule
 * of the ecosystem, owned here so that no application has to remember a
 * tag: {@link buildEggTags} applies it unless a host asks for another
 * generation explicitly. It is still `'v2'`: V3 exists and is opt-in (a host
 * passes `{ visualGeneration: 'v3', v3 }`), because making it the default
 * would start writing V3 events from every application that upgrades the
 * kit, including ones that cannot draw them yet. Moving this to `'v3'` is an
 * ecosystem decision, not a refactor. It is distinct from {@link DEFAULT_VISUAL_GENERATION},
 * which is how an event WITHOUT the tag is read: every Blobbi that existed
 * before the marker did stays V1, without any migration, and a stage
 * transition never changes a generation (the tag is persistent identity;
 * see `blobbi-visual-generation.test.ts`).
 */
export const NEW_BLOBBI_VISUAL_GENERATION: BlobbiVisualGeneration = 'v2';

/**
 * The tag list that names a generation on a NEW event: `[]` for `'v1'`
 * (absence is V1, so a V1 creation is byte-identical to one made before
 * the marker existed) and `[["visual_generation", "v2"]]` for `'v2'`. For
 * hosts that assemble a first kind 31124 by hand instead of through
 * {@link buildEggTags}: the one place the spelling lives.
 */
export function visualGenerationTags(generation: BlobbiVisualGeneration = NEW_BLOBBI_VISUAL_GENERATION): string[][] {
  return generation === DEFAULT_VISUAL_GENERATION ? [] : [[VISUAL_GENERATION_TAG, generation]];
}

const VISUAL_GENERATIONS: ReadonlySet<string> = new Set<BlobbiVisualGeneration>(['v1', 'v2', 'v3']);

/**
 * Read the visual generation from a tag list.
 *
 * Absent tag -> `'v1'`. An unrecognized value also resolves to `'v1'` rather
 * than throwing: a client that predates a future generation must still draw
 * the Blobbi somehow, and V1 is the only generation every client has. Hosts
 * that want to detect "newer than I understand" can read the raw tag.
 */
export function parseVisualGeneration(tags: string[][]): BlobbiVisualGeneration {
  const value = getTagValue(tags, VISUAL_GENERATION_TAG);
  return value !== undefined && VISUAL_GENERATIONS.has(value)
    ? (value as BlobbiVisualGeneration)
    : DEFAULT_VISUAL_GENERATION;
}

/**
 * Progression process state — orthogonal to BlobbiState.
 * 
 * 'none'       — no progression process active
 * 'incubating' — egg is being incubated (hatch tasks)
 * 'evolving'   — baby is being evolved (evolve tasks)
 */
export type BlobbiProgressionState = 'none' | 'incubating' | 'evolving';

export interface BlobbiStats {
  hunger: number;
  happiness: number;
  health: number;
  hygiene: number;
  energy: number;
}

// ─── Visual Traits Types ──────────────────────────────────────────────────────

/**
 * Visual traits for a Blobbi, derived from seed or legacy tags.
 * 
 * This interface is designed to be directly consumable by the EggGraphic module.
 * All color values are canonical CSS hex colors.
 * All categorical values match the EggGraphic vocabulary.
 */
export interface BlobbiVisualTraits {
  /** Primary/base color - hex value (e.g., "#F59E0B") */
  baseColor: string;
  /** Secondary/accent color - hex value */
  secondaryColor: string;
  /** Eye color - hex value */
  eyeColor: string;
  /** Pattern type: 'solid' | 'spotted' | 'striped' | 'gradient' */
  pattern: BlobbiPattern;
  /** Special marking: 'none' | 'star' | 'heart' | 'sparkle' | 'blush' */
  specialMark: BlobbiSpecialMark;
  /** Size category: 'small' | 'medium' | 'large' */
  size: BlobbiSize;
}

/** Pattern types supported by EggGraphic */
export type BlobbiPattern = 'solid' | 'spotted' | 'striped' | 'gradient';

/** Special marks supported by EggGraphic */
export type BlobbiSpecialMark = 'none' | 'star' | 'heart' | 'sparkle' | 'blush';

/** Size categories supported by EggGraphic */
export type BlobbiSize = 'small' | 'medium' | 'large';

/**
 * @deprecated Legacy palette — no longer used for seed-based generation.
 * Colors are now derived as arbitrary HSL values from the seed, then passed
 * through applyColorGuardrails(). Kept only as a historical reference of
 * colors that existing events may have stored in explicit tags.
 */
export const BLOBBI_BASE_COLORS: readonly string[] = [
  '#F59E0B', // Amber/Gold
  '#55C4A2', // Teal
  '#60A5FA', // Sky Blue
  '#F472B6', // Pink
  '#A78BFA', // Purple
  '#F87171', // Coral Red
  '#34D399', // Emerald
  '#FBBF24', // Yellow
  '#818CF8', // Indigo
  '#FB923C', // Orange
] as const;

/** @deprecated See BLOBBI_BASE_COLORS. */
export const BLOBBI_SECONDARY_COLORS: readonly string[] = [
  '#FCD34D', // Light Gold
  '#6EE7B7', // Light Teal
  '#93C5FD', // Light Blue
  '#F9A8D4', // Light Pink
  '#C4B5FD', // Light Purple
  '#FCA5A5', // Light Coral
  '#A7F3D0', // Light Emerald
  '#FDE68A', // Light Yellow
  '#A5B4FC', // Light Indigo
  '#FDBA74', // Light Orange
] as const;

/** @deprecated See BLOBBI_BASE_COLORS. */
export const BLOBBI_EYE_COLORS: readonly string[] = [
  '#1F2937', // Dark Gray (default)
  '#7C3AED', // Violet
  '#059669', // Emerald
  '#DC2626', // Red
  '#2563EB', // Blue
  '#D97706', // Amber
  '#DB2777', // Pink
  '#4F46E5', // Indigo
] as const;

/** Available patterns - EggGraphic compatible */
export const BLOBBI_PATTERNS: readonly BlobbiPattern[] = [
  'solid',
  'spotted',
  'striped',
  'gradient',
] as const;

/** Available special marks - EggGraphic compatible */
export const BLOBBI_SPECIAL_MARKS: readonly BlobbiSpecialMark[] = [
  'none',
  'star',
  'heart',
  'sparkle',
  'blush',
] as const;

/** Available sizes - EggGraphic compatible */
export const BLOBBI_SIZES: readonly BlobbiSize[] = [
  'small',
  'medium',
  'large',
] as const;

/** Default visual traits when seed is missing */
export const DEFAULT_VISUAL_TRAITS: BlobbiVisualTraits = {
  baseColor: '#F59E0B',
  secondaryColor: '#FCD34D',
  eyeColor: '#1F2937',
  pattern: 'solid',
  specialMark: 'none',
  size: 'medium',
} as const;

/**
 * Parsed task progress stored in Blobbi event tags.
 * Format: ["task", "name:value"]
 */
export interface BlobbiTaskProgress {
  name: string;
  value: number;
}

/**
 * Parsed representation of a Kind 31124 Blobbi Current State event.
 */
export interface BlobbiCompanion {
  /** Original event for republishing */
  event: NostrEvent;
  /** The d tag value */
  d: string;
  /** Display name */
  name: string;
  /** Lifecycle stage */
  stage: BlobbiStage;
  /** Activity state (active, sleeping, hibernating — never progression) */
  state: BlobbiState;
  /** Progression process state (none, incubating, evolving — orthogonal to state) */
  progressionState: BlobbiProgressionState;
  /** Deterministic identity seed (64-char hex) */
  seed: string | undefined;
  /** Visual traits (derived from seed or legacy tags) */
  visualTraits: BlobbiVisualTraits;
  /**
   * Whether this event is in a legacy / unsupported format.
   *
   * This is true when EITHER:
   * - the event carries old-app / old-schema markers (deprecated egg/incubation/
   *   fee tags) — this catches old-app events even when the d-tag looks
   *   canonical and a seed is present. Branding tags (`client`, `t`) are not
   *   markers; OR
   * - the event has a non-canonical d-tag, a missing/short seed, or a missing
   *   name.
   *
   * NOTE: Old-app legacy Blobbis are no longer automatically migrated. This
   * flag is used by the collection filter, fresh-fetch, canonical sync, and
   * seed-identity sync to ignore unsupported events (never shown, selected,
   * synced, or republished).
   */
  isLegacy: boolean;
  /** Timestamp of last user interaction (unix seconds) */
  lastInteraction: number;
  /** Timestamp used for stat decay checkpoint (unix seconds) */
  lastDecayAt: number | undefined;
  /** Stats (0-100) */
  stats: Partial<BlobbiStats>;
  /** Generation number */
  generation: number | undefined;
  /** Breeding eligibility */
  breedingReady: boolean;
  /** Whether external users can interact with this Blobbi (social tag = "open") */
  socialOpen: boolean;
  /** Total XP */
  experience: number | undefined;
  /** Consecutive care days */
  careStreak: number | undefined;
  /** Unix timestamp (seconds) of last streak update */
  careStreakLastAt: number | undefined;
  /** Local day string (YYYY-MM-DD) of last streak update */
  careStreakLastDay: string | undefined;
  /** 
   * @deprecated Incubation time in seconds - no longer used.
   * Task system uses progression_started_at instead.
   */
  incubationTime: number | undefined;
  /** 
   * @deprecated When incubation began - no longer used.
   * Replaced by progression_started_at for all process timing.
   */
  startIncubation: number | undefined;
  /** Adult evolution form type (adult only) */
  adultType: string | undefined;
  /**
   * Which artwork generation draws this Blobbi. `'v1'` when the event carries
   * no `visual_generation` tag (every pre-existing Blobbi). See
   * {@link BlobbiVisualGeneration}.
   */
  visualGeneration: BlobbiVisualGeneration;
  /**
   * The V3 identity of the event: the seed its address derives, under
   * Algorithm 1, present only when `visualGeneration` is `'v3'`. Everything
   * the Blobbi looks like follows from it (Algorithm 1, in the renderer);
   * see {@link ParsedBlobbiV3Identity}.
   * Optional so hosts that build companions by hand keep compiling.
   */
  v3Identity?: ParsedBlobbiV3Identity;
  /**
   * NIP-23 style `published_at` (unix seconds): when this Blobbi was first
   * published, preserved across republishes by hosts that carry it. Optional;
   * not every producer writes it. Never used for decay or ordering by the kit.
   * Optional (not `| undefined`) so hosts that build companions by hand, as
   * Ditto's egg preview does, keep compiling.
   */
  publishedAt?: number;
  /** 
   * @deprecated Use progressionStartedAt instead.
   * Timestamp when current state (incubating/evolving) started (unix seconds).
   * Kept only for read-time normalization of the legacy state→progression_state
   * model; it does NOT drive any old-app event migration/republish.
   */
  stateStartedAt: number | undefined;
  /** Timestamp when current progression (incubating/evolving) started (unix seconds) */
  progressionStartedAt: number | undefined;
  /** Task progress cache (source of truth is computed from Nostr events) */
  tasks: BlobbiTaskProgress[];
  /** Completed task names */
  tasksCompleted: string[];
  /** Evolution missions parsed from 31124 content JSON (per-Blobbi progression) */
  evolution: Mission[];
  /** All tags preserved for republishing */
  allTags: string[][];
}

/**
 * Parsed representation of a Blobbonaut Profile event (Kind 11125).
 * Also supports legacy Kind 31125 profiles.
 */
export interface BlobbonautProfile {
  /** Original event for republishing */
  event: NostrEvent;
  /** The d tag value */
  d: string;
  /** Currently selected companion Blobbi d-tag */
  currentCompanion: string | undefined;
  /** Whether onboarding/tutorial is complete */
  onboardingDone: boolean;
  /** Display name for the Blobbonaut */
  name: string | undefined;
  /** List of owned Blobbi d-tags */
  has: string[];
  /** Petting level (interaction counter) */
  pettingLevel: number;
  /** Player lifetime XP (source of truth for progression) */
  xp: number;
  /** Player level (derived from xp, stored as queryable mirror) */
  level: number;
  /** Current room the player is in (persisted for cross-session continuity) */
  room: string | undefined;
  /** Raw content string for missions JSON */
  content: string;
  /** All tags preserved for republishing */
  allTags: string[][];
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get the first 12 lowercase hex characters from a pubkey.
 */
export function getPubkeyPrefix12(pubkey: string): string {
  return pubkey.slice(0, 12).toLowerCase();
}

/**
 * Generate a random 10-character lowercase hex petId.
 */
export function generatePetId10(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the canonical d-tag for a Blobbi (Kind 31124).
 * Format: blobbi-{ownerPubkeyPrefix12}-{petId10}
 */
export function getCanonicalBlobbiD(pubkey: string, petId: string): string {
  return `blobbi-${getPubkeyPrefix12(pubkey)}-${petId}`;
}

/**
 * Get the canonical d-tag for a Blobbonaut Profile (Kind 11125).
 * Format: blobbonaut-{pubkeyPrefix12}
 */
export function getCanonicalBlobbonautD(pubkey: string): string {
  return `blobbonaut-${getPubkeyPrefix12(pubkey)}`;
}

/**
 * Build a canonical Blobbi address coordinate for the `a` tag of events that
 * reference a Kind 31124 Blobbi state (e.g. kind 1124 interactions).
 *
 * Format: `31124:<owner-pubkey>:<blobbi-d-tag>`
 *
 * This is the single source of truth for the coordinate string. Callers that
 * reference a Blobbi (interactions, presence, activity history) should use this
 * instead of hand-building the string, so the kind prefix and separator layout
 * cannot drift.
 */
export function buildBlobbiAddress(pubkey: string, d: string): string {
  return `${KIND_BLOBBI_STATE}:${pubkey}:${d}`;
}

/**
 * Parse a canonical Blobbi address coordinate (`31124:<pubkey>:<d>`) into its
 * parts. The inverse of {@link buildBlobbiAddress}.
 *
 * Returns `undefined` unless the address is exactly:
 * - `KIND_BLOBBI_STATE` (31124) as the kind segment,
 * - exactly 3 colon-separated parts,
 * - a non-empty pubkey,
 * - a non-empty d-tag.
 *
 * Deep hex/format validation of the pubkey and d-tag is intentionally NOT
 * performed here — callers that need it can layer `isCanonicalBlobbiD` or
 * `isNostrId` on top. This keeps the parser small and permissive of legacy
 * d-tags while still rejecting malformed coordinates.
 */
export function parseBlobbiAddress(
  address: string,
): { kind: typeof KIND_BLOBBI_STATE; pubkey: string; d: string } | undefined {
  const parts = address.split(':');
  if (parts.length !== 3) return undefined;

  const [kindStr, pubkey, d] = parts;
  if (kindStr !== String(KIND_BLOBBI_STATE)) return undefined;
  if (!pubkey) return undefined;
  if (!d) return undefined;

  return { kind: KIND_BLOBBI_STATE, pubkey, d };
}

/**
 * Derive the Blobbi seed using sha256.
 * seed = sha256("blobbi:v1|" + pubkey + ":" + d + ":" + createdAt)
 * 
 * This is the raw derivation function. Use getOrDeriveSeed() when working with events
 * to ensure existing seeds are never recomputed.
 */
export function deriveBlobbiSeedV1(pubkey: string, d: string, createdAt: number): string {
  const input = `blobbi:v1|${pubkey}:${d}:${createdAt}`;
  const hashBytes = sha256(new TextEncoder().encode(input));
  return bytesToHex(hashBytes);
}

/**
 * Get the seed from an existing event, or derive it if not present.
 * Per spec: Clients MUST NOT recompute the seed if a seed tag already exists.
 * 
 * @param event - The Blobbi event to get/derive seed from
 * @returns The existing seed or a newly derived one
 * A V3 Blobbi's seed is its address (`getBlobbiV3Seed`), never a tag.
 *
 * @throws When the event is V3 and has no single well-formed address
 */
export function getOrDeriveSeed(event: NostrEvent): string {
  if (parseVisualGeneration(event.tags) === 'v3') {
    const seed = getBlobbiV3Seed(event);
    if (!seed) throw new Error('Cannot derive seed: a V3 Blobbi without a single well-formed address (pubkey, d) has none');
    return seed;
  }
  const existingSeed = getTagValue(event.tags, 'seed');
  if (existingSeed && existingSeed.length === 64) {
    return existingSeed;
  }
  
  const d = getTagValue(event.tags, 'd');
  if (!d) {
    throw new Error('Cannot derive seed: event missing d tag');
  }
  
  return deriveBlobbiSeedV1(event.pubkey, d, event.created_at);
}

// ─── Tag Parsing Utilities ────────────────────────────────────────────────────

/**
 * Get the first value for a given tag name.
 * Does NOT assume tag order.
 */
export function getTagValue(tags: string[][], name: string): string | undefined {
  const tag = tags.find(([n]) => n === name);
  return tag?.[1];
}

/**
 * Get all values for a given tag name (for repeated tags like "has").
 */
export function getTagValues(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(t => t[1]).filter(Boolean);
}

/**
 * Parse a numeric tag value, returning undefined if invalid.
 */
function parseNumericTag(tags: string[][], name: string): number | undefined {
  const value = getTagValue(tags, name);
  if (value === undefined) return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Parse a boolean tag value (string "true" or "false").
 */
function parseBooleanTag(tags: string[][], name: string, defaultValue = false): boolean {
  const value = getTagValue(tags, name);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
}

// ─── Legacy Detection ─────────────────────────────────────────────────────────

/**
 * Check if a Blobbonaut d-tag is in canonical format.
 * Canonical: blobbonaut-{12 lowercase hex}
 */
export function isCanonicalBlobbonautD(d: string): boolean {
  return /^blobbonaut-[0-9a-f]{12}$/.test(d);
}

/**
 * Check if a Blobbonaut d-tag is a legacy format.
 * Legacy formats:
 * - Blobbonaut-{8-12 hex} (capitalized)
 * - blobbonaut-profile
 * - blobbonaut-{8-11 hex}
 */
export function isLegacyBlobbonautD(d: string): boolean {
  // Capitalized version
  if (/^Blobbonaut-[0-9a-fA-F]{8,12}$/.test(d)) return true;
  // Generic profile id
  if (d === 'blobbonaut-profile') return true;
  // Short prefix (8-11 chars instead of 12)
  if (/^blobbonaut-[0-9a-f]{8,11}$/.test(d)) return true;
  return false;
}

/**
 * Check if a Blobbi d-tag is in canonical format.
 * Canonical: blobbi-{12 lowercase hex}-{10 lowercase hex}
 * Per spec: petId MUST be 10 lowercase hex characters
 */
export function isCanonicalBlobbiD(d: string): boolean {
  return /^blobbi-[0-9a-f]{12}-[0-9a-f]{10}$/.test(d);
}

// ─── Visual Trait Derivation ──────────────────────────────────────────────────

/**
 * Seed offset layout (per spec):
 * - [0..8]   base_color   (H/S/L split from 32-bit value)
 * - [8..16]  secondary_color hue shift / lightness offset from base
 * - [12..20] eye_color    (H/S/L split from 32-bit value; overlaps secondary)
 * - [16..24] pattern
 * - [24..32] special_mark
 * - [32..40] size
 * - [40..48] adult_type
 * - [48..64] reserved
 */

/**
 * Read 8 hex chars from `seed` at `offset` and return the raw unsigned
 * 32-bit integer (0 .. 0xFFFFFFFF).
 *
 * Returns 0 for empty/unparseable slices so callers never see NaN.
 */
function readSeedUint32(seed: string, offset: number): number {
  const slice = seed.slice(offset, offset + 8);
  const value = parseInt(slice, 16);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Derive a bounded index from a seed at a specific offset.
 * Uses 4 bytes (8 hex chars) starting at offset, then maps to [0, max).
 *
 * Use this for selecting from small arrays (patterns, marks, sizes, forms).
 * For raw 32-bit entropy that will be decomposed further (e.g. into H/S/L
 * components via successive division), use readSeedUint32() directly.
 */
function deriveIndexFromSeed(seed: string, offset: number, max: number): number {
  return readSeedUint32(seed, offset) % max;
}

/**
 * Derive base color (hex) from seed using arbitrary HSL generation.
 *
 * Extracts a single 32-bit value from seed[0..8] and splits it into
 * three components via successive division:
 * - Hue:        0..359  (full color wheel)
 * - Saturation: 30..100 (vibrant, never dull gray)
 * - Lightness:  30..75  (safe range for the SVG gradient pipeline)
 *
 * The result is passed through clampBaseColor() via applyColorGuardrails()
 * at the call site, but the ranges here are already chosen to land within
 * the guardrail thresholds, so clamping is a safety net rather than a
 * regular adjustment.
 */
export function deriveBaseColorFromSeed(seed: string): string {
  const value = readSeedUint32(seed, 0);
  const h = value % 360;
  const rem1 = Math.floor(value / 360);
  const s = (rem1 % 71) + 30;  // 30..100
  const rem2 = Math.floor(rem1 / 71);
  const l = (rem2 % 46) + 30;  // 30..75
  return hslToHex(h, s, l);
}

/**
 * Derive secondary color (hex) from seed, harmonized with a base color.
 *
 * Instead of picking independently from a palette, the secondary is derived
 * as a lighter variant of the base with a small hue shift:
 * - Hue shift:       ±20° from base (subtle tonal variation)
 * - Lightness offset: +12..+25 above base (guaranteed visible gradient)
 *
 * This ensures the base/secondary pair always produces a good 3D body
 * gradient regardless of the base color.
 *
 * @param seed - The Blobbi seed (64-char hex)
 * @param baseHex - The already-resolved base color (after guardrails)
 */
export function deriveSecondaryColorFromSeed(seed: string, baseHex?: string): string {
  const seedValue = readSeedUint32(seed, 8);

  // Without a base color, fall back to independent HSL derivation
  // (same approach as base, but with a lighter range)
  if (!baseHex) {
    const h = seedValue % 360;
    const rem1 = Math.floor(seedValue / 360);
    const s = (rem1 % 71) + 30;
    const rem2 = Math.floor(rem1 / 71);
    const l = (rem2 % 31) + 60; // 60..90 (lighter range)
    return hslToHex(h, s, l);
  }

  // Harmonized derivation: shift from base
  const baseHsl = hexToHsl(baseHex);
  const hueShift = (seedValue % 41) - 20;  // -20..+20 degrees
  const rem1 = Math.floor(seedValue / 41);
  const lOffset = (rem1 % 14) + 12;        // +12..+25 lightness

  const secH = (baseHsl.h + hueShift + 360) % 360;
  const secS = baseHsl.s; // preserve base saturation for cohesion
  const secL = Math.min(baseHsl.l + lOffset, 90); // cap to avoid near-white

  return hslToHex(secH, secS, secL);
}

/**
 * Derive eye color (hex) from seed using arbitrary HSL generation.
 *
 * Eyes are generated in a darker, more saturated range than base colors
 * to ensure visibility against white sclera circles:
 * - Hue:        0..359  (full color wheel, independent of base)
 * - Saturation: 40..100 (vivid enough to read at small sizes)
 * - Lightness:  10..55  (always darker than typical bases)
 *
 * The result is further validated by ensureEyeVisibility() via
 * applyColorGuardrails() at the call site.
 */
export function deriveEyeColorFromSeed(seed: string): string {
  const value = readSeedUint32(seed, 12);
  const h = value % 360;
  const rem1 = Math.floor(value / 360);
  const s = (rem1 % 61) + 40;  // 40..100
  const rem2 = Math.floor(rem1 / 61);
  const l = (rem2 % 46) + 10;  // 10..55
  return hslToHex(h, s, l);
}

/**
 * Derive pattern from seed.
 */
export function derivePatternFromSeed(seed: string): BlobbiPattern {
  const index = deriveIndexFromSeed(seed, 16, BLOBBI_PATTERNS.length);
  return BLOBBI_PATTERNS[index];
}

/**
 * Derive special mark from seed.
 */
export function deriveSpecialMarkFromSeed(seed: string): BlobbiSpecialMark {
  const index = deriveIndexFromSeed(seed, 24, BLOBBI_SPECIAL_MARKS.length);
  return BLOBBI_SPECIAL_MARKS[index];
}

/**
 * Derive size from seed.
 */
export function deriveSizeFromSeed(seed: string): BlobbiSize {
  const index = deriveIndexFromSeed(seed, 32, BLOBBI_SIZES.length);
  return BLOBBI_SIZES[index];
}

// ─── Seed Authoring ───────────────────────────────────────────────────────────

/**
 * Adjust a seed so that deriveAdultFormFromSeed(adjusted) === targetForm.
 *
 * A seed AUTHORING utility, not a read path: the kit never calls it while
 * parsing an event. Hosts use it when they deliberately rewrite a Blobbi's
 * seed to select an adult form (Ditto's development editor does), after
 * which the mirror tags follow the new seed on republish.
 *
 * Directly computes the seed bytes at offset [40..48] (the adult_type
 * region) that produce the target form index. All other seed regions
 * are left untouched, so colors [0..20] are preserved and non-color
 * traits are re-derived from the adjusted seed via deriveSeedIdentity().
 *
 * Returns the original seed unchanged if it already produces targetForm.
 */
export function adjustSeedForAdultType(seed: string, targetForm: AdultForm): string {
  // Fast path: already matches
  if (deriveAdultFormFromSeed(seed) === targetForm) return seed;

  const targetIndex = ADULT_FORMS.indexOf(targetForm);
  if (targetIndex < 0) return seed; // unknown form — leave seed unchanged

  const prefix = seed.slice(0, 40);
  const suffix = seed.slice(48);

  // Direct computation: deriveAdultFormFromSeed reads seed[40..48] as a
  // hex integer and takes `% ADULT_FORMS.length`. So any 8-hex-char value
  // whose parseInt % length === targetIndex works. The simplest is the
  // target index itself (always < 16, which is < ADULT_FORMS.length).
  const candidate = targetIndex.toString(16).padStart(8, '0');
  return prefix + candidate + suffix;
}

/**
 * Validate and normalize a pattern value from a tag.
 * Returns undefined if invalid, allowing fallback to seed derivation.
 */
function normalizePatternTag(value: string | undefined): BlobbiPattern | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase() as BlobbiPattern;
  return BLOBBI_PATTERNS.includes(normalized) ? normalized : undefined;
}

/**
 * Validate and normalize a special mark value from a tag.
 * Returns undefined if invalid, allowing fallback to seed derivation.
 */
function normalizeSpecialMarkTag(value: string | undefined): BlobbiSpecialMark | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase() as BlobbiSpecialMark;
  return BLOBBI_SPECIAL_MARKS.includes(normalized) ? normalized : undefined;
}

/**
 * Validate and normalize a size value from a tag.
 * Returns undefined if invalid, allowing fallback to seed derivation.
 */
function normalizeSizeTag(value: string | undefined): BlobbiSize | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase() as BlobbiSize;
  return BLOBBI_SIZES.includes(normalized) ? normalized : undefined;
}

/**
 * Validate a hex color value.
 * Returns the value if valid hex, undefined otherwise.
 */
function normalizeHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Accept both #RGB and #RRGGBB formats
  if (/^#[0-9A-Fa-f]{3}$/.test(value) || /^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value.toUpperCase();
  }
  return undefined;
}

/**
 * Derive all visual traits from seed, with legacy tag fallbacks.
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ VISUAL TRAIT POLICY                                                         │
 * │                                                                              │
 * │ Color resolution priority:                                                  │
 * │ 1. Seed present → colors ALWAYS come from seed + guardrails                 │
 * │    (explicit color tags are ignored; they are mirrors, not overrides)        │
 * │ 2. No seed → explicit color tags used as-is (legacy fallback)               │
 * │ 3. Neither → safe defaults                                                  │
 * │                                                                              │
 * │ Non-color traits (pattern, special_mark, size):                             │
 * │ 1. Explicit valid tags take precedence                                      │
 * │ 2. Derive from seed if no tag present                                       │
 * │ 3. Safe defaults as final fallback                                          │
 * │                                                                              │
 * │ IMPORTANT: Some events may have explicit visual tags WITHOUT a seed         │
 * │ (e.g. an event with a non-canonical d-tag). These tags must be respected    │
 * │ for rendering — do NOT discard them in favor of defaults. This is a          │
 * │ read-time fallback only; it does not trigger any republish/migration.       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * This function is the SINGLE SOURCE OF TRUTH for visual trait resolution.
 * The UI should consume the output directly without additional logic.
 */
export function deriveVisualTraits(
  tags: string[][],
  seed: string | undefined
): BlobbiVisualTraits {
  // A V3 seed is an Algorithm 1 seed or no seed (`canonicalBlobbiV3Seed`);
  // V1 and V2 keep the length check.
  const validSeed = parseVisualGeneration(tags) === 'v3' ? canonicalBlobbiV3Seed(seed) : seed && seed.length === 64 ? seed : undefined;
  
  // Seed is the canonical source of truth for the entire visual identity.
  // When present, all visual trait tags are mirrors — not consulted for rendering.
  if (validSeed) {
    // A V3 Blobbi's tags state nothing about its looks (its colours and trait
    // kinds are Algorithm 1's, which only the renderer computes), so this
    // record is the seed's in the older generations' mapping, like V1 and V2.
    // It is NOT a V3 Blobbi's colours: those are `createBlobbiV3Identity(seed)`
    // in the renderer. Stated colour, pattern or mark tags are never read.
    return deriveSeedIdentity(validSeed);
  }
  
  // No seed (legacy): use explicit tags with defaults as final fallback.
  const tagBaseColor = normalizeHexColor(getTagValue(tags, 'base_color'));
  const tagSecondaryColor = normalizeHexColor(getTagValue(tags, 'secondary_color'));
  const tagEyeColor = normalizeHexColor(getTagValue(tags, 'eye_color'));
  const tagPattern = normalizePatternTag(getTagValue(tags, 'pattern'));
  const tagSpecialMark = normalizeSpecialMarkTag(getTagValue(tags, 'special_mark'));
  const tagSize = normalizeSizeTag(getTagValue(tags, 'size'));
  const resolvedBaseColor = tagBaseColor ?? DEFAULT_VISUAL_TRAITS.baseColor;
  return {
    baseColor: resolvedBaseColor,
    secondaryColor: tagSecondaryColor ?? resolvedBaseColor,
    eyeColor: tagEyeColor ?? DEFAULT_VISUAL_TRAITS.eyeColor,
    pattern: tagPattern ?? DEFAULT_VISUAL_TRAITS.pattern,
    specialMark: tagSpecialMark ?? DEFAULT_VISUAL_TRAITS.specialMark,
    size: tagSize ?? DEFAULT_VISUAL_TRAITS.size,
  };
}

/**
 * Derive the full seed-determined visual identity.
 *
 * This is the single function that turns a 64-char hex seed into the
 * authoritative set of visual traits (colors + pattern + mark + size)
 * with color guardrails applied. All call sites that need seed-derived
 * visual traits should use this to guarantee consistency.
 */
export function deriveSeedIdentity(seed: string): BlobbiVisualTraits {
  const rawBase = deriveBaseColorFromSeed(seed);
  const rawEye = deriveEyeColorFromSeed(seed);
  const colors = applyColorGuardrails({
    baseColor: rawBase,
    secondaryColor: deriveSecondaryColorFromSeed(seed, rawBase),
    eyeColor: rawEye,
  });
  return {
    ...colors,
    pattern: derivePatternFromSeed(seed),
    specialMark: deriveSpecialMarkFromSeed(seed),
    size: deriveSizeFromSeed(seed),
  };
}

// ─── Legacy Event Detection ───────────────────────────────────────────────────

/**
 * Old-app schema markers that identify a Blobbi event produced by the
 * legacy ("old app") client, *even when its d-tag looks canonical*.
 *
 * Current canonical events are not expected to write any of these tags into a
 * Kind 31124 event: the egg/incubation/fee fields were removed from the schema.
 *
 * Presence of ANY of these tag NAMES is therefore a strong, d-tag-independent
 * signal that the event came from the old app and should be treated as
 * unsupported (never migrated, normalized, or republished).
 *
 * Legacy detection is SCHEMA/STRUCTURE based. Branding tags (`client`, `t`)
 * are deliberately NOT in this set: they say which client wrote an event, not
 * which schema it follows. Current hosts legitimately publish
 * `["client", "blobbi"]` (Blobbi Island) or a NIP-89 `["client", "Ditto", …]`
 * tag on fully canonical events, so a branding value is never schema evidence.
 *
 * NOTE: This intentionally does NOT include the new-app progression timing
 * tags. `start_incubation` IS an old-app field (the new app uses
 * `progression_started_at`), so it stays here.
 */
const OLD_APP_SCHEMA_TAG_NAMES = new Set<string>([
  'incubation_time',
  'incubation_progress',
  'egg_temperature',
  'egg_status',
  'shell_integrity',
  'fees',
  'start_incubation',
  'interact_6_progress',
]);

/**
 * `state` values of the schema that stored progression in the activity state.
 * The current model (`state` = activity, `progression_state` = process) has
 * been the only one written by any client since 2026-04-18; an event that still
 * carries one of these in `state` was last published before that split and is
 * historical. It is identified and ignored, never reinterpreted.
 */
const LEGACY_PROGRESSION_STATE_VALUES = new Set<string>(['incubating', 'evolving']);

/**
 * Detect a Blobbi event that originated from the old app / old schema, even
 * when its d-tag is in the current canonical format and it carries a valid
 * seed.
 *
 * Such events should be treated as **unsupported**: ignored everywhere, never
 * shown/selected, never synced (canonical or seed/tag), and never republished
 * into a cleaned/current format. Opening one must not produce a new 31124.
 *
 * Detection is based on old-app/deprecated schema markers ONLY, NOT the d-tag
 * and NOT branding: any old-app-only egg/incubation/fee schema tag
 * (incubation_time, incubation_progress, egg_temperature, egg_status,
 * shell_integrity, fees, start_incubation, interact_6_progress).
 *
 * `client` / `t` tags, whatever their value, are never a marker: a canonical
 * event branded `["client", "blobbi"]` or `["t", "blobbi"]` is a current event.
 * The mere presence of a `seed` is NOT a marker either.
 */
export function isUnsupportedLegacyBlobbiEvent(event: NostrEvent): boolean {
  for (const [name, value] of event.tags) {
    if (OLD_APP_SCHEMA_TAG_NAMES.has(name)) return true;
    if (name === 'state' && value !== undefined && LEGACY_PROGRESSION_STATE_VALUES.has(value)) return true;
  }
  return false;
}

/**
 * Check if a Blobbi event is in a legacy / unsupported format.
 *
 * A Blobbi is considered legacy if ANY of the following is true:
 * - it carries old-app / old-schema markers (see isUnsupportedLegacyBlobbiEvent)
 *   — this catches old-app events even when the d-tag looks canonical
 * - the d tag is not in canonical format
 * - the seed tag is missing (on a V3 Blobbi: the event has no single well-formed address, `getBlobbiV3Seed`)
 * - the name tag is missing and must be derived from d
 * - visual traits exist but seed does not
 *
 * Canonical Blobbi events must always contain:
 * - canonical d
 * - seed
 * - name
 * - stage
 * - state
 * - stats
 * - ecosystem tag
 *
 * NOTE: Old-app legacy Blobbis are no longer automatically migrated to the
 * canonical format. This predicate populates the BlobbiCompanion.isLegacy
 * flag, which the collection filter, fresh-fetch, canonical sync, and
 * seed-identity sync all use to ignore unsupported events.
 */
export function isLegacyBlobbiEvent(event: NostrEvent): boolean {
  const tags = event.tags;

  // Old-app schema markers (d-tag-independent). Catches old-app events whose
  // d-tag looks canonical and that carry a valid seed.
  if (isUnsupportedLegacyBlobbiEvent(event)) {
    return true;
  }

  const d = getTagValue(tags, 'd');
  
  if (!d) return true;
  
  // Check if d-tag is not canonical
  if (!isCanonicalBlobbiD(d)) {
    return true;
  }
  
  // A V3 Blobbi's seed is its address (`getBlobbiV3Seed`): an event with no
  // single well-formed one has no seed, so it is not a modern V3 Blobbi. A
  // `seed` tag says nothing about it either way. V1 and V2 keep their check.
  if (parseVisualGeneration(tags) === 'v3') {
    if (!getBlobbiV3Seed(event)) return true;
  } else {
    // Check if seed is missing
    const seed = getTagValue(tags, 'seed');
    if (!seed || seed.length !== 64) {
      return true;
    }
  }

  // Check if name tag is missing
  const name = getTagValue(tags, 'name');
  if (!name) {
    return true;
  }

  return false;
}

/**
 * Check if a parsed BlobbiCompanion needs migration.
 * This is a convenience wrapper around isLegacyBlobbiEvent.
 */
export function companionNeedsMigration(companion: BlobbiCompanion): boolean {
  return companion.isLegacy;
}

// ─── Event Validation ─────────────────────────────────────────────────────────

/**
 * Schema-level validity of a kind 31124 Blobbi state event.
 *
 * This is the modern contract. It is deliberately the SMALLEST set of
 * requirements every current producer (Ditto, Blobbi Island, this kit's own
 * `buildEggTags`) satisfies, so a standalone consumer can rely on exactly these
 * fields and nothing more:
 *
 * - `kind` 31124;
 * - `d`: the replaceable identity (its canonical shape is a legacy question,
 *   see {@link isLegacyBlobbiEvent}, not a validity one);
 * - `b` = `blobbi:ecosystem:v1`: the ecosystem marker. It is protocol-level
 *   (collections are queried by it) and every current producer writes it;
 * - `stage` in `egg | baby | adult`;
 * - `state` in `active | sleeping | hibernating`. Progression is NOT a state:
 *   an event carrying `incubating`/`evolving` here follows the historical
 *   schema and is rejected (also flagged by {@link isUnsupportedLegacyBlobbiEvent});
 * - `last_interaction`: the one timestamp every stat and decay computation
 *   anchors on; written by every producer, `BlobbiCompanion.lastInteraction`
 *   is typed non-optional because of it.
 *
 * Everything else is optional, because real current events differ in it:
 * the five care stats, `experience`, `care_streak*`, `generation`,
 * `breeding_ready`, `progression_state`/`progression_started_at`,
 * `last_decay_at`, the visual trait tags, `visual_generation`, `published_at`
 * and the JSON `content`. A parser must default them, not reject them.
 * Product-specific tags (`client`, `t`, host extensions) are never required.
 */
export function isValidBlobbiEvent(event: NostrEvent): boolean {
  if (event.kind !== KIND_BLOBBI_STATE) return false;
  
  const d = getTagValue(event.tags, 'd');
  const b = getTagValue(event.tags, 'b');
  const stage = getTagValue(event.tags, 'stage');
  const state = getTagValue(event.tags, 'state');
  const lastInteraction = getTagValue(event.tags, 'last_interaction');
  
  if (!d) return false;
  if (b !== BLOBBI_ECOSYSTEM_NAMESPACE) return false;
  if (!stage || !['egg', 'baby', 'adult'].includes(stage)) return false;
  if (!state || !(BLOBBI_ACTIVITY_STATES as readonly string[]).includes(state)) return false;
  if (!lastInteraction) return false;
  
  return true;
}

// ─── Modern classification (the one path a consumer needs) ───────────────────

/**
 * How a kind 31124 event relates to the modern contract.
 *
 * - `'modern'`: schema-valid and not legacy. Parse and use it.
 * - `'legacy'`: schema-valid but historical (old-app markers, progression in
 *   `state`, non-canonical `d`, missing seed or name). Identify and ignore; it
 *   is never migrated, normalized or republished.
 * - `'invalid'`: fails the schema contract (wrong kind, missing `d`, wrong or
 *   missing `b`, unknown `stage`/`state`, no `last_interaction`).
 *
 * Legacy takes precedence over invalid only where the two overlap through
 * `state` (an old progression value fails validity too); the result is still
 * `'legacy'` so callers can tell "old" from "malformed".
 */
export type BlobbiEventClass = 'modern' | 'legacy' | 'invalid';

/** Classify a kind 31124 event against the modern contract. */
export function classifyBlobbiEvent(event: NostrEvent): BlobbiEventClass {
  if (event.kind !== KIND_BLOBBI_STATE) return 'invalid';
  if (isUnsupportedLegacyBlobbiEvent(event)) return 'legacy';
  if (!isValidBlobbiEvent(event)) return 'invalid';
  return isLegacyBlobbiEvent(event) ? 'legacy' : 'modern';
}

/**
 * True for exactly the events a consumer should show, select, care for and
 * republish: schema-valid ({@link isValidBlobbiEvent}) and not historical
 * ({@link isLegacyBlobbiEvent}). This is the predicate `useBlobbisCollection`
 * keeps events with.
 */
export function isModernBlobbiEvent(event: NostrEvent): boolean {
  return classifyBlobbiEvent(event) === 'modern';
}

/**
 * Parse a kind 31124 event only if it is modern. Unlike {@link parseBlobbiEvent},
 * which still returns a companion flagged `isLegacy` for historical events,
 * this returns `undefined` for both legacy and invalid input, so a consumer
 * never has to check `isLegacy` itself.
 */
export function parseModernBlobbiEvent(event: NostrEvent): BlobbiCompanion | undefined {
  if (!isModernBlobbiEvent(event)) return undefined;
  return parseBlobbiEvent(event);
}

/**
 * Validate that an event has the required tags for a valid Blobbonaut profile.
 * Accepts both current kind (11125) and legacy kind (31125) for migration support.
 * Required: d, b (blobbi:ecosystem:v1)
 */
export function isValidBlobbonautEvent(event: NostrEvent): boolean {
  // Accept both current and legacy kinds
  if (event.kind !== KIND_BLOBBONAUT_PROFILE && event.kind !== KIND_BLOBBONAUT_PROFILE_LEGACY) {
    return false;
  }
  
  const d = getTagValue(event.tags, 'd');
  const b = getTagValue(event.tags, 'b');
  
  if (!d) return false;
  if (b !== BLOBBI_ECOSYSTEM_NAMESPACE) return false;
  
  return true;
}

/**
 * Check if a Blobbonaut profile event is using the legacy kind (31125).
 * Used by profile normalization/compatibility only (kind 31125 → 11125);
 * unrelated to old-app Blobbi migration.
 */
export function isLegacyBlobbonautKind(event: NostrEvent): boolean {
  return event.kind === KIND_BLOBBONAUT_PROFILE_LEGACY;
}

// ─── Event Parsing ────────────────────────────────────────────────────────────

/**
 * Derive a display name from a legacy d-tag.
 * Legacy format: blobbi-{name} (e.g., "blobbi-puck" → "Puck")
 * 
 * @param d - The d-tag value
 * @returns The derived name with first letter capitalized, or "Unnamed Blobbi" if not derivable
 */
/**
 * Capitalize each word in a string.
 * @example "mr cool" -> "Mr Cool"
 */
function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Derive a display name from a legacy d-tag.
 * 
 * Transformation rules:
 * 1. Remove "blobbi-" prefix
 * 2. Replace "-" and "_" with spaces
 * 3. Trim whitespace
 * 4. Capitalize words in a human-friendly way
 * 5. Fallback to "Unnamed Blobbi" if result is empty
 * 
 * @example "blobbi-puck" -> "Puck"
 * @example "blobbi-mr-cool" -> "Mr Cool"
 * @example "blobbi_blue" -> "Blue"
 * @example "blobbi-" -> "Unnamed Blobbi"
 */
export function deriveNameFromLegacyD(d: string): string {
  if (!d.startsWith('blobbi-')) {
    return 'Unnamed Blobbi';
  }
  
  // Remove prefix and normalize separators
  const rawName = d
    .replace('blobbi-', '')
    .replace(/[-_]/g, ' ')
    .trim();
  
  // If nothing meaningful remains, return fallback
  if (!rawName || rawName.length === 0) {
    return 'Unnamed Blobbi';
  }
  
  // Capitalize words for human-friendly display
  return capitalizeWords(rawName);
}

/**
 * Parse a Kind 31124 Blobbi Current State event into a structured object.
 * Returns undefined if the event is invalid.
 * 
 * This function is the SINGLE SOURCE OF TRUTH for resolving:
 * - name (from tag or legacy d-tag derivation)
 * - seed
 * - visualTraits (derived from seed, with legacy tag fallbacks)
 * - isLegacy flag
 * 
 * The UI should NOT need to guess names or traits - everything is resolved here.
 * 
 * Name resolution priority:
 * 1. Use `name` tag if present
 * 2. Derive from legacy d-tag format (blobbi-{name})
 * 3. Fall back to "Unnamed Blobbi"
 * 
 * Visual trait priority:
 * 1. Use explicit visual tags if valid (legacy compatibility)
 * 2. Derive deterministically from seed
 * 3. Use safe defaults if seed is missing
 */
export function parseBlobbiEvent(event: NostrEvent): BlobbiCompanion | undefined {
  if (!isValidBlobbiEvent(event)) return undefined;
  
  const tags = event.tags;
  const d = getTagValue(tags, 'd')!;
  const nameTag = getTagValue(tags, 'name');
  const stage = getTagValue(tags, 'stage') as BlobbiStage;
  const rawState = getTagValue(tags, 'state')!;
  // A V3 Blobbi's seed is its address; V1 and V2 state theirs in a tag.
  const seed = parseVisualGeneration(tags) === 'v3' ? getBlobbiV3Seed(event) : getTagValue(tags, 'seed');
  
  // `state` is an activity state (isValidBlobbiEvent guarantees the value) and
  // progression lives only in `progression_state`. There is no read-time
  // normalisation of the historical progression-in-state schema: such events
  // are unsupported and never reach this point (see classifyBlobbiEvent).
  // An unknown `progression_state` value means "no known process", not a
  // rejected event: a future process name must not hide a Blobbi.
  const state = rawState as BlobbiState;
  const progressionStateTag = getTagValue(tags, 'progression_state');
  const progressionState: BlobbiProgressionState =
    progressionStateTag === 'incubating' || progressionStateTag === 'evolving' ? progressionStateTag : 'none';
  
  // Resolve name: tag > legacy d-tag derivation > fallback
  const name = nameTag ?? deriveNameFromLegacyD(d);
  
  // Derive visual traits (single source of truth). The seed alone decides
  // the identity, adult form included: a stored `adult_type` tag is a mirror
  // of the seed and is only consulted when there is no seed (legacy).
  const visualTraits = deriveVisualTraits(tags, seed);
  
  // Flag legacy / unsupported format (non-canonical d-tag, missing seed/name,
  // OR old-app schema markers even when the d-tag looks canonical). Never
  // triggers migration; the collection filter, fresh-fetch, canonical sync, and
  // seed-identity sync all use it to ignore unsupported events.
  const isLegacy = isLegacyBlobbiEvent(event);
  
  blobbiLogger.debug('[Blobbi]', {
    d: d.length > 30 ? `${d.slice(0, 20)}...` : d,
    name,
    isLegacy,
    hasSeed: !!seed,
    traits: `${visualTraits.baseColor} ${visualTraits.pattern} ${visualTraits.size}`,
  });
  
  // Parse task progress tags: ["task", "name:value"]
  const tasks: BlobbiTaskProgress[] = [];
  for (const tag of tags) {
    if (tag[0] === 'task' && tag[1]) {
      const [taskName, taskValue] = tag[1].split(':');
      if (taskName && taskValue) {
        tasks.push({ name: taskName, value: parseInt(taskValue, 10) || 0 });
      }
    }
  }
  
  // Parse completed task tags: ["task_completed", "name"]
  const tasksCompleted: string[] = [];
  for (const tag of tags) {
    if (tag[0] === 'task_completed' && tag[1]) {
      tasksCompleted.push(tag[1]);
    }
  }
  
  // Parse evolution missions from 31124 content JSON (per-Blobbi)
  const evolution = parseEvolutionContent(event.content);

  return {
    event,
    d,
    name,
    stage,
    state,
    progressionState,
    seed,
    visualTraits,
    isLegacy,
    lastInteraction: parseNumericTag(tags, 'last_interaction')!,
    lastDecayAt: parseNumericTag(tags, 'last_decay_at'),
    stats: {
      hunger: parseNumericTag(tags, 'hunger'),
      happiness: parseNumericTag(tags, 'happiness'),
      health: parseNumericTag(tags, 'health'),
      hygiene: parseNumericTag(tags, 'hygiene'),
      energy: parseNumericTag(tags, 'energy'),
    },
    generation: parseNumericTag(tags, 'generation'),
    breedingReady: parseBooleanTag(tags, 'breeding_ready', false),
    socialOpen: getTagValue(tags, 'social') === 'open',
    experience: parseNumericTag(tags, 'experience'),
    careStreak: parseNumericTag(tags, 'care_streak'),
    careStreakLastAt: parseNumericTag(tags, 'care_streak_last_at'),
    careStreakLastDay: getTagValue(tags, 'care_streak_last_day'),
    incubationTime: parseNumericTag(tags, 'incubation_time'),
    startIncubation: parseNumericTag(tags, 'start_incubation'),
    // A V3 Blobbi has no adult form: it has one adult body, its own.
    adultType: parseVisualGeneration(tags) === 'v3'
      ? undefined
      : stage === 'adult' && seed && seed.length === 64
        ? deriveAdultFormFromSeed(seed)
        : getTagValue(tags, 'adult_type'),
    visualGeneration: parseVisualGeneration(tags),
    ...(parseVisualGeneration(tags) === 'v3' ? { v3Identity: parseBlobbiV3Identity(event) } : null),
    publishedAt: parseNumericTag(tags, 'published_at'),
    stateStartedAt: parseNumericTag(tags, 'state_started_at'),
    progressionStartedAt: parseNumericTag(tags, 'progression_started_at') ?? parseNumericTag(tags, 'state_started_at'),
    tasks,
    tasksCompleted,
    evolution,
    allTags: tags,
  };
}

/**
 * Parse a Kind 11125 Blobbonaut Profile event into a structured object.
 * Also supports legacy kind 31125 profiles for profile compatibility
 * (unrelated to old-app Blobbi migration).
 * Returns undefined if the event is invalid.
 * 
 * Note: pettingLevel is parsed from both 'pettingLevel' and 'petting_level' tags
 * for backwards compatibility with legacy profiles.
 */
export function parseBlobbonautEvent(event: NostrEvent): BlobbonautProfile | undefined {
  if (!isValidBlobbonautEvent(event)) return undefined;
  
  const tags = event.tags;
  const d = getTagValue(tags, 'd')!;
  
  // Parse pettingLevel from either camelCase or snake_case tag
  const pettingLevelValue = parseNumericTag(tags, 'pettingLevel') 
    ?? parseNumericTag(tags, 'petting_level') 
    ?? 0;
  
  return {
    event,
    d,
    currentCompanion: getTagValue(tags, 'current_companion'),
    onboardingDone: parseBooleanTag(tags, 'blobbi_onboarding_done', false)
      || parseBooleanTag(tags, 'onboarding_done', false),
    name: getTagValue(tags, 'name'),
    has: getTagValues(tags, 'has'),
    pettingLevel: pettingLevelValue,
    xp: parseNumericTag(tags, 'xp') ?? 0,
    level: parseNumericTag(tags, 'level') ?? 1,
    room: getTagValue(tags, 'room') ?? undefined,
    // NOTE: consumable inventory and Coins are NOT modeled here. Legacy
    // `storage` and `coins` tags are never parsed or surfaced — they reach
    // callers only through `allTags`, as opaque unknown extension tags (see
    // MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES).
    content: event.content,
    allTags: tags,
  };
}

// ─── Tag Building Utilities ───────────────────────────────────────────────────

/**
 * Build tags for a new Blobbonaut Profile (Kind 11125).
 * Includes pettingLevel: 0 by default.
 */
export function buildBlobbonautTags(pubkey: string): string[][] {
  return [
    ['d', getCanonicalBlobbonautD(pubkey)],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['blobbi_onboarding_done', 'false'],
    ['pettingLevel', '0'],
  ];
}

/**
 * Build tags for a new Blobbi egg (Kind 31124).
 * Includes required and recommended tags for a new egg.
 * 
 * Visual traits are derived from the seed and explicitly stored
 * to ensure consistent rendering across clients.
 */
export interface BuildEggTagsOptions {
  /**
   * Which artwork generation the new Blobbi is born into. Defaults to
   * {@link NEW_BLOBBI_VISUAL_GENERATION} (`'v2'`). Pass `'v1'` for an
   * application that deliberately creates original-generation Blobbis; that
   * output carries no `visual_generation` tag, exactly as before this option.
   * Pass `'v3'` for a procedural Blobbi: its whole intrinsic identity is
   * its address under Algorithm 1, so the egg states only
   * `visual_generation`, and needs nothing from the host.
   */
  visualGeneration?: BlobbiVisualGeneration;
}

export function buildEggTags(
  pubkey: string,
  petId: string,
  createdAt: number,
  name = 'Egg',
  options: BuildEggTagsOptions = {}
): string[][] {
  const d = getCanonicalBlobbiD(pubkey, petId);
  const visualGeneration = options.visualGeneration ?? NEW_BLOBBI_VISUAL_GENERATION;
  const now = createdAt.toString();
  const isV3 = visualGeneration === 'v3';
  // V1 and V2: the seed is derived once, from the birth time too, stated in the
  // `seed` tag, and the visual traits are written as its mirrors. V3: the seed
  // is the address (`deriveBlobbiV3Seed`) and everything it looks like is
  // Algorithm 1's, so the egg states neither. Deriving it here checks the
  // address: a pubkey Nostr would not write throws.
  const seed = isV3 ? deriveBlobbiV3Seed(pubkey, d) : deriveBlobbiSeedV1(pubkey, d, createdAt);
  const { baseColor, secondaryColor, eyeColor, pattern, specialMark, size } = deriveSeedIdentity(seed);
  
  return [
    ['d', d],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['name', name],
    ['stage', 'egg'],
    ['state', 'active'],
    ['progression_state', 'none'],
    ...(isV3 ? [] : [['seed', seed]]),
    ['generation', '1'],
    ['breeding_ready', 'false'],
    ['experience', '0'],
    ['care_streak', '1'],
    ['care_streak_last_at', now],
    ['care_streak_last_day', getLocalDayString()],
    ['hunger', DEFAULT_EGG_STATS.hunger.toString()],
    ['happiness', DEFAULT_EGG_STATS.happiness.toString()],
    ['health', DEFAULT_EGG_STATS.health.toString()],
    ['hygiene', DEFAULT_EGG_STATS.hygiene.toString()],
    ['energy', DEFAULT_EGG_STATS.energy.toString()],
    ['last_interaction', now],
    ['last_decay_at', now],
    // V1 and V2: visual traits (derived from seed, explicitly stored for consistency)
    ...(isV3 ? [] : [
      ['base_color', baseColor],
      ['secondary_color', secondaryColor],
      ['eye_color', eyeColor],
      ['pattern', pattern],
      ['special_mark', specialMark],
      ['size', size],
    ]),
    // Identity from birth: which artwork family draws this Blobbi (see NEW_BLOBBI_VISUAL_GENERATION).
    ...visualGenerationTags(visualGeneration),
  ];
}

// ─── Managed Tag Sets (Separated by Kind) ─────────────────────────────────────

/**
 * Tags managed by the client for Kind 31124 (Blobbi State).
 * These tags are controlled by the application and may be overwritten.
 * 
 * @see blobbi-tag-schema.ts for the complete canonical schema documentation
 */
export const MANAGED_BLOBBI_STATE_TAG_NAMES = new Set([
  // System / metadata tags
  'd', 'b',
  // Core identity tags
  'name', 'seed', 'generation',
  // Lifecycle state tags
  'stage', 'state', 'last_interaction', 'last_decay_at',
  // Stat tags
  'hunger', 'happiness', 'health', 'hygiene', 'energy',
  // Visual trait tags (derived from seed, stored for fast rendering)
  'base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark', 'size',
  // Identity/personality tags (MUST persist across stage transitions)
  'personality', 'trait', 'favorite_food', 'voice_type', 'mood',
  // Progression tags
  'experience', 'care_streak', 'care_streak_last_at', 'care_streak_last_day',
  // Social/flag tags
  'social', 'breeding_ready',
  // Progression tags (orthogonal to activity state)
  'progression_state', 'progression_started_at',
  // Task system tags (removed after stage transitions)
  'state_started_at', 'task', 'task_completed',
  // Evolution tags (adult only)
  'adult_type',
  // Visual generation (identity; never derived from the seed)
  'visual_generation',
  // The pre-release V3 tags (algorithm version, trait kinds) a V3 republish drops
  ...BLOBBI_V3_RETIRED_TAG_NAMES,
  // Extension tags (for themes/crossovers)
  'theme', 'crossover_app',
]);

/**
 * Visual trait tags that are part of the canonical Blobbi format.
 * These tags ensure deterministic visual rendering across clients.
 * 
 * Note: While seed is the ultimate source of truth for visual generation,
 * these tags are explicitly stored for compatibility and faster rendering.
 */
export const VISUAL_TRAIT_TAG_NAMES = [
  'base_color',
  'secondary_color',
  'eye_color',
  'pattern',
  'special_mark',
  'size',
] as const;

/**
 * Deprecated tags that should be removed when republishing events.
 * These tags were part of earlier designs but are no longer used.
 * 
 * - t: Topic tag (blobbi) - no longer needed, the app adds the client tag automatically
 * - client: Client tag - no longer needed, the app adds this automatically via useNostrPublish
 * - shell_integrity: Eggs now use the standard health stat instead
 * - egg_temperature: Eggs now rely on warmth prop fallback; not part of active stat model
 * - incubation_progress: Obsolete task progress field
 * - egg_status: Obsolete status field
 * - fees: Obsolete fee tracking field
 * - incubation_time: Obsolete; task system uses progression_started_at instead
 * - start_incubation: Obsolete; replaced by progression_started_at
 * - interact_6_progress: Legacy interaction tracking; replaced by ["task", "interactions:N"]
 */
export const DEPRECATED_BLOBBI_TAG_NAMES = new Set([
  't',
  'client',
  'shell_integrity',
  'egg_temperature',
  'incubation_progress',
  'egg_status',
  'fees',
  'incubation_time',
  'start_incubation',
  'interact_6_progress',
]);

/**
 * Tags managed by the client for Kind 11125 (Blobbonaut Profile).
 * These tags are controlled by the application and may be overwritten.
 *
 * NOTE: `storage` (legacy consumable inventory) and `coins` (legacy profile
 * currency) are intentionally NOT managed. Neither is modeled on kind 11125 at
 * all — the kit does not parse, expose, create, update, normalize, or delete
 * `storage` or `coins` tags. Any pre-existing tags of either name are opaque,
 * host-owned extension tags: preserved verbatim on republish exactly like
 * `inv` and any other unknown tag. Active Blobbi Coin balances live outside
 * blobbi-kit entirely. Do NOT re-add `storage` or `coins` here.
 */
export const MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES = new Set([
  'd', 'b', 'name', 'current_companion', 'blobbi_onboarding_done', 'onboarding_done', 'has',
  // Progression tags
  'xp', 'level',
  // Room persistence
  'room',
  // Legacy player progress tags (preserved for compatibility)
  'petting_level', 'pettingLevel', 'lifetime_blobbis', 'lifetimeBlobbis',
  'starter_blobbi', 'starterBlobbi', 'favorite_blobbi', 'favoriteBlobbi',
]);

/**
 * Combined set for backwards compatibility.
 * @deprecated Use kind-specific sets instead
 */
const MANAGED_TAG_NAMES = new Set([
  ...MANAGED_BLOBBI_STATE_TAG_NAMES,
  ...MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES,
]);

/**
 * Merge tags for republishing, preserving unknown tags from the original event.
 * @param existingTags - Tags from the original event
 * @param newTags - New tags to apply (will override existing by tag name)
 * @returns Merged tags array
 */
export function mergeTagsForRepublish(
  existingTags: string[][],
  newTags: string[][]
): string[][] {
  // Create a map of new tags by their first element (tag name)
  const newTagsMap = new Map<string, string[][]>();
  for (const tag of newTags) {
    const name = tag[0];
    if (!newTagsMap.has(name)) {
      newTagsMap.set(name, []);
    }
    newTagsMap.get(name)!.push(tag);
  }
  
  // Start with existing unknown tags (tags we don't manage and that aren't deprecated)
  const unknownTags = existingTags.filter(tag => 
    !MANAGED_TAG_NAMES.has(tag[0]) && !DEPRECATED_BLOBBI_TAG_NAMES.has(tag[0])
  );
  
  // Collect all new tags in order
  const result: string[][] = [];
  
  // Add new tags first
  for (const tags of newTagsMap.values()) {
    result.push(...tags);
  }
  
  // Preserve unknown tags
  result.push(...unknownTags);
  
  return result;
}

/**
 * Overwrite mirror tags so they match the seed-derived canonical identity.
 *
 * When a seed tag is present, replaces all seed-derived mirror tags with
 * the canonical values from deriveSeedIdentity(). For adult-stage events,
 * also syncs adult_type. If no seed is found the tags are returned unchanged.
 *
 * This is called inside mergeBlobbiStateTagsForRepublish so that every
 * republish automatically backfills correct mirror tags.
 *
 * GENERATION-AWARE. On a V1 or V2 Blobbi every one of these tags is a
 * mirror and is rewritten here, exactly as it always was. A V3 Blobbi has
 * no mirrors and no stated looks at all: its seed is its address and its
 * looks are Algorithm 1's, so no tag may restate either. This function never
 * adds any of `BLOBBI_V3_ABSENT_TAG_NAMES` to a V3 event, and drops any it
 * finds (an event from before the contract settled, or a write that tried to
 * state a seed, a colour or a trait).
 */
function syncMirrorTagsToSeed(tags: string[][]): string[][] {
  if (parseVisualGeneration(tags) === 'v3') {
    return tags.some((t) => BLOBBI_V3_ABSENT_TAG_NAMES.includes(t[0])) ? tags.filter((t) => !BLOBBI_V3_ABSENT_TAG_NAMES.includes(t[0])) : tags;
  }

  const seed = getTagValue(tags, 'seed');
  if (!seed || seed.length !== 64) return tags;

  const canonical = deriveSeedIdentity(seed);
  const MIRROR_TAG_NAMES = new Set(['base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark', 'size']);

  const stage = getTagValue(tags, 'stage');
  if (stage === 'adult') {
    MIRROR_TAG_NAMES.add('adult_type');
  }

  // Remove existing mirror tags
  const filtered = tags.filter((t) => !MIRROR_TAG_NAMES.has(t[0]));

  // Append canonical values
  filtered.push(
    ['base_color', canonical.baseColor],
    ['secondary_color', canonical.secondaryColor],
    ['eye_color', canonical.eyeColor],
    ['pattern', canonical.pattern],
    ['special_mark', canonical.specialMark],
    ['size', canonical.size],
  );

  if (stage === 'adult') {
    filtered.push(['adult_type', deriveAdultFormFromSeed(seed)]);
  }

  return filtered;
}

/**
 * Build the stat + timestamp tag updates for a Blobbi state publish.
 * Serializes all 5 stats to strings and sets both decay/interaction timestamps.
 */
export function statsToTagUpdates(stats: BlobbiStats, now: number): Record<string, string> {
  const nowStr = now.toString();
  return {
    hunger: stats.hunger.toString(),
    happiness: stats.happiness.toString(),
    health: stats.health.toString(),
    hygiene: stats.hygiene.toString(),
    energy: stats.energy.toString(),
    last_decay_at: nowStr,
    last_interaction: nowStr,
  };
}

/**
 * Update specific tags in a Blobbi event while preserving unknown tags.
 * Uses MANAGED_BLOBBI_STATE_TAG_NAMES for Kind 31124.
 */
export function updateBlobbiTags(
  existingTags: string[][],
  updates: Record<string, string | string[]>
): string[][] {
  return mergeBlobbiStateTagsForRepublish(existingTags, updates);
}

/**
 * Merge tags for republishing a Kind 31124 Blobbi State event.
 * Preserves unknown tags, applies updates to managed tags, and validates the result.
 * 
 * This function automatically:
 * - Preserves existing managed tags that aren't being updated
 * - Applies updates
 * - Preserves unknown tags (for forward compatibility)
 * - Filters out deprecated tags
 * - Validates and repairs the final tag set
 * 
 * @param existingTags - Current tags from the event
 * @param updates - Tags to update (will override existing by tag name)
 * @param options - Optional configuration
 * @returns Validated and repaired tag array
 */
export function mergeBlobbiStateTagsForRepublish(
  existingTags: string[][],
  updates: Record<string, string | string[]>,
  options?: {
    /** If true, skips validation (use with caution) */
    skipValidation?: boolean;
  }
): string[][] {
  const newTags: string[][] = [];
  const updateKeys = new Set(Object.keys(updates));
  
  // Preserve existing managed tags that aren't being updated
  for (const tag of existingTags) {
    const name = tag[0];
    if (MANAGED_BLOBBI_STATE_TAG_NAMES.has(name) && !updateKeys.has(name)) {
      newTags.push(tag);
    }
  }
  
  // Add updates
  for (const [name, value] of Object.entries(updates)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        newTags.push([name, v]);
      }
    } else {
      newTags.push([name, value]);
    }
  }
  
  // Preserve unknown tags (tags not managed by us), excluding deprecated tags.
  //
  // INVARIANT: unknown/unmanaged extension tags MUST survive republish. Host
  // apps (e.g. Blobbi Island) attach their own tags to kind 31124 events —
  // future accessories, `equip`, and similar. Core does not understand these
  // tags but must never clobber them. Do not add such tags to
  // MANAGED_BLOBBI_STATE_TAG_NAMES unless core intends to own them, and note
  // that validateAndRepairBlobbiTags only stage-filters tags that HAVE a
  // schema entry — unknown tags pass through untouched by design.
  const unknownTags = existingTags.filter(tag => 
    !MANAGED_BLOBBI_STATE_TAG_NAMES.has(tag[0]) && 
    !DEPRECATED_BLOBBI_TAG_NAMES.has(tag[0])
  );
  
  let mergedTags = [...newTags, ...unknownTags];
  
  // ─── Sync mirror tags to seed-derived values ───
  // When a seed exists, visual trait tags are mirrors of the seed. Overwrite
  // any stale values so persisted tags always match the canonical derivation.
  mergedTags = syncMirrorTagsToSeed(mergedTags);
  
  // Skip validation if requested (for internal use)
  if (options?.skipValidation) {
    return mergedTags;
  }
  
  // Validate and repair the final tag set
  // Use existingTags as the recovery source for missing required tags
  const result = validateAndRepairBlobbiTags(mergedTags, existingTags);
  
  // Log repairs in development
  if (result.repaired) {
    blobbiLogger.debug('[Blobbi] Tag repairs applied:', result.repairs);
  }
  
  // Log errors (these are non-fatal but should be monitored)
  if (result.errors.length > 0) {
    console.warn('[Blobbi] Tag validation errors:', result.errors);
  }
  
  return result.tags;
}

/**
 * Merge tags for republishing a Kind 11125 Blobbonaut Profile event.
 * Preserves unknown tags, applies updates, and deduplicates repeated tags like 'has'.
 *
 * Legacy-data note: `storage` (consumable inventory) and `coins` (legacy
 * profile currency) are NOT managed tags and are not part of the profile
 * model. Any pre-existing `storage` or `coins` tags are preserved verbatim
 * (opaque passthrough, like `inv`), but the kit refuses to WRITE them — a
 * `storage` or `coins` key in `updates` is dropped (with a dev-time warning)
 * so a profile republish can never create or mutate consumable inventory or
 * Coin balances on kind 11125. Active Blobbi Coin balances live outside
 * blobbi-kit entirely.
 */
export function mergeBlobbonautTagsForRepublish(
  existingTags: string[][],
  updates: Record<string, string | string[]>
): string[][] {
  // Guard: the kit must never generate new `storage` (consumable inventory) or
  // `coins` (legacy currency) tags on kind 11125. Drop those update keys so
  // they cannot be written. Existing tags of either name are still preserved
  // below via the unknown-tags passthrough.
  let effectiveUpdates = updates;
  for (const retired of ['storage', 'coins'] as const) {
    if (retired in effectiveUpdates) {
      blobbiLogger.warn(
        `[Blobbi] Ignoring \`${retired}\` update on kind 11125: it is not modeled by the kit. Existing ${retired} tags are preserved opaquely.`,
      );
      if (effectiveUpdates === updates) effectiveUpdates = { ...updates };
      delete effectiveUpdates[retired];
    }
  }

  const newTags: string[][] = [];
  const updateKeys = new Set(Object.keys(effectiveUpdates));
  
  // Preserve existing managed tags that aren't being updated
  for (const tag of existingTags) {
    const name = tag[0];
    if (MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES.has(name) && !updateKeys.has(name)) {
      newTags.push(tag);
    }
  }
  
  // Add updates
  for (const [name, value] of Object.entries(effectiveUpdates)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        newTags.push([name, v]);
      }
    } else {
      newTags.push([name, value]);
    }
  }
  
  // Preserve unknown tags (tags not managed by us).
  //
  // INVARIANT: unknown/unmanaged extension tags MUST survive republish. Host
  // apps attach their own tags to kind 11125 profiles (e.g. Blobbi Island's
  // accessory/cosmetic `inv` tags, legacy consumable `storage` tags, and
  // legacy `coins` tags). Core must never clobber them. Only `has` is deduped
  // below; all other unmanaged tags — including `inv`, legacy `storage`, and
  // legacy `coins` — are passed through verbatim.
  const unknownTags = existingTags.filter(tag => !MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES.has(tag[0]));
  
  // Deduplicate 'has' tags
  return deduplicateHasTags([...newTags, ...unknownTags]);
}

/**
 * Deduplicate 'has' tags in a tag array.
 * Ensures each pet reference appears only once.
 */
export function deduplicateHasTags(tags: string[][]): string[][] {
  const seenHas = new Set<string>();
  const result: string[][] = [];
  
  for (const tag of tags) {
    if (tag[0] === 'has') {
      const value = tag[1];
      if (value && !seenHas.has(value)) {
        seenHas.add(value);
        result.push(tag);
      }
    } else {
      result.push(tag);
    }
  }
  
  return result;
}

/**
 * Update Blobbonaut profile tags with proper deduplication.
 * Use this when updating Kind 11125 events.
 */
export function updateBlobbonautTags(
  existingTags: string[][],
  updates: Record<string, string | string[]>
): string[][] {
  return mergeBlobbonautTagsForRepublish(existingTags, updates);
}

// ─── Profile Normalization ────────────────────────────────────────────────────

/**
 * Check if a Blobbonaut profile is missing the pettingLevel tag.
 * This helps determine if normalization is needed.
 */
export function profileNeedsPettingLevelNormalization(profile: BlobbonautProfile): boolean {
  // Check if either pettingLevel or petting_level tag exists in allTags
  const hasPettingLevelTag = profile.allTags.some(
    ([name]) => name === 'pettingLevel' || name === 'petting_level'
  );
  return !hasPettingLevelTag;
}

/**
 * Check if a profile uses the legacy `onboarding_done` tag instead of the
 * new `blobbi_onboarding_done` tag. Returns true if migration is needed.
 */
export function profileNeedsOnboardingTagMigration(profile: BlobbonautProfile): boolean {
  const hasNewTag = profile.allTags.some(([name]) => name === 'blobbi_onboarding_done');
  const hasOldTag = profile.allTags.some(([name]) => name === 'onboarding_done');
  // Needs migration if: has old tag but not the new one
  return !hasNewTag && hasOldTag;
}

/**
 * Build updated tags for normalizing a profile.
 * Handles:
 * - Adding pettingLevel: 0 if missing
 * - Migrating onboarding_done → blobbi_onboarding_done
 *
 * Preserves all existing tags except the ones being migrated.
 */
export function buildNormalizedProfileTags(profile: BlobbonautProfile): string[][] {
  let tags = profile.allTags;
  let changed = false;

  // Normalize pettingLevel
  if (profileNeedsPettingLevelNormalization(profile)) {
    tags = updateBlobbonautTags(tags, { pettingLevel: '0' });
    changed = true;
  }

  // Migrate onboarding_done → blobbi_onboarding_done
  if (profileNeedsOnboardingTagMigration(profile)) {
    const oldValue = tags.find(([name]) => name === 'onboarding_done')?.[1] ?? 'false';
    // Remove old tag, add new tag
    tags = tags.filter(([name]) => name !== 'onboarding_done');
    tags = updateBlobbonautTags(tags, { blobbi_onboarding_done: oldValue });
    changed = true;
  }

  return changed ? tags : profile.allTags;
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Get all possible d-tag values to query for a Blobbonaut profile.
 * Includes canonical and legacy formats for profile compatibility (unrelated
 * to old-app Blobbi migration).
 */
export function getBlobbonautQueryDValues(pubkey: string): string[] {
  const prefix12 = getPubkeyPrefix12(pubkey);
  const prefix8 = pubkey.slice(0, 8).toLowerCase();
  
  return [
    // Canonical
    `blobbonaut-${prefix12}`,
    // Legacy: capitalized
    `Blobbonaut-${prefix12}`,
    `Blobbonaut-${prefix8}`,
    // Legacy: generic
    'blobbonaut-profile',
    // Legacy: shorter prefixes
    `blobbonaut-${prefix8}`,
  ];
}

/**
 * Add a pet to the profile's 'has' list without duplicates.
 * Returns updated has array.
 */
export function addPetToHas(currentHas: string[], newPetD: string): string[] {
  if (currentHas.includes(newPetD)) {
    return currentHas;
  }
  return [...currentHas, newPetD];
}

/**
 * Merge the known `has` lists when adopting a new Blobbi.
 *
 * Adoption must only ever GROW the owned-Blobbi list — it must never drop a
 * Blobbi the user already owns. The cached profile and a fresh relay read can
 * each be momentarily incomplete (cache miss, relay hiccup, replaceable-event
 * write race), so we union both sources (deduped, order-preserving) before
 * appending the newly-adopted pet.
 *
 * Returns the merged `has` list including `newPetD` exactly once.
 */
export function mergeHasForAdoption(
  cachedHas: readonly string[] | undefined,
  freshHas: readonly string[] | undefined,
  newPetD: string,
): string[] {
  const merged = [...new Set([...(cachedHas ?? []), ...(freshHas ?? [])])];
  return addPetToHas(merged, newPetD);
}

/**
 * Get the localStorage key for the user's selected Blobbi.
 *
 * User-scoped by full pubkey: `blobbi:selected:d:<pubkey>`. This MUST be used
 * by every surface that reads or writes the selected Blobbi (BlobbiPage,
 * BlobbiWidget, onboarding, ...) so the selection stays in sync between them.
 * Using a truncated pubkey here previously caused the widget and the page to
 * read different keys, so selecting an adult Blobbi on one surface left the
 * other falling back to a freshly-adopted egg.
 */
export function getSelectedBlobbiKey(pubkey: string): string {
  return `blobbi:selected:d:${pubkey}`;
}

// ─── LocalStorage Cache Types ─────────────────────────────────────────────────

export interface BlobbiBootCache {
  /** The user's pubkey this cache belongs to */
  pubkey: string;
  profile: BlobbonautProfile | null;
  companion: BlobbiCompanion | null;
  cachedAt: number;
}

export const BLOBBI_CACHE_KEY = 'blobbi:boot-cache';
