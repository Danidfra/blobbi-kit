/**
 * THE ADULT PLAN: the Adult V2 artwork, measured.
 *
 * Every number is taken from the kit's authored drawings (`front.ts` and
 * `side.ts` of `@blobbi-kit/renderer`), with their document transforms
 * collapsed into root units. The front view's root units are the
 * artwork's own; the side view was authored 2.8% smaller under a different
 * transform and is converted into the same space, so one unit is one unit
 * everywhere (the eye white is 53.8 by 63.6 in both).
 *
 * With every gene at zero the builders reproduce these drawings.
 */
import { pt } from '../geometry';
import type { ArmTemplate, EyeLocal, FrontPlan, SidePlan, StagePlan } from './types';

const AXIS = 408.65657;
const TOP = 136.79346;
/** Both eye groups carry `matrix(0.69877802, …)`; the white is `rx="77" ry="91"`. */
const EYE_K = 0.69877802;

const iris = { rx: 52, ry: 63 };
const pupil = { rx: 32, ry: 41 };
const highlight = { rx: 18, ry: 23 };
const glint = { r: 8.5, opacity: 0.76 };

// The highlights sit on the lit (viewer's-left) side of BOTH eyes, so the two
// eyes are not mirror images: each has its own offsets.
const LOCAL_LEFT: EyeLocal = {
  iris: { dx: 4, dy: 8, ...iris },
  pupil: { dx: 10, dy: 19, ...pupil },
  highlight: { dx: -15, dy: -23, ...highlight },
  glint: { dx: 26, dy: 35, ...glint },
};
const LOCAL_RIGHT: EyeLocal = {
  iris: { dx: -4, dy: 8, ...iris },
  pupil: { dx: -10, dy: 19, ...pupil },
  highlight: { dx: -29, dy: -23, ...highlight },
  glint: { dx: 12, dy: 35, ...glint },
};
/** The profile eye looks ahead: its iris sits well forward in the white. */
const LOCAL_SIDE: EyeLocal = {
  iris: { dx: 20.57476, dy: 11.41314, ...iris },
  pupil: { dx: 14.57476, dy: 22.41314, ...pupil },
  highlight: { dx: -4.42527, dy: -19.58686, ...highlight },
  glint: { dx: 36.57476, dy: 38.41314, ...glint },
};

/** `m 148.21229,496.57208 c -44,24 -42,99 2,133 34,26 63,-5 63,-45 -1,-45 -21,-76 -65,-88 z` */
export const ARM_FRONT: ArmTemplate = [
  [pt(-44, 24), pt(-42, 99), pt(2, 133)],
  [pt(36, 159), pt(65, 128), pt(65, 88)],
  [pt(64, 43), pt(44, 12), pt(0, 0)],
];
/** The profile's near arm, hanging over the middle of the body. */
export const ARM_SIDE_NEAR: ArmTemplate = [
  [pt(41.801, 15.554), pt(55.411, 79.713), pt(26.247, 115.682)],
  [pt(2.916, 144.845), pt(-29.164, 129.291), pt(-36.941, 95.268)],
  [pt(-45.69, 56.383), pt(-34.025, 15.554), pt(0, 0)],
];
/** The profile's far arm: the same paddle, seen from its other side. */
export const ARM_SIDE_FAR: ArmTemplate = [
  [pt(-40.829, 18.47), pt(-43.745, 83.602), pt(-7.777, 112.765)],
  [pt(18.47, 134.152), pt(41.801, 111.793), pt(41.801, 78.741)],
  [pt(40.829, 41.801), pt(29.164, 12.637), pt(0, 0)],
];

const FRONT: FrontPlan = {
  body: {
    axisX: AXIS,
    top: TOP,
    baseY: 767.46063,
    // `m 408.65657,136.79346 c 72,0 130,36.36624 174,95.70063 47,63.16242 …`
    anchors: [
      { at: pt(0, 0), in: pt(0, 0), out: pt(72, 0), round: true },
      { at: pt(174, 95.70063), in: pt(-44, -59.33439), out: pt(47, 63.16242), top: 1 },
      { at: pt(264, 351.22132), in: pt(-14, -101.44267), out: pt(16, 115.79777), belly: 0.3 },
      { at: pt(123, 605.78501), in: pt(99, -41.15128), out: pt(-37, 15.3121), belly: 1 },
      { at: pt(0, 630.66717), in: pt(45, -1.91401), out: pt(0, 0), round: true },
    ],
    halfWidth: 264,
    crownHalfWidth: 174,
  },
  eyes: {
    k: EYE_K,
    white: { rx: 77, ry: 91 },
    // The kit's `GAZE_TRAVEL_UNITS.v2`.
    gazeTravel: 12,
    left: pt(EYE_K * 319.65656 + 79.280551, EYE_K * 383.79346 + 152.15487),
    right: pt(EYE_K * 497.65656 + 163.09607, EYE_K * 383.79346 + 145.17025),
    localLeft: LOCAL_LEFT,
    localRight: LOCAL_RIGHT,
  },
  brows: {
    width: 76,
    strokeWidth: 11,
    opacity: 0.72,
    // `m 266.25672,330.36951 q 38,-25 76,1` and `m 464.49446,330.02033 q 38,-26 76,-1`
    left: pt(266.25672, 330.36951),
    right: pt(464.49446, 330.02033),
    neutralLeft: { start: 0, ctrl: -25 / 76, end: 1 / 76 },
    neutralRight: { start: 0, ctrl: -26 / 76, end: -1 / 76 },
  },
  cheeks: {
    // Both groups carry `translate(-7.3047614,-15.343688)`.
    left: pt(245.65657 - 7.3047614, 514.79346 - 15.343688),
    right: pt(571.65656 - 7.3047614, 514.79346 - 15.343688),
    rx: 47,
    ry: 30,
    opacity: 0.74,
    highlightOpacity: 0.17,
    highlight: { dx: -14, dy: -9, rx: 18, ry: 9 },
  },
  mouth: {
    // `m 371.1973,494.83689 c 15.89586,30.56679 67.22108,31.06386 82.71435,0`
    start: pt(371.1973, 494.83689),
    width: 82.71435,
    strokeWidth: 14.0674,
    depthScale: 1,
    neutral: {
      width: 1,
      dy: 0,
      hx: (15.89586 + (82.71435 - 67.22108)) / 2 / 82.71435,
      low: (30.56679 + 31.06386) / 2 / 82.71435,
      up: (30.56679 + 31.06386) / 2 / 82.71435,
      hxSkew: (15.89586 - (82.71435 - 67.22108)) / 2 / 82.71435,
      lowSkew: (31.06386 - 30.56679) / 2 / 82.71435,
    },
  },
  // `ellipse rx="79" ry="57"` under `rotate(∓7)` about the origin: both land at y = 744.
  feet: { spacing: 94, cy: 744, rx: 79, ry: 57, rotation: 7, shadow: { dy: 24.79346, rx: 77, ry: 55 } },
  arms: { left: pt(148.21229, 496.57208), right: pt(669.10084, 497.92126), template: ARM_FRONT, scale: 1 },
  tuft: {
    root: pt(AXIS + 3.4, TOP + 30.5),
    main: { cx: AXIS - 5, cy: TOP - 10, rx: 32, ry: 49, rotation: 18 },
    secondary: { cx: AXIS + 31, cy: TOP + 4, rx: 23, ry: 37, rotation: 52 },
    details: [
      { start: pt(402.0793, 168.45718), ctrl: pt(-16.59766, -33.04105), end: pt(7.98185, -61.26766), width: 8.94185 },
      { start: pt(422.30612, 166.25276), ctrl: pt(6.58014, -26.71721), end: pt(34.13093, -30.80669), width: 6.65413 },
    ],
  },
  shine: { dx: -84, dy: 92, rx: 23, ry: 13, rotation: -30 },
  glow: null,
  groundShadow: { cy: 830.79346, rx: 205, ry: 30 },
  ground: 801,
};

const SIDE: SidePlan = {
  body: {
    axisX: 399.6,
    // `m 330,133 c 72,-21 157,4 218,68 55,57 84,148 94,257 12,127 -35,235 -126,291 …`, converted.
    anchors: [
      { at: pt(334.991, 130.982), in: pt(-54.439, 17.498), out: pt(69.992, -20.414), round: true },
      { at: pt(546.912, 197.086), in: pt(-59.299, -62.215), out: pt(53.466, 55.411), top: 1 },
      { at: pt(638.291, 446.92), in: pt(-9.721, -105.961), out: pt(11.665, 123.459), belly: 0.4 },
      { at: pt(515.805, 729.805), in: pt(88.463, -54.439), out: pt(-46.662, 28.191), belly: 1 },
      { at: pt(348.601, 758.969), in: pt(64.16, 10.693), out: pt(-97.212, -16.526) },
      { at: pt(160.982, 569.406), in: pt(18.47, 99.156), out: pt(-18.47, -100.128), belly: 0.5 },
      { at: pt(206.672, 275.827), in: pt(-45.689, 87.49), out: pt(33.052, -64.16), top: 1 },
    ],
    gradient: { cx: 319.19, cy: 277.26, rx: 408.4, ry: 536.74, mid: 0.45 },
    shadow: { dx: 11.665, dy: 14.582 },
  },
  eye: { k: EYE_K, white: { rx: 77, ry: 91 }, gazeTravel: 12, center: pt(536.728, 400.755), local: LOCAL_SIDE },
  // `q 38,-26 76,-1` in root units: the front's right brow.
  brow: { width: 76, strokeWidth: 11, opacity: 0.72, start: pt(497.395, 325.724), neutral: { start: 0, ctrl: -26 / 76, end: -1 / 76 } },
  cheek: { center: pt(490.352, 485.336), rx: 39.916, ry: 28.191, opacity: 0.74, highlightOpacity: 0.17, highlight: { dx: -9.979, dy: -7.777, rx: 14.968, ry: 8.749 } },
  mouth: {
    // `c 11.119,18.027 31.426,24.808 54.587,18.855`: the visible half of a smile.
    start: pt(576.094, 489.087),
    width: 54.587,
    slope: 18.855 / 54.587,
    strokeWidth: 14.0674,
    depthScale: 1,
    neutral: (() => {
      const w = 54.587;
      const slope = 18.855 / w;
      const c1 = { x: 11.119 / w, y: 18.027 / w - slope * (11.119 / w) };
      const c2 = { x: 31.426 / w, y: 24.808 / w - slope * (31.426 / w) };
      const hxL = c1.x;
      const hxR = 1 - c2.x;
      return {
        width: 1,
        dy: 0,
        hx: (hxL + hxR) / 2,
        low: (c1.y + c2.y) / 2,
        up: (c1.y + c2.y) / 2,
        hxSkew: (hxL - hxR) / 2,
        lowSkew: (c2.y - c1.y) / 2,
      };
    })(),
  },
  feet: {
    near: { cx: 378.793, cy: 741.996, rx: 79.714, ry: 55.411, rotation: 8 },
    far: { cx: 419.061, cy: 743.672, rx: 69.992, ry: 49.578, rotation: -8, opacity: 0.78 },
  },
  arms: {
    near: { start: pt(436.297, 491.079), template: ARM_SIDE_NEAR },
    // The far arm hangs from the FAR SHOULDER. In this slightly turned profile
    // the far side of the body shows a little ahead of the near side (the
    // authored far foot stands 40 units ahead of the near one; shoulders are
    // wider apart than feet, so 128), and the body covers it: at rest it is
    // hidden, as it is in the kit's drawing. The kit parks its far arm at the
    // BACK edge instead (`m 52.63,136.20 …`, 240 units behind the near
    // shoulder), which is also hidden at rest but swings out of the back when
    // it walks; that position is not used.
    far: { start: pt(436.297 + 128, 491.079 + 6), template: ARM_SIDE_FAR, opacity: 0.76 },
    scale: 1,
  },
  tuft: {
    root: pt(376.12, 150.41),
    main: { cx: 363.182, cy: 117.372, rx: 30.136, ry: 47.634, rotation: 24 },
    secondary: { cx: 398.179, cy: 129.038, rx: 21.387, ry: 34.996, rotation: 57 },
    details: [
      { start: pt(366.006, 151.514), ctrl: pt(-16.598, -33.041), end: pt(7.982, -61.268), width: 8.942 },
      { start: pt(386.233, 149.309), ctrl: pt(6.58, -26.717), end: pt(34.131, -30.807), width: 6.654 },
    ],
  },
  shine: { cx: 375.82, cy: 208.751, rx: 22.359, ry: 12.638, rotation: -30 },
  glow: null,
  groundShadow: { cx: 403.039, cy: 798.826, rx: 199.284, ry: 29.163 },
  ground: 797.407,
};

export const ADULT_PLAN: StagePlan = {
  stage: 'adult',
  scale: 1,
  development: { antenna: 1, horn: 1, ear: 1, tail: 1, marking: 1, belly: true },
  look: { body: 'v2', eye: 'layered', gait: 'legs' },
  // Measured over a population, through every expression, as fractions of the
  // body's height: a raised brow reaches 0.20 and the eyes begin at 0.31; the
  // cheeks end at 0.63 and the widest open mouth at 0.70 (it is 0.27 of the
  // half-width wide). The brows' inner ends come within 40 units of the
  // middle, so there is no room BETWEEN them: the forehead is the skin above.
  // The shoulders are at 0.57 on the edge and the feet show from 0.87.
  surface: {
    face: { top: 0.19, bottom: 0.72 },
    marks: {
      forehead: { theta: [4, 16], y: [0.12, 0.148], size: 0.8 },
      chest: { theta: [14, 34], y: [0.775, 0.825] },
      // In profile the mouth reaches back to 0.65 of the half-depth, down to 0.69: the hip is below that.
      hip: { theta: [52, 66], y: [0.765, 0.82] },
      shoulder: { theta: [130, 156], y: [0.27, 0.42] },
    },
  },
  front: FRONT,
  side: SIDE,
};
