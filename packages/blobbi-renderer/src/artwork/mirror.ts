/**
 * Horizontal mirroring of a finished SVG string.
 *
 * Used for the V2 profile: the side view is authored once, facing right, and
 * the left-facing profile is the same drawing reflected about the vertical
 * center of its viewBox. Everything inside the `<svg>` (including `<defs>`,
 * which paint nothing and are position-independent for `userSpaceOnUse`
 * gradients once inside the reflected group) is wrapped in one group carrying
 * the reflection; nothing in the artwork is edited.
 *
 * Deterministic, string-only, idempotent in intent (a second call would mirror
 * back; callers apply it at most once per build).
 */

/**
 * Reflect the drawing about `x = viewBoxWidth / 2`.
 *
 * The wrapper is `data-blobbi-mirrored="x"`, so tests and hosts can see that a
 * mirror was applied without inspecting transforms.
 */
export function mirrorSvgHorizontally(svgText: string, viewBoxWidth: number): string {
  const open = /<svg\b[^>]*>/i.exec(svgText);
  const closeIndex = svgText.lastIndexOf('</svg>');
  if (!open || closeIndex === -1) return svgText;

  const openEnd = open.index + open[0].length;
  const inner = svgText.slice(openEnd, closeIndex);
  const w = Number.isFinite(viewBoxWidth) ? viewBoxWidth : 0;

  return (
    svgText.slice(0, openEnd) +
    `<g data-blobbi-mirrored="x" transform="matrix(-1,0,0,1,${w},0)">` +
    inner +
    '</g>' +
    svgText.slice(closeIndex)
  );
}
