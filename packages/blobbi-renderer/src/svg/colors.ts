/**
 * Color Utilities for Blobbi SVG Manipulation
 *
 * Shared color manipulation functions used across:
 * - Baby SVG customizer
 * - Adult SVG customizer
 *
 * Pure math only. The hex<->HSL pair below is the renderer's own copy of two
 * conversions that also live in `@blobbi-kit/core/color-guardrails`; keeping a
 * local copy is what lets this package carry no dependency on the domain kit.
 * Both copies are pure functions of their input and must stay behaviorally
 * identical (`svg/colors.test.ts` pins the outputs).
 */

/**
 * The colour gate: the ONLY shapes a caller colour may take before it is
 * spliced into artwork.
 *
 * Every customizer in this package builds markup by string interpolation
 * (`style="stop-color:${color}"`, `fill="${color}"`), and the finished string is
 * mounted through `dangerouslySetInnerHTML`. A colour is therefore an
 * attribute value written by hand, and anything that is not a bare hex colour
 * could close the attribute and open an element. This gate runs once, at the
 * artwork boundary (`finishBlobbiArtwork`) and in `normalizeBlobbiRenderModel`,
 * so no host has to remember to validate before calling.
 *
 * `#rgb` and `#rrggbb` only, either case, exactly as `@blobbi-kit/core` writes
 * them. The value is returned UNCHANGED when it passes (no case folding, no
 * expansion), so every valid colour still produces byte-identical artwork.
 */
const ARTWORK_HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Whether a value is a colour the artwork customizers may interpolate as-is. */
export function isArtworkHexColor(value: unknown): value is string {
  return typeof value === 'string' && ARTWORK_HEX_COLOR.test(value);
}

/**
 * The colour if it is a plain hex colour, else `undefined`, which every
 * customizer already treats as "the artwork's own colour".
 */
export function sanitizeArtworkColor(value: unknown): string | undefined {
  return isArtworkHexColor(value) ? value : undefined;
}

/**
 * Lighten a hex color by a percentage.
 *
 * @param color - Hex color string (e.g., "#ff0000")
 * @param percent - Percentage to lighten (0-100)
 * @returns Lightened hex color string
 */
export function lightenColor(color: string, percent: number): string {
  if (!color.startsWith('#')) return color;

  const num = parseInt(color.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;

  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
      .toUpperCase()
  );
}

/**
 * Darken a hex color by a percentage.
 *
 * @param color - Hex color string (e.g., "#ff0000")
 * @param percent - Percentage to darken (0-100)
 * @returns Darkened hex color string
 */
export function darkenColor(color: string, percent: number): string {
  if (!color.startsWith('#')) return color;

  const num = parseInt(color.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
  const B = Math.max(0, (num & 0x0000ff) - amt);

  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1).toUpperCase();
}

/** Expand `#RGB` to `#RRGGBB`; anything else is returned unchanged. */
function expandHex(hex: string): string {
  if (hex.length === 4) {
    const r = hex[1], g = hex[2], b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

/**
 * Convert a hex color (#RGB or #RRGGBB) to HSL.
 * Returns h: 0-360, s: 0-100, l: 0-100 (all rounded to integers).
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const hex6 = expandHex(hex);
  const num = parseInt(hex6.slice(1), 16);
  const r = ((num >> 16) & 0xff) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL values to a hex color string (#RRGGBB, uppercase).
 * Expects h: 0-360, s: 0-100, l: 0-100.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);

  function f(n: number): number {
    const k = (n + h / 30) % 12;
    return lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  }

  const R = Math.round(f(0) * 255);
  const G = Math.round(f(8) * 255);
  const B = Math.round(f(4) * 255);

  return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1).toUpperCase();
}
