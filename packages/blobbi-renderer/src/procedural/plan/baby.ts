/**
 * THE BABY PLAN: the official Blobbi Baby, measured.
 *
 * The baby is the kit's Baby V1 (`baby-svg-data.ts` of
 * `@blobbi-kit/renderer`): a small floating seed. It has no arms, no feet,
 * no tuft and no brows. Its body is a pointed droplet with a flat three-stop
 * gradient and a soft inner glow; its eyes are a shaded white with one dark
 * disc and one highlight; its blush floats at the edges of its body. Every
 * number below is that drawing's, carried from its 100-unit box into root
 * units by one transform, so the canonical procedural baby IS the official
 * baby (the raster test holds it to that).
 *
 * The kit has no baby profile: it draws the front for both. The SIDE plan
 * here is therefore designed, as plainly as possible: the same seed, the
 * same paint, one eye and half the mouth moved to the face's edge.
 *
 * Nothing adult is added. Genes still shape this body (wider, taller, eyes
 * further apart), and traits appear on it as a baby would carry them:
 * antennae short, horns as buds, ears tiny, no tail yet, no tuft yet.
 */
import { pt, type Pt } from '../geometry';
import type { MouthPose } from '../expressions';
import type { EyeLocal, FrontPlan, PlanAnchor, SidePlan, StagePlan } from './types';

/** Root units per unit of the Baby V1 drawing's 100-unit box. */
export const BABY_UNIT = 5.58;
const AXIS = 408.65657;
/** Where the box's top edge sits: the seed's base then floats a little above the ground line. */
const BOX_TOP = 282;
/** The ground line every stage shares (the adult's soles). */
const GROUND = 801;

/** A point of the official drawing, in root units. */
const at = (x: number, y: number): Pt => pt(AXIS + (x - 50) * BABY_UNIT, BOX_TOP + y * BABY_UNIT);
const u = (n: number) => n * BABY_UNIT;

/** The official drawing's box, in root units: the baby's own frame. */
export const BABY_BOX = { x: AXIS - u(50), y: BOX_TOP, size: u(100) } as const;

// `M 50 15 Q 72 25 75 55 Q 75 80 50 88 Q 25 80 25 55 Q 28 25 50 15`: two
// quadratics a side, written here as the cubics that trace them exactly
// (a quadratic's control point pulls each cubic handle two thirds of the way).
const BODY: PlanAnchor[] = [
  { at: pt(0, 0), in: pt(0, 0), out: pt(u(14.6667), u(6.6667)), round: true },
  { at: pt(u(25), u(40)), in: pt(u(-2), u(-20)), out: pt(0, u(16.6667)), belly: 0.5 },
  { at: pt(0, u(73)), in: pt(u(16.6667), u(-5.3333)), out: pt(0, 0), round: true },
];

/** `M 42 62 Q 50 68 58 62`, as a mouth pose: a quadratic's handles sit a third of the way in. */
const DEPTH = 0.65;
const MOUTH: MouthPose = { width: 1, dy: 0, hx: 1 / 3, low: 0.25 / DEPTH, up: 0.25 / DEPTH, hxSkew: 0, lowSkew: 0 };

// One dark disc (`r="6"`, a unit below centre) and one highlight (`r="2"`, up
// and to the right) in each eye. The highlight is on the same side of both.
const EYE: EyeLocal = {
  iris: { dx: 0, dy: 1, rx: 6, ry: 6 },
  pupil: { dx: 0, dy: 1, rx: 6, ry: 6 },
  highlight: { dx: 2, dy: -1, rx: 2, ry: 2 },
  glint: { dx: 0, dy: 0, r: 0, opacity: 0 },
};
const EYES = {
  k: BABY_UNIT,
  white: { rx: 8, ry: 10 },
  // The kit's `GAZE_TRAVEL_UNITS.v1`.
  gazeTravel: 2,
  // The sleeping drawing's eyes: `M 30 45 Q 40 48 45 45`, a shallow arc across the eye.
  closed: { chord: 0, sag: 0.3, reach: 0.94, lineWidth: 2.5 / 8 },
  // The kit's wide baby eye: whites of 9 by 11.2 and a disc of 6.6.
  wide: { white: 1.125, inner: 1.1 },
};
/** `rgba(255,182,193,0.5)`, with no highlight. */
const CHEEK = { rx: u(6), ry: u(4), opacity: 0.5, highlightOpacity: 0, highlight: { dx: 0, dy: 0, rx: 0, ry: 0 }, strongScale: 1.2, hiddenAsleep: true };
/** The sleeping drawing's mouth: a dot (`circle cx="50" cy="65" r="1.5"`), here a tiny round mouth under the stroke. */
const ASLEEP: MouthPose = { width: 0.5 / 16, dy: 3 / 16, hx: 0, low: ((4 / 3) * 0.25) / 16 / DEPTH, up: -((4 / 3) * 0.25) / 16 / DEPTH, hxSkew: 0, lowSkew: 0 };

const FRONT: FrontPlan = {
  body: {
    axisX: AXIS,
    top: at(50, 15).y,
    baseY: at(50, 88).y,
    anchors: BODY,
    halfWidth: u(25),
    // The seed narrows to a point: its "crown" is the top fifth.
    crownHalfWidth: u(13),
    // The authored path starts with a zero-width flick up to y = 12.5; its box includes it.
    boxAbove: u(2.5),
  },
  eyes: { ...EYES, left: at(38, 45), right: at(62, 45), localLeft: EYE, localRight: EYE },
  brows: null,
  cheeks: { ...CHEEK, left: at(22, 55), right: at(78, 55) },
  mouth: { start: at(42, 62), width: u(16), strokeWidth: u(2.5), neutral: MOUTH, depthScale: DEPTH, asleep: ASLEEP },
  feet: null,
  arms: null,
  tuft: null,
  shine: null,
  // `ellipse cx="50" cy="45" rx="15" ry="20" fill="white" opacity="0.2"`
  glow: { center: at(50, 45), rx: u(15), ry: u(20), opacity: 0.2 },
  groundShadow: { cy: GROUND + 8, rx: u(17), ry: u(3.2) },
  ground: GROUND,
};

// The profile: the same seed, a touch fuller in front than behind, facing right.
const SIDE_AXIS = AXIS;
const SIDE_BODY: PlanAnchor[] = [
  { at: at(49.5, 15), in: pt(u(-13.8), u(6.8)), out: pt(u(15.2), u(6.6)), round: true },
  { at: at(75.5, 56), in: pt(u(-1.6), u(-21)), out: pt(0, u(16.4)), belly: 0.6 },
  { at: at(50.5, 88), in: pt(u(17), u(-5.2)), out: pt(u(-16.4), u(-5.4)) },
  { at: at(26, 54), in: pt(0, u(16.8)), out: pt(u(2.2), u(-19.6)), top: 0.4 },
];

const SIDE: SidePlan = {
  body: { axisX: SIDE_AXIS, anchors: SIDE_BODY, gradient: null, shadow: null },
  // The one eye sits where the front's right eye does; it looks ahead.
  eye: { ...EYES, center: at(63, 45), local: { ...EYE, pupil: { dx: 1.2, dy: 1, rx: 6, ry: 6 }, highlight: { dx: 3, dy: -1, rx: 2, ry: 2 } } },
  brow: null,
  cheek: { ...CHEEK, rx: u(5.2), ry: u(3.8), center: at(59.5, 56) },
  mouth: { start: at(65.2, 62), width: u(8.4), slope: 0.22, strokeWidth: u(2.5), neutral: { ...MOUTH, hx: 0.3, hxSkew: -0.08 }, depthScale: DEPTH },
  feet: null,
  arms: null,
  tuft: null,
  shine: null,
  glow: { center: at(47, 45), rx: u(14.5), ry: u(20), opacity: 0.2 },
  groundShadow: { cx: AXIS, cy: GROUND + 8, rx: u(17), ry: u(3.2) },
  ground: GROUND,
};

export const BABY_PLAN: StagePlan = {
  stage: 'baby',
  scale: 0.64,
  // Traits are there from the start, undeveloped: horns are buds, antennae
  // short, ears tiny. The tail and the belly patch have not appeared yet.
  development: { antenna: 0.5, horn: 0.34, ear: 0.52, tail: 0, marking: 0.85, belly: false },
  look: { body: 'v1', eye: 'simple', gait: 'hop' },
  // Measured over a population, through every expression: a baby is mostly
  // face. Its eyes begin at 0.23 of its height, and its widest open mouth
  // ends at 0.79 and is 0.6 of the half-width wide. Its body is a droplet,
  // narrow at both ends, so what is left is a little forehead and the skin
  // under its chin.
  surface: {
    face: { top: 0.215, bottom: 0.81 },
    marks: {
      forehead: { theta: [3, 14], y: [0.135, 0.175], size: 0.8 },
      chest: { theta: [10, 24], y: [0.86, 0.875] },
      hip: { theta: [56, 70], y: [0.83, 0.86] },
      shoulder: { theta: [130, 156], y: [0.26, 0.44] },
    },
  },
  front: FRONT,
  side: SIDE,
};
