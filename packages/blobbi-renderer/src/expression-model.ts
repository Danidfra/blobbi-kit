/**
 * The PUBLIC expression contract of `@blobbi-kit/renderer`.
 *
 * An expression names HOW a Blobbi's face looks. It never says why: a host
 * decides that a zap, a full stomach or a click makes its Blobbi happy, and
 * hands the renderer the word `'happy'`. The renderer knows what happy looks
 * like on the artwork it owns, and nothing about zaps.
 *
 * Everything a caller sends is a closed vocabulary: a preset name, or an
 * object of per-part states, each drawn from a small union. No path data, no
 * CSS, no markup ever crosses this boundary; every shape an expression
 * produces is a package-owned constant applied to package-owned artwork
 * (`artwork/adult/v2/expression.ts`).
 *
 * Normalization is total: any input, including hostile or malformed input,
 * resolves to a complete {@link ResolvedBlobbiExpression} without throwing.
 * Unknown presets and unknown part values fall back to neutral, because
 * "draw the neutral face" is the only safe reading of a state this package
 * does not implement.
 */

/** How open the eyes are. `closed` is also what sleeping draws. */
export type BlobbiEyeState = 'open' | 'half' | 'closed' | 'wide';
export const BLOBBI_EYE_STATES: readonly BlobbiEyeState[] = ['open', 'half', 'closed', 'wide'];

/** The mouth shape. `neutral` is the authored mouth, untouched. */
export type BlobbiMouthState = 'neutral' | 'smile' | 'grin' | 'frown' | 'open' | 'flat';
export const BLOBBI_MOUTH_STATES: readonly BlobbiMouthState[] = [
  'neutral', 'smile', 'grin', 'frown', 'open', 'flat',
];

/** The eyebrow pose. `inner-up` lifts the ends nearest the nose (sadness). */
export type BlobbiBrowState = 'neutral' | 'raised' | 'lowered' | 'inner-up';
export const BLOBBI_BROW_STATES: readonly BlobbiBrowState[] = ['neutral', 'raised', 'lowered', 'inner-up'];

/** Cheek blush. `soft` is the authored cheek; `none` hides it; `strong` deepens it. */
export type BlobbiBlushState = 'none' | 'soft' | 'strong';
export const BLOBBI_BLUSH_STATES: readonly BlobbiBlushState[] = ['none', 'soft', 'strong'];

/** Explicit per-part states. Every field is optional; absent means neutral. */
export interface BlobbiExpressionParts {
  eyes?: BlobbiEyeState;
  mouth?: BlobbiMouthState;
  brows?: BlobbiBrowState;
  blush?: BlobbiBlushState;
}

/** The named presets. Each is a fixed combination of part states (see {@link BLOBBI_EMOTION_PRESETS}). */
export type BlobbiEmotion =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'sad'
  | 'sleepy'
  | 'surprised'
  | 'upset';

export const BLOBBI_EMOTIONS: readonly BlobbiEmotion[] = [
  'neutral', 'happy', 'excited', 'sad', 'sleepy', 'surprised', 'upset',
];

/**
 * A BLEND of presets: how much of each emotion the face shows, each 0..1
 * (`{ blend: { happy: 0.6, sad: 0.2 } }`). The weights are clamped, and
 * scaled down together if they sum past 1, so a blend never leaves the
 * shapes the presets span.
 *
 * Drawn continuously by artwork whose face is geometry (V3). Artwork with
 * drawn faces (V1, V2) cannot interpolate and draws the preset that
 * dominates the blend (weight of at least a half), or the neutral face.
 */
export interface BlobbiExpressionBlend {
  blend: Partial<Record<Exclude<BlobbiEmotion, 'neutral'>, number>>;
}

/** What a caller sends: a preset name, explicit parts, or a blend of presets. Plain, serializable. */
export type BlobbiExpression = BlobbiEmotion | BlobbiExpressionParts | BlobbiExpressionBlend;

/** A fully resolved expression: every part decided. */
export interface ResolvedBlobbiExpression {
  eyes: BlobbiEyeState;
  mouth: BlobbiMouthState;
  brows: BlobbiBrowState;
  blush: BlobbiBlushState;
  /**
   * The normalized weights, when the caller sent a blend with any weight in
   * it. The four parts above are then the dominant preset's (what artwork
   * that cannot interpolate draws).
   */
  blend?: Readonly<Partial<Record<Exclude<BlobbiEmotion, 'neutral'>, number>>>;
}

/**
 * The preset table: how each named emotion is built from the primitives.
 *
 * Kept small on purpose. A preset is a combination the artwork renders well,
 * not a psychology model; a host that wants a face this table does not name
 * composes the parts itself.
 */
export const BLOBBI_EMOTION_PRESETS: Readonly<Record<BlobbiEmotion, ResolvedBlobbiExpression>> = Object.freeze({
  neutral:   Object.freeze({ eyes: 'open',   mouth: 'neutral', brows: 'neutral',  blush: 'soft'   }),
  happy:     Object.freeze({ eyes: 'open',   mouth: 'smile',   brows: 'raised',   blush: 'soft'   }),
  excited:   Object.freeze({ eyes: 'wide',   mouth: 'grin',    brows: 'raised',   blush: 'strong' }),
  sad:       Object.freeze({ eyes: 'half',   mouth: 'frown',   brows: 'inner-up', blush: 'none'   }),
  sleepy:    Object.freeze({ eyes: 'half',   mouth: 'flat',    brows: 'lowered',  blush: 'soft'   }),
  surprised: Object.freeze({ eyes: 'wide',   mouth: 'open',    brows: 'raised',   blush: 'soft'   }),
  upset:     Object.freeze({ eyes: 'open',   mouth: 'flat',    brows: 'lowered',  blush: 'none'   }),
});

/** The neutral face: what every default and every unknown input resolves to. */
export const NEUTRAL_EXPRESSION: ResolvedBlobbiExpression = BLOBBI_EMOTION_PRESETS.neutral;

const EYE_SET: ReadonlySet<string> = new Set(BLOBBI_EYE_STATES);
const MOUTH_SET: ReadonlySet<string> = new Set(BLOBBI_MOUTH_STATES);
const BROW_SET: ReadonlySet<string> = new Set(BLOBBI_BROW_STATES);
const BLUSH_SET: ReadonlySet<string> = new Set(BLOBBI_BLUSH_STATES);

/** Is this string a preset this package implements? */
export function isBlobbiEmotion(value: unknown): value is BlobbiEmotion {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BLOBBI_EMOTION_PRESETS, value);
}

function pick<T extends string>(value: unknown, allowed: ReadonlySet<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? (value as T) : fallback;
}

/**
 * Resolve any expression input into a complete, drawable expression.
 *
 * Pure and total. A preset name yields its table row; an object yields its
 * recognized fields with neutral for the rest; anything else (undefined, null,
 * a number, an unknown name, a string where an object was expected) yields
 * {@link NEUTRAL_EXPRESSION}. Always returns a frozen object; the neutral
 * result is a shared instance, so "no expression" allocates nothing.
 */
export function normalizeBlobbiExpression(input: unknown): ResolvedBlobbiExpression {
  if (input === undefined || input === null) return NEUTRAL_EXPRESSION;
  if (typeof input === 'string') {
    return isBlobbiEmotion(input) ? BLOBBI_EMOTION_PRESETS[input] : NEUTRAL_EXPRESSION;
  }
  if (typeof input !== 'object' || Array.isArray(input)) return NEUTRAL_EXPRESSION;

  const parts = input as Record<string, unknown>;
  if (parts.blend !== undefined) return normalizeBlend(parts.blend);
  const resolved: ResolvedBlobbiExpression = {
    eyes: pick(parts.eyes, EYE_SET, NEUTRAL_EXPRESSION.eyes),
    mouth: pick(parts.mouth, MOUTH_SET, NEUTRAL_EXPRESSION.mouth),
    brows: pick(parts.brows, BROW_SET, NEUTRAL_EXPRESSION.brows),
    blush: pick(parts.blush, BLUSH_SET, NEUTRAL_EXPRESSION.blush),
  };
  if (isNeutral(resolved)) return NEUTRAL_EXPRESSION;
  return Object.freeze(resolved);
}

/** A blend's weights, clamped and made convex; the parts of the preset that dominates it. */
function normalizeBlend(input: unknown): ResolvedBlobbiExpression {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return NEUTRAL_EXPRESSION;
  const raw = input as Record<string, unknown>;
  const weights: Partial<Record<Exclude<BlobbiEmotion, 'neutral'>, number>> = {};
  let total = 0;
  for (const emotion of BLOBBI_EMOTIONS) {
    if (emotion === 'neutral') continue;
    const value = raw[emotion];
    const weight = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (weight > 0) {
      weights[emotion] = weight;
      total += weight;
    }
  }
  if (total === 0) return NEUTRAL_EXPRESSION;
  let dominant: Exclude<BlobbiEmotion, 'neutral'> | null = null;
  for (const emotion of Object.keys(weights) as Exclude<BlobbiEmotion, 'neutral'>[]) {
    if (total > 1) weights[emotion] = weights[emotion]! / total;
    if (dominant === null || weights[emotion]! > weights[dominant]!) dominant = emotion;
  }
  const preset = dominant !== null && weights[dominant]! >= 0.5 ? BLOBBI_EMOTION_PRESETS[dominant] : NEUTRAL_EXPRESSION;
  return Object.freeze({ ...preset, blend: Object.freeze(weights) });
}

/** Whether a resolved expression is the neutral face (draws the authored artwork unchanged). */
export function isNeutral(expression: ResolvedBlobbiExpression): boolean {
  return (
    expression.eyes === NEUTRAL_EXPRESSION.eyes &&
    expression.mouth === NEUTRAL_EXPRESSION.mouth &&
    expression.brows === NEUTRAL_EXPRESSION.brows &&
    expression.blush === NEUTRAL_EXPRESSION.blush &&
    expression.blend === undefined
  );
}
