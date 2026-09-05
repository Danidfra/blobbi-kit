/**
 * Adult V2 color customization.
 *
 * V2 is ONE anatomy, so it needs one customizer instead of sixteen. The
 * authored artwork paints every part from a small set of literal colors, and
 * each literal plays exactly one ROLE; customization replaces roles, not
 * elements, so the same rule holds for the front, side and back views and for
 * any view added later that uses the same palette.
 *
 * Role -> trait mapping (the authored purple is the reference):
 *
 * | role                      | authored           | replaced by                        |
 * | ------------------------- | ------------------ | ---------------------------------- |
 * | body gradient, light stop | `#c792ff`          | lighten(base, 26)                  |
 * | body gradient, mid stop   | `#8749ef`          | base                               |
 * | body gradient, dark stop  | `#5420c8`          | darken(base, 19)                   |
 * | limb/tuft gradient        | `#9c61f4`/`#5422bc`| lighten(base, 8) / darken(base, 20)|
 * | foot gradient             | `#8248e8`/`#46199f`| darken(base, 2) / darken(base, 27) |
 * | eyebrow + tuft strokes    | `#4f239e`          | darken(base, 22)                   |
 * | side-pattern marks        | `#481696`          | secondary                          |
 * | iris gradient             | `#54308d`/`#201538`/`#090711` | lighten(eye, 20) / eye / darken(eye, 9) |
 *
 * Deliberately NOT recolored: the pupil (`#080711`), eye whites and
 * highlights, the pink cheeks (`#ff7ab7`), the mouth (`#21102e`) and the two
 * shadow fills (`#2d0d68`, `#2f183f`). They are lighting and features, not
 * traits. The lighten/darken amounts were chosen so that the authored purple
 * reproduces itself within a few units; they are not exact inverses, which is
 * why customization is only applied when a color is actually supplied: with no
 * colors the artwork is returned untouched, as in V1.
 *
 * Trait support status for V2:
 *  - baseColor, secondaryColor, eyeColor: supported (above);
 *  - pattern, specialMark, theme: PENDING. The artwork has one authored side
 *    pattern with no mapping to the pattern vocabulary, no mark artwork and no
 *    theme variants. They are carried in identity and ignored here rather than
 *    guessed at.
 */
import { darkenColor, lightenColor, uniquifySvgIds } from '../../../svg';
import type { ArtworkColors } from '../../types';

interface Role {
  authored: string;
  replacement: (colors: Required<Pick<ArtworkColors, 'baseColor' | 'secondaryColor' | 'eyeColor'>>) => string;
  /** Which supplied trait this role follows; it is only applied when that trait is given. */
  trait: keyof ArtworkColors;
}

const ROLES: readonly Role[] = [
  { authored: '#c792ff', trait: 'baseColor', replacement: (c) => lightenColor(c.baseColor, 26) },
  { authored: '#8749ef', trait: 'baseColor', replacement: (c) => c.baseColor },
  { authored: '#5420c8', trait: 'baseColor', replacement: (c) => darkenColor(c.baseColor, 19) },
  { authored: '#9c61f4', trait: 'baseColor', replacement: (c) => lightenColor(c.baseColor, 8) },
  { authored: '#5422bc', trait: 'baseColor', replacement: (c) => darkenColor(c.baseColor, 20) },
  { authored: '#8248e8', trait: 'baseColor', replacement: (c) => darkenColor(c.baseColor, 2) },
  { authored: '#46199f', trait: 'baseColor', replacement: (c) => darkenColor(c.baseColor, 27) },
  { authored: '#4f239e', trait: 'baseColor', replacement: (c) => darkenColor(c.baseColor, 22) },
  { authored: '#481696', trait: 'secondaryColor', replacement: (c) => c.secondaryColor },
  { authored: '#54308d', trait: 'eyeColor', replacement: (c) => lightenColor(c.eyeColor, 20) },
  { authored: '#201538', trait: 'eyeColor', replacement: (c) => c.eyeColor },
  { authored: '#090711', trait: 'eyeColor', replacement: (c) => darkenColor(c.eyeColor, 9) },
];

/** Every authored literal a role owns, for tests that check nothing else moved. */
export const ADULT_V2_ROLE_COLORS: readonly string[] = ROLES.map((r) => r.authored);

/** Normalize a caller color to the lower-case `#rrggbb` the artwork uses. */
function normalizeHex(color: string): string | undefined {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color.trim());
  if (!m) return undefined;
  const hex = m[1].length === 3 ? m[1].split('').map((ch) => ch + ch).join('') : m[1];
  return `#${hex.toLowerCase()}`;
}

/**
 * Apply trait colors to a V2 drawing, then fit and namespace it.
 *
 * Pure and deterministic: the same markup and colors always produce the same
 * string. Colors that are not valid hex are ignored, like an absent color.
 */
/**
 * Give the ROOT element `width="100%" height="100%"` so the drawing fills the
 * renderer box. Scoped to the root tag on purpose: the shared V1 helper tests
 * the whole document for a `width=` attribute, and V2's blur filters carry
 * `width`/`height`, which would make it skip the root and leave an inline SVG
 * at the browser's 300x150 default.
 */
function fillContainer(svgText: string): string {
  return svgText.replace(/<svg\b([^>]*)>/, (full, attrs: string) =>
    /\swidth=/.test(attrs) && /\sheight=/.test(attrs) ? full : `<svg${attrs} width="100%" height="100%">`,
  );
}

export function customizeAdultV2Svg(
  svgText: string,
  colors: ArtworkColors,
  instanceId?: string,
): string {
  let svg = fillContainer(svgText);

  const base = colors.baseColor ? normalizeHex(colors.baseColor) : undefined;
  const secondary = colors.secondaryColor ? normalizeHex(colors.secondaryColor) : undefined;
  const eye = colors.eyeColor ? normalizeHex(colors.eyeColor) : undefined;

  if (base || secondary || eye) {
    const resolved = {
      baseColor: base ?? '',
      secondaryColor: secondary ?? '',
      eyeColor: eye ?? '',
    };
    for (const role of ROLES) {
      if (!resolved[role.trait]) continue;
      const next = role.replacement(resolved).toLowerCase();
      svg = svg.split(role.authored).join(next);
    }
  }

  return instanceId ? uniquifySvgIds(svg, instanceId) : svg;
}
