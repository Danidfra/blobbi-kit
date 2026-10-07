/**
 * THE ADULT PLAN, as this package reads it: the kit's `ADULT_PLAN` (the
 * Adult V2 artwork, measured, in ROOT UNITS), picked apart into the few
 * named pieces the 3D builders use. Nothing here is a number of its own;
 * every value is the kit's, so the 3D body grows from exactly the drawing
 * the 2D renderer reproduces with every gene at zero.
 */
import { ADULT_PLAN, MARK_REGIONS, type MarkRegionName } from '@blobbi-kit/renderer/procedural';
import { pt } from './math';

const FRONT = ADULT_PLAN.front;
const SIDE = ADULT_PLAN.side;

export const AXIS = FRONT.body.axisX;
export const TOP = FRONT.body.top;
export const BASE_Y = FRONT.body.baseY;
/** The ground line the feet stand on. */
export const GROUND = FRONT.ground;
/** The canonical body's height, crown to base, in root units. */
export const CANON_HEIGHT = BASE_Y - TOP;
export const EYE_K = FRONT.eyes.k;

export const FRONT_BODY = FRONT.body;
/** The profile, facing right (+x is the face). */
export const SIDE_BODY = SIDE.body;

const local = (eye: typeof FRONT.eyes.localLeft) => ({
  iris: pt(eye.iris.dx, eye.iris.dy),
  pupil: pt(eye.pupil.dx, eye.pupil.dy),
  highlight: pt(eye.highlight.dx, eye.highlight.dy),
  glint: pt(eye.glint.dx, eye.glint.dy),
});

/** The eyes: centres, the white's radii (times EYE_K), the inner eye's radii and its authored offsets per side. */
export const EYES = {
  k: FRONT.eyes.k,
  white: FRONT.eyes.white,
  gazeTravel: FRONT.eyes.gazeTravel,
  left: FRONT.eyes.left,
  right: FRONT.eyes.right,
  iris: { rx: FRONT.eyes.localLeft.iris.rx, ry: FRONT.eyes.localLeft.iris.ry },
  pupil: { rx: FRONT.eyes.localLeft.pupil.rx, ry: FRONT.eyes.localLeft.pupil.ry },
  highlight: { rx: FRONT.eyes.localLeft.highlight.rx, ry: FRONT.eyes.localLeft.highlight.ry },
  glint: { r: FRONT.eyes.localLeft.glint.r, opacity: FRONT.eyes.localLeft.glint.opacity },
  localLeft: local(FRONT.eyes.localLeft),
  localRight: local(FRONT.eyes.localRight),
};

const brows = FRONT.brows!;
export const BROWS = { width: brows.width, strokeWidth: brows.strokeWidth, opacity: brows.opacity, left: brows.left, right: brows.right, neutralLeft: brows.neutralLeft, neutralRight: brows.neutralRight };

export const CHEEKS = FRONT.cheeks;
export const MOUTH = { start: FRONT.mouth.start, width: FRONT.mouth.width, strokeWidth: FRONT.mouth.strokeWidth };
export const FEET = FRONT.feet!;
export const ARMS = { left: FRONT.arms!.left, right: FRONT.arms!.right };
export const TUFT = FRONT.tuft!;
export const SHINE = FRONT.shine!;

/** Where the face is, as fractions of the body's height, and where a special mark may lie. */
export const SURFACE = ADULT_PLAN.surface;

export { MARK_REGIONS, type MarkRegionName };
