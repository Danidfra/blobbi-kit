/**
 * THE FRONT VIEW, and the BACK view, which is the same body seen from behind.
 *
 * The back is not a second drawing. It is this view built from the
 * individual REFLECTED left to right (`mirrorMorphology`, `mirrorFrontPlan`):
 * same silhouette, the tuft leaning the other way, a single antenna now on
 * the other side of the screen. The face is left out, the arms and tuft go
 * behind the body (as in the kit's back view), and the trait frame is told
 * the body faces away, which is what hides a forehead horn and reveals a tail.
 * Lighting does not turn with the character: the gradient and the shine stay
 * on the viewer's left.
 */
import { NEUTRAL_POSE, applyFaceParts, resolveFacePose, restingPose } from '../expressions';
import { buildFrontFace, type FaceGeometry } from '../face';
import { type DebugMark, type EllipseShape, lerp, pt } from '../geometry';
import { buildFrontLimbs, type FrontLimbs } from '../limbs';
import { mirrorMorphology, type BlobbiMorphology } from '../morphology';
import { mirrorFrontPlan, type FrontPlan, type StagePlan } from '../plan';
import { buildFrontBody, CANONICAL_PARAMS, type FrontBody } from '../silhouette';
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
import { frontFrame } from '../traits/frame';
import { buildMarkings, type MarkingsGeometry } from '../traits/markings';

export interface FrontGeometry {
  view: 'front' | 'back';
  body: FrontBody;
  /** Absent from behind. */
  face: FaceGeometry | null;
  limbs: FrontLimbs;
  appendages: Appendage[];
  markings: MarkingsGeometry;
  gradient: { cx: number; cy: number; rx: number; ry: number; mid: number };
  /** The contact shadow under a `v2` body; a `v1` body has none. */
  shadowD: string | null;
  shine: EllipseShape | null;
  /** A `v1` body's inner light. */
  glow: (EllipseShape & { opacity: number }) | null;
  /** The point the whole character turns and breathes about: the middle of the ground under it. */
  ground: { x: number; y: number };
  debug: DebugMark[];
}

const canonCache = new WeakMap<FrontPlan['body'], FrontBody>();
function canonicalBody(plan: FrontPlan): FrontBody {
  let body = canonCache.get(plan.body);
  if (!body) {
    body = buildFrontBody(plan.body, CANONICAL_PARAMS);
    canonCache.set(plan.body, body);
  }
  return body;
}

export function buildFrontGeometry(stage: StagePlan, morphology: BlobbiMorphology, state: BlobbiState, away: boolean): FrontGeometry {
  const plan = away ? mirrorFrontPlan(stage.front) : stage.front;
  const m = away ? mirrorMorphology(morphology) : morphology;
  const body = buildFrontBody(plan.body, m);
  const canon = canonicalBody(plan);
  const limbs = buildFrontLimbs(plan, canon, m, body);

  let face: FaceGeometry | null = null;
  if (!away) {
    // A stage with no brows still needs a resting brow pose to blend from; it is never drawn.
    const rest = plan.brows ?? { neutralLeft: NEUTRAL_POSE.browLeft, neutralRight: NEUTRAL_POSE.browRight };
    const neutral = restingPose(plan.mouth.neutral, rest.neutralLeft, rest.neutralRight);
    face = buildFrontFace(plan, m, body, applyFaceParts(resolveFacePose(state.expression, neutral), neutral, state.face), state.gaze, state.sleeping);
  }

  const frame = frontFrame(body, stage.scale, away);
  // Each leaf's depth, from where it stands on this crown in this view.
  if (limbs.tuft) {
    const lat = (leaf: { cx: number }) => (leaf.cx - body.apex.x) / body.crownHalfWidth;
    limbs.tuft.depths = { main: frame.depthAt(lat(limbs.tuft.main), TUFT_FORE.main), secondary: frame.depthAt(lat(limbs.tuft.secondary), TUFT_FORE.secondary) };
  }
  const appendages: Appendage[] = [
    ...m.antennae.map((a) => buildAntenna(a, frame)),
    ...(m.horns ? buildHorns(m.horns, frame) : []),
    ...(m.ears ? buildEars(m.ears, frame) : []),
  ];
  const tail = m.tail ? buildTail(m.tail, frame) : null;
  if (tail) appendages.push(tail);
  const markings = buildMarkings(m, frame, face?.cheeks ?? []);

  const width = body.halfWidth * 2;
  const left = body.axisX - body.halfWidth;
  const canonHeight = plan.body.baseY - plan.body.top;
  let gradient: FrontGeometry['gradient'];
  let shadowD: string | null = null;
  if (stage.look.body === 'v2') {
    // The authored gradient resolves to a centre at 35.86% / 25% of the body
    // box and radii of 82.82% / 82%.
    gradient = { cx: left + 0.3586 * width, cy: body.top + 0.25 * body.height, rx: 0.8282 * width, ry: 0.82001 * body.height, mid: 0.44 };
    // The authored body-shadow is the same silhouette before its vertical
    // squash (×1.044925), dropped a few units: a soft rim under the base.
    shadowD = body.mapped((q) => pt(q.x - 0.65657, body.top + 3.20654 * stage.scale + (q.y - body.top) * 1.044925));
  } else {
    // Baby V1: `cx="0.3" cy="0.25"` and the default radius of half, over the
    // authored path's box (which reaches a little above the crown).
    const above = (plan.body.boxAbove ?? 0) * m.bodyHeight;
    const boxTop = body.top - above;
    const boxHeight = body.height + above;
    gradient = { cx: left + 0.3 * width, cy: boxTop + 0.25 * boxHeight, rx: 0.5 * width, ry: 0.5 * boxHeight, mid: 0.6 };
  }
  const shine: EllipseShape | null = plan.shine && {
    cx: body.axisX + plan.shine.dx * m.bodyWidth * lerp(1, m.topWidth, 0.5),
    cy: body.top + (plan.shine.dy / canonHeight) * body.height,
    rx: plan.shine.rx,
    ry: plan.shine.ry,
    rotation: plan.shine.rotation,
  };
  const glow = plan.glow && {
    cx: body.axisX + (plan.glow.center.x - plan.body.axisX) * m.bodyWidth,
    cy: body.top + ((plan.glow.center.y - plan.body.top) / canonHeight) * body.height,
    rx: plan.glow.rx * m.bodyWidth,
    ry: plan.glow.ry * m.bodyHeight,
    opacity: plan.glow.opacity,
  };

  return {
    view: away ? 'back' : 'front',
    body,
    face,
    limbs,
    appendages,
    markings,
    gradient,
    shadowD,
    shine,
    glow,
    ground: { x: body.axisX, y: plan.ground },
    debug: [...body.debug, ...limbs.debug, ...appendages.flatMap((a) => a.debug), ...markings.debug, ...(face?.debug ?? [])],
  };
}

/** Write the character, back to front. */
export function drawFront(d: Drawing, geo: FrontGeometry, options: RenderOptions): string {
  const c = d.palette;
  const { body, face, limbs, appendages, markings } = geo;
  d.bodyGradient(geo.gradient, geo.gradient.mid);
  let out = '';
  if (geo.shadowD || limbs.feet.length > 0) d.blur('blur10', 10, 'x="-0.15584416" y="-0.21818182" width="1.3116883" height="1.4363636"');
  if (geo.shadowD) out += `<path data-part="body-shadow" d="${geo.shadowD}" fill="${c.bodyShadow}" opacity="0.18" filter="${d.url('blur10')}"/>`;
  if (options.groundShadow) {
    d.blur('blur18', 18, 'x="-0.10536585" y="-0.72" width="1.2107317" height="2.44"');
    out += ellipse(limbs.groundShadow, `data-part="ground-shadow" fill="${c.groundShadow}" opacity="0.18" filter="${d.url('blur18')}"`);
  }
  for (const foot of limbs.feet) {
    if (foot.shadow) out += ellipse(foot.shadow, `data-part="${foot.side}-foot-shadow" fill="${c.bodyShadow}" opacity="0.22" filter="${d.url('blur10')}"`);
  }
  for (const foot of limbs.feet) out += drawFoot(d, foot);
  // Rooted traits and the tuft's leaves, in depth order (see `drawCrown`). From
  // behind, the leaves and the arms are on the far side of the body with them.
  const crown = drawCrown(d, appendages, limbs.tuft, geo.view === 'back');
  if (geo.view === 'back') for (const arm of limbs.arms) out += drawArm(d, arm);
  out += crown.behind;
  out += `<path data-part="body-base" d="${body.d}" fill="${d.url('body')}"/>`;
  if (geo.glow) out += ellipse(geo.glow, `data-part="body-glow" fill="${c.white}" opacity="${geo.glow.opacity}"`);
  out += drawBodyMarks(d, markings, body.d);
  out += crown.front;
  if (geo.view === 'front') for (const arm of limbs.arms) out += drawArm(d, arm);
  out += drawAppendages(d, appendages, 'over');
  if (face) {
    for (const eye of face.eyes) out += drawEye(d, eye);
    for (const brow of face.brows) out += drawBrow(d, brow);
  }
  if (face) {
    if (d.look.eye === 'simple') {
      // Baby V1 order: the mouth, then the blush over everything.
      out += drawMouth(d, face.mouth);
      for (const cheek of face.cheeks) out += drawCheek(d, cheek);
      out += drawFreckles(d, markings);
    } else {
      for (const cheek of face.cheeks) out += drawCheek(d, cheek);
      out += drawFreckles(d, markings);
      out += drawMouth(d, face.mouth);
    }
  }
  if (geo.shine) out += ellipse(geo.shine, `data-part="body-shine" fill="${c.white}" opacity="0.3"`);
  return out;
}
