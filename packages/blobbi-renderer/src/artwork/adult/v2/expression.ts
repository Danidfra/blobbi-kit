/**
 * Adult V2 EXPRESSIONS: pure transformations of the canonical face.
 *
 * Like `closed-eyes.ts`, every change here is a RULE applied to the one
 * authored drawing, keyed on the `data-part` contract in `parts.ts`. No
 * second drawing exists for any face, so an expression can never drift from
 * the neutral one, and the front and the profile share one vocabulary.
 *
 * What may change, and only this:
 *  - the `mouth` path's `d` (and, for the open mouth, its fill);
 *  - each eyebrow path's `d`;
 *  - each eye group's children: a lid pair on top for `half`, a scaled
 *    wrapper around the inner group for `wide`, the closed-eyes rule for
 *    `closed`;
 *  - the cheek opacities for blush.
 *
 * Every shape is a package constant expressed RELATIVE to the authored
 * geometry (the authored start point and width of the mouth, the authored
 * start point and width of each brow, the eye white's centre and radii), so
 * one rule serves the front (root units) and the profile (about a quarter of
 * the size) and survives the horizontal mirror applied for the left profile.
 * Callers pick states from a closed vocabulary; no geometry crosses in.
 *
 * Order of application: mouth, brows, blush, then eyes. Applied to the RAW
 * authored markup, before colour customisation and id namespacing, so the new
 * elements are recoloured by role (the half lid is filled with the body's mid
 * role colour) and namespaced per instance like everything else.
 *
 * Determinism: same markup, same expression, same string. No clock, no
 * randomness, no DOM. The back view has no face parts and passes through
 * unchanged for every expression.
 */
import type { ResolvedBlobbiExpression, BlobbiMouthState, BlobbiBrowState, BlobbiBlushState } from '../../../expression-model';
import { NEUTRAL_EXPRESSION } from '../../../expression-model';
import { closeAdultV2Eyes } from './closed-eyes';

/** The mouth's authored stroke colour; the open mouth is filled with it. */
const FEATURE_COLOR = '#21102e';
/** The body gradient's mid role colour: the half lid is filled with it so `baseColor` tints the lid. */
const LID_FILL = '#8749ef';

const fmt = (n: number) => String(Math.round(n * 100000) / 100000);

// ─── Mouth ───────────────────────────────────────────────────────────────────

const MOUTH_TAG = /<path\b[^>]*\bdata-part="mouth"[^>]*\/>/;
/** The authored mouth starts with an absolute moveto followed by a relative cubic. */
const MOUTH_D = /\bd="m\s*([-\d.]+),([-\d.]+)\s+c\s+([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)"/;

interface MouthAnchor {
  /** Authored start point (the viewer's left corner on the front, the visible corner on the profile). */
  sx: number;
  sy: number;
  /** Authored horizontal extent, the unit every mouth shape is expressed in. */
  w: number;
  /** Authored control depth, kept for the neutral reference. */
  depth: number;
  /** The profile mouth ends lower than it starts; the front mouth is level. */
  endDy: number;
}

function mouthAnchor(tag: string): MouthAnchor | undefined {
  const m = MOUTH_D.exec(tag);
  if (!m) return undefined;
  const [, sx, sy, , c1y, , , ex, ey] = m.map(Number);
  return { sx, sy, w: ex, depth: c1y, endDy: ey };
}

/** A relative mouth shape: offsets in units of the authored width `w`. */
function mouthPath(state: Exclude<BlobbiMouthState, 'neutral'>, a: MouthAnchor): { d: string; filled: boolean } {
  const { sx, sy, w } = a;
  // The profile mouth slopes down toward its end; the front mouth is level.
  // Keeping that authored slope makes every shape read as the same mouth.
  const slope = a.endDy / w;
  const rel = (dx: number, dy: number) => `${fmt(dx * w)},${fmt(dy * w + slope * dx * w)}`;
  const at = (dx: number, dy: number) => `${fmt(sx + dx * w)},${fmt(sy + dy * w + slope * dx * w)}`;
  switch (state) {
    case 'smile':
      return { d: `m ${at(0, 0)} c ${rel(0.19, 0.52)} ${rel(0.81, 0.52)} ${rel(1, 0)}`, filled: false };
    case 'grin':
      return { d: `m ${at(-0.12, -0.02)} c ${rel(0.25, 0.72)} ${rel(0.99, 0.72)} ${rel(1.24, 0)}`, filled: false };
    case 'frown':
      return { d: `m ${at(0, 0.18)} c ${rel(0.19, -0.34)} ${rel(0.81, -0.34)} ${rel(1, 0)}`, filled: false };
    case 'flat':
      return { d: `m ${at(0.08, 0.1)} l ${rel(0.84, 0)}`, filled: false };
    case 'open': {
      const cx = sx + 0.5 * w;
      const cy = sy + 0.16 * w + slope * 0.5 * w;
      const rx = 0.28 * w;
      const ry = 0.22 * w;
      return {
        d: `M ${fmt(cx - rx)},${fmt(cy)} a ${fmt(rx)},${fmt(ry)} 0 1 0 ${fmt(2 * rx)},0 a ${fmt(rx)},${fmt(ry)} 0 1 0 ${fmt(-2 * rx)},0 z`,
        filled: true,
      };
    }
  }
}

function applyMouth(svg: string, state: BlobbiMouthState): string {
  if (state === 'neutral') return svg;
  return svg.replace(MOUTH_TAG, (tag) => {
    const anchor = mouthAnchor(tag);
    if (!anchor) return tag;
    const { d, filled } = mouthPath(state, anchor);
    let next = tag.replace(MOUTH_D, `d="${d}"`).replace(/\bdata-part="mouth"/, `data-part="mouth" data-blobbi-mouth="${state}"`);
    if (filled) next = next.replace(/\bfill="none"/, `fill="${FEATURE_COLOR}"`);
    return next;
  });
}

// ─── Eyebrows ────────────────────────────────────────────────────────────────

const BROW_TAG = /<path\b[^>]*\bdata-part="(left-eyebrow|right-eyebrow|eyebrow)"[^>]*\/>/g;
/** The authored brow: absolute moveto, one relative quadratic. */
const BROW_D = /\bd="m\s*([-\d.]+),([-\d.]+)\s+q\s+([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)"/;

/**
 * A brow shape relative to its authored start point and width. `inner` says
 * which end faces the nose: the front's left brow and the profile brow end
 * there; the front's right brow starts there.
 */
function browPath(state: Exclude<BlobbiBrowState, 'neutral'>, sx: number, sy: number, w: number, inner: 'start' | 'end'): string {
  const at = (dy: number) => `${fmt(sx)},${fmt(sy + dy * w)}`;
  const q = (cy: number, ey: number) => `q ${fmt(0.5 * w)},${fmt(cy * w)} ${fmt(w)},${fmt(ey * w)}`;
  switch (state) {
    case 'raised':
      return `m ${at(-0.16)} ${q(-0.36, 0)}`;
    case 'lowered':
      return `m ${at(0.12)} ${q(-0.1, 0.02)}`;
    case 'inner-up':
      return inner === 'end' ? `m ${at(0.05)} ${q(-0.2, -0.22)}` : `m ${at(-0.17)} ${q(-0.02, 0.22)}`;
  }
}

function applyBrows(svg: string, state: BlobbiBrowState): string {
  if (state === 'neutral') return svg;
  return svg.replace(BROW_TAG, (tag, part: string) => {
    const m = BROW_D.exec(tag);
    if (!m) return tag;
    const [, sx, sy, , , ex] = m.map(Number);
    const inner = part === 'right-eyebrow' ? 'start' : 'end';
    return tag
      .replace(BROW_D, `d="${browPath(state, sx, sy, ex, inner)}"`)
      .replace(/\bdata-part="([^"]+)"/, `data-part="$1" data-blobbi-brows="${state}"`);
  });
}

// ─── Blush ───────────────────────────────────────────────────────────────────

const CHEEK_BASE_TAG = /<ellipse\b[^>]*\bdata-part="(?:left-cheek-base|right-cheek-base|cheek)"[^>]*\/>/g;
const CHEEK_HIGHLIGHT_TAG = /<ellipse\b[^>]*\bdata-part="(?:left-cheek-highlight|right-cheek-highlight|cheek-highlight)"[^>]*\/>/g;

const BLUSH_OPACITY: Record<Exclude<BlobbiBlushState, 'soft'>, { base: string; highlight: string }> = {
  none: { base: '0', highlight: '0' },
  strong: { base: '0.96', highlight: '0.28' },
};

function applyBlush(svg: string, state: BlobbiBlushState): string {
  if (state === 'soft') return svg;
  const { base, highlight } = BLUSH_OPACITY[state];
  const setOpacity = (tag: string, value: string) =>
    tag.replace(/\bopacity="[^"]*"/, `opacity="${value}"`).replace(/\bdata-part="([^"]+)"/, `data-part="$1" data-blobbi-blush="${state}"`);
  return svg
    .replace(CHEEK_BASE_TAG, (tag) => setOpacity(tag, base))
    .replace(CHEEK_HIGHLIGHT_TAG, (tag) => setOpacity(tag, highlight));
}

// ─── Eyes ────────────────────────────────────────────────────────────────────

const EYE_GROUP_OPEN_TAG = /<g\b[^>]*\bdata-part="(left-eye|right-eye|eye)"[^>]*>/g;
const EYE_WHITE = /<ellipse\b[^>]*\bdata-part="(?:left-|right-)?eye-white"[^>]*\bcx="([^"]+)"[^>]*\bcy="([^"]+)"[^>]*\brx="([^"]+)"[^>]*\bry="([^"]+)"/;
const EYE_INNER_OPEN_TAG = /<g\b[^>]*\bdata-part="(?:left-|right-)?eye-inner"[^>]*>/;

/** Index just past the `</g>` closing the group whose open tag ends at `from`; -1 if unbalanced. */
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

/** Half-closed: the upper part of the eye white is covered by a lid in the body colour, with a lid edge. */
function halfLid(eyePart: string, cx: number, cy: number, rx: number, ry: number, indent: string): string {
  const chordY = cy - 0.09 * ry;
  const half = rx * Math.sqrt(Math.max(0, 1 - ((chordY - cy) / ry) ** 2));
  const left = `${fmt(cx - half)},${fmt(chordY)}`;
  const right = `${fmt(cx + half)},${fmt(chordY)}`;
  const sag = fmt(chordY + 0.3 * ry);
  const lid = `${indent}<path id="${eyePart}-lid" data-part="${eyePart}-lid" d="M ${left} A ${fmt(rx)},${fmt(ry)} 0 0 1 ${right} Q ${fmt(cx)},${sag} ${left} z" fill="${LID_FILL}" />`;
  const edge = `${indent}<path id="${eyePart}-lid-edge" data-part="${eyePart}-lid-edge" d="M ${left} Q ${fmt(cx)},${sag} ${right}" fill="none" stroke="${FEATURE_COLOR}" stroke-width="${fmt(0.16 * rx)}" stroke-linecap="round" />`;
  return lid + edge;
}

/** How much the inner eye shrinks for `wide` (more white shows around the iris). */
const WIDE_SCALE = 0.84;

function applyEyes(svg: string, state: ResolvedBlobbiExpression['eyes']): string {
  if (state === 'open') return svg;
  if (state === 'closed') return closeAdultV2Eyes(svg);

  let out = '';
  let cursor = 0;
  EYE_GROUP_OPEN_TAG.lastIndex = 0;
  for (let m = EYE_GROUP_OPEN_TAG.exec(svg); m; m = EYE_GROUP_OPEN_TAG.exec(svg)) {
    const openStart = m.index;
    const openEnd = openStart + m[0].length;
    const groupEnd = closingGroupEnd(svg, openEnd);
    if (groupEnd === -1) break;
    let children = svg.slice(openEnd, groupEnd - '</g>'.length);
    const white = EYE_WHITE.exec(children);
    if (!white) {
      EYE_GROUP_OPEN_TAG.lastIndex = groupEnd;
      continue;
    }
    const [cx, cy, rx, ry] = white.slice(1, 5).map(Number);
    const eyePart = m[1];
    const indent = /^\s*/.exec(children)?.[0] ?? '';
    const trailing = /\s*$/.exec(children)?.[0] ?? '';

    if (state === 'half') {
      children = children.replace(/\s*$/, '') + halfLid(eyePart, cx, cy, rx, ry, indent) + trailing;
    } else {
      // wide: wrap the inner group's children in a scaled group about the
      // eye white's centre. The wrapper sits INSIDE the movable inner group,
      // so gaze (a CSS transform on the inner group) is unaffected.
      const innerOpen = EYE_INNER_OPEN_TAG.exec(children);
      if (innerOpen) {
        const innerStart = innerOpen.index + innerOpen[0].length;
        const innerEnd = closingGroupEnd(children, innerStart);
        if (innerEnd !== -1) {
          const innerChildren = children.slice(innerStart, innerEnd - '</g>'.length);
          const tx = fmt((1 - WIDE_SCALE) * cx);
          const ty = fmt((1 - WIDE_SCALE) * cy);
          const wrapped =
            `<g id="${eyePart}-scale" data-part="${eyePart}-scale" transform="matrix(${WIDE_SCALE},0,0,${WIDE_SCALE},${tx},${ty})">` +
            innerChildren +
            '</g>';
          children = children.slice(0, innerStart) + wrapped + children.slice(innerEnd - '</g>'.length);
        }
      }
    }

    out += svg.slice(cursor, openStart) + m[0].replace(/>$/, ` data-blobbi-eyes="${state}">`) + children + '</g>';
    cursor = groupEnd;
    EYE_GROUP_OPEN_TAG.lastIndex = groupEnd;
  }
  if (cursor === 0) return svg;
  return out + svg.slice(cursor);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Apply an expression to a V2 drawing. Pure string → string.
 *
 * `eyesClosed` (sleeping) wins over the expression's eye state: a sleeping
 * Blobbi has its eyes shut whatever face it was asked to make; mouth, brows
 * and blush still apply, so a sleeping happy Blobbi smiles in its sleep.
 * The neutral expression with open eyes returns the input string itself.
 */
export function applyAdultV2Expression(
  svgText: string,
  expression: ResolvedBlobbiExpression = NEUTRAL_EXPRESSION,
  eyesClosed = false,
): string {
  const eyes = eyesClosed ? 'closed' : expression.eyes;
  let svg = svgText;
  svg = applyMouth(svg, expression.mouth);
  svg = applyBrows(svg, expression.brows);
  svg = applyBlush(svg, expression.blush);
  svg = applyEyes(svg, eyes);
  return svg;
}
