/**
 * The vocabulary of the artwork layer.
 *
 * Two axes select a drawing: which GENERATION of artwork a Blobbi belongs to,
 * and which way it FACES. Both are plain strings a host can put on the wire.
 */

/**
 * Artwork generation. A property of the Blobbi's identity (carried in its
 * event by the domain kit), never of the renderer version: the same Blobbi
 * draws the same generation everywhere and forever.
 *
 * - `'v1'`: the original generation. Sixteen independent adult forms, one
 *   baby, a sleeping variant of each, and a rear view derived by removing the
 *   face. Fully supported; every pre-existing Blobbi is V1.
 * - `'v2'`: the canonical anatomy. One adult body with explicit semantic parts
 *   (body, arms, feet, tuft, eyes, eyebrows, cheeks, mouth) and authored
 *   directional artwork (front, side, back). The foundation for future
 *   movement, clothing and expressions.
 *
 * Declared here independently of `@blobbi-kit/core`'s identical union: the two
 * packages never import each other.
 */
export type BlobbiVisualGeneration = 'v1' | 'v2';

/** The generation of every visual that names none. */
export const DEFAULT_VISUAL_GENERATION: BlobbiVisualGeneration = 'v1';

/**
 * Which way the character is turned, from the viewer's point of view.
 *
 * `'front'` and `'back'` are the historical values and keep their meaning.
 * `'left'` and `'right'` are the character's profile facing screen-left or
 * screen-right. V1 has no profile artwork and draws the front for both; V2
 * draws its authored side view, mirrored for one of the two directions.
 */
export type BlobbiFacing = 'front' | 'back' | 'left' | 'right';

/** Authored artwork views. `'side'` is drawn once and mirrored for the other direction. */
export type BlobbiArtworkView = 'front' | 'back' | 'side';

/** The colors a drawing can be customized with. Absent means "the artwork's own". */
export interface ArtworkColors {
  baseColor?: string;
  secondaryColor?: string;
  eyeColor?: string;
}

/** What a caller asks the registry for. Already normalized: no undefined stage. */
export interface ArtworkRequest {
  stage: 'egg' | 'baby' | 'adult';
  visualGeneration: BlobbiVisualGeneration;
  /** Adult form; only meaningful for V1 adults. */
  adultType?: string;
  facing: BlobbiFacing;
  /** Draw the closed-eye variant when the generation has one. */
  eyesClosed: boolean;
}

/**
 * Where notable points of a drawing sit, as fractions (0..1) of its viewBox.
 * Metadata for hosts and future accessory anchoring; nothing here is applied
 * by the renderer itself yet.
 */
export interface ArtworkAnchors {
  /** Horizontal center of the body. */
  centerX: number;
  /** Top of the body silhouette (excluding the tuft). */
  headTopY: number;
  /** Vertical center of the eye line, when the view has a face. */
  eyeLineY?: number;
  /** Ground contact line. */
  groundY: number;
}

/**
 * A resolved drawing plus everything the pipeline needs to finish it.
 * Produced by the registry; consumed by `buildBlobbiMarkup`.
 */
export interface ResolvedArtwork {
  generation: BlobbiVisualGeneration;
  /** The stage actually drawn (`'egg'` resolves to the baby drawing). */
  stage: 'baby' | 'adult';
  view: BlobbiArtworkView;
  /** The drawing must be flipped horizontally to face the requested way. */
  mirrored: boolean;
  /** Whether the drawing shows closed eyes (V2 has no closed-eye artwork yet). */
  eyesClosed: boolean;
  /** Whether the drawing has pupils that gaze markup can move. */
  gazeable: boolean;
  /** V1 adult form that was resolved, when applicable. */
  form?: string;
  /** The `viewBox` width and height of the raw markup. */
  viewBox: { width: number; height: number };
  anchors: ArtworkAnchors;
  /** Raw authored markup, before any customization. */
  markup: string;
}
