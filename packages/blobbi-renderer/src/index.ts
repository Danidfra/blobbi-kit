/**
 * `@blobbi-kit/renderer`: the canonical, host-independent Blobbi renderer.
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

// ── V3: procedural identity ────────────────────────────────────────────────
// A V3 Blobbi is not picked from artwork: it is generated from its seed,
// which `@blobbi-kit/core` derives from its address. `createBlobbiV3Identity(seed)`
// is Algorithm 1's identity of that seed (four colours, its trait kinds),
// for any host that needs to know who a Blobbi is; `visual.v3` takes the
// seed (and, for previews and fixtures, stated fields). A V3 seed
// has one spelling, 64 lower-case hexadecimal digits (`canonicalBlobbiV3Seed`). The
// engine behind it (`procedural/`) is NOT part of this barrel: genes,
// morphology and geometry are implementation, frozen per algorithm version.
// Another renderer of the same identity (`@blobbi-kit/3d`) reaches it
// through the `@blobbi-kit/renderer/procedural` subpath, which is the one
// canonical implementation of the algorithm; nothing re-implements it.
export {
  BLOBBI_V3_ALGORITHM_VERSION,
  BLOBBI_V3_ANTENNAE,
  BLOBBI_V3_HORNS,
  BLOBBI_V3_EARS,
  BLOBBI_V3_TAILS,
  BLOBBI_V3_PATTERNS,
  BLOBBI_V3_SPECIAL_MARKS,
  BLOBBI_V3_SUPPORTED_ALGORITHMS,
  BLOBBI_V3_SEED_LENGTH,
  canonicalBlobbiV3Seed,
  createBlobbiV3Identity,
  normalizeBlobbiV3Visual,
  resolveBlobbiV3Visual,
} from './artwork/v3/identity';
export type {
  BlobbiV3Visual,
  BlobbiV3Identity,
  BlobbiV3Resolution,
  BlobbiV3Colors,
  BlobbiV3Traits,
  BlobbiV3Antenna,
  BlobbiV3Horns,
  BlobbiV3Ears,
  BlobbiV3Tail,
  BlobbiV3Pattern,
  BlobbiV3SpecialMark,
} from './artwork/v3/identity';

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

// ── Expressive state ───────────────────────────────────────────────────────
// Expression is SVG render state (it changes the body markup on V2 faces);
// motion is wrapper/CSS render state (attributes plus a package stylesheet).
// Both are closed vocabularies: a host names a state, never a shape or a rule.
export {
  BLOBBI_EMOTIONS,
  BLOBBI_EMOTION_PRESETS,
  BLOBBI_EYE_STATES,
  BLOBBI_MOUTH_STATES,
  BLOBBI_BROW_STATES,
  BLOBBI_BLUSH_STATES,
  NEUTRAL_EXPRESSION,
  isBlobbiEmotion,
  normalizeBlobbiExpression,
} from './expression-model';
export type {
  BlobbiEmotion,
  BlobbiExpression,
  BlobbiExpressionParts,
  BlobbiExpressionBlend,
  BlobbiEyeState,
  BlobbiMouthState,
  BlobbiBrowState,
  BlobbiBlushState,
  ResolvedBlobbiExpression,
} from './expression-model';
export {
  BLOBBI_MOTIONS,
  BLOBBI_MOTION_PHASES,
  BLOBBI_MOTION_STYLESHEET,
  blobbiMotionAttributes,
  blobbiMotionPhase,
  normalizeBlobbiMotion,
} from './motion-model';
export type { BlobbiMotion } from './motion-model';
// The V3 rig's stylesheet, whole: for a host that would rather mount it once
// than let each moving V3 Blobbi carry the part of it that it needs.
export { MOTION_STYLESHEET as BLOBBI_V3_MOTION_STYLESHEET } from './procedural/motion';
export { BLOBBI_EGG_CRACKS, normalizeBlobbiEggCrack, eggCrackLevel } from './egg-model';
export type { BlobbiEggCrack } from './egg-model';

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
export type {
  BlobbiVisualGeneration,
  BlobbiFacing,
  ArtworkAnchors,
  BlobbiArtworkSupport,
} from './artwork/types';
// The Adult V2 semantic part contract: what `data-part` values a V2 drawing
// carries, so hosts and future systems select parts by name, never by id.
export {
  ADULT_V2_PARTS,
  ADULT_V2_FACE_PARTS,
  ADULT_V2_GAZE_PARTS,
  ADULT_V2_CLOSED_EYE_PARTS,
  ADULT_V2_EXPRESSION_PARTS,
  ADULT_V2_LEG_PARTS,
} from './artwork/adult/v2';
export type { AdultV2Part } from './artwork/adult/v2';

// ── Rendering without React ────────────────────────────────────────────────
// The same SVG pipeline the component uses, for consumers that want a string:
// server-side thumbnails, canvas compositing, a non-React card.
// `renderBlobbiSvg` is generation-aware; `loadBlobbiSvg` is the historical V1
// positional API and stays byte-identical.
export { describeBlobbiArtwork, loadBlobbiSvg, renderBlobbiSvg } from './artwork/load-blobbi-svg';
export type { DescribedBlobbiArtwork, RenderBlobbiSvgOptions, RenderedBlobbiSvg } from './artwork/load-blobbi-svg';
export { anchorsInSquare } from './artwork/types';
export type { BlobbiView, GazeMarkupOptions } from './svg';

// ── SVG post-processing (provisional) ──────────────────────────────────────
// Exported for consumers composing their own pipeline around `loadBlobbiSvg`.
// Provisional: these are string-to-string transforms over an artwork
// convention, and the convention may change with the artwork.
export { applyGazeMarkup, applyRearView, uniquifySvgIds } from './svg';

// Sleep indicator: whether the V1 sleeping drawings keep their baked Zzz
export { BLOBBI_SLEEP_INDICATORS, normalizeBlobbiSleepIndicator, type BlobbiSleepIndicator } from './svg/sleep-indicator';
// Ground shadow: the V2 drawings' baked floor shadow is the world's to draw; off by default
export { BLOBBI_GROUND_SHADOWS, normalizeBlobbiGroundShadow, type BlobbiGroundShadow } from './svg/ground-shadow';
export { BABY_V1_EXPRESSION_PARTS } from './artwork/baby/v1/expression';
