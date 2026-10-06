/**
 * The vocabulary of the artwork layer.
 *
 * Two axes select a drawing: which GENERATION of artwork a Blobbi belongs to,
 * and which way it FACES. Both are plain strings a host can put on the wire.
 */

import type { ResolvedBlobbiExpression } from '../expression-model';
import type { BlobbiEggCrack } from '../egg-model';
import type { BlobbiMotion } from '../motion-model';
import type { BlobbiV3Visual } from './v3/identity';
import type { ProceduralArtwork } from './v3/render';

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
 * - `'v3'`: the procedural generation. No authored drawing per Blobbi: each
 *   one is an individual, generated from its own identity (a seed, its
 *   colours, its trait kinds; see `artwork/v3/identity.ts`) as an egg, a
 *   baby and an adult, from the front, in profile and from behind. The
 *   canonical V3 individual is the V2 adult, the V1 baby and the V1 egg.
 *
 * Declared here independently of `@blobbi-kit/core`'s identical union: the two
 * packages never import each other.
 */
export type BlobbiVisualGeneration = 'v1' | 'v2' | 'v3';

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
  /**
   * Whether the V1 sleeping drawings keep their baked "Zzz" (`'artwork'`, the
   * default) or draw the creature asleep only (`'none'`), for hosts that draw
   * their own sleep cue. V2 has no baked Zzz. See `svg/sleep-indicator.ts`.
   */
  sleepIndicator?: 'artwork' | 'none';
  /**
   * Whether the V2 drawings keep their baked ground shadow (`'artwork'`) or
   * draw the creature only (`'none'`, the default), for hosts that draw the
   * ground shadow in their world. V1 has none. See `svg/ground-shadow.ts`.
   */
  groundShadow?: 'none' | 'artwork';
  /**
   * Resolved facial expression. Drawn by generations with a face the package
   * can transform (V2 front and side; the V1 baby front); ignored by the V1
   * adults and by faceless views. Absent means neutral. `eyesClosed` wins
   * over the expression's eye state.
   */
  expression?: ResolvedBlobbiExpression;
  /**
   * Shell crack state. Drawn by the egg stage only; every other stage ignores
   * it. Absent means the intact shell.
   */
  eggCrack?: BlobbiEggCrack;
  /**
   * The V3 identity (seed, colours, trait kinds). Read by the V3 generation
   * only; V1 and V2 never look at it, whatever it holds.
   */
  v3?: BlobbiV3Visual;
  /**
   * Body motion, for generations that animate THEIR OWN PARTS (V3: its rig).
   * V1 and V2 ignore it: their motion is a wrapper animation the caller
   * applies around the finished drawing.
   */
  motion?: BlobbiMotion;
  /**
   * Draw one frame of the motion (0..1 through its cycle) instead of leaving
   * it to the stylesheet. V3 only.
   */
  motionPhase?: number;
  /**
   * A gaze drawn INTO the markup (-1..1 per axis, screen-relative), for a
   * static picture. Live gaze does not use this: it moves the marked eye
   * parts through CSS variables. V3 only.
   */
  gaze?: { x: number; y: number };
}

/**
 * What a drawing can do, so a host can ask instead of guess.
 *
 *  - `expression`: the view has a semantic face the expression transforms
 *    apply to (V2 front and side). V1 and the V2 back draw the neutral face,
 *    or no face, whatever expression is requested.
 *  - `gaze`: the drawing has pupils gaze markup can move (the historical
 *    `gazeable`: a face, and eyes not closed).
 *  - `motion`: the body can carry a motion state. Always true: motion is a
 *    wrapper/CSS transform that never touches the artwork.
 */
export interface BlobbiArtworkSupport {
  expression: boolean;
  gaze: boolean;
  motion: boolean;
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
  /**
   * What the drawing stands on (or floats above): the middle of its contact
   * with the ground and how wide that contact is. A host that draws its own
   * ground shadow puts it here, on `groundY`, instead of guessing from the
   * frame: an adult stands on two feet, a baby is a small thing in the air,
   * an egg rests on its base, and each individual is a little wider or
   * narrower. Present for every V3 drawing; absent where a generation's
   * artwork has not been measured.
   */
  footprint?: { centerX: number; width: number };
  /**
   * The centre of the mouth at rest, when the view has a face: where a host
   * brings food, or lets something leave the mouth, instead of guessing from
   * the frame. Measured on this individual's own resting face (no
   * expression), so it does not move with a smile or a frown. Present for
   * every V3 baby and adult drawn with a face (front and profile); absent for
   * an egg, a back view, and where a generation's artwork has not been measured.
   */
  mouth?: { x: number; y: number };
}

/**
 * The same anchors as fractions of the SQUARE the component draws in (the
 * drawing is fitted into it whole and centred, as `preserveAspectRatio`
 * `xMidYMid meet` does), which is the frame a host lays things out against.
 */
export function anchorsInSquare(anchors: ArtworkAnchors, viewBox: { width: number; height: number }): ArtworkAnchors {
  const side = Math.max(viewBox.width, viewBox.height) || 1;
  const kx = viewBox.width / side;
  const ky = viewBox.height / side;
  const x = (v: number) => Math.round((0.5 + (v - 0.5) * kx) * 1000) / 1000;
  const y = (v: number) => Math.round((0.5 + (v - 0.5) * ky) * 1000) / 1000;
  const out: ArtworkAnchors = { centerX: x(anchors.centerX), headTopY: y(anchors.headTopY), groundY: y(anchors.groundY) };
  if (anchors.eyeLineY !== undefined) out.eyeLineY = y(anchors.eyeLineY);
  if (anchors.footprint) out.footprint = { centerX: x(anchors.footprint.centerX), width: Math.round(anchors.footprint.width * kx * 1000) / 1000 };
  if (anchors.mouth) out.mouth = { x: x(anchors.mouth.x), y: y(anchors.mouth.y) };
  return out;
}

/**
 * A resolved drawing plus everything the pipeline needs to finish it.
 * Produced by the registry; consumed by `buildBlobbiMarkup`.
 */
export interface ResolvedArtwork {
  generation: BlobbiVisualGeneration;
  /** The stage actually drawn. */
  stage: 'egg' | 'baby' | 'adult';
  view: BlobbiArtworkView;
  /** The drawing must be flipped horizontally to face the requested way. */
  mirrored: boolean;
  /** Whether the drawing shows closed eyes (V2 has no closed-eye artwork yet). */
  eyesClosed: boolean;
  /** Whether the drawing has pupils that gaze markup can move. */
  gazeable: boolean;
  /** What this drawing supports; see {@link BlobbiArtworkSupport}. */
  supports: BlobbiArtworkSupport;
  /** V1 adult form that was resolved, when applicable. */
  form?: string;
  /** The `viewBox` width and height of the raw markup. */
  viewBox: { width: number; height: number };
  anchors: ArtworkAnchors;
  /** Raw authored markup, before any customization. */
  markup: string;
  /**
   * The expression the finishing step draws on this view, when the view has
   * a face the package transforms AFTER colouring (the V1 baby front). V2
   * draws its expression on the raw markup instead.
   */
  expression?: ResolvedBlobbiExpression;
  /**
   * How far a full gaze deflection moves the marked eye parts, in their own
   * units, when the drawing knows (V3: from this individual's eyes). Absent:
   * the generation's fixed travel.
   */
  gazeTravel?: number;
  /**
   * Present when the drawing ANIMATES ITSELF (V3: its rig parts move). It is
   * the stylesheet text this drawing's motion needs, possibly empty (still,
   * or a baked frame). A caller must then mount this instead of wrapping the
   * drawing in the kit's own motion animation. Absent for V1 and V2.
   */
  motionStyles?: string;
  /**
   * Set when a V3 identity states a procedural algorithm version this
   * package does not implement. The drawing is then a STAND-IN: the
   * canonical body in the colours and trait kinds the identity states, with
   * nothing derived from its seed. It is never drawn as another version.
   */
  unsupportedAlgorithm?: number;
  /** What the V3 finishing step draws from. Internal to the artwork layer. */
  procedural?: ProceduralArtwork;
}
