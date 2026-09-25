/**
 * Baby V1 EXPRESSIONS: pure transformations of the one authored baby face.
 *
 * The baby is a single hand-drawn SVG (`baby-svg-data.ts`) with no
 * `data-part` markers: two eye whites (ellipses), two pupils with a
 * highlight each (circles), one mouth (a quadratic path) and two blush
 * ellipses, each in a comment-labelled block. Rather than a second drawing
 * per emotion, every expression here is a RULE applied to those exact
 * authored tags, matched by their authored geometry:
 *
 *   mouth   the path's `d` is replaced per state (`smile`, `grin`,
 *           `frown`, `flat`), or the path becomes a small filled ellipse
 *           (`open`); every shape is expressed around the authored mouth
 *           centre (50, 62) and width (16)
 *   eyes    `half`: a lid, filled with the body gradient so `baseColor`
 *           tints it, is drawn over the top of each eye in its own block
 *           AFTER the pupils block (so the pupils block, which gaze marks,
 *           is untouched and still moves under the lid); `wide`: the whites
 *           and pupils grow a little; `closed` is never drawn here: closed
 *           eyes are the sleeping drawing, which the registry selects
 *   blush   `none` fades the two ellipses out; `strong` deepens and
 *           enlarges them
 *   brows   the baby has no authored brows, so the brow state is not drawn:
 *           sadness reads through the half-lids and the frown, upset through
 *           the flat mouth and the missing blush (documented limitation)
 *
 * The neutral expression is the identity: the string comes back unchanged,
 * which is what keeps the V1 fingerprints intact. Deterministic: same
 * markup, same expression, same string; no clock, no randomness, no DOM.
 * Applied to the RAW authored markup, before colour customisation and id
 * namespacing, so the lid takes the body colour and every id is namespaced
 * like the rest.
 */
import type { ResolvedBlobbiExpression, BlobbiMouthState } from '../../../expression-model';
import { NEUTRAL_EXPRESSION } from '../../../expression-model';

/** The parts an expression may touch, as the `data-part` values it stamps on them. */
export const BABY_V1_EXPRESSION_PARTS = ['mouth', 'left-eyelid', 'right-eyelid', 'left-eye', 'right-eye', 'left-pupil', 'right-pupil', 'left-cheek', 'right-cheek'] as const;

// The authored geometry, matched exactly (see baby-svg-data.ts).
const MOUTH_TAG = /<path d="M 42 62 Q 50 68 58 62"([^>]*)\/>/;
const LEFT_EYE = /<ellipse cx="38" cy="45" rx="8" ry="10" fill="url\(#blobbiEyeGradient\)" \/>/;
const RIGHT_EYE = /<ellipse cx="62" cy="45" rx="8" ry="10" fill="url\(#blobbiEyeGradient\)" \/>/;
const LEFT_PUPIL = /<circle cx="38" cy="46" r="6" fill="url\(#blobbiPupilGradient\)" \/>/;
const RIGHT_PUPIL = /<circle cx="62" cy="46" r="6" fill="url\(#blobbiPupilGradient\)" \/>/;
const LEFT_CHEEK = /<ellipse cx="22" cy="55" rx="6" ry="4" fill="rgba\(255,182,193,0\.5\)" \/>/;
const RIGHT_CHEEK = /<ellipse cx="78" cy="55" rx="6" ry="4" fill="rgba\(255,182,193,0\.5\)" \/>/;
const MOUTH_COMMENT = '<!-- Mouth -->';

const MOUTH_D: Record<Exclude<BlobbiMouthState, 'neutral' | 'open'>, string> = {
  smile: 'M 42 61 Q 50 70.5 58 61',
  grin: 'M 40 60 Q 50 73 60 60',
  frown: 'M 42 66 Q 50 60 58 66',
  // Not a straight line: the mouth's stroke is an objectBoundingBox gradient,
  // and a path with a zero-height box does not render at all.
  flat: 'M 43 64 Q 50 65.4 57 64',
};

function applyMouth(svg: string, state: BlobbiMouthState): string {
  if (state === 'neutral') return svg;
  return svg.replace(MOUTH_TAG, (_tag, rest: string) => {
    if (state === 'open') return `<ellipse cx="50" cy="65" rx="4.5" ry="3.6" fill="url(#blobbiMouthGradient)" data-part="mouth" data-blobbi-mouth="open" />`;
    const attrs = (state === 'grin' ? rest.replace(/stroke-width="2\.5"/, 'stroke-width="3"') : rest).trim();
    return `<path d="${MOUTH_D[state]}" ${attrs} data-part="mouth" data-blobbi-mouth="${state}" />`;
  });
}

/**
 * The half-lid: the upper half of each eye white (an elliptical arc from
 * one side of the eye at its centre line, y=45, over the top and back), closed
 * along the chord and filled with the body gradient so it reads as skin.
 * Inserted as its own comment block right before the mouth block, after the
 * pupils, so it covers the top of the pupil too.
 */
const LIDS =
  `<!-- Eyelids (expression) -->\n` +
  `  <path d="M 30 45 A 8 10 0 0 1 46 45 Z" fill="url(#blobbiBodyGradient)" data-part="left-eyelid" data-blobbi-eyes="half" />\n` +
  `  <path d="M 54 45 A 8 10 0 0 1 70 45 Z" fill="url(#blobbiBodyGradient)" data-part="right-eyelid" data-blobbi-eyes="half" />\n  \n  `;

function applyEyes(svg: string, state: ResolvedBlobbiExpression['eyes']): string {
  switch (state) {
    case 'half':
      return svg.includes(MOUTH_COMMENT) ? svg.replace(MOUTH_COMMENT, LIDS + MOUTH_COMMENT) : svg;
    case 'wide':
      return svg
        .replace(LEFT_EYE, '<ellipse cx="38" cy="45" rx="9" ry="11.2" fill="url(#blobbiEyeGradient)" data-part="left-eye" data-blobbi-eyes="wide" />')
        .replace(RIGHT_EYE, '<ellipse cx="62" cy="45" rx="9" ry="11.2" fill="url(#blobbiEyeGradient)" data-part="right-eye" data-blobbi-eyes="wide" />')
        .replace(LEFT_PUPIL, '<circle cx="38" cy="46" r="6.6" fill="url(#blobbiPupilGradient)" data-part="left-pupil" />')
        .replace(RIGHT_PUPIL, '<circle cx="62" cy="46" r="6.6" fill="url(#blobbiPupilGradient)" data-part="right-pupil" />');
    default:
      // `open` is the authored eye; `closed` is the sleeping drawing, chosen by the registry, never drawn here.
      return svg;
  }
}

function applyBlush(svg: string, state: ResolvedBlobbiExpression['blush']): string {
  if (state === 'soft') return svg;
  const left = state === 'none' ? '<ellipse cx="22" cy="55" rx="6" ry="4" fill="rgba(255,182,193,0)" data-part="left-cheek" data-blobbi-blush="none" />' : '<ellipse cx="22" cy="55" rx="7" ry="5" fill="rgba(255,150,170,0.85)" data-part="left-cheek" data-blobbi-blush="strong" />';
  const right = state === 'none' ? '<ellipse cx="78" cy="55" rx="6" ry="4" fill="rgba(255,182,193,0)" data-part="right-cheek" data-blobbi-blush="none" />' : '<ellipse cx="78" cy="55" rx="7" ry="5" fill="rgba(255,150,170,0.85)" data-part="right-cheek" data-blobbi-blush="strong" />';
  return svg.replace(LEFT_CHEEK, left).replace(RIGHT_CHEEK, right);
}

/**
 * Apply a resolved expression to the authored baby front. Neutral is the
 * identity. Order: mouth, blush, eyes (the lids go in last, over the pupils).
 */
export function applyBabyV1Expression(svgText: string, expression: ResolvedBlobbiExpression = NEUTRAL_EXPRESSION): string {
  if (expression === NEUTRAL_EXPRESSION || (expression.mouth === 'neutral' && expression.eyes === 'open' && expression.blush === 'soft')) return svgText;
  let out = svgText;
  out = applyMouth(out, expression.mouth);
  out = applyBlush(out, expression.blush);
  out = applyEyes(out, expression.eyes);
  return out;
}
