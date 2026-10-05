/**
 * V3 IDENTITY, as the renderer takes it: the plain data that makes one
 * procedural Blobbi that Blobbi and no other.
 *
 * ```
 *   identity ──► genome ──► morphology ──► geometry ──► SVG
 *   (this file)  (procedural/, frozen per algorithm version)
 * ```
 *
 * A V3 identity has two layers, and they are kept apart on purpose:
 *
 *  - EXPLICIT: the colours and the kind of each trait. Stated, because they
 *    are what an owner would notice changing, and because the colour
 *    generator is art direction that will keep being tuned for NEW Blobbis.
 *    An existing Blobbi keeps the colours it was created with.
 *  - DERIVED: every proportion and every trait's own shape (micro-geometry),
 *    from `seed` under `algorithm`. Never stored; reproducible only because
 *    the algorithm version is frozen (see `procedural/version.ts`).
 *
 * This is declared independently of `@blobbi-kit/core`, which declares the
 * same shape for the event side: the two packages never import each other,
 * and a host passes core's parsed identity straight in.
 *
 * Nothing here is render state. The same identity is an egg, a baby and an
 * adult, awake or asleep, from any side.
 */
import {
  EAR_KINDS,
  HORN_KINDS,
  PROCEDURAL_ALGORITHM_VERSION,
  TAIL_KINDS,
  canonicalGenome,
  generateGenome,
  sanitizeHex,
  type BlobbiGenome,
  type EarKind,
  type HornKind,
  type TailKind,
} from '../../procedural';

/** The procedural algorithm version this package implements. */
export const BLOBBI_V3_ALGORITHM_VERSION: number = PROCEDURAL_ALGORITHM_VERSION;

export const BLOBBI_V3_ANTENNAE = ['none', 'single', 'double'] as const;
export type BlobbiV3Antenna = (typeof BLOBBI_V3_ANTENNAE)[number];
export const BLOBBI_V3_HORNS: readonly HornKind[] = HORN_KINDS;
export type BlobbiV3Horns = HornKind;
export const BLOBBI_V3_EARS: readonly EarKind[] = EAR_KINDS;
export type BlobbiV3Ears = EarKind;
export const BLOBBI_V3_TAILS: readonly TailKind[] = TAIL_KINDS;
export type BlobbiV3Tail = TailKind;

/** The four colours a V3 Blobbi is painted from. Every other colour on it is derived from these. */
export interface BlobbiV3Colors {
  /** The body. */
  base: string;
  /** Markings (flank spots, the egg's spots). */
  secondary: string;
  /** The iris. */
  eye: string;
  /** Small details (antenna tips, a curled tail's tip). Absent: this Blobbi has no accent colour. */
  accent?: string;
}

/** Which traits a V3 Blobbi has. Their exact shapes come from the seed. */
export interface BlobbiV3Traits {
  antenna: BlobbiV3Antenna;
  horns: BlobbiV3Horns;
  ears: BlobbiV3Ears;
  tail: BlobbiV3Tail;
  spots: boolean;
  belly: boolean;
  freckles: boolean;
}

/** A complete V3 identity: every explicit field stated. What creation produces and an event carries. */
export interface BlobbiV3Identity {
  /** The seed all micro-geometry is derived from. */
  seed: string;
  /** The procedural algorithm version the micro-geometry is derived under. */
  algorithm: number;
  colors: BlobbiV3Colors;
  traits: BlobbiV3Traits;
}

/**
 * What a host may pass: an identity, possibly incomplete (external data).
 * Anything missing or malformed is filled from the seed under the frozen
 * algorithm, field by field, so the result is still deterministic.
 */
export interface BlobbiV3Visual {
  seed?: string;
  algorithm?: number;
  colors?: Partial<BlobbiV3Colors>;
  traits?: Partial<BlobbiV3Traits>;
}

/** A seed longer than this is cut: every gene hashes the whole seed, and a seed is external data. */
const MAX_SEED_LENGTH = 256;

const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
const flag = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

function identityOf(genome: BlobbiGenome): BlobbiV3Identity {
  const { colors, traits } = genome;
  const out: BlobbiV3Identity = {
    seed: genome.seed,
    algorithm: BLOBBI_V3_ALGORITHM_VERSION,
    // A seed-generated genome always has these three; the fallbacks are for the type only.
    colors: { base: colors.base ?? '#8b5cf6', secondary: colors.secondary ?? colors.base ?? '#8b5cf6', eye: colors.eye ?? '#1f2937' },
    traits: {
      antenna: BLOBBI_V3_ANTENNAE[traits.antenna.count] ?? 'none',
      horns: traits.horns.kind,
      ears: traits.ears.kind,
      tail: traits.tail.kind,
      spots: traits.spots.enabled,
      belly: traits.belly.enabled,
      freckles: traits.freckles.enabled,
    },
  };
  if (colors.accent) out.colors.accent = colors.accent;
  return out;
}

/**
 * CREATE a V3 identity for a seed: the colours and trait kinds this seed
 * gives under the current algorithm, stated explicitly.
 *
 * This is the creation rule's visual half. Call it ONCE, when a Blobbi is
 * born, and store what it returns (the domain kit writes it into the event);
 * from then on the stored identity is the truth, and re-running this for the
 * same seed after the colour generator has been retuned is exactly what must
 * not decide an existing Blobbi's colours.
 *
 * Pure and deterministic: the same seed always returns an equal identity.
 */
export function createBlobbiV3Identity(seed: string): BlobbiV3Identity {
  return identityOf(generateGenome(String(seed).slice(0, MAX_SEED_LENGTH)));
}

/**
 * Resolve loose input to a complete identity, or `null` when there is no
 * seed to resolve it from.
 *
 * Total: never throws, whatever it is given. Per field: a valid explicit
 * value is kept; anything else is what the seed gives. The colours are one
 * decision, though: with a valid `base` they are explicit (a missing
 * `accent` then means "no accent"), without one they are all the seed's.
 * An algorithm version this package does not implement is drawn with the
 * one it does: the only reading of such an identity it has.
 */
export function normalizeBlobbiV3Visual(input: unknown): BlobbiV3Identity | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as BlobbiV3Visual;
  if (typeof raw.seed !== 'string' || raw.seed === '') return null;
  const seed = raw.seed.slice(0, MAX_SEED_LENGTH);
  const own = identityOf(generateGenome(seed));

  const given = raw.colors && typeof raw.colors === 'object' ? raw.colors : {};
  const base = sanitizeHex(given.base);
  let colors: BlobbiV3Colors = own.colors;
  if (base) {
    colors = { base, secondary: sanitizeHex(given.secondary) ?? own.colors.secondary, eye: sanitizeHex(given.eye) ?? own.colors.eye };
    const accent = sanitizeHex(given.accent);
    if (accent) colors.accent = accent;
  }

  const t = raw.traits && typeof raw.traits === 'object' ? raw.traits : {};
  return {
    seed,
    algorithm: BLOBBI_V3_ALGORITHM_VERSION,
    colors,
    traits: {
      antenna: oneOf(BLOBBI_V3_ANTENNAE, t.antenna) ?? own.traits.antenna,
      horns: oneOf(BLOBBI_V3_HORNS, t.horns) ?? own.traits.horns,
      ears: oneOf(BLOBBI_V3_EARS, t.ears) ?? own.traits.ears,
      tail: oneOf(BLOBBI_V3_TAILS, t.tail) ?? own.traits.tail,
      spots: flag(t.spots) ?? own.traits.spots,
      belly: flag(t.belly) ?? own.traits.belly,
      freckles: flag(t.freckles) ?? own.traits.freckles,
    },
  };
}

/** The genome of a complete identity: its explicit fields, and the seed's micro-geometry. */
export function blobbiV3Genome(identity: BlobbiV3Identity): BlobbiGenome {
  return generateGenome({ seed: identity.seed, colors: { ...identity.colors }, ...identity.traits });
}

/**
 * The genome drawn when a visual names the V3 generation but carries no
 * identity to draw: the canonical body, in the visual's plain colours
 * (through the kit's own colour mapping). Never an invented individual.
 */
export function fallbackV3Genome(colors: { baseColor?: string; secondaryColor?: string; eyeColor?: string }): BlobbiGenome {
  const genome = canonicalGenome();
  const base = sanitizeHex(colors.baseColor);
  const secondary = sanitizeHex(colors.secondaryColor);
  const eye = sanitizeHex(colors.eyeColor);
  if (base || secondary || eye) genome.colors = { ...(base && { base }), ...(secondary && { secondary }), ...(eye && { eye }), mapping: 'kit' };
  return genome;
}

/** A stable key for an identity: equal identities, equal keys. For memoization. */
export function blobbiV3Key(identity: BlobbiV3Identity | null): string {
  if (!identity) return '';
  const { colors: c, traits: t } = identity;
  return [identity.seed, identity.algorithm, c.base, c.secondary, c.eye, c.accent ?? '', t.antenna, t.horns, t.ears, t.tail, +t.spots, +t.belly, +t.freckles].join('|');
}
