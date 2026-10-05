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
 *  - EXPLICIT (semantic identity): the colours, the kind of each trait, the
 *    body's pattern and its special mark.
 *    The seed DECIDES them once, at creation (`createBlobbiV3Identity`);
 *    from then on what the identity states is authoritative, and a stated
 *    value always wins over anything the seed would give. An existing
 *    Blobbi keeps the colours it was created with, however the generator is
 *    tuned for new ones.
 *  - DERIVED (micro-geometry): every proportion and every trait's own size,
 *    curve and place, from `seed` under `algorithm`. Never stored;
 *    reproducible only because the algorithm version is frozen (see
 *    `procedural/version.ts`).
 *
 * The seed is the Blobbi's one seed. It is used at creation (to decide the
 * explicit layer) and at every render (to derive the micro-geometry), and
 * for nothing else; there is no second, V3-specific seed. It has ONE
 * spelling, 64 lower-case hexadecimal digits: see `canonicalBlobbiV3Seed`.
 *
 * AN ALGORITHM VERSION IS NOT A HINT. Micro-geometry derived under another
 * version of the rules is another body. An identity that states a version
 * this package does not implement is therefore never drawn as if it stated
 * this one: see `resolveBlobbiV3Visual`.
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
  MARK_KINDS,
  PATTERN_KINDS,
  PROCEDURAL_ALGORITHM_VERSION,
  TAIL_KINDS,
  canonicalGenome,
  generateGenome,
  sanitizeHex,
  type BlobbiGenome,
  type EarKind,
  type HornKind,
  type MarkKind,
  type PatternKind,
  type TailKind,
} from '../../procedural';

/** The procedural algorithm version this package creates new identities under. */
export const BLOBBI_V3_ALGORITHM_VERSION: number = PROCEDURAL_ALGORITHM_VERSION;

/** Every algorithm version this package can derive micro-geometry under. */
export const BLOBBI_V3_SUPPORTED_ALGORITHMS: readonly number[] = [PROCEDURAL_ALGORITHM_VERSION];

export const BLOBBI_V3_ANTENNAE = ['none', 'single', 'double'] as const;
export type BlobbiV3Antenna = (typeof BLOBBI_V3_ANTENNAE)[number];
export const BLOBBI_V3_HORNS: readonly HornKind[] = HORN_KINDS;
export type BlobbiV3Horns = HornKind;
export const BLOBBI_V3_EARS: readonly EarKind[] = EAR_KINDS;
export type BlobbiV3Ears = EarKind;
export const BLOBBI_V3_TAILS: readonly TailKind[] = TAIL_KINDS;
export type BlobbiV3Tail = TailKind;
/** The body's one pattern; `solid` is none. */
export const BLOBBI_V3_PATTERNS: readonly PatternKind[] = PATTERN_KINDS;
export type BlobbiV3Pattern = PatternKind;
/** One small permanent marking, or none. */
export const BLOBBI_V3_SPECIAL_MARKS: readonly MarkKind[] = MARK_KINDS;
export type BlobbiV3SpecialMark = MarkKind;

/** The four colours a V3 Blobbi is painted from. Every other colour on it is derived from these. */
export interface BlobbiV3Colors {
  /** The body. */
  base: string;
  /** The pattern (spots, stripes, the deepening of a gradient) and the egg's spots. */
  secondary: string;
  /** The iris. */
  eye: string;
  /** Small details (antenna tips, a curled tail's tip, the special mark). Absent: this Blobbi has no accent colour. */
  accent?: string;
}

/**
 * What a V3 Blobbi has, by kind: its anatomy (antenna, horns, ears, tail)
 * and its surface (pattern, special mark, belly patch, freckles). Every
 * exact shape, size and place comes from the seed.
 */
export interface BlobbiV3Traits {
  antenna: BlobbiV3Antenna;
  horns: BlobbiV3Horns;
  ears: BlobbiV3Ears;
  tail: BlobbiV3Tail;
  pattern: BlobbiV3Pattern;
  specialMark: BlobbiV3SpecialMark;
  belly: boolean;
  freckles: boolean;
}

/** A complete V3 identity: every explicit field stated. What creation produces and an event carries. */
export interface BlobbiV3Identity {
  /** The seed all micro-geometry is derived from, as 64 lower-case hexadecimal digits. */
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

/** How long a V3 seed is: 32 bytes, as hexadecimal digits. */
export const BLOBBI_V3_SEED_LENGTH = 64;
const HEX_SEED = /^[0-9a-fA-F]{64}$/;

/**
 * THE V3 SEED, canonically: 32 bytes written as exactly 64 lower-case
 * hexadecimal digits (`0-9a-f`). It is what the domain kit has always
 * derived for a Blobbi, and it is the ONLY input algorithm 1 is defined
 * over.
 *
 * The algorithm hashes the seed's characters, so two spellings of the same
 * bytes would be two different individuals. There is therefore one:
 *
 *  - 64 hexadecimal digits in any letter case are the same seed, and are
 *    read as their lower-case form;
 *  - anything else is NOT a V3 seed and is rejected, never repaired: not
 *    trimmed, not padded, not stripped of a prefix, not hashed into shape.
 *    A value that needs a guess has no single right answer, and two
 *    renderers guessing differently would draw two Blobbis.
 *
 * Returns the canonical seed, or `undefined` when the value is not one.
 * Every door into algorithm 1 in this package goes through it
 * (`createBlobbiV3Identity`, `resolveBlobbiV3Visual`), so no non-canonical
 * spelling can reach the engine and be drawn as an individual.
 */
export function canonicalBlobbiV3Seed(value: unknown): string | undefined {
  return typeof value === 'string' && HEX_SEED.test(value) ? value.toLowerCase() : undefined;
}

/** Under a version of the rules this package does not have, a seed is kept as stated but cut to this: it is external data. */
const MAX_FOREIGN_SEED_LENGTH = 256;

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
      pattern: traits.pattern.kind,
      specialMark: traits.mark.kind,
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
 * Pure and deterministic: the same seed always returns an equal identity,
 * and it states the seed canonically (`canonicalBlobbiV3Seed`).
 *
 * @throws TypeError when `seed` is not a V3 seed. Creation is the one
 * strict door: a Blobbi must never be born from a value that had to be
 * guessed at. (Reading is total: see `resolveBlobbiV3Visual`.)
 */
export function createBlobbiV3Identity(seed: string): BlobbiV3Identity {
  const canonical = canonicalBlobbiV3Seed(seed);
  if (canonical === undefined) throw new TypeError('[blobbi-kit] createBlobbiV3Identity: a V3 seed is 64 hexadecimal digits.');
  return identityOf(generateGenome(canonical));
}

/**
 * What a V3 visual resolves to. Three outcomes, never blurred:
 *
 *  - `individual`: a seed and an algorithm version this package implements.
 *    `identity` is complete; `inferred` names every field the input did not
 *    state validly and that was therefore taken from the seed (a
 *    compatibility fallback for DRAWING: it is never written anywhere).
 *    Empty for every identity this kit created.
 *  - `unsupported-algorithm`: the identity states a version of the rules
 *    this package does not have. Nothing may be derived from its seed, so
 *    there is no individual to draw; only what it states EXPLICITLY (valid
 *    colours, valid trait kinds) is kept.
 *  - `none`: no seed at all, or (under a version this package implements)
 *    something that is not a V3 seed. There is no individual to derive, and
 *    none is guessed at.
 */
export type BlobbiV3Resolution =
  | { status: 'individual'; identity: BlobbiV3Identity; inferred: string[] }
  | { status: 'unsupported-algorithm'; algorithm: number; seed: string; colors: Partial<BlobbiV3Colors>; traits: Partial<BlobbiV3Traits> }
  | { status: 'none' };

const NONE: BlobbiV3Resolution = Object.freeze({ status: 'none' });

/**
 * Resolve loose input (external data) to what can be drawn from it.
 *
 * Total: never throws, whatever it is given.
 *
 *  - A VALID EXPLICIT FIELD ALWAYS WINS. The seed is consulted only for a
 *    field that is missing or malformed, and every such field is reported
 *    in `inferred`.
 *  - The colours are one decision: with a valid `base` the palette is
 *    explicit (a missing `accent` then means "no accent"); without one it is
 *    all the seed's.
 *  - `algorithm`: a version this package implements is used; an ABSENT one
 *    reads as version 1, the first (and is reported as inferred); any other
 *    stated number is `unsupported-algorithm`. It is never drawn as the
 *    version this package happens to have.
 *  - `seed`: canonicalized (`canonicalBlobbiV3Seed`). Hexadecimal digits in
 *    another case resolve to the SAME identity as their lower-case form;
 *    anything that is not a V3 seed resolves to `none`. Under an unsupported
 *    version nothing is derived from the seed, so it is kept as stated.
 */
export function resolveBlobbiV3Visual(input: unknown): BlobbiV3Resolution {
  if (!input || typeof input !== 'object') return NONE;
  const raw = input as BlobbiV3Visual;
  if (typeof raw.seed !== 'string' || raw.seed === '') return NONE;
  const given = raw.colors && typeof raw.colors === 'object' ? raw.colors : {};
  const t = raw.traits && typeof raw.traits === 'object' ? raw.traits : {};
  const stated = {
    base: sanitizeHex(given.base),
    secondary: sanitizeHex(given.secondary),
    eye: sanitizeHex(given.eye),
    accent: sanitizeHex(given.accent),
    antenna: oneOf(BLOBBI_V3_ANTENNAE, t.antenna),
    horns: oneOf(BLOBBI_V3_HORNS, t.horns),
    ears: oneOf(BLOBBI_V3_EARS, t.ears),
    tail: oneOf(BLOBBI_V3_TAILS, t.tail),
    pattern: oneOf(BLOBBI_V3_PATTERNS, t.pattern),
    specialMark: oneOf(BLOBBI_V3_SPECIAL_MARKS, t.specialMark),
    belly: flag(t.belly),
    freckles: flag(t.freckles),
  };

  // A stated version this package does not implement: keep what is explicit, derive nothing.
  if (typeof raw.algorithm === 'number' && !BLOBBI_V3_SUPPORTED_ALGORITHMS.includes(raw.algorithm)) {
    const colors: Partial<BlobbiV3Colors> = {};
    for (const role of ['base', 'secondary', 'eye', 'accent'] as const) if (stated[role]) colors[role] = stated[role];
    const traits: Partial<BlobbiV3Traits> = {};
    if (stated.antenna) traits.antenna = stated.antenna;
    if (stated.horns) traits.horns = stated.horns;
    if (stated.ears) traits.ears = stated.ears;
    if (stated.tail) traits.tail = stated.tail;
    if (stated.pattern) traits.pattern = stated.pattern;
    if (stated.specialMark) traits.specialMark = stated.specialMark;
    for (const key of ['belly', 'freckles'] as const) if (stated[key] !== undefined) traits[key] = stated[key];
    return { status: 'unsupported-algorithm', algorithm: raw.algorithm, seed: raw.seed.slice(0, MAX_FOREIGN_SEED_LENGTH), colors, traits };
  }

  // Algorithm 1 is defined over canonical seeds only: one spelling, so one individual.
  const seed = canonicalBlobbiV3Seed(raw.seed);
  if (seed === undefined) return NONE;

  const own = identityOf(generateGenome(seed));
  const inferred: string[] = [];
  const pick = <T>(name: string, value: T | undefined, fallback: T): T => {
    if (value !== undefined) return value;
    inferred.push(name);
    return fallback;
  };
  if (typeof raw.algorithm !== 'number') inferred.push('algorithm');

  let colors: BlobbiV3Colors;
  if (stated.base) {
    colors = { base: stated.base, secondary: pick('colors.secondary', stated.secondary, own.colors.secondary), eye: pick('colors.eye', stated.eye, own.colors.eye) };
    if (stated.accent) colors.accent = stated.accent;
  } else {
    colors = own.colors;
    inferred.push('colors.base', 'colors.secondary', 'colors.eye', 'colors.accent');
  }

  return {
    status: 'individual',
    inferred,
    identity: {
      seed,
      algorithm: BLOBBI_V3_ALGORITHM_VERSION,
      colors,
      traits: {
        antenna: pick('traits.antenna', stated.antenna, own.traits.antenna),
        horns: pick('traits.horns', stated.horns, own.traits.horns),
        ears: pick('traits.ears', stated.ears, own.traits.ears),
        tail: pick('traits.tail', stated.tail, own.traits.tail),
        pattern: pick('traits.pattern', stated.pattern, own.traits.pattern),
        specialMark: pick('traits.specialMark', stated.specialMark, own.traits.specialMark),
        belly: pick('traits.belly', stated.belly, own.traits.belly),
        freckles: pick('traits.freckles', stated.freckles, own.traits.freckles),
      },
    },
  };
}

/**
 * The complete identity of a V3 visual, or `null` when there is no
 * individual to resolve: no seed, or an algorithm version this package does
 * not implement (which `resolveBlobbiV3Visual` reports as such).
 */
export function normalizeBlobbiV3Visual(input: unknown): BlobbiV3Identity | null {
  const resolved = resolveBlobbiV3Visual(input);
  return resolved.status === 'individual' ? resolved.identity : null;
}

/** The genome of a complete identity: its explicit fields, and the seed's micro-geometry. */
export function blobbiV3Genome(identity: BlobbiV3Identity): BlobbiGenome {
  const { specialMark, ...traits } = identity.traits;
  return generateGenome({ seed: identity.seed, colors: { ...identity.colors }, ...traits, mark: specialMark });
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

/**
 * The genome drawn for an identity whose algorithm version this package
 * does not implement: the canonical body (every gene at zero, so NOTHING is
 * derived from the seed), with exactly the colours and trait kinds the
 * identity states. It is a stand-in that says what the Blobbi explicitly
 * is, not a guess at the individual: every such Blobbi of one description
 * looks the same, which is the honest thing to draw.
 */
export function genericV3Genome(colors: Partial<BlobbiV3Colors>, traits: Partial<BlobbiV3Traits>): BlobbiGenome {
  const genome = canonicalGenome();
  if (colors.base || colors.secondary || colors.eye || colors.accent) genome.colors = { ...colors };
  if (traits.antenna) genome.traits.antenna.count = BLOBBI_V3_ANTENNAE.indexOf(traits.antenna) as 0 | 1 | 2;
  if (traits.horns) genome.traits.horns.kind = traits.horns;
  if (traits.ears) genome.traits.ears.kind = traits.ears;
  if (traits.tail) genome.traits.tail.kind = traits.tail;
  if (traits.pattern) genome.traits.pattern.kind = traits.pattern;
  if (traits.specialMark) genome.traits.mark.kind = traits.specialMark;
  if (traits.belly !== undefined) genome.traits.belly.enabled = traits.belly;
  if (traits.freckles !== undefined) genome.traits.freckles.enabled = traits.freckles;
  return genome;
}

/** What a resolution keeps of its input, as plain data that resolves to itself again. */
export function blobbiV3VisualOf(resolved: BlobbiV3Resolution): BlobbiV3Visual | null {
  if (resolved.status === 'individual') return resolved.identity;
  if (resolved.status === 'unsupported-algorithm') return { seed: resolved.seed, algorithm: resolved.algorithm, colors: resolved.colors, traits: resolved.traits };
  return null;
}

/** A stable key for a resolved visual: equal inputs, equal keys. For memoization. */
export function blobbiV3Key(visual: BlobbiV3Visual | null): string {
  if (!visual) return '';
  const c = visual.colors ?? {};
  const t = visual.traits ?? {};
  const bit = (value: boolean | undefined) => (value === undefined ? '' : +value);
  return [visual.seed, visual.algorithm, c.base, c.secondary, c.eye, c.accent ?? '', t.antenna, t.horns, t.ears, t.tail, t.pattern, t.specialMark, bit(t.belly), bit(t.freckles)].join('|');
}
