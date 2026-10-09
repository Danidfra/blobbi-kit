import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

/**
 * V3 IDENTITY ON THE EVENT: what a procedural (`visual_generation = v3`)
 * kind 31124 event says about who the Blobbi is. Almost nothing, on purpose:
 *
 * ```
 *   visual_generation = v3          the visual system, and with it the rules: V3 IS Algorithm 1
 *   (the address: pubkey, d)        the seed, hashed from it: `deriveBlobbiV3Seed(pubkey, d)`
 * ```
 *
 * THE BLOBBI IS ITS ADDRESS. A kind 31124 event is parameterized
 * replaceable: every event at one address (author pubkey, `d`) is a version
 * of the same Blobbi, and any version can say anything. So nothing a version
 * SAYS decides who the Blobbi is:
 *
 * ```
 *   (pubkey, d) ─► seed ─► Algorithm 1 ─► the whole intrinsic Blobbi
 *                                          colours, anatomy, pattern, mark,
 *                                          belly, freckles, every proportion
 * ```
 *
 * Every conforming client derives the same Blobbi from the current event
 * alone: no earlier event, birth record or relay history, and no tag to
 * trust. Its genetics cannot be edited, because no tag holds them.
 *
 * WHAT A V3 EVENT DOES NOT CARRY (`BLOBBI_V3_ABSENT_TAG_NAMES`): a `seed`;
 * the colour, pattern and mark tags V1 and V2 carry as seed mirrors
 * (`base_color`, `secondary_color`, `eye_color`, `pattern`,
 * `special_mark`); the tags of the pre-release V3 contract
 * (`visual_algorithm`, `accent_color`, `antenna`, `horns`, `ears`, `tail`,
 * `belly`, `freckles`); and `size` and `adult_type`. Creation writes none of them,
 * reading ignores any it finds, and every kit write drops them. They are
 * not kept as mirrors either: a mirror is a second source that can
 * disagree, and relays do not index multi-letter tags, so one would buy no
 * query.
 *
 * WHERE THE IDENTITY IS COMPUTED. Algorithm 1 is the renderer's
 * (`@blobbi-kit/renderer`): core and the renderer never import each other,
 * and nothing re-implements the engine. Core resolves the address to the
 * seed and names Algorithm 1; the renderer's
 * `createBlobbiV3Identity(seed)` turns the seed into the colours and trait
 * kinds, and the renderer draws from the same seed.
 *
 * WHAT IS NOT INTRINSIC. Render state (expression, motion, gaze, sleep) and
 * domain state (stage, stats, care) change all the time and are not
 * identity. Customization (clothing, accessories, dyes) belongs to a
 * separate layer when it exists, never to a tag that rewrites genetics.
 *
 * V3 IS ALGORITHM 1, FOREVER. There is no algorithm version inside V3: a
 * per-Blobbi version would be one more tag a replacement event could edit
 * to redraw the Blobbi. What the rules are is decided by the generation:
 *
 *  - a change that keeps every V3 Blobbi the same Blobbi (a faster or
 *    different backend, animation, expressions, render state, cosmetic
 *    layers, a fix that brings the implementation back to Algorithm 1's
 *    pinned reference) needs no version at all;
 *  - a change to anything Algorithm 1 freezes (`procedural/version.ts` in
 *    the renderer: the seed's reading, the random streams, the genome, the
 *    trait odds, the colour generator, morphology, the stage plans,
 *    geometry, patterns and marks, paint structure, the palette) is a new
 *    visual GENERATION (`v4`) for Blobbis born into it. Existing V3 Blobbis
 *    stay V3 and are drawn by Algorithm 1 for as long as V3 is drawn.
 *
 * A `visual_algorithm` tag on a V3 event is the pre-release contract's: it
 * is never read and every kit write drops it. The algorithm a V3 Blobbi is
 * reported under is always `BLOBBI_V3_ALGORITHM`.
 */

/** The pre-release tag that named a per-Blobbi algorithm version. Retired: V3 is Algorithm 1. */
export const VISUAL_ALGORITHM_TAG = 'visual_algorithm';

/** The algorithm every V3 Blobbi is drawn by, fixed by its generation: the renderer's `BLOBBI_V3_ALGORITHM_VERSION`. */
export const BLOBBI_V3_ALGORITHM = 1;

/** The colour tags that are seed MIRRORS on V1 and V2. A V3 event has none. */
export const BLOBBI_MIRRORED_COLOR_TAG_NAMES: readonly string[] = ['base_color', 'secondary_color', 'eye_color'];

/**
 * EVERY tag that is a seed MIRROR on V1 and V2, none of which a V3 event
 * carries: the three colours, the pattern and the special mark. What
 * `syncMirrorTagsToSeed` rewrites on the older generations and drops on V3.
 */
export const BLOBBI_MIRRORED_IDENTITY_TAG_NAMES: readonly string[] = [...BLOBBI_MIRRORED_COLOR_TAG_NAMES, 'pattern', 'special_mark'];

/**
 * The tags of the pre-release V3 contract, when a V3 event stated its
 * algorithm version, colours and trait kinds: never written now, never read,
 * dropped by every kit write. Still managed, so a V1 or V2 event carrying
 * one is treated exactly as before, and never invented on any event.
 */
export const BLOBBI_V3_RETIRED_TAG_NAMES: readonly string[] = [VISUAL_ALGORITHM_TAG, 'accent_color', 'antenna', 'horns', 'ears', 'tail', 'belly', 'freckles'];

/**
 * Every tag a V3 event does NOT carry: a V3 republish drops any it finds,
 * and no repair restores one. `seed` would state what the address decides;
 * the mirrors and the retired trait tags would state what Algorithm 1
 * decides; `size` and `adult_type` describe nothing about a V3 Blobbi.
 */
export const BLOBBI_V3_ABSENT_TAG_NAMES: readonly string[] = ['seed', ...BLOBBI_MIRRORED_IDENTITY_TAG_NAMES, ...BLOBBI_V3_RETIRED_TAG_NAMES, 'size', 'adult_type'];

// ─── The vocabulary of what Algorithm 1 derives ──────────────────────────────
// Core states none of it. These are the words of the renderer's resolved
// identity, for hosts that talk about a Blobbi (and, later, breeding).

export const BLOBBI_V3_ANTENNA_KINDS = ['none', 'single', 'double'] as const;
export type BlobbiV3AntennaKind = (typeof BLOBBI_V3_ANTENNA_KINDS)[number];
export const BLOBBI_V3_HORN_KINDS = ['none', 'forehead', 'top', 'side'] as const;
export type BlobbiV3HornKind = (typeof BLOBBI_V3_HORN_KINDS)[number];
export const BLOBBI_V3_EAR_KINDS = ['none', 'round', 'pointed'] as const;
export type BlobbiV3EarKind = (typeof BLOBBI_V3_EAR_KINDS)[number];
export const BLOBBI_V3_TAIL_KINDS = ['none', 'nub', 'curl', 'leaf'] as const;
export type BlobbiV3TailKind = (typeof BLOBBI_V3_TAIL_KINDS)[number];
/** The body's one pattern. The `pattern` tag's own words; `solid` is "no pattern". */
export const BLOBBI_V3_PATTERN_KINDS = ['solid', 'spotted', 'striped', 'gradient'] as const;
export type BlobbiV3PatternKind = (typeof BLOBBI_V3_PATTERN_KINDS)[number];
/** One small permanent marking, or none. */
export const BLOBBI_V3_SPECIAL_MARK_KINDS = ['none', 'star', 'heart', 'sparkle', 'moon'] as const;
export type BlobbiV3SpecialMarkKind = (typeof BLOBBI_V3_SPECIAL_MARK_KINDS)[number];

/** The four colours a V3 Blobbi is painted from, as lower-case `#rrggbb`. */
export interface BlobbiV3Colors {
  base: string;
  secondary: string;
  eye: string;
  /** Absent: this Blobbi has no accent colour. */
  accent?: string;
}

export interface BlobbiV3Traits {
  antenna: BlobbiV3AntennaKind;
  horns: BlobbiV3HornKind;
  ears: BlobbiV3EarKind;
  tail: BlobbiV3TailKind;
  pattern: BlobbiV3PatternKind;
  specialMark: BlobbiV3SpecialMarkKind;
  belly: boolean;
  freckles: boolean;
}

/**
 * A complete V3 identity, as Algorithm 1 resolves it from a seed
 * (`createBlobbiV3Identity` in the renderer). Core never builds one: it is
 * the shape a host receives from the renderer.
 */
export interface BlobbiV3Identity {
  /** The seed the micro-geometry derives from: `deriveBlobbiV3Seed` of the Blobbi's address, as 64 lower-case hexadecimal digits. */
  seed: string;
  /** The procedural algorithm version, a positive integer. */
  algorithm: number;
  colors: BlobbiV3Colors;
  traits: BlobbiV3Traits;
}

/**
 * A V3 identity as core READS it from an event: the seed its address derives,
 * under Algorithm 1. Nothing on the event but its address is identity.
 */
export interface ParsedBlobbiV3Identity {
  /** The seed, derived from the event's address (`getBlobbiV3Seed`). Absent when the event has no single well-formed address. */
  seed?: string;
  /** Always `BLOBBI_V3_ALGORITHM`: the generation fixes the rules; no tag can name others. */
  algorithm: typeof BLOBBI_V3_ALGORITHM;
  /** `['seed']` when the address yields no seed; empty otherwise. */
  missing: string[];
}


/** How long a V3 seed is: 32 bytes, as hexadecimal digits. */
export const BLOBBI_V3_SEED_LENGTH = 64;
const HEX_SEED = /^[0-9a-fA-F]{64}$/;

/**
 * THE V3 SEED, canonically: 32 bytes written as exactly 64 lower-case
 * hexadecimal digits (`0-9a-f`), which is what `deriveBlobbiV3Seed`
 * produces.
 *
 * A procedural algorithm hashes the seed's CHARACTERS, so two spellings of
 * the same bytes would be two different individuals. There is therefore one
 * spelling:
 *
 *  - 64 hexadecimal digits in any letter case are the same seed, and read
 *    as their lower-case form (upper-case digits carry no information; the
 *    older generations already read them case-insensitively);
 *  - anything else is NOT a V3 seed and is rejected, never repaired: not
 *    trimmed, not padded, not stripped of a prefix, not hashed into shape.
 *    A value that needs guessing has no single right answer, and two
 *    clients guessing differently would draw two Blobbis.
 *
 * Returns the canonical seed, or `undefined` when the value is not one.
 * This governs V3 seeds only (a value a host passes the renderer); V1 and
 * V2 read their `seed` tag exactly as before.
 */
export function canonicalBlobbiV3Seed(value: unknown): string | undefined {
  return typeof value === 'string' && HEX_SEED.test(value) ? value.toLowerCase() : undefined;
}

// ─── The seed is the address ────────────────────────────────────────────────

/**
 * The domain the V3 seed is hashed under. It names the SCHEME (a Blobbi's
 * visual seed, derivation version 1), not an artwork algorithm: every
 * `visual_algorithm` reads the same seed (see `deriveBlobbiV3Seed`).
 */
export const BLOBBI_V3_SEED_DOMAIN = 'blobbi:visual-seed:v1';

const NOSTR_PUBKEY = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

/** True when a string has no lone UTF-16 surrogate, so it has exactly one UTF-8 encoding. */
function isWellFormedUnicode(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/**
 * The exact bytes `deriveBlobbiV3Seed` hashes, for an implementation in
 * another language to check itself against. Throws a `TypeError` for an
 * input that has no address (see `deriveBlobbiV3Seed`).
 */
export function blobbiV3SeedPreimage(pubkey: string, d: string): Uint8Array {
  if (typeof pubkey !== 'string' || !NOSTR_PUBKEY.test(pubkey)) {
    throw new TypeError('[blobbi-kit] A V3 seed is derived from a Nostr pubkey: 64 lower-case hexadecimal digits.');
  }
  if (typeof d !== 'string' || d === '' || !isWellFormedUnicode(d)) {
    throw new TypeError('[blobbi-kit] A V3 seed is derived from a non-empty, well-formed `d` value.');
  }
  const domain = textEncoder.encode(BLOBBI_V3_SEED_DOMAIN);
  const key = hexToBytes(pubkey);
  const dBytes = textEncoder.encode(d);
  const out = new Uint8Array(1 + domain.length + key.length + 4 + dBytes.length);
  let at = 0;
  out[at++] = domain.length;
  out.set(domain, at); at += domain.length;
  out.set(key, at); at += key.length;
  new DataView(out.buffer).setUint32(at, dBytes.length, false); at += 4;
  out.set(dBytes, at);
  return out;
}

/**
 * THE V3 SEED OF A BLOBBI, from its address. A V3 Blobbi is whoever lives
 * at (author pubkey, `d`): every replacement event at that address derives
 * the same seed, and no tag can restate it.
 *
 * ```
 *   seed = lowercase_hex( SHA-256(
 *            u8(len(DOMAIN)) || DOMAIN          DOMAIN = ASCII "blobbi:visual-seed:v1" (21 bytes)
 *            || PUBKEY                          the 32 bytes of the author's x-only public key
 *            || u32_be(len(D)) || D ))          D = the `d` value as UTF-8, byte for byte
 * ```
 *
 * - PUBKEY is accepted only as Nostr writes it (NIP-01): 64 lower-case
 *   hexadecimal digits. Anything else is not an event author, and throws;
 *   it is never lower-cased or repaired here.
 * - D is the `d` value exactly as the event carries it: no trimming, no case
 *   folding, no Unicode normalization (relays address by the exact string, so
 *   two spellings are two addresses, and two Blobbis). It must be non-empty
 *   and well-formed Unicode (no lone surrogate), so its UTF-8 is one byte
 *   string; otherwise this throws.
 * - The kind (31124) does not participate: the domain already scopes the hash
 *   to a Blobbi's visual seed, and a Blobbi moved to another kind is still the
 *   Blobbi at (pubkey, `d`).
 * - `visual_algorithm` does not participate: the seed is who the Blobbi is,
 *   and an algorithm is how it is drawn. A future algorithm reads the same
 *   seed, so changing the tag can never select a different seed; the
 *   algorithm already changes everything it draws.
 * - The output is 32 bytes as 64 lower-case hexadecimal digits: a canonical
 *   V3 seed (`canonicalBlobbiV3Seed`), the procedural engine's input as before.
 *
 * Frozen: `blobbi-v3-seed.vectors.json` pins it. A change is a new domain,
 * never an edit.
 */
export function deriveBlobbiV3Seed(pubkey: string, d: string): string {
  return bytesToHex(sha256(blobbiV3SeedPreimage(pubkey, d)));
}

/** An event's author and tags: all `getBlobbiV3Seed` reads. A `NostrEvent` is one. */
export interface BlobbiV3AddressSource {
  pubkey?: string;
  tags: string[][];
}

/**
 * The V3 seed of a kind 31124 event, from its address, or `undefined` when
 * the event has no single well-formed address:
 *
 * - exactly ONE `d` tag. Relays read the first; a second makes the address
 *   ambiguous to anything that does not, so it is no address at all here;
 * - its value non-empty and well-formed Unicode;
 * - a NIP-01 pubkey (64 lower-case hexadecimal digits).
 *
 * Total and pure. Every tag but `d` is ignored: a `seed` tag in particular.
 */
export function getBlobbiV3Seed(event: BlobbiV3AddressSource): string | undefined {
  const dTags = event.tags.filter((tag) => tag[0] === 'd');
  if (dTags.length !== 1) return undefined;
  const d = dTags[0][1];
  if (typeof event.pubkey !== 'string' || !NOSTR_PUBKEY.test(event.pubkey)) return undefined;
  if (typeof d !== 'string' || d === '' || !isWellFormedUnicode(d)) return undefined;
  return deriveBlobbiV3Seed(event.pubkey, d);
}

/**
 * Read the V3 identity of an event: the seed its address derives, under
 * Algorithm 1. Pure and total: any input yields a result, and nothing is
 * ever invented. It does not check the generation; a caller reads it for a
 * `visual_generation = v3` event (`parseBlobbiEvent` does, into
 * `BlobbiCompanion.v3Identity`).
 *
 * No `visual_algorithm`, `seed`, colour or trait tag is read: none can name
 * another Blobbi.
 */
export function parseBlobbiV3Identity(event: BlobbiV3AddressSource): ParsedBlobbiV3Identity {
  const seed = getBlobbiV3Seed(event);
  return seed ? { seed, algorithm: BLOBBI_V3_ALGORITHM, missing: [] } : { algorithm: BLOBBI_V3_ALGORITHM, missing: ['seed'] };
}
