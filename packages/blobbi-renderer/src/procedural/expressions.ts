/**
 * EXPRESSIONS as continuous transformations of a Blobbi's own face.
 *
 * The kit's expression system is already rule-based: a mouth state is a
 * shape "relative to the authored mouth width", a brow state is a curve
 * relative to the authored brow, a half lid is a chord across the eye
 * white. Those shapes are carefully chosen, so this module KEEPS them and
 * changes only how they are reached: each kit preset becomes a KEY POSE, a
 * point in a small numeric pose space, and an expression is a weighted
 * blend of key poses. At weight 1 a pose is the kit's face; in between the
 * face interpolates instead of swapping.
 *
 * A pose never contains coordinates. It is expressed in the face's own
 * units (mouth widths, brow widths, eye radii), and `face.ts` applies it to
 * whatever mouth, brows and eyes the individual has. Two Blobbis with
 * different faces therefore make the same expression with their own faces.
 *
 * Pure math, no SVG, no randomness.
 */
import { clamp01, lerp } from './geometry';

/** The emotion axes: one per kit preset other than neutral. */
export const EMOTIONS = ['happy', 'excited', 'sad', 'sleepy', 'surprised', 'upset'] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** How much of each emotion the face shows, each 0..1. Absent means 0. */
export type ExpressionWeights = Partial<Record<Emotion, number>>;

export interface MouthPose {
  /** Width as a multiple of the individual's neutral mouth width. */
  width: number;
  /** Vertical shift of the corners, in mouth widths (positive is down). */
  dy: number;
  /** How far in from each corner the curve's handles sit, as a fraction of the current width. */
  hx: number;
  /** Depth of the lower lip's handles, in mouth widths (positive bows down: a smile). */
  low: number;
  /** Depth of the upper lip's handles. Equal to `low` for a closed mouth. */
  up: number;
  /**
   * The authored curve's own lopsidedness: how much further in the left
   * handle sits than the right, and how much deeper the right one hangs.
   * Only neutral mouths carry any (the front's is a hair, the profile's is
   * the shape of a half-smile); every key pose is symmetric, so the skew
   * fades as an expression takes over.
   */
  hxSkew: number;
  lowSkew: number;
}

/** One brow as a quadratic: heights of its start, control and end, in brow widths (negative is up). */
export interface BrowPose {
  start: number;
  ctrl: number;
  end: number;
}

export interface FacePose {
  mouth: MouthPose;
  /** Viewer's left and right brows. They differ only where a pose is sided (`sad`). */
  browLeft: BrowPose;
  browRight: BrowPose;
  /** 0 open, 0.5 the kit's half lid, 1 closed. */
  lid: number;
  /** Scale of the iris, pupil and highlights about the eye's centre (the kit's `wide` is 0.84). */
  irisScale: number;
  /** -1 no blush, 0 the authored cheek, 1 the kit's strong blush. */
  blush: number;
}

// The authored neutral mouth is `c 15.89586,30.56679 67.22108,31.06386 82.71435,0`.
// In mouth widths that is handles 0.1897 in from each corner at a depth of
// 0.3726, with a tiny left/right difference kept as skew.
const NEUTRAL_MOUTH: MouthPose = {
  width: 1,
  dy: 0,
  hx: (15.89586 + (82.71435 - 67.22108)) / 2 / 82.71435,
  low: (30.56679 + 31.06386) / 2 / 82.71435,
  up: (30.56679 + 31.06386) / 2 / 82.71435,
  hxSkew: (15.89586 - (82.71435 - 67.22108)) / 2 / 82.71435,
  lowSkew: (31.06386 - 30.56679) / 2 / 82.71435,
};

// The kit's mouth shapes (`adult/v2/expression.ts`), in the same units.
const SMILE: MouthPose = { width: 1, dy: 0, hx: 0.19, low: 0.52, up: 0.52, hxSkew: 0, lowSkew: 0 };
const GRIN: MouthPose = { width: 1.24, dy: -0.02, hx: 0.25 / 1.24, low: 0.72, up: 0.72, hxSkew: 0, lowSkew: 0 };
const FROWN: MouthPose = { width: 1, dy: 0.18, hx: 0.19, low: -0.34, up: -0.34, hxSkew: 0, lowSkew: 0 };
const FLAT: MouthPose = { width: 0.84, dy: 0.1, hx: 0.19, low: 0, up: 0, hxSkew: 0, lowSkew: 0 };
// The kit's open mouth is an ellipse 0.56 wide and 0.44 tall, centred 0.16
// below the corners. Two cubics with vertical handles of 4/3 of the radius
// trace it; the handles sit on the corners, so `hx` is 0.
const OPEN: MouthPose = { width: 0.56, dy: 0.16, hx: 0, low: (4 / 3) * 0.22, up: -(4 / 3) * 0.22, hxSkew: 0, lowSkew: 0 };

// The authored brows: `q 38,-25 76,1` (left) and `q 38,-26 76,-1` (right).
const NEUTRAL_BROW_LEFT: BrowPose = { start: 0, ctrl: -25 / 76, end: 1 / 76 };
const NEUTRAL_BROW_RIGHT: BrowPose = { start: 0, ctrl: -26 / 76, end: -1 / 76 };
// The kit's brow shapes. Its control and end heights are relative to the
// start; here all three are absolute, so a blend moves each end on its own.
const RAISED: BrowPose = { start: -0.16, ctrl: -0.52, end: -0.16 };
const LOWERED: BrowPose = { start: 0.12, ctrl: 0.02, end: 0.14 };
// `inner-up` lifts the end nearest the nose: the left brow's end, the right brow's start.
const INNER_UP_LEFT: BrowPose = { start: 0.05, ctrl: -0.15, end: -0.17 };
const INNER_UP_RIGHT: BrowPose = { start: -0.17, ctrl: -0.19, end: 0.05 };

export const NEUTRAL_POSE: FacePose = {
  mouth: NEUTRAL_MOUTH,
  browLeft: NEUTRAL_BROW_LEFT,
  browRight: NEUTRAL_BROW_RIGHT,
  lid: 0,
  irisScale: 1,
  blush: 0,
};

const WIDE = 0.84;

/** The key poses: each is the kit preset of the same name, in pose space. */
export const KEY_POSES: Readonly<Record<Emotion, FacePose>> = {
  happy: { mouth: SMILE, browLeft: RAISED, browRight: RAISED, lid: 0, irisScale: 1, blush: 0 },
  excited: { mouth: GRIN, browLeft: RAISED, browRight: RAISED, lid: 0, irisScale: WIDE, blush: 1 },
  sad: { mouth: FROWN, browLeft: INNER_UP_LEFT, browRight: INNER_UP_RIGHT, lid: 0.5, irisScale: 1, blush: -1 },
  sleepy: { mouth: FLAT, browLeft: LOWERED, browRight: LOWERED, lid: 0.5, irisScale: 1, blush: 0 },
  surprised: { mouth: OPEN, browLeft: RAISED, browRight: RAISED, lid: 0, irisScale: WIDE, blush: 0 },
  upset: { mouth: FLAT, browLeft: LOWERED, browRight: LOWERED, lid: 0, irisScale: 1, blush: -1 },
};

/**
 * Clamp each weight to 0..1 and, when they sum past 1, scale them down so
 * they sum to 1. The result is always a convex combination: no blend of
 * emotions can push the face outside the shapes the key poses span.
 */
export function normalizeWeights(weights: ExpressionWeights | undefined): Record<Emotion, number> {
  const out = {} as Record<Emotion, number>;
  let total = 0;
  for (const emotion of EMOTIONS) {
    const raw = weights?.[emotion];
    const w = typeof raw === 'number' && Number.isFinite(raw) ? clamp01(raw) : 0;
    out[emotion] = w;
    total += w;
  }
  if (total > 1) for (const emotion of EMOTIONS) out[emotion] /= total;
  return out;
}

function blend<T extends object>(neutral: T, rest: number, poses: [T, number][]): T {
  const out = {} as Record<string, number>;
  for (const key of Object.keys(neutral)) {
    let value = (neutral as Record<string, number>)[key] * rest;
    for (const [pose, weight] of poses) value += (pose as Record<string, number>)[key] * weight;
    out[key] = value;
  }
  return out as T;
}

/**
 * Blend the key poses by weight, starting from a neutral face.
 *
 * `neutral` is the resting face of the drawing being made (each stage and
 * view has its own, from its plan); the key poses are shared by all of them.
 * All weights zero returns `neutral` itself.
 */
export function resolveFacePose(weights: ExpressionWeights | undefined, neutral: FacePose = NEUTRAL_POSE): FacePose {
  const w = normalizeWeights(weights);
  const active = EMOTIONS.filter((e) => w[e] > 0);
  if (active.length === 0) return neutral;
  const rest = 1 - active.reduce((sum, e) => sum + w[e], 0);
  const scalar = (pick: (p: FacePose) => number) =>
    pick(neutral) * rest + active.reduce((sum, e) => sum + pick(KEY_POSES[e]) * w[e], 0);
  return {
    mouth: blend(neutral.mouth, rest, active.map((e) => [KEY_POSES[e].mouth, w[e]])),
    browLeft: blend(neutral.browLeft, rest, active.map((e) => [KEY_POSES[e].browLeft, w[e]])),
    browRight: blend(neutral.browRight, rest, active.map((e) => [KEY_POSES[e].browRight, w[e]])),
    lid: scalar((p) => p.lid),
    irisScale: scalar((p) => p.irisScale),
    blush: scalar((p) => p.blush),
  };
}

/**
 * A face stated PART BY PART, each from the kit's closed vocabulary (the
 * same words its V1 and V2 faces take). Every word is one of the shapes the
 * key poses are made of, so a preset spelled out as parts IS that key pose
 * at full weight: `{ eyes: 'open', mouth: 'smile', brows: 'raised', blush:
 * 'soft' }` is `happy`.
 */
export interface FaceParts {
  eyes?: 'open' | 'half' | 'closed' | 'wide';
  mouth?: 'neutral' | 'smile' | 'grin' | 'frown' | 'open' | 'flat';
  brows?: 'neutral' | 'raised' | 'lowered' | 'inner-up';
  blush?: 'none' | 'soft' | 'strong';
}

const PART_MOUTHS = { smile: SMILE, grin: GRIN, frown: FROWN, open: OPEN, flat: FLAT } as const;

/**
 * Set the stated parts of a pose, leaving the rest as they are. `neutral` is
 * the drawing's own resting face: a part asked to be neutral gets exactly
 * that (the same object, so a resting mouth is still recognised as one).
 */
export function applyFaceParts(pose: FacePose, neutral: FacePose, parts: FaceParts | undefined): FacePose {
  if (!parts) return pose;
  const out: FacePose = { ...pose };
  switch (parts.eyes) {
    case 'open':
      out.lid = 0;
      out.irisScale = 1;
      break;
    case 'half':
      out.lid = 0.5;
      out.irisScale = 1;
      break;
    case 'closed':
      out.lid = 1;
      out.irisScale = 1;
      break;
    case 'wide':
      out.lid = 0;
      out.irisScale = WIDE;
      break;
  }
  if (parts.mouth === 'neutral') out.mouth = neutral.mouth;
  else if (parts.mouth && parts.mouth in PART_MOUTHS) out.mouth = PART_MOUTHS[parts.mouth];
  switch (parts.brows) {
    case 'neutral':
      out.browLeft = neutral.browLeft;
      out.browRight = neutral.browRight;
      break;
    case 'raised':
      out.browLeft = out.browRight = RAISED;
      break;
    case 'lowered':
      out.browLeft = out.browRight = LOWERED;
      break;
    case 'inner-up':
      out.browLeft = INNER_UP_LEFT;
      out.browRight = INNER_UP_RIGHT;
      break;
  }
  if (parts.blush === 'none') out.blush = -1;
  else if (parts.blush === 'soft') out.blush = 0;
  else if (parts.blush === 'strong') out.blush = 1;
  return out;
}

/** A resting face from a plan's neutral mouth and brows. */
export function restingPose(mouth: MouthPose, browLeft: BrowPose, browRight: BrowPose): FacePose {
  return { mouth, browLeft, browRight, lid: 0, irisScale: 1, blush: 0 };
}

/** A single emotion at an intensity: `expressionOf('happy', 0.5)`. */
export function expressionOf(emotion: Emotion | 'neutral', intensity = 1): ExpressionWeights {
  return emotion === 'neutral' ? {} : { [emotion]: clamp01(intensity) };
}

/** How much the kit's `strong` blush deepens the authored cheek and its highlight. */
const STRONG_BLUSH = { base: 0.96 / 0.74, highlight: 0.28 / 0.17 } as const;

/**
 * Cheek opacities for a blush level: the stage's resting cheek at 0, hidden
 * at -1, the kit's `strong` at 1. The defaults are the adult's cheek.
 */
export function blushOpacity(blush: number, restBase = 0.74, restHighlight = 0.17): { base: number; highlight: number } {
  const b = blush < -1 ? -1 : blush > 1 ? 1 : blush;
  return b < 0
    ? { base: lerp(restBase, 0, -b), highlight: lerp(restHighlight, 0, -b) }
    : { base: lerp(restBase, Math.min(1, restBase * STRONG_BLUSH.base), b), highlight: lerp(restHighlight, restHighlight * STRONG_BLUSH.highlight, b) };
}

/**
 * The lid for a closure 0..1, in eye radii from the eye's centre.
 *
 * Three key lids, linearly connected: fully open (the lid's edge at the top
 * of the eye), the kit's half lid (a chord 0.09 radii above the centre,
 * sagging 0.3), and the kit's closed eye (a stroke 0.088 below the centre
 * whose ends stop at three quarters of the eye's width, sagging 0.48).
 */
export interface LidShape {
  /** Height of the lid edge's ends, in vertical radii (negative is above the centre). */
  chord: number;
  /** How far below the chord the edge's control point hangs, in vertical radii. */
  sag: number;
  /** Half-length of the edge in horizontal radii; `null` means "ends on the eye's outline". */
  reach: number | null;
  /** Edge stroke width in horizontal radii. */
  lineWidth: number;
  /** Edge opacity: fades in as the lid starts to lower. */
  lineOpacity: number;
  /** Opacity of the kit's flat lid tint over the skin; gone by the time the eye is shut. */
  tint: number;
  /** For closures past half: the lower lid rising to meet the upper one. 0 none, 1 met. */
  lower: number;
}

/** The adult's closed eye: `m cx-58,cy+8 q 58,44 116,0` on a 77 by 91 eye, stroke 17. */
export const ADULT_CLOSED_LID = { chord: 8 / 91, sag: 44 / 91, reach: 58 / 77, lineWidth: 17 / 77 } as const;

export function lidShape(closure: number, closed: { chord: number; sag: number; reach: number; lineWidth: number } = ADULT_CLOSED_LID): LidShape | null {
  const c = clamp01(closure);
  if (c <= 0) return null;
  if (c <= 0.5) {
    const u = c / 0.5;
    return { chord: lerp(-1, -0.09, u), sag: lerp(0, 0.3, u), reach: null, lineWidth: 0.16, lineOpacity: clamp01(c / 0.2), tint: 1, lower: 0 };
  }
  const u = (c - 0.5) / 0.5;
  return {
    chord: lerp(-0.09, closed.chord, u),
    sag: lerp(0.3, closed.sag, u),
    reach: closed.reach,
    lineWidth: lerp(0.16, closed.lineWidth, u),
    lineOpacity: 1,
    tint: 1 - u,
    lower: u,
  };
}
