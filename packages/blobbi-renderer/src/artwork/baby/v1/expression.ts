/**
 * Baby V1 EXPRESSIONS: pure transformations of the one authored baby face.
 *
 * The baby is a single hand-drawn SVG (`baby-svg-data.ts`) with no
 * `data-part` markers: two eye whites (ellipses), two pupils with a
 * highlight each (circles), one mouth (a quadratic path) and two blush
 * ellipses, each in a comment-labelled block. Rather than a second drawing
 * per emotion, every expression here is a RULE applied to those exact
 * authored tags, matched by their authored geometry. The rule runs on the
 * COLOURED drawing (after `customizeBabySvg`, so gradient ids may carry an
 * instance prefix and the body colours are the final ones):
 *
 *   mouth   the path's `d` is replaced per state: each shape keeps the
 *           authored width (16 units, a little more for a grin), stroke
 *           and caps, and moves its ends and its bend by a few units, so
 *           a happy mouth is the authored smile deepened, not a new mouth;
 *           `open` becomes a small filled ellipse in the mouth's colour
 *   eyes    `half` draws a LID over the upper part of each eye: the eye
 *           white cut along a chord, filled with a solid skin colour taken
 *           from the body gradient, with a lid LINE along the chord in the
 *           mouth's colour (the same stroke the authored sleeping eyes
 *           use). The lids go in their own block after the pupils block,
 *           so gaze still moves the pupils under them. The fill is a SOLID
 *           colour on purpose: a gradient fill in objectBoundingBox units
 *           re-centres on each lid and paints a white highlight on it.
 *           `wide` grows the whites and pupils a little. `closed` is never
 *           drawn here: closed eyes are the sleeping drawing, which the
 *           registry selects.
 *   brows   the baby has no authored brows, so a brow state is drawn as the
 *           SLANT of the lids: `inner-up` droops the outer corners (sad),
 *           `lowered` with half eyes makes heavy level lids (sleepy), and
 *           `lowered` with open eyes draws a thin lid slanting down toward
 *           the centre (upset). `raised` and `neutral` draw nothing.
 *   blush   `none` fades the two ellipses out; `strong` deepens and
 *           enlarges them
 *
 * The neutral expression is the identity: the string comes back unchanged,
 * which is what keeps the V1 fingerprints intact. Deterministic: same
 * markup, same expression, same string; no clock, no randomness, no DOM.
 */
import type { ResolvedBlobbiExpression, BlobbiMouthState, BlobbiEyeState, BlobbiBrowState } from '../../../expression-model';
import { NEUTRAL_EXPRESSION } from '../../../expression-model';

/** The parts an expression may touch, as the `data-part` values it stamps on them. */
export const BABY_V1_EXPRESSION_PARTS = [
  'mouth',
  'left-eyelid', 'right-eyelid', 'left-eyelid-line', 'right-eyelid-line',
  'left-eye', 'right-eye', 'left-pupil', 'right-pupil',
  'left-cheek', 'right-cheek',
] as const;

// The authored geometry, matched exactly; gradient ids may be namespaced.
const ref = (gradient: string) => `url\\(#[^)]*${gradient}\\)`;
const MOUTH_TAG = /<path d="M 42 62 Q 50 68 58 62"([^>]*)\/>/;
const MOUTH_STROKE = new RegExp(`stroke="(${ref('blobbiMouthGradient')})"`);
const LEFT_EYE = new RegExp(`<ellipse cx="38" cy="45" rx="8" ry="10" fill="(${ref('blobbiEyeGradient')})" />`);
const RIGHT_EYE = new RegExp(`<ellipse cx="62" cy="45" rx="8" ry="10" fill="(${ref('blobbiEyeGradient')})" />`);
const LEFT_PUPIL = new RegExp(`<circle cx="38" cy="46" r="6" fill="(${ref('blobbiPupilGradient')})" />`);
const RIGHT_PUPIL = new RegExp(`<circle cx="62" cy="46" r="6" fill="(${ref('blobbiPupilGradient')})" />`);
const LEFT_CHEEK = /<ellipse cx="22" cy="55" rx="6" ry="4" fill="rgba\(255,182,193,0\.5\)" \/>/;
const RIGHT_CHEEK = /<ellipse cx="78" cy="55" rx="6" ry="4" fill="rgba\(255,182,193,0\.5\)" \/>/;
const BODY_GRADIENT = /<radialGradient[^>]*id="[^"]*blobbiBodyGradient"[^>]*>([\s\S]*?)<\/radialGradient>/;
const STOP_COLOR = /stop-color:\s*(#[0-9a-fA-F]{3,8})/g;
const MOUTH_COMMENT = '<!-- Mouth -->';
/** The authored 60% body stop, for markup whose gradient cannot be read. */
const FALLBACK_SKIN = '#7c3aed';

// ─── Mouth ───────────────────────────────────────────────────────────────────

/**
 * Each shape is the authored mouth (`M 42 62 Q 50 68 58 62`: 16 wide, ends
 * at 62, bend to 68) with its ends and bend moved a few units.
 */
const MOUTH_D: Record<Exclude<BlobbiMouthState, 'neutral' | 'open'>, string> = {
  smile: 'M 41 61 Q 50 69 59 61',
  grin: 'M 40 60 Q 50 71.5 60 60',
  frown: 'M 43 65.5 Q 50 61 57 65.5',
  // A slight downturn, not a straight line: a straight line has a
  // zero-height box and its objectBoundingBox gradient stroke draws nothing.
  flat: 'M 43 64.2 Q 50 63 57 64.2',
};

function applyMouth(svg: string, state: BlobbiMouthState): string {
  if (state === 'neutral') return svg;
  return svg.replace(MOUTH_TAG, (_tag, rest: string) => {
    if (state === 'open') {
      const fill = MOUTH_STROKE.exec(rest)?.[1] ?? '#1e293b';
      return `<ellipse cx="50" cy="65" rx="3.8" ry="3.2" fill="${fill}" data-part="mouth" data-blobbi-mouth="open" />`;
    }
    return `<path d="${MOUTH_D[state]}" ${rest.trim()} data-part="mouth" data-blobbi-mouth="${state}" />`;
  });
}

// ─── Eyes and lids ───────────────────────────────────────────────────────────

const EYE = { rx: 8, ry: 10, cy: 45 } as const;
const EYES = [
  { side: 'left', cx: 38 },
  { side: 'right', cx: 62 },
] as const;

interface LidShape {
  /** Where the lid's edge meets the eye on the outer side (toward the temple) and the inner side (toward the centre). */
  outerY: number;
  innerY: number;
  /** How far the edge bows down at its middle. */
  bulge: number;
}

/** The lid for an eye and brow state, or null when the eye is fully open. */
function lidFor(eyes: BlobbiEyeState, brows: BlobbiBrowState): LidShape | null {
  if (eyes === 'half') {
    if (brows === 'inner-up') return { outerY: 47, innerY: 42.5, bulge: 1 };
    if (brows === 'lowered') return { outerY: 46.5, innerY: 46.5, bulge: 1.5 };
    return { outerY: 45, innerY: 45, bulge: 1.5 };
  }
  if (eyes === 'open' && brows === 'lowered') return { outerY: 40, innerY: 45.5, bulge: 0.6 };
  return null;
}

const num = (n: number) => String(Number(n.toFixed(2)));
/** Half the eye white's width at height `y`. */
const halfWidth = (y: number) => EYE.rx * Math.sqrt(Math.max(0, 1 - ((y - EYE.cy) / EYE.ry) ** 2));

/**
 * The lid as a closed path: the eye's top arc from the left meeting point to
 * the right one, back along a shallow curve. `A` goes over the top (sweep 1
 * is clockwise in SVG's y-down space) and takes the major arc when the
 * eye's centre lies above the chord.
 */
function lidPaths(cx: number, side: 'left' | 'right', lid: LidShape): { region: string; line: string } {
  const leftY = side === 'left' ? lid.outerY : lid.innerY;
  const rightY = side === 'left' ? lid.innerY : lid.outerY;
  const lx = cx - halfWidth(leftY);
  const rx = cx + halfWidth(rightY);
  const mx = (lx + rx) / 2;
  const my = (leftY + rightY) / 2 + lid.bulge;
  const chordYAtCenter = leftY + ((rightY - leftY) * (cx - lx)) / (rx - lx);
  const largeArc = EYE.cy < chordYAtCenter ? 1 : 0;
  const edge = `Q ${num(mx)} ${num(my)} `;
  return {
    region: `M ${num(lx)} ${num(leftY)} A ${EYE.rx} ${EYE.ry} 0 ${largeArc} 1 ${num(rx)} ${num(rightY)} ${edge}${num(lx)} ${num(leftY)} Z`,
    line: `M ${num(lx)} ${num(leftY)} ${edge}${num(rx)} ${num(rightY)}`,
  };
}

/** The lid colour: the body gradient's middle stop, so the lid reads as skin whatever the Blobbi's colour. */
function skinColor(svg: string): string {
  const stops = [...(BODY_GRADIENT.exec(svg)?.[1] ?? '').matchAll(STOP_COLOR)].map((m) => m[1]);
  return stops[1] ?? stops[stops.length - 1] ?? FALLBACK_SKIN;
}

function applyLids(svg: string, expression: ResolvedBlobbiExpression): string {
  const lid = lidFor(expression.eyes, expression.brows);
  if (!lid || !svg.includes(MOUTH_COMMENT)) return svg;
  const skin = skinColor(svg);
  const stroke = MOUTH_STROKE.exec(svg)?.[1] ?? '#1e293b';
  const marks = `data-blobbi-eyes="${expression.eyes}" data-blobbi-brows="${expression.brows}"`;
  const lids = EYES.map(({ side, cx }) => {
    const { region, line } = lidPaths(cx, side, lid);
    return (
      `  <path d="${region}" fill="${skin}" data-part="${side}-eyelid" ${marks} />\n` +
      `  <path d="${line}" stroke="${stroke}" stroke-width="2" fill="none" stroke-linecap="round" data-part="${side}-eyelid-line" ${marks} />\n`
    );
  }).join('');
  return svg.replace(MOUTH_COMMENT, `<!-- Eyelids (expression) -->\n${lids}  \n  ${MOUTH_COMMENT}`);
}

function applyWideEyes(svg: string): string {
  return svg
    .replace(LEFT_EYE, (_t, fill: string) => `<ellipse cx="38" cy="45" rx="9" ry="11.2" fill="${fill}" data-part="left-eye" data-blobbi-eyes="wide" />`)
    .replace(RIGHT_EYE, (_t, fill: string) => `<ellipse cx="62" cy="45" rx="9" ry="11.2" fill="${fill}" data-part="right-eye" data-blobbi-eyes="wide" />`)
    .replace(LEFT_PUPIL, (_t, fill: string) => `<circle cx="38" cy="46" r="6.6" fill="${fill}" data-part="left-pupil" />`)
    .replace(RIGHT_PUPIL, (_t, fill: string) => `<circle cx="62" cy="46" r="6.6" fill="${fill}" data-part="right-pupil" />`);
}

// ─── Blush ───────────────────────────────────────────────────────────────────

function applyBlush(svg: string, state: ResolvedBlobbiExpression['blush']): string {
  if (state === 'soft') return svg;
  const cheek = (side: 'left' | 'right', cx: number) =>
    state === 'none'
      ? `<ellipse cx="${cx}" cy="55" rx="6" ry="4" fill="rgba(255,182,193,0)" data-part="${side}-cheek" data-blobbi-blush="none" />`
      : `<ellipse cx="${cx}" cy="55" rx="7" ry="5" fill="rgba(255,150,170,0.75)" data-part="${side}-cheek" data-blobbi-blush="strong" />`;
  return svg.replace(LEFT_CHEEK, cheek('left', 22)).replace(RIGHT_CHEEK, cheek('right', 78));
}

// ─── The rule ────────────────────────────────────────────────────────────────

/** Whether an expression changes the baby face at all (a `raised` or `neutral` brow on open eyes adds nothing). */
function isNeutralOnBaby(e: ResolvedBlobbiExpression): boolean {
  return e.mouth === 'neutral' && e.blush === 'soft' && e.eyes !== 'half' && e.eyes !== 'wide' && !(e.eyes === 'open' && e.brows === 'lowered');
}

/**
 * Apply a resolved expression to the coloured baby front. Neutral is the
 * identity. Order: mouth, blush, wide eyes, lids (the lids go in last, over
 * the pupils).
 */
export function applyBabyV1Expression(svgText: string, expression: ResolvedBlobbiExpression = NEUTRAL_EXPRESSION): string {
  if (expression === NEUTRAL_EXPRESSION || isNeutralOnBaby(expression)) return svgText;
  let out = svgText;
  out = applyMouth(out, expression.mouth);
  out = applyBlush(out, expression.blush);
  if (expression.eyes === 'wide') out = applyWideEyes(out);
  out = applyLids(out, expression);
  return out;
}
