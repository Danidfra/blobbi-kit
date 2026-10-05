/**
 * THE FACE: eyes, lids, brows, cheeks and mouth, placed on a body.
 *
 * The feature builders are shared by every stage and view; what differs is
 * the plan they read and the frame they are placed in.
 *
 *  - FRONT: a face frame on the body's axis, at the plan's eye line as a
 *    fraction of the body's height. The authored face is a slightly diagonal
 *    view (the viewer's-left eye a few units lower and further out, the
 *    highlights on the lit side of both eyes); that is in the plan, and the
 *    genes only add to it.
 *  - SIDE: the same heights, but every feature rides the profile's FRONT
 *    EDGE at its height, so a fuller belly or a deeper head carries the face
 *    forward with it. One eye, one cheek, one brow, and the visible half of
 *    the mouth. Which eye it is depends on which flank faces the viewer.
 *
 * An expression arrives as a `FacePose` in the face's own units and is
 * applied to this individual's features; nothing here knows emotion names.
 */
import { blushOpacity, lidShape, type BrowPose, type FacePose, type MouthPose } from './expressions';
import { type DebugMark, type EllipseShape, type Pt, fmt, fmtPt, lerp, pt } from './geometry';
import type { BlobbiMorphology } from './morphology';
import type { ClosedLid, EyeLocal, EyePlan, FrontPlan, MouthPlan, SidePlan } from './plan/types';
import type { FrontBody, SideBody } from './silhouette';

export interface LidGeometry {
  /** Fully shut: only `line` is drawn and the eye itself is omitted. */
  closed: boolean;
  /** Skin covering the eye above the lid edge (and below the lower lid), clipped to the eye. */
  upper: string;
  lower: string | null;
  /** The lid edge stroke. */
  line: string;
  lineWidth: number;
  lineOpacity: number;
  tint: number;
}

export interface EyeGeometry {
  /** The part prefix: `left-eye` / `right-eye` on the front, `eye` on the profile. */
  part: string;
  center: Pt;
  white: EllipseShape;
  iris: EllipseShape;
  pupil: EllipseShape;
  highlight: EllipseShape;
  glint: EllipseShape & { opacity: number };
  lid: LidGeometry | null;
  /**
   * How far the inner eye moves at a full gaze deflection, in root units.
   * The gaze in `state` is already applied to the shapes above; this is for
   * a host that moves the inner eye itself (the kit's live gaze).
   */
  travel: number;
}

export interface BrowGeometry {
  part: string;
  d: string;
  strokeWidth: number;
  opacity: number;
}

export interface CheekGeometry {
  part: string;
  base: EllipseShape;
  highlight: EllipseShape;
  baseOpacity: number;
  highlightOpacity: number;
}

export interface MouthGeometry {
  d: string;
  /** An open mouth is a closed, filled shape; a closed mouth is a single stroke. */
  open: boolean;
  strokeWidth: number;
  left: Pt;
  right: Pt;
}

export interface FaceGeometry {
  eyeLineY: number;
  eyes: EyeGeometry[];
  brows: BrowGeometry[];
  cheeks: CheekGeometry[];
  mouth: MouthGeometry;
  debug: DebugMark[];
}

export interface Gaze {
  x: number;
  y: number;
}

// ─── Feature builders ────────────────────────────────────────────────────────

/**
 * `slant` tips the lid's edge: positive lifts the end nearest the nose
 * (worry), negative lowers it (a scowl). It is how a face with no brows
 * shows what brows would; `innerDir` is which way the nose is.
 */
function buildLid(center: Pt, rx: number, ry: number, closure: number, closed: ClosedLid | undefined, slant = 0, innerDir = 0): LidGeometry | null {
  const shape = lidShape(closure, closed);
  if (!shape) return null;
  const y = center.y + shape.chord * ry;
  // The slant is gone by the time the eye is shut.
  const tip = (slant * (1 - shape.lower) * innerDir * ry) / 2;
  const endY = (dir: -1 | 1) => Math.min(center.y + 0.96 * ry, Math.max(center.y - 0.96 * ry, y - dir * tip));
  const reachAt = (endAt: number) => {
    const onOutline = rx * Math.sqrt(Math.max(0, 1 - ((endAt - center.y) / ry) ** 2));
    return shape.reach === null ? onOutline : lerp(onOutline, shape.reach * rx, shape.lower);
  };
  const yl = endY(-1);
  const yr = endY(1);
  const xl = center.x - reachAt(yl);
  const xr = center.x + reachAt(yr);
  const ctrlY = y + shape.sag * ry;
  // The skin regions run past the eye on every side; the clip trims them.
  const m = 4;
  const farL = center.x - rx - m;
  const farR = center.x + rx + m;
  const upper =
    `M ${fmt(farL)},${fmt(center.y - ry - m)} L ${fmt(farR)},${fmt(center.y - ry - m)} L ${fmt(farR)},${fmt(yr)} ` +
    `L ${fmt(xr)},${fmt(yr)} Q ${fmt(center.x)},${fmt(ctrlY)} ${fmt(xl)},${fmt(yl)} L ${fmt(farL)},${fmt(yl)} Z`;
  let lower: string | null = null;
  if (shape.lower > 0) {
    // The lower lid starts below the eye and rises until it lies on the upper edge.
    const lowY = lerp(center.y + 1.15 * ry, y, shape.lower);
    const lowCtrl = lowY + lerp(0, shape.sag * ry, shape.lower);
    lower =
      `M ${fmt(farL)},${fmt(center.y + ry + m)} L ${fmt(farR)},${fmt(center.y + ry + m)} L ${fmt(farR)},${fmt(lowY)} ` +
      `L ${fmt(xr)},${fmt(lowY)} Q ${fmt(center.x)},${fmt(lowCtrl)} ${fmt(xl)},${fmt(lowY)} L ${fmt(farL)},${fmt(lowY)} Z`;
  }
  return {
    closed: closure >= 0.999,
    upper,
    lower,
    line: `M ${fmt(xl)},${fmt(yl)} Q ${fmt(center.x)},${fmt(ctrlY)} ${fmt(xr)},${fmt(yr)}`,
    lineWidth: shape.lineWidth * rx,
    lineOpacity: shape.lineOpacity,
    tint: shape.tint,
  };
}

interface EyeInput {
  part: string;
  center: Pt;
  /** The plan's eye, with `k` already scaled by the individual's eye size. */
  plan: EyePlan;
  local: EyeLocal;
  pupilSize: number;
  irisScale: number;
  closure: number;
  gaze: Gaze;
  /** Lid slant and which way the nose is, for faces whose lids stand in for brows. */
  slant?: number;
  innerDir?: -1 | 0 | 1;
}

function buildEye({ part, center, plan, local, pupilSize, irisScale, closure, gaze, slant = 0, innerDir = 0 }: EyeInput): EyeGeometry {
  const { k, white } = plan;
  // A pose asks for "wide" as the adult's inner-eye scale (0.84 at full); each
  // stage's eye answers in its own way.
  const wide = Math.min(1, Math.max(0, (1 - irisScale) / 0.16));
  const s = lerp(1, plan.wide?.inner ?? 0.84, wide);
  const grow = lerp(1, plan.wide?.white ?? 1, wide);
  const rx = white.rx * k * grow;
  const ry = white.ry * k * grow;
  // The inner eye (iris, pupil, highlights) scales about the eye's centre
  // for `wide`, then follows the gaze as one group.
  const gx = gaze.x * plan.gazeTravel * k;
  const gy = gaze.y * plan.gazeTravel * k;
  const inner = (dx: number, dy: number, w: number, h: number, size = 1): EllipseShape => ({
    cx: center.x + dx * k * s + gx,
    cy: center.y + dy * k * s + gy,
    rx: w * k * s * size,
    ry: h * k * s * size,
  });
  return {
    part,
    center,
    white: { cx: center.x, cy: center.y, rx, ry },
    iris: inner(local.iris.dx, local.iris.dy, local.iris.rx, local.iris.ry, pupilSize),
    pupil: inner(local.pupil.dx, local.pupil.dy, local.pupil.rx, local.pupil.ry, pupilSize),
    highlight: inner(local.highlight.dx, local.highlight.dy, local.highlight.rx, local.highlight.ry),
    glint: { ...inner(local.glint.dx, local.glint.dy, local.glint.r, local.glint.r), opacity: local.glint.opacity },
    lid: buildLid(center, rx, ry, closure, plan.closed, slant, innerDir),
    travel: plan.gazeTravel * k,
  };
}

function buildBrow(part: string, start: Pt, width: number, pose: BrowPose, strokeWidth: number, opacity: number, debug: DebugMark[]): BrowGeometry {
  const a = pt(start.x, start.y + pose.start * width);
  const c = pt(start.x + 0.5 * width, start.y + pose.ctrl * width);
  const b = pt(start.x + width, start.y + pose.end * width);
  debug.push({ kind: 'anchor', at: a, group: 'brows' }, { kind: 'anchor', at: b, group: 'brows' });
  debug.push({ kind: 'control', at: c, from: a, group: 'brows' }, { kind: 'guide', from: c, to: b, group: 'brows' });
  return { part, d: `M ${fmtPt(a)} Q ${fmtPt(c)} ${fmtPt(b)}`, strokeWidth, opacity };
}

/**
 * The mouth, from a pose. `start` is the neutral mouth's left corner and
 * `unit` its width: every pose offset is in that unit. On the profile the
 * mouth slopes down toward the face's edge; `slope` keeps every shape on it.
 */
function buildMouth(start: Pt, unit: number, pose: MouthPose, curve: number, slope: number, strokeWidth: number, debug: DebugMark[]): MouthGeometry {
  // `curve` already carries the stage's depth: a baby's mouth shapes are shallower.
  const width = unit * pose.width;
  const onSlope = (x: number, y: number): Pt => pt(x, y + slope * (x - start.x));
  const x0 = start.x + (unit - width) / 2;
  const y = start.y + pose.dy * unit;
  const left = onSlope(x0, y);
  const right = onSlope(x0 + width, y);
  const hxL = (pose.hx + pose.hxSkew) * width;
  const hxR = (pose.hx - pose.hxSkew) * width;
  const depth = unit * curve;
  const lowL = onSlope(x0 + hxL, y + (pose.low - pose.lowSkew) * depth);
  const lowR = onSlope(x0 + width - hxR, y + (pose.low + pose.lowSkew) * depth);
  const open = Math.abs(pose.low - pose.up) * depth > 0.75;
  let d = `M ${fmtPt(left)} C ${fmtPt(lowL)} ${fmtPt(lowR)} ${fmtPt(right)}`;
  debug.push({ kind: 'anchor', at: left, group: 'mouth' }, { kind: 'anchor', at: right, group: 'mouth' });
  debug.push({ kind: 'control', at: lowL, from: left, group: 'mouth' }, { kind: 'control', at: lowR, from: right, group: 'mouth' });
  if (open) {
    const upR = onSlope(x0 + width - hxR, y + pose.up * depth);
    const upL = onSlope(x0 + hxL, y + pose.up * depth);
    d += ` C ${fmtPt(upR)} ${fmtPt(upL)} ${fmtPt(left)} Z`;
    debug.push({ kind: 'control', at: upR, from: right, group: 'mouth' }, { kind: 'control', at: upL, from: left, group: 'mouth' });
  }
  return { d, open, strokeWidth, left, right };
}

function eyeDebug(eye: EyeGeometry, debug: DebugMark[]) {
  debug.push({ kind: 'anchor', at: eye.center, group: 'eyes' }, { kind: 'anchor', at: pt(eye.pupil.cx, eye.pupil.cy), group: 'eyes' });
  debug.push({
    kind: 'bounds',
    x: eye.white.cx - eye.white.rx,
    y: eye.white.cy - eye.white.ry,
    width: eye.white.rx * 2,
    height: eye.white.ry * 2,
    group: 'eyes',
  });
}

/**
 * How far the lids close and how they slant. A face with brows keeps its
 * lids level and lets the brows speak. A face WITHOUT brows (the baby) says
 * the same things with its lids, as the kit's baby does: worry lifts their
 * inner ends, and a lowered brow on open eyes becomes a thin lid slanting
 * down toward the nose.
 */
function browlessLids(pose: FacePose, sleeping: boolean, browless: boolean): { closure: number; slant: number } {
  if (sleeping) return { closure: 1, slant: 0 };
  if (!browless) return { closure: pose.lid, slant: 0 };
  // The left brow's pose: `start` is its outer end, `end` its inner.
  // A resting brow is not quite level; that much is not an expression.
  const REST = 0.02;
  const lowered = Math.max(0, (pose.browLeft.start + pose.browLeft.end) / 2 - REST);
  const worry = Math.max(0, pose.browLeft.start - pose.browLeft.end - REST);
  const open = Math.max(0, 1 - 2 * pose.lid);
  return { closure: Math.min(1, pose.lid + lowered * 3.87 * open), slant: worry * 2.25 - lowered * 5 * open };
}

/** The mouth to draw: the pose's, or the stage's sleeping mouth on a sleeping face with no expression. */
function restingMouth(plan: MouthPlan, pose: FacePose, sleeping: boolean): MouthPose {
  return sleeping && plan.asleep && pose.mouth === plan.neutral ? plan.asleep : pose.mouth;
}

// ─── Front ───────────────────────────────────────────────────────────────────

export function buildFrontFace(plan: FrontPlan, m: BlobbiMorphology, body: FrontBody, pose: FacePose, gaze: Gaze, sleeping: boolean): FaceGeometry {
  const debug: DebugMark[] = [];
  const canonHeight = plan.body.baseY - plan.body.top;
  /** A canonical y, carried to this body: the same fraction of its height. */
  const frameY = (y: number) => body.top + ((y - plan.body.top) / canonHeight) * body.height;

  const eyes = plan.eyes;
  const midX = (eyes.left.x + eyes.right.x) / 2;
  const eyeLineCanon = (eyes.left.y + eyes.right.y) / 2;
  const eyeLineY = frameY(eyeLineCanon) + m.eyeHeight;
  const halfSpacing = ((eyes.right.x - eyes.left.x) / 2) * m.eyeSpacing;
  const tilt = (eyes.left.y - eyes.right.y) / 2 + m.eyeTilt;
  const eyePlan: EyePlan = { ...eyes, k: eyes.k * m.eyeSize };
  const lids = browlessLids(pose, sleeping, plan.brows === null);
  const common = { plan: eyePlan, pupilSize: m.pupilSize, irisScale: pose.irisScale, closure: lids.closure, slant: lids.slant, gaze };

  const left = buildEye({ ...common, part: 'left-eye', center: pt(midX - halfSpacing, eyeLineY + tilt), local: eyes.localLeft, innerDir: 1 });
  const right = buildEye({ ...common, part: 'right-eye', center: pt(midX + halfSpacing, eyeLineY - tilt), local: eyes.localRight, innerDir: -1 });
  debug.push({ kind: 'guide', from: pt(left.center.x - 70, eyeLineY), to: pt(right.center.x + 70, eyeLineY), group: 'eyes' });
  eyeDebug(left, debug);
  eyeDebug(right, debug);

  // A brow keeps its authored gap above the top of its eye, whatever the eye's size.
  const brows = plan.brows;
  const brow = (part: string, eye: EyeGeometry, canonEye: Pt, canonStart: Pt, p: BrowPose) => {
    if (!brows) return null;
    const gap = canonEye.y - eyes.white.ry * eyes.k - canonStart.y;
    const start = pt(eye.center.x + (canonStart.x - canonEye.x) * m.eyeSize, eye.center.y - eye.white.ry - gap - m.browHeight);
    return buildBrow(part, start, brows.width * m.eyeSize, p, brows.strokeWidth, brows.opacity, debug);
  };

  // Cheeks ride the face frame; their spacing follows the body's width and,
  // by half, the eyes' spacing, so they stay under the outer corners of the eyes.
  const cheeks = plan.cheeks;
  const blush = blushOpacity(pose.blush, cheeks.opacity, cheeks.highlightOpacity);
  const flush = lerp(1, cheeks.strongScale ?? 1, Math.max(0, Math.min(1, pose.blush)));
  const cheekMid = (cheeks.left.x + cheeks.right.x) / 2;
  const cheekSpacing = ((cheeks.right.x - cheeks.left.x) / 2) * lerp(1, m.bodyWidth, 0.8) * lerp(1, m.eyeSpacing, 0.5);
  const cheek = (part: string, dir: -1 | 1): CheekGeometry => {
    const cx = cheekMid + dir * cheekSpacing;
    const cy = frameY(cheeks.left.y);
    return {
      part,
      base: { cx, cy, rx: cheeks.rx * m.cheekSize * flush, ry: cheeks.ry * m.cheekSize * flush },
      highlight: {
        cx: cx + cheeks.highlight.dx * m.cheekSize,
        cy: cy + cheeks.highlight.dy * m.cheekSize,
        rx: cheeks.highlight.rx * m.cheekSize,
        ry: cheeks.highlight.ry * m.cheekSize,
      },
      baseOpacity: sleeping && cheeks.hiddenAsleep ? 0 : blush.base,
      highlightOpacity: blush.highlight,
    };
  };

  const unit = plan.mouth.width * m.mouthWidth;
  const mouthCenter = plan.mouth.start.x + plan.mouth.width / 2;
  const mouthStart = pt(mouthCenter - unit / 2, frameY(plan.mouth.start.y) + m.mouthHeight);
  const mouth = buildMouth(mouthStart, unit, restingMouth(plan.mouth, pose, sleeping), m.mouthCurve * plan.mouth.depthScale, 0, plan.mouth.strokeWidth, debug);

  return {
    eyeLineY,
    eyes: [left, right],
    brows: brows
      ? [brow('left-eyebrow', left, eyes.left, brows.left, pose.browLeft), brow('right-eyebrow', right, eyes.right, brows.right, pose.browRight)].filter(
          (b): b is BrowGeometry => b !== null,
        )
      : [],
    cheeks: [cheek('left-cheek', -1), cheek('right-cheek', 1)],
    mouth,
    debug,
  };
}

// ─── Side ────────────────────────────────────────────────────────────────────

/**
 * The profile face, facing right. `nearSide` says which of the front view's
 * eyes is the visible one (-1 the viewer's-left eye, 1 the right): the
 * individual's eye tilt lowers one and raises the other.
 */
export function buildSideFace(
  plan: SidePlan,
  canon: SideBody,
  m: BlobbiMorphology,
  body: SideBody,
  pose: FacePose,
  gaze: Gaze,
  sleeping: boolean,
  nearSide: -1 | 1,
  frontHalfSpacing: number,
): FaceGeometry {
  const debug: DebugMark[] = [];
  /** A canonical point, carried to this body: same height fraction, same distance behind the face's edge. */
  const carry = (p: Pt, dy = 0): Pt => {
    const y = body.top + ((p.y - canon.top) / canon.height) * body.height + dy;
    const inset = canon.frontAt(p.y) - p.x;
    return pt(body.frontAt(y) - inset, y);
  };

  const eye = plan.eye;
  // Wider-set eyes sit further round the head: further from the profile's edge.
  const setBack = (m.eyeSpacing - 1) * frontHalfSpacing * 0.6;
  const lids = browlessLids(pose, sleeping, plan.brow === null);
  const at = carry(eye.center, m.eyeHeight - nearSide * m.eyeTilt);
  const center = pt(at.x - setBack, at.y);
  const theEye = buildEye({
    part: 'eye',
    center,
    plan: { ...eye, k: eye.k * m.eyeSize },
    local: eye.local,
    pupilSize: m.pupilSize,
    irisScale: pose.irisScale,
    closure: lids.closure,
    slant: lids.slant,
    // The profile faces right: the nose is ahead.
    innerDir: 1,
    gaze,
  });
  eyeDebug(theEye, debug);

  const brows: BrowGeometry[] = [];
  if (plan.brow) {
    const gap = eye.center.y - eye.white.ry * eye.k - plan.brow.start.y;
    const browStart = pt(center.x + (plan.brow.start.x - eye.center.x) * m.eyeSize, center.y - theEye.white.ry - gap - m.browHeight);
    // The profile's brow ends toward the nose, like the front's left brow.
    brows.push(buildBrow('eyebrow', browStart, plan.brow.width * m.eyeSize, pose.browLeft, plan.brow.strokeWidth, plan.brow.opacity, debug));
  }

  const blush = blushOpacity(pose.blush, plan.cheek.opacity, plan.cheek.highlightOpacity);
  const flush = lerp(1, plan.cheek.strongScale ?? 1, Math.max(0, Math.min(1, pose.blush)));
  const cheekAt = carry(plan.cheek.center);
  const cheekX = cheekAt.x - setBack * 0.5;
  const cheek: CheekGeometry = {
    part: 'cheek',
    base: { cx: cheekX, cy: cheekAt.y, rx: plan.cheek.rx * m.cheekSize * flush, ry: plan.cheek.ry * m.cheekSize * flush },
    highlight: {
      cx: cheekX + plan.cheek.highlight.dx * m.cheekSize,
      cy: cheekAt.y + plan.cheek.highlight.dy * m.cheekSize,
      rx: plan.cheek.highlight.rx * m.cheekSize,
      ry: plan.cheek.highlight.ry * m.cheekSize,
    },
    baseOpacity: sleeping && plan.cheek.hiddenAsleep ? 0 : blush.base,
    highlightOpacity: blush.highlight,
  };

  // The mouth keeps its far end at the same distance from the face's edge;
  // a wider mouth reaches further back.
  const unit = plan.mouth.width * m.mouthWidth;
  const mouthEnd = carry(pt(plan.mouth.start.x + plan.mouth.width, plan.mouth.start.y), m.mouthHeight);
  const mouth = buildMouth(pt(mouthEnd.x - unit, mouthEnd.y), unit, restingMouth(plan.mouth, pose, sleeping), m.mouthCurve * plan.mouth.depthScale, plan.mouth.slope, plan.mouth.strokeWidth, debug);

  return { eyeLineY: center.y, eyes: [theEye], brows, cheeks: [cheek], mouth, debug };
}
