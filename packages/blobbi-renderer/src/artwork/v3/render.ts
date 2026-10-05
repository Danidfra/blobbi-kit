/**
 * V3 IN THE ARTWORK PIPELINE: the adapter between the kit's request (a
 * stage, a facing, a named expression, a motion word) and the procedural
 * engine (`procedural/`: a genome and a state).
 *
 * The registry treats V3 like any other generation: `resolveV3Artwork`
 * decides what is drawn and describes it, `finishV3Artwork` produces the
 * markup. What differs is that nothing here is authored artwork: the
 * drawing is generated from the identity, so there is no colour customizer
 * (the colours are the identity's), no id rewriting (the engine namespaces
 * its own ids) and no mirroring pass (the engine draws the left profile).
 *
 * What is IDENTITY and what is STATE stays visibly apart in `stateFor`:
 * every field it sets comes from the request's render state, none from the
 * identity, and the genome is built from the identity alone.
 */
import {
  BABY_BOX,
  DOCUMENT_TRANSFORM,
  EGG_BOX,
  VIEWBOX,
  buildBlobbiGeometry,
  deriveMorphology,
  motionStylesheetFor,
  planFor,
  renderEggSvg,
  renderGeometryToSvg,
  type BlobbiGenome,
  type BlobbiGeometry,
  type BlobbiState,
  type Direction,
  type Gait,
  type View,
} from '../../procedural';
import { isNeutral } from '../../expression-model';
import { blobbiMotionPhase, BLOBBI_MOTION_PHASES } from '../../motion-model';
import type { ArtworkAnchors, ArtworkColors, ArtworkRequest, ResolvedArtwork } from '../types';
import { blobbiV3Genome, fallbackV3Genome, genericV3Genome, resolveBlobbiV3Visual } from './identity';

/** What the finishing step needs to draw a resolved V3 request. Internal to the artwork layer. */
export interface ProceduralArtwork {
  /** The identity's genome, or null when the visual carried no identity (then the fallback genome is drawn). */
  genome: BlobbiGenome | null;
  /** Set when the identity states an algorithm version this package does not implement. */
  unsupportedAlgorithm?: number;
  state: Partial<BlobbiState>;
  groundShadow: boolean;
  gait: Gait;
}

function viewOf(facing: ArtworkRequest['facing']): { view: View; direction: Direction } {
  switch (facing) {
    case 'back':
      return { view: 'back', direction: 'right' };
    case 'left':
      return { view: 'side', direction: 'left' };
    case 'right':
      return { view: 'side', direction: 'right' };
    default:
      return { view: 'front', direction: 'right' };
  }
}

/** Render state only: nothing here can change who the Blobbi is. */
function stateFor(request: ArtworkRequest): Partial<BlobbiState> {
  const state: Partial<BlobbiState> = {
    stage: request.stage,
    ...viewOf(request.facing),
    sleeping: request.eyesClosed,
    eggCrack: request.eggCrack ?? 'none',
    motion: request.motion ?? 'still',
  };
  const expression = request.expression;
  if (expression?.blend) state.expression = expression.blend;
  else if (expression && !isNeutral(expression)) state.face = { eyes: expression.eyes, mouth: expression.mouth, brows: expression.brows, blush: expression.blush };
  if (request.gaze) state.gaze = request.gaze;
  if (typeof request.motionPhase === 'number') state.phase = request.motionPhase;
  return state;
}

/** A square of root units, as viewBox units. */
const boxOf = (box: { x: number; y: number; size: number }) => ({
  x: box.x * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx,
  y: box.y * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.ty,
  width: box.size * DOCUMENT_TRANSFORM.scale,
  height: box.size * DOCUMENT_TRANSFORM.scale,
});

/** Where the notable points of THIS individual's drawing are, as fractions of its frame. */
function anchorsOf(geo: BlobbiGeometry, frame: { x: number; y: number; width: number; height: number }): ArtworkAnchors {
  const fx = (x: number) => (x * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx - frame.x) / frame.width;
  const fy = (y: number) => (y * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.ty - frame.y) / frame.height;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const centre = geo.view === 'side' ? (geo.body.left + geo.body.right) / 2 : geo.body.axisX;
  const mirrored = geo.view === 'side' && geo.mirrored;
  const anchors: ArtworkAnchors = {
    centerX: round(mirrored ? 1 - fx(centre) : fx(centre)),
    headTopY: round(fy(geo.body.top)),
    groundY: round(fy(geo.ground.y)),
  };
  const eye = geo.face?.eyes[0];
  if (eye) anchors.eyeLineY = round(fy(eye.center.y));
  return anchors;
}

/** The egg's box is the official egg's: the shell fills 10..91 of it. */
const EGG_ANCHORS: ArtworkAnchors = { centerX: 0.5, headTopY: 0.1, groundY: 0.91 };

/**
 * Decide what a V3 request draws, and describe it. Total: an identity that
 * is missing or malformed still resolves (see `normalizeBlobbiV3Visual` and
 * `fallbackV3Genome`).
 */
export function resolveV3Artwork(request: ArtworkRequest): ResolvedArtwork {
  // Three outcomes (see `resolveBlobbiV3Visual`): an individual; an identity
  // whose algorithm version this package does not implement, drawn as the
  // canonical body in the colours and trait kinds it states, nothing derived
  // from its seed, and FLAGGED; or no identity at all.
  const resolved = resolveBlobbiV3Visual(request.v3);
  const unsupportedAlgorithm = resolved.status === 'unsupported-algorithm' ? resolved.algorithm : undefined;
  const genome = resolved.status === 'individual' ? blobbiV3Genome(resolved.identity) : resolved.status === 'unsupported-algorithm' ? genericV3Genome(resolved.colors, resolved.traits) : null;
  const state = stateFor(request);
  const { view } = viewOf(request.facing);
  const mirrored = request.facing === 'left';
  const live = (request.motion ?? 'still') !== 'still' && request.motionPhase === undefined;

  if (request.stage === 'egg') {
    const frame = boxOf(EGG_BOX);
    return {
      generation: 'v3',
      stage: 'egg',
      view: 'front',
      mirrored: false,
      eyesClosed: false,
      gazeable: false,
      supports: { expression: false, gaze: false, motion: true },
      viewBox: { width: frame.width, height: frame.height },
      anchors: EGG_ANCHORS,
      markup: '',
      motionStyles: live ? motionStylesheetFor(request.motion ?? 'still', 'rest', 'front') : '',
      unsupportedAlgorithm,
      procedural: { genome, state, groundShadow: request.groundShadow === 'artwork', gait: 'rest', unsupportedAlgorithm },
    };
  }

  // Geometry does not depend on colour, so the fallback genome's is the same whatever colours it is given.
  const stage = request.stage === 'adult' ? 'adult' : 'baby';
  const geo = buildBlobbiGeometry(deriveMorphology(genome ?? fallbackV3Genome({}), stage), state);
  const frame = stage === 'baby' ? boxOf(BABY_BOX) : { x: 0, y: 0, width: VIEWBOX.width, height: VIEWBOX.height };
  const eyes = geo.face?.eyes ?? [];
  const eyesClosed = eyes.length > 0 && eyes.every((eye) => eye.lid?.closed === true);
  const gazeable = eyes.length > 0 && !eyesClosed;
  const gait = planFor(stage).look.gait;
  return {
    generation: 'v3',
    stage,
    view,
    mirrored,
    eyesClosed: eyesClosed || request.eyesClosed,
    gazeable,
    supports: { expression: geo.face !== null, gaze: gazeable, motion: true },
    viewBox: { width: frame.width, height: frame.height },
    anchors: anchorsOf(geo, frame),
    markup: '',
    gazeTravel: gazeable ? eyes[0].travel : undefined,
    motionStyles: live ? motionStylesheetFor(request.motion ?? 'still', gait, view) : '',
    unsupportedAlgorithm,
    procedural: { genome, state, groundShadow: request.groundShadow === 'artwork', gait, unsupportedAlgorithm },
  };
}

/**
 * Draw a resolved V3 request. `colors` are the visual's plain colours and
 * are used only when it carried no V3 identity; an identity's colours are
 * its own.
 */
export function finishV3Artwork(resolved: ResolvedArtwork, colors: ArtworkColors, instanceId?: string): string {
  const procedural = resolved.procedural;
  if (!procedural) return '';
  const genome = procedural.genome ?? fallbackV3Genome(colors);
  const live = procedural.state.motion !== undefined && procedural.state.motion !== 'still' && procedural.state.phase === undefined;
  const options = {
    idPrefix: instanceId,
    groundShadow: procedural.groundShadow,
    // A baby and an egg fill their own square, as their official artwork does; an adult uses the shared frame.
    frame: resolved.stage === 'adult' ? ('shared' as const) : ('stage' as const),
    // The same phase bucket the wrapper motion gives this instance, so a crowd does not move in step.
    motionOffset: live && instanceId ? blobbiMotionPhase(instanceId) / BLOBBI_MOTION_PHASES : undefined,
  };
  const svg =
    resolved.stage === 'egg'
      ? renderEggSvg(genome, procedural.state, options)
      : renderGeometryToSvg(buildBlobbiGeometry(deriveMorphology(genome, resolved.stage), procedural.state), options);
  // The drawing itself says when it is a stand-in, so a string carries the fact as well as a component does.
  return procedural.unsupportedAlgorithm === undefined ? svg : svg.replace('<svg ', `<svg data-blobbi-unsupported-algorithm="${Math.trunc(Number(procedural.unsupportedAlgorithm)) || 0}" `);
}
