/**
 * THE SIDE VIEW: a real profile, built from the same morphology.
 *
 * Nothing here squeezes the front drawing. The profile has its own
 * silhouette (the plan's profile anchors, shaped by the same body
 * parameters), one eye riding the face's edge, half a mouth, a near and a
 * far arm and foot, and every trait placed by the profile's own frame.
 *
 * One drawing serves both directions. It is always BUILT facing right and
 * mirrored for left, as the kit does. What is not mirrored is anatomy that
 * exists on one side only: `near` says which flank is turned to the viewer,
 * so a Blobbi with spots on one flank shows them facing one way and not the
 * other, and a single antenna is on the near side or the far side.
 */
import { NEUTRAL_POSE, applyFaceParts, resolveFacePose, restingPose } from '../expressions';
import { buildSideFace, type FaceGeometry } from '../face';
import { type DebugMark, type EllipseShape, pt } from '../geometry';
import { buildSideLimbs, type SideLimbs } from '../limbs';
import type { BlobbiMorphology } from '../morphology';
import type { SidePlan, StagePlan } from '../plan';
import { buildFrontBody, buildSideBody, CANONICAL_PARAMS, type SideBody } from '../silhouette';
import type { BlobbiState } from '../state';
import {
  Drawing,
  drawAppendages,
  drawArm,
  drawCrown,
  drawBodyMarks,
  drawBrow,
  drawCheek,
  drawEye,
  drawFoot,
  drawFreckles,
  drawMouth,
  ellipse,
  TUFT_FORE,
  type RenderOptions,
} from '../svg';
import { buildAntenna, buildEars, buildHorns, buildTail, type Appendage } from '../traits/appendages';
import { sideFrame } from '../traits/frame';
import { buildMarkings, type MarkingsGeometry } from '../traits/markings';

export interface SideGeometry {
  view: 'side';
  /** The drawing is reflected: the Blobbi faces left. */
  mirrored: boolean;
  /** The flank turned to the viewer: -1 the one on the viewer's left from the front, 1 the right. */
  near: -1 | 1;
  body: SideBody;
  face: FaceGeometry;
  limbs: SideLimbs;
  appendages: Appendage[];
  markings: MarkingsGeometry;
  gradient: { cx: number; cy: number; rx: number; ry: number; mid: number };
  shadowD: string | null;
  shine: EllipseShape | null;
  glow: (EllipseShape & { opacity: number }) | null;
  ground: { x: number; y: number };
  debug: DebugMark[];
}

const canonCache = new WeakMap<SidePlan['body'], SideBody>();
function canonicalBody(plan: SidePlan): SideBody {
  let body = canonCache.get(plan.body);
  if (!body) {
    body = buildSideBody(plan.body, CANONICAL_PARAMS);
    canonCache.set(plan.body, body);
  }
  return body;
}

export function buildSideGeometry(stage: StagePlan, m: BlobbiMorphology, state: BlobbiState): SideGeometry {
  const plan = stage.side;
  const mirrored = state.direction === 'left';
  // Facing right shows the flank that is on the viewer's left from the front.
  const near: -1 | 1 = mirrored ? 1 : -1;
  const body = buildSideBody(plan.body, m);
  const canon = canonicalBody(plan);
  const limbs = buildSideLimbs(plan, canon, m, body);

  // The profile's one brow uses the front's "inner end last" poses.
  const restBrow = plan.brow?.neutral ?? NEUTRAL_POSE.browLeft;
  const neutral = restingPose(plan.mouth.neutral, restBrow, restBrow);
  // Gaze is screen-relative; a mirrored drawing looks the other way for the same number.
  const gaze = mirrored ? { x: -state.gaze.x, y: state.gaze.y } : state.gaze;
  const frontEyes = stage.front.eyes;
  const face = buildSideFace(plan, canon, m, body, applyFaceParts(resolveFacePose(state.expression, neutral), neutral, state.face), gaze, state.sleeping, near, (frontEyes.right.x - frontEyes.left.x) / 2);

  // The crown is as deep as the front's crown is wide, less the profile's lean.
  const crownHalfDepth = stage.front.body.crownHalfWidth * 0.86;
  // How high the head's surface is across its crown is the FRONT silhouette's to say: this individual's own.
  const across = buildFrontBody(stage.front.body, m);
  const crownY = (lat: number) => across.topAt(across.apex.x + lat * across.crownHalfWidth);
  const frame = sideFrame(body, stage.scale, near, crownHalfDepth, crownY);
  // The leaves stand on the centre line: nearer than what is on the far flank, further than what is on the near one.
  if (limbs.tuft) {
    limbs.tuft.depths = { main: frame.depthAt(0, TUFT_FORE.main), secondary: frame.depthAt(0, TUFT_FORE.secondary) };
  }
  const appendages: Appendage[] = [
    ...m.antennae.map((a) => buildAntenna(a, frame)),
    ...(m.horns ? buildHorns(m.horns, frame) : []),
    ...(m.ears ? buildEars(m.ears, frame) : []),
  ];
  const tail = m.tail ? buildTail(m.tail, frame) : null;
  if (tail) appendages.push(tail);
  const markings = buildMarkings(m, frame, face.cheeks);

  // The plan's gradient and shine keep their place in the body's box as it changes.
  const mapX = (x: number) => body.left + ((x - canon.left) / (canon.right - canon.left)) * (body.right - body.left);
  const mapY = (y: number) => body.top + ((y - canon.top) / canon.height) * body.height;
  const g = plan.body.gradient;
  const boxWidth = body.right - body.left;
  const gradient = g
    ? { cx: mapX(g.cx), cy: mapY(g.cy), rx: (g.rx * boxWidth) / (canon.right - canon.left), ry: (g.ry * body.height) / canon.height, mid: g.mid }
    : // A `v1` body: the Baby V1 gradient over the profile's own box.
      { cx: body.left + 0.3 * boxWidth, cy: body.top + 0.25 * body.height, rx: 0.5 * boxWidth, ry: 0.5 * body.height, mid: 0.6 };
  const shine: EllipseShape | null = plan.shine && { ...plan.shine, cx: mapX(plan.shine.cx), cy: mapY(plan.shine.cy) };
  const glow = plan.glow && {
    cx: mapX(plan.glow.center.x),
    cy: mapY(plan.glow.center.y),
    rx: (plan.glow.rx * boxWidth) / (canon.right - canon.left),
    ry: (plan.glow.ry * body.height) / canon.height,
    opacity: plan.glow.opacity,
  };
  const shadow = plan.body.shadow;

  return {
    view: 'side',
    mirrored,
    near,
    body,
    face,
    limbs,
    appendages,
    markings,
    gradient,
    shadowD: shadow && body.mapped((q) => pt(q.x + shadow.dx, q.y + shadow.dy)),
    shine,
    glow,
    ground: { x: limbs.nearFoot && limbs.farFoot ? (limbs.nearFoot.foot.cx + limbs.farFoot.foot.cx) / 2 : body.axisX, y: plan.ground },
    debug: [...body.debug, ...limbs.debug, ...appendages.flatMap((a) => a.debug), ...markings.debug, ...face.debug],
  };
}

/** Write the profile, back to front, facing right. */
export function drawSide(d: Drawing, geo: SideGeometry, options: RenderOptions): string {
  const c = d.palette;
  const { body, face, limbs, appendages, markings } = geo;
  d.bodyGradient(geo.gradient, geo.gradient.mid);

  let out = '';
  if (options.groundShadow) {
    d.blur('blur18', 17.498, 'x="-0.10536585" y="-0.72" width="1.2107317" height="2.44"');
    out += ellipse(limbs.groundShadow, `data-part="ground-shadow" fill="${c.groundShadow}" opacity="0.18" filter="${d.url('blur18')}"`);
  }
  if (geo.shadowD) {
    // The kit's profile was authored 2.8% smaller: its blurs are that much tighter.
    d.blur('blur10', 9.721, 'x="-0.047986937" y="-0.036512589" width="1.0959739" height="1.0730252"');
    out += `<path data-part="body-shadow" d="${geo.shadowD}" fill="${c.bodyShadow}" opacity="0.18" filter="${d.url('blur10')}"/>`;
  }
  if (limbs.farFoot) out += drawFoot(d, limbs.farFoot);
  if (limbs.farArm) out += drawArm(d, limbs.farArm);
  const crown = drawCrown(d, appendages, limbs.tuft, false);
  out += crown.behind;
  out += `<path data-part="body-base" d="${body.d}" fill="${d.url('body')}"/>`;
  if (geo.glow) out += ellipse(geo.glow, `data-part="body-glow" fill="${c.white}" opacity="${geo.glow.opacity}"`);
  out += drawBodyMarks(d, markings, body.d);
  out += crown.front;
  if (limbs.nearArm) out += drawArm(d, limbs.nearArm);
  if (limbs.nearFoot) out += drawFoot(d, limbs.nearFoot);
  out += drawAppendages(d, appendages, 'over');
  const simple = d.look.eye === 'simple';
  if (!simple) {
    for (const cheek of face.cheeks) out += drawCheek(d, cheek);
    out += drawFreckles(d, markings);
  }
  if (geo.shine) out += ellipse(geo.shine, `data-part="body-shine" fill="${c.white}" opacity="0.3"`);
  for (const eye of face.eyes) out += drawEye(d, eye);
  for (const brow of face.brows) out += drawBrow(d, brow);
  out += drawMouth(d, face.mouth);
  if (simple) {
    for (const cheek of face.cheeks) out += drawCheek(d, cheek);
    out += drawFreckles(d, markings);
  }
  return out;
}
