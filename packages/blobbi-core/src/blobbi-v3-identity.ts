import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

/**
 * V3 IDENTITY ON THE EVENT: how a procedural (`visual_generation = v3`)
 * Blobbi states who it is in its kind 31124 tags.
 *
 * ```
 *   visual_generation = v3          the visual system (blobbi.ts)
 *   visual_algorithm  = 1           the frozen procedural algorithm its micro-geometry derives under
 *   (no seed tag)                   the seed is the Blobbi's ADDRESS, hashed: `deriveBlobbiV3Seed(pubkey, d)`
 *   base_color, secondary_color,
 *   eye_color, accent_color         its colours: EXPLICIT
 *   antenna, horns, ears, tail      its anatomy, the kind of each: EXPLICIT
 *   pattern, special_mark,
 *   belly, freckles                 its surface: EXPLICIT
 * ```
 *
 * A V3 event carries NO `size` and NO `adult_type`: a V3 Blobbi has neither
 * (its proportions are micro-geometry, and it has one adult body, its own).
 *
 * THE SEED IS THE ADDRESS. A kind 31124 event is parameterized replaceable:
 * every event at one address (author pubkey, `d`) is a version of the same
 * Blobbi, and a new version replaces the old. A seed the event STATES could
 * be restated by any replacement, rerolling who the Blobbi is while keeping
 * its address. So a V3 seed is never stated: it is the address itself,
 * hashed under a domain of its own (`deriveBlobbiV3Seed`, specified there).
 * Any client holding the current event, and nothing else, derives the same
 * seed; no earlier event, birth record or relay history is needed to draw
 * it. A `seed` tag on a V3 event is not read, and a republish drops it.
 *
 * THE MODEL. The seed is used twice, for two different things:
 *
 * ```
 *   creation:    seed ─► procedural generator ─► semantic identity ─► written to the event, once
 *   rendering:   the event's semantic identity
 *                + micro-geometry derived from the seed (under `visual_algorithm`)
 *                + temporary render state                               ─► SVG
 * ```
 *
 * SEMANTIC IDENTITY (colours, trait kinds) is what an owner would notice
 * changing. The seed DECIDES it at creation; from then on the event is
 * authoritative, and nothing regenerates it: not a care action, not a
 * hatch, not an evolution, not a retuned colour generator. MICRO-GEOMETRY
 * (every proportion, the exact size, curve and place of each trait) is
 * never stored: it is re-derived from the seed, which is only reproducible
 * because the algorithm version is frozen.
 *
 * THE VOCABULARY IS GENERATION-INDEPENDENT. `visual_generation` already
 * says which visual system reads the event, so the properties are not
 * namespaced by it: the colours use the names every Blobbi has always used
 * (`base_color`, `secondary_color`, `eye_color`), and the new ones are plain
 * words (`accent_color`, `antenna`, `horns`, ...).
 *
 * WHAT THAT COSTS, AND WHERE IT IS PAID. Five of these names are older than
 * V3: `base_color`, `secondary_color`, `eye_color`, `pattern` and
 * `special_mark`. On a V1 or V2 Blobbi they are MIRRORS OF THE SEED: every
 * republish rewrites them from what the seed derives, and nothing reads
 * them when a seed is present. On a V3 Blobbi the same five tags are
 * explicit identity and must never be rewritten. That difference is one
 * generation check, in the one function that does the rewriting
 * (`syncMirrorTagsToSeed` in blobbi.ts) and the one that reads the traits
 * (`deriveVisualTraits`); V1 and V2 keep their behaviour exactly. A client
 * on a kit older than the address-derived seed finds no `seed` tag on a V3
 * event, so its kit classifies the event as legacy and never republishes
 * it: it cannot overwrite those five. Clients are expected to be updated to
 * V3; nothing here duplicates the identity to protect it from one that is not.
 *
 * ONE VOCABULARY PER TAG. `pattern` says `solid | spotted | striped |
 * gradient` on every generation (`solid` is "no pattern"); V3 does not
 * rename them. `special_mark` says `none | star | heart | sparkle` on every
 * generation; the older `blush` is not a V3 mark (a blush is what a cheek
 * does, not a marking one individual has), and V3 has `moon` in its place.
 *
 * This module owns the spelling, the parsing and the validation. It does NOT
 * generate an identity: which colours and traits a seed gives is the
 * renderer's art direction (`createBlobbiV3Identity` in `@blobbi-kit/renderer`).
 * The two packages never import each other; the shapes here and there are
 * structurally the same, so a host hands one to the other.
 */

/** The kind 31124 tag that names the procedural algorithm version: `["visual_algorithm", "1"]`. */
export const VISUAL_ALGORITHM_TAG = 'visual_algorithm';

/** The tag each field of a V3 identity is stated in. The seed is stated in none: it is derived from the address. */
export const BLOBBI_V3_TAGS = {
  algorithm: VISUAL_ALGORITHM_TAG,
  baseColor: 'base_color',
  secondaryColor: 'secondary_color',
  eyeColor: 'eye_color',
  accentColor: 'accent_color',
  antenna: 'antenna',
  horns: 'horns',
  ears: 'ears',
  tail: 'tail',
  pattern: 'pattern',
  specialMark: 'special_mark',
  belly: 'belly',
  freckles: 'freckles',
} as const;

/** Every tag a V3 identity is stated in, in the order they are written. */
export const BLOBBI_V3_TAG_NAMES: readonly string[] = Object.values(BLOBBI_V3_TAGS);

/**
 * The colour tags that are seed MIRRORS on V1 and V2 and EXPLICIT identity
 * on V3. The one place the two readings of the same three names are listed.
 */
export const BLOBBI_MIRRORED_COLOR_TAG_NAMES: readonly string[] = [BLOBBI_V3_TAGS.baseColor, BLOBBI_V3_TAGS.secondaryColor, BLOBBI_V3_TAGS.eyeColor];

/**
 * EVERY identity tag that is a seed MIRROR on V1 and V2 and EXPLICIT
 * identity on V3: the three colours, the pattern and the special mark. What
 * `syncMirrorTagsToSeed` rewrites on the older generations and must leave
 * alone on V3.
 */
export const BLOBBI_MIRRORED_IDENTITY_TAG_NAMES: readonly string[] = [...BLOBBI_MIRRORED_COLOR_TAG_NAMES, BLOBBI_V3_TAGS.pattern, BLOBBI_V3_TAGS.specialMark];

/**
 * The identity tags that exist ONLY for a V3 Blobbi (everything but the
 * names older generations also carry): never written on a V1 or V2 event,
 * and never invented on any.
 */
export const BLOBBI_V3_ONLY_TAG_NAMES: readonly string[] = BLOBBI_V3_TAG_NAMES.filter((name) => !BLOBBI_MIRRORED_IDENTITY_TAG_NAMES.includes(name));

/**
 * Tags of the older generations that a V3 Blobbi does NOT have, so a V3
 * event never carries them and a V3 republish drops any it finds: `size`
 * and `adult_type` describe nothing about it, and `seed` would state what
 * its address already decides (see `deriveBlobbiV3Seed`).
 */
export const BLOBBI_V3_ABSENT_TAG_NAMES: readonly string[] = ['seed', 'size', 'adult_type'];

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
 * A complete V3 identity: what a NEW Blobbi is created with. Every explicit
 * field is stated; there is nothing left for a renderer to decide.
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
 * A V3 identity as READ from an event: exactly what its tags state, and
 * nothing more. A field that is absent or malformed is absent here; core
 * never fills one in (that would be inventing identity), and nothing it
 * returns is ever written back to the event. A renderer may resolve the
 * gaps for DRAWING, deterministically from the seed; `missing` says exactly
 * what was not stated, so a host can always tell stated from inferred.
 */
export interface ParsedBlobbiV3Identity {
  /** The seed, derived from the event's address (`getBlobbiV3Seed`). Absent when the event has no single well-formed address. */
  seed?: string;
  /**
   * The algorithm version the event states. Absent when the tag is missing
   * or malformed. It is reported as stated, whatever its value: whether a
   * given version can be drawn is the renderer's knowledge, not core's.
   */
  algorithm?: number;
  colors: Partial<BlobbiV3Colors>;
  traits: Partial<BlobbiV3Traits>;
  /**
   * The identity fields that were absent or malformed: tag names, and `seed`
   * when the address yields none. Empty for every Blobbi this kit created.
   */
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
 * This governs V3 seeds only (an identity handed to `buildEggTags`, a value
 * a host passes the renderer); V1 and V2 read their `seed` tag exactly as
 * before.
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

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** A colour as canonical lower-case `#rrggbb`, or undefined if it is not a plain hex colour. */
export function normalizeBlobbiV3Color(value: unknown): string | undefined {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) return undefined;
  const hex = value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value;
  return hex.toLowerCase();
}

const kindOf = <T extends string>(kinds: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (kinds as readonly string[]).includes(value) ? (value as T) : undefined;
const validAlgorithm = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9999;

export type BlobbiV3Validation = { valid: true; identity: BlobbiV3Identity } | { valid: false; errors: string[] };

/**
 * Check that something is a COMPLETE V3 identity, and return it in canonical
 * form (the seed and the colours lower-cased, only known fields). Used at
 * creation: an event is never born with a partial identity, or with a seed
 * that is not a V3 seed.
 */
export function validateBlobbiV3Identity(input: unknown): BlobbiV3Validation {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { valid: false, errors: ['identity is not an object'] };
  const raw = input as Partial<BlobbiV3Identity>;
  const seed = canonicalBlobbiV3Seed(raw.seed);
  if (typeof raw.seed !== 'string' || raw.seed === '') errors.push('seed is missing');
  else if (!seed) errors.push('seed is not 64 hexadecimal digits');
  if (!validAlgorithm(raw.algorithm)) errors.push('algorithm is not a positive integer');

  const c: Partial<BlobbiV3Colors> = raw.colors && typeof raw.colors === 'object' ? raw.colors : {};
  const base = normalizeBlobbiV3Color(c.base);
  const secondary = normalizeBlobbiV3Color(c.secondary);
  const eye = normalizeBlobbiV3Color(c.eye);
  const accent = c.accent === undefined ? undefined : normalizeBlobbiV3Color(c.accent);
  if (!base) errors.push('colors.base is not a hex colour');
  if (!secondary) errors.push('colors.secondary is not a hex colour');
  if (!eye) errors.push('colors.eye is not a hex colour');
  if (c.accent !== undefined && !accent) errors.push('colors.accent is not a hex colour');

  const t: Partial<BlobbiV3Traits> = raw.traits && typeof raw.traits === 'object' ? raw.traits : {};
  const antenna = kindOf(BLOBBI_V3_ANTENNA_KINDS, t.antenna);
  const horns = kindOf(BLOBBI_V3_HORN_KINDS, t.horns);
  const ears = kindOf(BLOBBI_V3_EAR_KINDS, t.ears);
  const tail = kindOf(BLOBBI_V3_TAIL_KINDS, t.tail);
  if (!antenna) errors.push('traits.antenna is not a known kind');
  if (!horns) errors.push('traits.horns is not a known kind');
  if (!ears) errors.push('traits.ears is not a known kind');
  if (!tail) errors.push('traits.tail is not a known kind');
  const pattern = kindOf(BLOBBI_V3_PATTERN_KINDS, t.pattern);
  const specialMark = kindOf(BLOBBI_V3_SPECIAL_MARK_KINDS, t.specialMark);
  if (!pattern) errors.push('traits.pattern is not a known kind');
  if (!specialMark) errors.push('traits.specialMark is not a known kind');
  for (const key of ['belly', 'freckles'] as const) {
    if (typeof t[key] !== 'boolean') errors.push(`traits.${key} is not a boolean`);
  }

  if (errors.length > 0) return { valid: false, errors };
  const colors: BlobbiV3Colors = { base: base!, secondary: secondary!, eye: eye! };
  if (accent) colors.accent = accent;
  return {
    valid: true,
    identity: {
      seed: seed!,
      algorithm: raw.algorithm!,
      colors,
      traits: { antenna: antenna!, horns: horns!, ears: ears!, tail: tail!, pattern: pattern!, specialMark: specialMark!, belly: t.belly!, freckles: t.freckles! },
    },
  };
}

/**
 * The tags that state a V3 identity, all of them, in canonical order. The
 * seed is not among them: it is the Blobbi's address (`getBlobbiV3Seed`). A Blobbi
 * with no accent colour has no `accent_color` tag (absence is the statement).
 */
export function blobbiV3IdentityTags(identity: BlobbiV3Identity): string[][] {
  const { colors, traits } = identity;
  const tags: string[][] = [
    [BLOBBI_V3_TAGS.algorithm, String(identity.algorithm)],
    [BLOBBI_V3_TAGS.baseColor, colors.base],
    [BLOBBI_V3_TAGS.secondaryColor, colors.secondary],
    [BLOBBI_V3_TAGS.eyeColor, colors.eye],
  ];
  if (colors.accent) tags.push([BLOBBI_V3_TAGS.accentColor, colors.accent]);
  tags.push(
    [BLOBBI_V3_TAGS.antenna, traits.antenna],
    [BLOBBI_V3_TAGS.horns, traits.horns],
    [BLOBBI_V3_TAGS.ears, traits.ears],
    [BLOBBI_V3_TAGS.tail, traits.tail],
    [BLOBBI_V3_TAGS.pattern, traits.pattern],
    [BLOBBI_V3_TAGS.specialMark, traits.specialMark],
    [BLOBBI_V3_TAGS.belly, String(traits.belly)],
    [BLOBBI_V3_TAGS.freckles, String(traits.freckles)],
  );
  return tags;
}

const valueOf = (tags: string[][], name: string): string | undefined => tags.find((tag) => tag[0] === name)?.[1];
const booleanOf = (value: string | undefined): boolean | undefined => (value === 'true' ? true : value === 'false' ? false : undefined);

/**
 * Read the V3 identity of an event: the seed its address derives, and what
 * its tags state. Pure and total: any input yields a result, and nothing is
 * ever invented. It does not check the generation; a caller reads it for a
 * `visual_generation = v3` event (`parseBlobbiEvent` does, into
 * `BlobbiCompanion.v3Identity`).
 *
 * The seed is `getBlobbiV3Seed(event)`. A `seed` tag is never read: it cannot
 * name another seed. Without an author (`pubkey` absent) or a single
 * well-formed `d`, there is no seed, and `missing` names it.
 */
export function parseBlobbiV3Identity(event: BlobbiV3AddressSource): ParsedBlobbiV3Identity {
  const { tags } = event;
  const missing: string[] = [];
  const read = <T>(name: string, parse: (value: string | undefined) => T | undefined): T | undefined => {
    const parsed = parse(valueOf(tags, name));
    if (parsed === undefined) missing.push(name);
    return parsed;
  };

  const seed = getBlobbiV3Seed(event);
  if (!seed) missing.push('seed');
  const algorithmTag = valueOf(tags, BLOBBI_V3_TAGS.algorithm);
  const algorithmValue = algorithmTag !== undefined && /^[0-9]{1,4}$/.test(algorithmTag) ? Number(algorithmTag) : undefined;
  if (!validAlgorithm(algorithmValue)) missing.push(BLOBBI_V3_TAGS.algorithm);

  const colors: Partial<BlobbiV3Colors> = {};
  const base = read(BLOBBI_V3_TAGS.baseColor, normalizeBlobbiV3Color);
  const secondary = read(BLOBBI_V3_TAGS.secondaryColor, normalizeBlobbiV3Color);
  const eye = read(BLOBBI_V3_TAGS.eyeColor, normalizeBlobbiV3Color);
  if (base) colors.base = base;
  if (secondary) colors.secondary = secondary;
  if (eye) colors.eye = eye;
  // The accent is optional: its absence is a statement, a malformed one is a gap.
  const accentTag = valueOf(tags, BLOBBI_V3_TAGS.accentColor);
  const accent = normalizeBlobbiV3Color(accentTag);
  if (accent) colors.accent = accent;
  else if (accentTag !== undefined) missing.push(BLOBBI_V3_TAGS.accentColor);

  const traits: Partial<BlobbiV3Traits> = {};
  const antenna = read(BLOBBI_V3_TAGS.antenna, (v) => kindOf(BLOBBI_V3_ANTENNA_KINDS, v));
  const horns = read(BLOBBI_V3_TAGS.horns, (v) => kindOf(BLOBBI_V3_HORN_KINDS, v));
  const ears = read(BLOBBI_V3_TAGS.ears, (v) => kindOf(BLOBBI_V3_EAR_KINDS, v));
  const tail = read(BLOBBI_V3_TAGS.tail, (v) => kindOf(BLOBBI_V3_TAIL_KINDS, v));
  const pattern = read(BLOBBI_V3_TAGS.pattern, (v) => kindOf(BLOBBI_V3_PATTERN_KINDS, v));
  const specialMark = read(BLOBBI_V3_TAGS.specialMark, (v) => kindOf(BLOBBI_V3_SPECIAL_MARK_KINDS, v));
  const belly = read(BLOBBI_V3_TAGS.belly, booleanOf);
  const freckles = read(BLOBBI_V3_TAGS.freckles, booleanOf);
  if (antenna) traits.antenna = antenna;
  if (horns) traits.horns = horns;
  if (ears) traits.ears = ears;
  if (tail) traits.tail = tail;
  if (pattern) traits.pattern = pattern;
  if (specialMark) traits.specialMark = specialMark;
  if (belly !== undefined) traits.belly = belly;
  if (freckles !== undefined) traits.freckles = freckles;

  const identity: ParsedBlobbiV3Identity = { colors, traits, missing };
  if (validAlgorithm(algorithmValue)) identity.algorithm = algorithmValue;
  if (seed) identity.seed = seed;
  return identity;
}
