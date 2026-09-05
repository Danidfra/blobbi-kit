/**
 * `@blobbi/renderer`: the canonical, host-independent Blobbi renderer.
 *
 * Everything reachable from this file renders a Blobbi from PLAIN, SERIALIZABLE
 * DATA: no relay, no query client, no router, no current user, no world
 * coordinates, no asset directory, no host CSS. Feed it a visual description
 * and it draws; that is the entire contract.
 *
 * The export list is written out by hand, one symbol at a time. There is no
 * `export *` anywhere in this package on purpose: a wildcard would make every
 * future internal helper public by accident, and `package-api.test.ts` asserts
 * this surface exactly, so growing it is a decision somebody makes rather than
 * something that happens.
 */

// ── The component ──────────────────────────────────────────────────────────
export { BlobbiRenderer, AccessoryLayerView } from './BlobbiRenderer';
export type { BlobbiRendererProps, BlobbiSvgSanitizer } from './BlobbiRenderer';
// Migration aliases (deprecated): the names the extracted Island package used.
export { BlobbiRendererView } from './BlobbiRenderer';
export type { BlobbiRendererViewProps } from './BlobbiRenderer';

// ── Visual model and normalization ─────────────────────────────────────────
export {
  normalizeBlobbiRenderModel,
  normalizeInstanceId,
  DEFAULT_STAGE,
  DEFAULT_ADULT_TYPE,
  FALLBACK_INSTANCE_ID,
} from './blobbi-render-model';
export type {
  BlobbiVisual,
  BlobbiRenderVisual,
  BlobbiRenderModel,
  BlobbiRenderModelInput,
  BlobbiRenderView,
} from './blobbi-render-model';

// ── The canonical box ──────────────────────────────────────────────────────
export {
  BLOBBI_RENDER_SIZE_PX,
  ACCESSORY_BASE_RATIO,
  ACCESSORY_BASE_PERCENT,
  blobbiRenderSizePx,
  accessoryBasePx,
  resolveBlobbiRenderSize,
} from './blobbi-render-size';
export type {
  BlobbiRenderSize,
  BlobbiRendererSize,
  ResolvedBlobbiRenderSize,
} from './blobbi-render-size';

// ── Accessories ────────────────────────────────────────────────────────────
export { normalizeAccessoryPlacements, ACCESSORY_SLOT_RANK } from './accessory-normalize';
export type {
  NormalizedAccessoryPlacement,
  NormalizeAccessoryOptions,
  AccessoryLayer,
} from './accessory-normalize';
export { REAR_VIEW_HIDDEN_SLOTS, DEFAULT_ACCESSORY_SOURCES } from './accessory-types';
export type {
  AccessorySlot,
  AccessoryPlacementInput,
  AccessorySourceRequest,
  AccessorySourceResolver,
} from './accessory-types';

// ── Visual effects ─────────────────────────────────────────────────────────
// Effect INPUT is plain data (`{ id, intensity? }`) and effect IMPLEMENTATION
// is entirely local to this package. Nothing here accepts a component, a class
// name, a CSS string or an animation expression, and no id resolves to
// anything this package did not write.
export {
  BLOBBI_VISUAL_EFFECT_IDS,
  EFFECT_SLOTS,
  EFFECT_SLOT_ORDER,
  DEFAULT_EFFECT_INTENSITY,
  MIN_EFFECT_INTENSITY,
  MAX_EFFECT_INTENSITY,
  isBlobbiVisualEffectId,
  normalizeBlobbiVisualEffects,
} from './effects/effect-model';
export type {
  BlobbiVisualEffect,
  BlobbiVisualEffectId,
  BlobbiEffectSlot,
  ResolvedBlobbiVisualEffect,
} from './effects/effect-model';
export {
  getBlobbiVisualEffectInfo,
  MAX_PIECES_PER_EFFECT,
  MAX_PIECES_TOTAL,
} from './effects/effect-catalog';
export type { BlobbiVisualEffectInfo } from './effects/effect-catalog';

// ── Stylesheets (optional, package-owned text) ─────────────────────────────
// The renderer needs NO CSS for its geometry. These are for hosts that want
// the decoration modifiers styled, or that would rather mount the effect rules
// once than carry a `<style>` element per effect-bearing character.
export { BLOBBI_RENDERER_STYLESHEET } from './styles';
export { BLOBBI_EFFECT_STYLESHEET } from './effects/effect-styles';

// ── Artwork vocabulary ─────────────────────────────────────────────────────
// Generation and facing are plain strings a host puts on the wire. Declared
// here independently of the domain kit's identical unions.
export { DEFAULT_VISUAL_GENERATION } from './artwork/types';
export type { BlobbiVisualGeneration, BlobbiFacing, ArtworkAnchors } from './artwork/types';
// The Adult V2 semantic part contract: what `data-part` values a V2 drawing
// carries, so hosts and future systems select parts by name, never by id.
export { ADULT_V2_PARTS, ADULT_V2_FACE_PARTS, ADULT_V2_GAZE_PARTS } from './artwork/adult/v2';
export type { AdultV2Part } from './artwork/adult/v2';

// ── Rendering without React ────────────────────────────────────────────────
// The same SVG pipeline the component uses, for consumers that want a string:
// server-side thumbnails, canvas compositing, a non-React card.
// `renderBlobbiSvg` is generation-aware; `loadBlobbiSvg` is the historical V1
// positional API and stays byte-identical.
export { loadBlobbiSvg, renderBlobbiSvg } from './artwork/load-blobbi-svg';
export type { RenderBlobbiSvgOptions, RenderedBlobbiSvg } from './artwork/load-blobbi-svg';
export type { BlobbiView } from './svg';

// ── SVG post-processing (provisional) ──────────────────────────────────────
// Exported for consumers composing their own pipeline around `loadBlobbiSvg`.
// Provisional: these are string-to-string transforms over an artwork
// convention, and the convention may change with the artwork.
export { applyGazeMarkup, applyRearView, uniquifySvgIds } from './svg';
