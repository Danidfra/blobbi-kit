/**
 * The procedural Blobbi engine. Framework-free: no React, no DOM, no clock,
 * no `Math.random()`.
 *
 * ```
 *   seed ─► generateGenome ─► deriveMorphology(stage) ─► buildBlobbiGeometry(view) ─► renderGeometryToSvg
 *                                                               ▲
 *                                                             state
 * ```
 */
export { PROCEDURAL_ALGORITHM_VERSION, PROCEDURAL_GENERATION } from './version';
export { createRng, geneRng, hashSeed, type Rng } from './rng';
export {
  ANTENNA_GENES,
  EAR_GENES,
  EGG_GENES,
  EAR_KINDS,
  GENOME_VERSION,
  HORN_GENES,
  HORN_KINDS,
  MORPHOLOGY_GENES,
  TAIL_GENES,
  TAIL_KINDS,
  canonicalGenome,
  clampGene,
  generateGenome,
  type AntennaCount,
  type AntennaGeneName,
  type AntennaGenes,
  type BlobbiGenome,
  type BlobbiSemanticIdentity,
  type BlobbiTraits,
  type EarGeneName,
  type EarKind,
  type EggGeneName,
  type EggGenes,
  type GenerateGenomeInput,
  type HornGeneName,
  type HornKind,
  type MarkingSide,
  type MorphologyGeneName,
  type MorphologyGenes,
  type TailGeneName,
  type TailKind,
} from './genome';
export {
  ANTENNA_RANGES,
  EAR_RANGES,
  HORN_RANGES,
  MORPHOLOGY_RANGES,
  TAIL_RANGES,
  deriveMorphology,
  mirrorMorphology,
  type AntennaMorphology,
  type BlobbiMorphology,
  type GeneRange,
  type MorphologyGroup,
} from './morphology';
export {
  AUTHORED_PALETTE,
  COLOR_SCHEMES,
  MAX_BODY_CHROMA,
  MAX_BODY_LIGHTNESS,
  MIN_BODY_CHROMA,
  MIN_BODY_LIGHTNESS,
  composite,
  contrast,
  derivePalette,
  distance,
  generateColors,
  hexToOklch,
  mixOklab,
  oklchToHex,
  sanitizeHex,
  type BlobbiColors,
  type BlobbiPalette,
  type ColorScheme,
} from './colors';
export {
  EMOTIONS,
  KEY_POSES,
  NEUTRAL_POSE,
  applyFaceParts,
  blushOpacity,
  expressionOf,
  lidShape,
  normalizeWeights,
  resolveFacePose,
  type Emotion,
  type ExpressionWeights,
  type FaceParts,
  type FacePose,
} from './expressions';
export { MOTIONS, NEUTRAL_STATE, normalizeState, type BlobbiMotion, type BlobbiState } from './state';
export { LIVE_MOTION_ATTRIBUTE, MOTION_DURATION, MOTION_STYLESHEET, RIG_PARTS, motionPose, motionStylesheetFor, type Gait, type RigPart, type RigPose } from './motion';
export {
  ADULT_PLAN,
  BABY_BOX,
  BLOBBI_STAGES,
  BABY_PLAN,
  BABY_UNIT,
  DIRECTIONS,
  LIFE_STAGES,
  VIEWS,
  planFor,
  type BlobbiStage,
  type Direction,
  type LifeStage,
  type StagePlan,
  type View,
} from './plan';
export {
  AUTHORED_EGG_PALETTE,
  EGG_BOX,
  EGG_CRACKS,
  EGG_RANGES,
  EGG_UNIT,
  buildEggGeometry,
  deriveEgg,
  deriveEggPalette,
  type EggAppearance,
  type EggCrack,
  type EggGeometry,
  type EggPalette,
} from './egg';
export { CANONICAL_PARAMS, buildFrontBody, buildSideBody, type BodyParams, type FrontBody, type SideBody, type Silhouette } from './silhouette';
export type { DebugGroup, DebugMark } from './geometry';
export type { Appendage } from './traits/appendages';
export type { FrontGeometry } from './views/front';
export type { SideGeometry } from './views/side';
export {
  DOCUMENT_TRANSFORM,
  VIEWBOX,
  buildBlobbiGeometry,
  generateBlobbi,
  renderBlobbiSvg,
  renderEggSvg,
  renderGeometryToSvg,
  type BlobbiGeometry,
  type GenerateBlobbiInput,
  type GeneratedBlobbi,
  type RenderOptions,
} from './renderer';
