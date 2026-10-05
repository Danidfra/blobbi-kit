/**
 * THE RENDERER: genome + state in, SVG string out.
 *
 * ```
 *   genome ──deriveMorphology(stage)──► morphology ─┐
 *                                                   ├─buildBlobbiGeometry──► geometry ──renderGeometryToSvg──► SVG
 *   state  ──normalizeState───────────► state ──────┘        (per view)
 * ```
 *
 * Two steps on purpose. `buildBlobbiGeometry` does all the thinking and
 * returns plain data (silhouette, face, limbs, traits, debug marks) that
 * tests can inspect and a canvas or a physics rig could consume.
 * `renderGeometryToSvg` only writes markup.
 *
 * Every stage and view is drawn in the Adult V2 viewBox under one document
 * transform, with the kit's `data-part` names, so drawings overlay the
 * kit's pixel for pixel and a baby stands on the adult's ground line.
 *
 * Pure and deterministic: the same inputs always produce the same string.
 * Neither the genome, the morphology nor the state is mutated.
 */
import type { BlobbiPalette } from './colors';
import { generateGenome, type BlobbiGenome, type GenerateGenomeInput } from './genome';
import type { DebugMark } from './geometry';
import { LIVE_MOTION_ATTRIBUTE, motionPose, poseTransform, type BlobbiMotion } from './motion';
import { deriveMorphology, type BlobbiMorphology } from './morphology';
import { EGG_BOX, buildEggGeometry, deriveEgg, drawEgg, type EggAppearance } from './egg';
import { BABY_BOX, planFor, type LifeStage, type StageLook } from './plan';
import { normalizeState, type BlobbiState } from './state';
import { PROCEDURAL_GENERATION } from './version';
import { Drawing, drawDebug, type RenderOptions } from './svg';
import { buildFrontGeometry, drawFront, type FrontGeometry } from './views/front';
import { buildSideGeometry, drawSide, type SideGeometry } from './views/side';

export type { RenderOptions };

/** The Adult V2 viewBox, shared by every stage and view. */
export const VIEWBOX = { width: 211.66666, height: 238.125 } as const;

/**
 * The authored document transform, collapsed: `matrix(0.26458333 ...)` over
 * `translate(65.217497,-422.67995)` over `translate(-79.03227,287.45075)`.
 * It maps root units (what every builder works in) to viewBox units.
 */
const DOC_SCALE = 0.26458333;
const DOC_TX = DOC_SCALE * (65.217497 - 79.03227) + 1.3647759;
const DOC_TY = DOC_SCALE * (-422.67995 + 287.45075) + 37.271946;
export const DOCUMENT_TRANSFORM = { scale: DOC_SCALE, tx: DOC_TX, ty: DOC_TY } as const;
const DOC_MATRIX = `matrix(${DOC_SCALE},0,0,${DOC_SCALE},${DOC_TX.toFixed(6)},${DOC_TY.toFixed(6)})`;

export type BlobbiGeometry = (FrontGeometry | SideGeometry) & {
  stage: LifeStage;
  /** Size of this stage relative to the adult. */
  scale: number;
  look: StageLook;
  palette: BlobbiPalette;
  motion: BlobbiMotion;
  phase: number | undefined;
  debug: DebugMark[];
};

/**
 * Resolve everything that will be drawn, for the morphology's life stage and
 * the state's view. Pure; mutates nothing.
 */
export function buildBlobbiGeometry(morphology: BlobbiMorphology, state?: Partial<BlobbiState>): BlobbiGeometry {
  // The morphology already is a life stage's; an egg has none and is drawn by `renderEggSvg`.
  const s = normalizeState({ ...state, stage: morphology.stage });
  const plan = planFor(morphology.stage);
  const view = s.view === 'side' ? buildSideGeometry(plan, morphology, s) : buildFrontGeometry(plan, morphology, s, s.view === 'back');
  return { ...view, stage: plan.stage, scale: plan.scale, look: plan.look, palette: morphology.palette, motion: s.motion, phase: s.phase };
}

/** Write the geometry as SVG markup. */
export function renderGeometryToSvg(geo: BlobbiGeometry, options: RenderOptions = {}): string {
  const gait = geo.look.gait;
  const palette = options.paletteOverride ? { ...geo.palette, ...options.paletteOverride } : geo.palette;
  const d = new Drawing(options.idPrefix, palette, { motion: geo.motion, view: geo.view, phase: geo.phase, scale: geo.scale, gait }, geo.look);
  const parts = geo.view === 'side' ? drawSide(d, geo, options) : drawFront(d, geo, options);
  const debug = options.debug ? drawDebug(geo.debug, options.debug) : '';

  // The whole character is the `body` rig part: it breathes and bounces about the ground under it.
  let character = ' data-rig="body"';
  if (geo.motion !== 'still') {
    if (geo.phase === undefined) character += ` style="transform-origin:${geo.ground.x.toFixed(3)}px ${geo.ground.y.toFixed(3)}px"`;
    else {
      const transform = poseTransform(motionPose(geo.motion, geo.view, 'body', geo.phase, geo.scale, gait), geo.ground);
      if (transform) character += ` transform="${transform}"`;
    }
  }
  const live = geo.motion !== 'still' && geo.phase === undefined;
  const mirrored = geo.view === 'side' && geo.mirrored;
  const facing = geo.view === 'side' ? ` data-blobbi-direction="${mirrored ? 'left' : 'right'}"` : '';
  // A left-facing profile is the right-facing one reflected about the viewBox's centre line.
  const flip = mirrored ? `<g transform="matrix(-1,0,0,1,${VIEWBOX.width},0)">` : '';

  // The stage's own frame: the baby's official artwork is a square around it.
  const box = options.frame === 'stage' && geo.stage === 'baby' ? stageViewBox(BABY_BOX) : `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`;

  return (
    `<svg viewBox="${box}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"` +
    ` data-blobbi-generation="${PROCEDURAL_GENERATION}" data-blobbi-stage="${geo.stage}" data-blobbi-view="${geo.view}" data-blobbi-gait="${gait}"${facing}` +
    `${live ? ` ${LIVE_MOTION_ATTRIBUTE}="${geo.motion}" style="--pb-scale:${geo.scale}${liveOffset(options)}"` : ''}>` +
    `<defs>${d.defs}</defs>` +
    flip +
    `<g transform="${DOC_MATRIX}"><g data-part="character"${character}>${parts}</g>${debug}</g>` +
    (mirrored ? '</g>' : '') +
    `</svg>`
  );
}

/** Where in its cycle a live drawing starts, as the custom property the stylesheet's delays read. */
function liveOffset(options: RenderOptions): string {
  const offset = options.motionOffset;
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return '';
  const o = offset - Math.floor(offset);
  return o === 0 ? '' : `;--pb-phase:${Math.round(o * 1000) / 1000}`;
}

/** A square of root units as a viewBox. */
function stageViewBox(box: { x: number; y: number; size: number }): string {
  const n = (v: number) => (Math.round(v * 1e5) / 1e5).toString();
  return `${n(box.x * DOC_SCALE + DOC_TX)} ${n(box.y * DOC_SCALE + DOC_TY)} ${n(box.size * DOC_SCALE)} ${n(box.size * DOC_SCALE)}`;
}

/**
 * The egg of a genome, as SVG. An egg has one drawing: the state's view,
 * direction, expression and gaze do not apply; its crack level and motion do.
 */
export function renderEggSvg(genome: BlobbiGenome, state?: Partial<BlobbiState>, options: RenderOptions = {}): string {
  const s = normalizeState({ ...state, stage: 'egg' });
  const geo = buildEggGeometry(deriveEgg(genome), s.eggCrack);
  const { defs, parts, rig } = drawEgg(geo, { idPrefix: options.idPrefix, groundShadow: options.groundShadow, motion: s.motion, phase: s.phase });
  const live = s.motion !== 'still' && s.phase === undefined;
  const box = options.frame === 'stage' ? stageViewBox(EGG_BOX) : `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`;
  return (
    `<svg viewBox="${box}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"` +
    ` data-blobbi-generation="${PROCEDURAL_GENERATION}" data-blobbi-stage="egg" data-blobbi-view="front" data-blobbi-gait="rest" data-blobbi-egg-crack="${s.eggCrack}"` +
    `${live ? ` ${LIVE_MOTION_ATTRIBUTE}="${s.motion}"${liveOffset(options) ? ` style="${liveOffset(options).slice(1)}"` : ''}` : ''}>` +
    `<defs>${defs}</defs><g transform="${DOC_MATRIX}"><g data-part="character"${rig}>${parts}</g></g></svg>`
  );
}

/**
 * Genome + state to SVG, in one call. The state's stage decides what is
 * drawn: the egg, or the genome developed to a baby or an adult.
 */
export function renderBlobbiSvg(genome: BlobbiGenome, state?: Partial<BlobbiState>, options?: RenderOptions): string {
  const s = normalizeState(state);
  if (s.stage === 'egg') return renderEggSvg(genome, s, options);
  return renderGeometryToSvg(buildBlobbiGeometry(deriveMorphology(genome, s.stage), s), options);
}

export interface GenerateBlobbiInput extends GenerateGenomeInput {
  state?: Partial<BlobbiState>;
  render?: RenderOptions;
}

export interface GeneratedBlobbi {
  genome: BlobbiGenome;
  /** The genome developed to the state's life stage; null for an egg, which has `egg` instead. */
  morphology: BlobbiMorphology | null;
  egg: EggAppearance | null;
  svg: string;
}

/**
 * The whole pipeline: `generateBlobbi({ seed: 'abc123' })`.
 * The same input always returns the same genome, morphology and SVG.
 */
export function generateBlobbi(input: GenerateBlobbiInput): GeneratedBlobbi {
  const { state, render, ...identity } = input;
  const genome = generateGenome(identity);
  const s = normalizeState(state);
  if (s.stage === 'egg') return { genome, morphology: null, egg: deriveEgg(genome), svg: renderEggSvg(genome, s, render) };
  const morphology = deriveMorphology(genome, s.stage);
  return { genome, morphology, egg: null, svg: renderGeometryToSvg(buildBlobbiGeometry(morphology, s), render) };
}
