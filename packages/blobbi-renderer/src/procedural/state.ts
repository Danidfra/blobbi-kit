/**
 * STATE: what a Blobbi is doing right now. Temporary, and separate from the
 * genome on purpose.
 *
 * The genome answers "what does this Blobbi physically look like?" and never
 * changes. State answers everything that does change, at three speeds:
 *
 *  - its STAGE (egg, baby, adult), which changes a few times in a life;
 *  - how it is SEEN (front, side, back; facing left or right), which changes
 *    as it turns;
 *  - what it is DOING (expression, gaze, sleeping, motion), which changes
 *    all the time.
 *
 * The renderer takes genome and state and mutates neither. Nothing in state
 * can alter a proportion, a colour or a trait, and nothing in the genome can
 * make a face or take a step.
 */
import type { ExpressionWeights, FaceParts } from './expressions';
import { MOTIONS, type BlobbiMotion } from './motion';
import { EGG_CRACKS, type EggCrack } from './egg';
import { BLOBBI_STAGES, DIRECTIONS, VIEWS, type BlobbiStage, type Direction, type View } from './plan/types';

export { MOTIONS, type BlobbiMotion };

export interface BlobbiState {
  /** Egg, baby or adult. An egg has one drawing: it ignores view, direction, expression and gaze. */
  stage: BlobbiStage;
  view: View;
  /** Which way a profile faces. Ignored from the front and from behind. */
  direction: Direction;
  /** How much of each emotion the face shows. Empty is neutral. */
  expression: ExpressionWeights;
  /**
   * The face stated part by part instead (the kit's closed vocabulary),
   * applied over whatever the weights give. For hosts that name a face the
   * way they do for every other generation; a blend uses `expression`.
   */
  face?: FaceParts;
  /** Where the eyes look, -1..1 per axis (screen-relative: x = 1 is the viewer's right). */
  gaze: { x: number; y: number };
  /** Asleep: the eyes are shut whatever the expression asks of them. */
  sleeping: boolean;
  /** How cracked an egg's shell is; the host decides it from incubation progress. Ignored by a baby or adult. */
  eggCrack: EggCrack;
  motion: BlobbiMotion;
  /**
   * Where in the motion's cycle to draw, 0..1. Given: that frame is baked
   * into the SVG. Absent: the SVG carries the motion's name and the
   * stylesheet animates it.
   */
  phase?: number;
}

export const NEUTRAL_STATE: Readonly<BlobbiState> = Object.freeze({
  stage: 'adult',
  view: 'front',
  direction: 'right',
  expression: Object.freeze({}),
  gaze: Object.freeze({ x: 0, y: 0 }),
  sleeping: false,
  eggCrack: 'none',
  motion: 'still',
});

const axis = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Resolve partial or malformed state to a complete one. Total: never throws. */
export function normalizeState(state: Partial<BlobbiState> | undefined): BlobbiState {
  const out: BlobbiState = {
    stage: oneOf(BLOBBI_STAGES, state?.stage, 'adult'),
    view: oneOf(VIEWS, state?.view, 'front'),
    direction: oneOf(DIRECTIONS, state?.direction, 'right'),
    expression: state?.expression && typeof state.expression === 'object' ? state.expression : {},
    gaze: { x: axis(state?.gaze?.x), y: axis(state?.gaze?.y) },
    sleeping: state?.sleeping === true,
    eggCrack: oneOf(EGG_CRACKS, state?.eggCrack, 'none'),
    motion: oneOf(MOTIONS, state?.motion, 'still'),
  };
  if (state?.face && typeof state.face === 'object') out.face = state.face;
  if (typeof state?.phase === 'number' && Number.isFinite(state.phase)) out.phase = state.phase - Math.floor(state.phase);
  return out;
}
