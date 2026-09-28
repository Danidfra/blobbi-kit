/**
 * The baked ground shadow of the Adult V2 artwork, and who draws one.
 *
 * The V2 drawings carry an `ellipse` with `data-part="ground-shadow"`: a
 * blurred pool on the floor under the creature. That is an ENVIRONMENTAL
 * element, not the creature: the floor, its depth, the bed the creature
 * lies in, whether it is airborne and how the room is lit are all things a
 * host world knows and this package does not. A host that draws its own
 * ground shadow (every host that moves a Blobbi through a world does)
 * showed two under a V2 adult, one of them moving with the body.
 *
 * So the renderer draws the creature only: `groundShadow: 'none'` is the
 * default and removes exactly that one element. `'artwork'` keeps it, for a
 * host that has no ground of its own and wants the drawing as authored. The
 * body's contact shading (`body-shadow`, the foot shadows) is part of the
 * creature and is never touched. V1 artwork has no ground shadow either way.
 */
export type BlobbiGroundShadow = 'none' | 'artwork';
export const BLOBBI_GROUND_SHADOWS: readonly BlobbiGroundShadow[] = ['none', 'artwork'];

/** The part name the V2 artwork gives its baked ground shadow. */
export const GROUND_SHADOW_PART = 'ground-shadow';

const GROUND_SHADOW_ELEMENT = /<(?:ellipse|path|circle|rect)\b[^>]*\bdata-part="ground-shadow"[^>]*\/>\s*/g;

export function normalizeBlobbiGroundShadow(input: unknown): BlobbiGroundShadow {
  return input === 'artwork' ? 'artwork' : 'none';
}

/** Whether this markup still carries the baked ground shadow. */
export function hasGroundShadow(svgText: string): boolean {
  GROUND_SHADOW_ELEMENT.lastIndex = 0;
  return GROUND_SHADOW_ELEMENT.test(svgText);
}

/**
 * Remove the artwork's ground shadow element and nothing else. Pure and
 * idempotent; markup without one is returned as the same string, so V1
 * drawings never change.
 */
export function removeGroundShadow(svgText: string): string {
  if (!hasGroundShadow(svgText)) return svgText;
  return svgText.replace(GROUND_SHADOW_ELEMENT, '');
}
