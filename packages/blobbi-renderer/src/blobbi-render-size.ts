/**
 * Canonical Blobbi renderer-box contract.
 *
 *  - The renderer box is a SQUARE box and the single local coordinate space
 *    for everything the renderer paints.
 *  - The body SVG fills the box exactly (absolutely positioned wrapper; the
 *    SVG carries width/height 100% and a square viewBox, so it letterboxes
 *    nothing and distorts nothing).
 *  - Accessory x/y are percentages (0-100) OF THIS BOX, measured to the
 *    accessory's center.
 *  - Accessory base size is a fixed FRACTION of the box
 *    ({@link ACCESSORY_BASE_RATIO}), multiplied by the accessory's own saved
 *    scale. No fixed CSS-pixel accessory sizes.
 *  - Accessories may overflow the box; nothing clips them.
 *  - No viewport breakpoint may change the box: whatever scales a Blobbi with
 *    the viewport is a transform applied by the host, outside the renderer.
 *
 * The box is applied as an INLINE width/height, never as a utility class. A
 * published package cannot ask its consumer to generate CSS for it, and a
 * class name the consumer's build never emits collapses the box to 0x0 without
 * any error. The size tokens keep their historical pixel values so hosts that
 * authored placements against them see no change.
 */

/** The named size ladder. `xl` (128) is the historical accessory editor box. */
export type BlobbiRenderSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

/** Canonical square box size per token, in CSS pixels. */
export const BLOBBI_RENDER_SIZE_PX: Record<BlobbiRenderSize, number> = {
  sm: 32,
  md: 56,
  lg: 96,
  xl: 128,
  '2xl': 224,
  '3xl': 288,
};

/**
 * What a caller may pass as `size`: a token, a pixel number, or a CSS length
 * string (`'100%'`, `'12rem'`) for hosts that size the box from its container.
 * The `string & {}` keeps the token union autocompletable.
 */
export type BlobbiRendererSize = BlobbiRenderSize | number | (string & {});

/** A resolved box size: the CSS length to apply and the token it came from. */
export interface ResolvedBlobbiRenderSize {
  /** The CSS `width`/`height` value. */
  css: string;
  /** The token, when the input was one; otherwise `undefined`. */
  token: BlobbiRenderSize | undefined;
  /**
   * The value written to `data-blobbi-size`: the token when there is one,
   * otherwise the CSS length, so a test or stylesheet can always read it back.
   */
  label: string;
}

function isSizeToken(size: BlobbiRendererSize): size is BlobbiRenderSize {
  return typeof size === 'string' && size in BLOBBI_RENDER_SIZE_PX;
}

/**
 * Resolve any accepted `size` to the CSS length the box is drawn at.
 *
 *  - a token -> its canonical pixels;
 *  - a finite positive number -> that many pixels;
 *  - any other string -> used verbatim as a CSS length;
 *  - a non-finite or non-positive number -> the `lg` default, never `NaNpx`.
 */
export function resolveBlobbiRenderSize(size: BlobbiRendererSize): ResolvedBlobbiRenderSize {
  if (isSizeToken(size)) {
    return { css: `${BLOBBI_RENDER_SIZE_PX[size]}px`, token: size, label: size };
  }
  if (typeof size === 'number') {
    const px = Number.isFinite(size) && size > 0 ? size : BLOBBI_RENDER_SIZE_PX.lg;
    return { css: `${px}px`, token: undefined, label: `${px}px` };
  }
  const trimmed = size.trim();
  const css = trimmed.length > 0 ? trimmed : `${BLOBBI_RENDER_SIZE_PX.lg}px`;
  return { css, token: undefined, label: css };
}

/**
 * Accessory base size as a fraction of the renderer box.
 *
 * 60/128: the original accessory editor rendered accessories at a fixed 60px
 * inside its 128px `xl` box, and that editor is where every saved placement
 * was authored, so preserving the ratio preserves the author's intent in every
 * context. A saved `scale` multiplies this base.
 */
export const ACCESSORY_BASE_RATIO = 60 / 128;

/** Accessory base size as a CSS percentage string of the renderer box. */
export const ACCESSORY_BASE_PERCENT = `${ACCESSORY_BASE_RATIO * 100}%`;

/** Canonical pixel size for a token. */
export function blobbiRenderSizePx(size: BlobbiRenderSize): number {
  return BLOBBI_RENDER_SIZE_PX[size];
}

/** Accessory base size in px for a token (before the accessory's own scale). */
export function accessoryBasePx(size: BlobbiRenderSize): number {
  return BLOBBI_RENDER_SIZE_PX[size] * ACCESSORY_BASE_RATIO;
}
