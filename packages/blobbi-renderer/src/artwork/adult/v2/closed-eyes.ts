/**
 * Adult V2 CLOSED EYES: a pure transformation of the awake artwork.
 *
 * V1 ships a separately drawn sleeping SVG per form. V2 does not: it is one
 * anatomy with semantic parts, so "eyes closed" is a RULE applied to the
 * canonical drawing rather than a second drawing that could drift from it.
 * Every colour, gradient, limb, tuft, eyebrow, cheek and the mouth stay
 * byte-identical; only the eye groups change.
 *
 * The rule, per eye group (`data-part="left-eye"`, `"right-eye"` on the front,
 * `"eye"` on the profile):
 *  - the group element itself is kept, with its authored transform, so the lid
 *    sits exactly where the eye was;
 *  - its children (the eye white and the movable `*-eye-inner` group with iris,
 *    pupil and highlights) are REMOVED, not hidden: nothing of the open eye
 *    survives in the output, so no gaze rule can find a pupil to move;
 *  - one closed-lid stroke is drawn in their place: a shallow downward arc
 *    across the lower half of where the eye white was, in the mouth's stroke
 *    colour (`#21102e`, a facial feature colour, deliberately not a trait role
 *    so `baseColor` never tints the lids), round-capped, at a stroke weight
 *    proportionate to the mouth.
 *
 * The stroke is expressed in the eye group's LOCAL coordinates (the eye white
 * is the same 77x91 ellipse in every view), so one path shape serves the front
 * and the profile, and the mirrored left profile needs nothing extra.
 *
 * The back view has no eye group and passes through unchanged (same string).
 * Determinism: same input, same output; no clock, no randomness, no DOM.
 */

/** The mouth's authored stroke colour: the one dark facial line V2 already has. */
const LID_STROKE = '#21102e';
/** Eye-local stroke weight; ×0.6988 (front) is 11.9 root units next to the 14.07 mouth. */
const LID_STROKE_WIDTH = '17';

/**
 * Eye-local lid geometry relative to the eye white's centre `(cx, cy)`:
 * endpoints at `cx ± 58` (three quarters of the 77 radius), 8 units below the
 * centre, curving down 22 units at the apex (quadratic control at +44).
 */
function lidPath(cx: number, cy: number): string {
  return `m ${fmt(cx - 58)},${fmt(cy + 8)} q 58,44 116,0`;
}
const fmt = (n: number) => String(Math.round(n * 100000) / 100000);

/** A closed-eye part name for an eye group part name: `left-eye` → `left-eye-closed`. */
export function closedEyePartFor(eyePart: string): string {
  return `${eyePart}-closed`;
}

const EYE_GROUP_OPEN_TAG = /<g\b[^>]*\bdata-part="(left-eye|right-eye|eye)"[^>]*>/g;
const EYE_WHITE_CENTER = /<ellipse\b[^>]*\bdata-part="(?:left-|right-)?eye-white"[^>]*\bcx="([^"]+)"[^>]*\bcy="([^"]+)"/;

/**
 * Find the index just past the `</g>` that closes the group whose open tag ends
 * at `from`, counting nested groups. Returns -1 when the markup is unbalanced.
 */
function closingGroupEnd(svg: string, from: number): number {
  const tag = /<g\b|<\/g>/g;
  tag.lastIndex = from;
  let depth = 1;
  for (let m = tag.exec(svg); m; m = tag.exec(svg)) {
    depth += m[0] === '<g' ? 1 : -1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/**
 * Close every eye in a V2 drawing. Pure string → string.
 *
 * Applied to the RAW authored markup (before colour customisation and id
 * namespacing), so the lid's `id` is namespaced per instance like every other
 * element and the transform never has to know about instance prefixes.
 */
export function closeAdultV2Eyes(svgText: string): string {
  let out = '';
  let cursor = 0;
  EYE_GROUP_OPEN_TAG.lastIndex = 0;
  for (let m = EYE_GROUP_OPEN_TAG.exec(svgText); m; m = EYE_GROUP_OPEN_TAG.exec(svgText)) {
    const openStart = m.index;
    const openEnd = openStart + m[0].length;
    const groupEnd = closingGroupEnd(svgText, openEnd);
    if (groupEnd === -1) break;
    const children = svgText.slice(openEnd, groupEnd - '</g>'.length);
    const centre = EYE_WHITE_CENTER.exec(children);
    if (!centre) {
      // No eye white to close over: leave this group exactly as authored.
      EYE_GROUP_OPEN_TAG.lastIndex = groupEnd;
      continue;
    }
    const eyePart = m[1];
    const part = closedEyePartFor(eyePart);
    const cx = Number(centre[1]);
    const cy = Number(centre[2]);
    // Preserve the children's indentation so the output stays readable.
    const indent = /^\s*/.exec(children)?.[0] ?? '';
    const lid =
      `${indent}<path id="${part}" data-part="${part}" d="${lidPath(cx, cy)}" ` +
      `fill="none" stroke="${LID_STROKE}" stroke-width="${LID_STROKE_WIDTH}" stroke-linecap="round" />` +
      (/\s*$/.exec(children)?.[0] ?? '');
    out += svgText.slice(cursor, openStart) + m[0].replace(/>$/, ' data-blobbi-eyes="closed">') + lid + '</g>';
    cursor = groupEnd;
    EYE_GROUP_OPEN_TAG.lastIndex = groupEnd;
  }
  if (cursor === 0) return svgText; // nothing to close: identity, same string
  return out + svgText.slice(cursor);
}
