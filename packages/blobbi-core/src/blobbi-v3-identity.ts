/**
 * V3 IDENTITY ON THE EVENT: how a procedural (`visual_generation = v3`)
 * Blobbi states who it is in its kind 31124 tags.
 *
 * PROVISIONAL. This is the first real representation, written to be easy to
 * revise before anything is published as a specification. The tag names, the
 * split into one tag per field and the value spellings below are a working
 * convention, not yet a protocol promise. What IS meant to hold is the shape
 * of the idea:
 *
 * ```
 *   visual_generation = v3          the generation (blobbi.ts)
 *   seed              = <64 hex>    the existing seed tag: all micro-geometry derives from it
 *   v3_algorithm      = 1           the procedural algorithm version it derives under
 *   v3_*_color        = #rrggbb     the colours, EXPLICIT
 *   v3_antenna, v3_horns, ...       the kind of each trait, EXPLICIT
 * ```
 *
 * WHY EXPLICIT. A V3 Blobbi's proportions and trait shapes are derived from
 * its seed by a frozen algorithm, so they need no storage. Its colours and
 * trait kinds could be derived the same way, and are not: the colour
 * generator is art direction that keeps being tuned, and a Blobbi must not
 * be repainted because the generator improved. Stated once at creation, they
 * are simply what this Blobbi is.
 *
 * WHY NEW TAGS. The existing colour tags (`base_color`, `secondary_color`,
 * `eye_color`) are MIRRORS OF THE SEED: every republish, in this kit and in
 * every client already deployed, overwrites them with what the seed derives
 * (`syncMirrorTagsToSeed`). An explicit colour stored there would be erased
 * by the first care action from an older client. Tags a client does not know
 * are carried through every republish untouched, so the V3 identity lives in
 * tags of its own, and the mirror tags go on meaning what they always have
 * (they are also what a client that predates V3 draws from: it reads an
 * unknown generation as V1).
 *
 * This module owns the spelling, the parsing and the validation. It does NOT
 * generate an identity: which colours and traits a seed gives is the
 * renderer's art direction (`createBlobbiV3Identity` in `@blobbi-kit/renderer`).
 * The two packages never import each other; the shapes here and there are
 * structurally the same, so a host hands one to the other.
 */

/** The tag names of a V3 identity, in the order they are written. */
export const BLOBBI_V3_TAGS = {
  algorithm: 'v3_algorithm',
  baseColor: 'v3_base_color',
  secondaryColor: 'v3_secondary_color',
  eyeColor: 'v3_eye_color',
  accentColor: 'v3_accent_color',
  antenna: 'v3_antenna',
  horns: 'v3_horns',
  ears: 'v3_ears',
  tail: 'v3_tail',
  spots: 'v3_spots',
  belly: 'v3_belly',
  freckles: 'v3_freckles',
} as const;

/** Every V3 identity tag name. They are identity: persistent, never regenerated, never invented. */
export const BLOBBI_V3_TAG_NAMES: readonly string[] = Object.values(BLOBBI_V3_TAGS);

export const BLOBBI_V3_ANTENNA_KINDS = ['none', 'single', 'double'] as const;
export type BlobbiV3AntennaKind = (typeof BLOBBI_V3_ANTENNA_KINDS)[number];
export const BLOBBI_V3_HORN_KINDS = ['none', 'forehead', 'top', 'side'] as const;
export type BlobbiV3HornKind = (typeof BLOBBI_V3_HORN_KINDS)[number];
export const BLOBBI_V3_EAR_KINDS = ['none', 'round', 'pointed'] as const;
export type BlobbiV3EarKind = (typeof BLOBBI_V3_EAR_KINDS)[number];
export const BLOBBI_V3_TAIL_KINDS = ['none', 'nub', 'curl', 'leaf'] as const;
export type BlobbiV3TailKind = (typeof BLOBBI_V3_TAIL_KINDS)[number];

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
  spots: boolean;
  belly: boolean;
  freckles: boolean;
}

/**
 * A complete V3 identity: what a NEW Blobbi is created with. Every explicit
 * field is stated; there is nothing left for a renderer to decide.
 */
export interface BlobbiV3Identity {
  /** The seed the micro-geometry derives from: the Blobbi's `seed` tag. */
  seed: string;
  /** The procedural algorithm version, a positive integer. */
  algorithm: number;
  colors: BlobbiV3Colors;
  traits: BlobbiV3Traits;
}

/**
 * A V3 identity as READ from an event: exactly what its tags state, and
 * nothing more. A field that is absent or malformed is absent here; core
 * never fills one in (that would be inventing identity). A renderer resolves
 * the gaps deterministically from the seed; `missing` says whether it had to.
 */
export interface ParsedBlobbiV3Identity {
  seed?: string;
  /** The stated algorithm version; `1` when the tag is absent (the first one). */
  algorithm: number;
  colors: Partial<BlobbiV3Colors>;
  traits: Partial<BlobbiV3Traits>;
  /** The identity tags that were absent or malformed. Empty for every Blobbi this kit created. */
  missing: string[];
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
 * form (colours lower-cased, only known fields). Used at creation: an event
 * is never born with a partial identity.
 */
export function validateBlobbiV3Identity(input: unknown): BlobbiV3Validation {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { valid: false, errors: ['identity is not an object'] };
  const raw = input as Partial<BlobbiV3Identity>;
  if (typeof raw.seed !== 'string' || raw.seed === '') errors.push('seed is missing');
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
  for (const key of ['spots', 'belly', 'freckles'] as const) {
    if (typeof t[key] !== 'boolean') errors.push(`traits.${key} is not a boolean`);
  }

  if (errors.length > 0) return { valid: false, errors };
  const colors: BlobbiV3Colors = { base: base!, secondary: secondary!, eye: eye! };
  if (accent) colors.accent = accent;
  return {
    valid: true,
    identity: {
      seed: raw.seed!,
      algorithm: raw.algorithm!,
      colors,
      traits: { antenna: antenna!, horns: horns!, ears: ears!, tail: tail!, spots: t.spots!, belly: t.belly!, freckles: t.freckles! },
    },
  };
}

/**
 * The tags that state a V3 identity. The seed is not among them: it is the
 * Blobbi's existing `seed` tag. A Blobbi with no accent colour has no accent
 * tag (absence is the statement).
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
    [BLOBBI_V3_TAGS.spots, String(traits.spots)],
    [BLOBBI_V3_TAGS.belly, String(traits.belly)],
    [BLOBBI_V3_TAGS.freckles, String(traits.freckles)],
  );
  return tags;
}

const valueOf = (tags: string[][], name: string): string | undefined => tags.find((tag) => tag[0] === name)?.[1];
const booleanOf = (value: string | undefined): boolean | undefined => (value === 'true' ? true : value === 'false' ? false : undefined);

/**
 * Read the V3 identity a tag list states. Pure and total: any tag list
 * yields a result, and nothing is ever invented. It does not check the
 * generation; a caller reads it for a `visual_generation = v3` event
 * (`parseBlobbiEvent` does, into `BlobbiCompanion.v3Identity`).
 */
export function parseBlobbiV3Identity(tags: string[][]): ParsedBlobbiV3Identity {
  const missing: string[] = [];
  const read = <T>(name: string, parse: (value: string | undefined) => T | undefined): T | undefined => {
    const parsed = parse(valueOf(tags, name));
    if (parsed === undefined) missing.push(name);
    return parsed;
  };

  const seed = valueOf(tags, 'seed');
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
  const spots = read(BLOBBI_V3_TAGS.spots, booleanOf);
  const belly = read(BLOBBI_V3_TAGS.belly, booleanOf);
  const freckles = read(BLOBBI_V3_TAGS.freckles, booleanOf);
  if (antenna) traits.antenna = antenna;
  if (horns) traits.horns = horns;
  if (ears) traits.ears = ears;
  if (tail) traits.tail = tail;
  if (spots !== undefined) traits.spots = spots;
  if (belly !== undefined) traits.belly = belly;
  if (freckles !== undefined) traits.freckles = freckles;

  const identity: ParsedBlobbiV3Identity = { algorithm: validAlgorithm(algorithmValue) ? algorithmValue : 1, colors, traits, missing };
  if (seed) identity.seed = seed;
  return identity;
}
