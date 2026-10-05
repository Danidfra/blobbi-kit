/**
 * LIMBS AND TUFT: feet, arms and the head tuft, attached to a body.
 *
 * The feet and the tuft's leaves are ellipses, so they are fully parametric.
 * The arm is a small paddle whose outline was drawn by hand; the plan keeps
 * it as a TEMPLATE of control points that is scaled and re-attached to the
 * body, rather than re-invented as a formula that would only approximate it.
 *
 * Attachment is what makes them procedural: arms sit on the silhouette at
 * their height (so a wider body carries its arms outward), the tuft sits on
 * the crown (so a leaning or taller crown carries the tuft), and the feet
 * stay on the ground line.
 */
import { type DebugMark, type EllipseShape, type Pt, fmtPt, pt, rotateAbout, sampleCubic } from './geometry';
import type { BlobbiMorphology } from './morphology';
import type { ArmTemplate, FrontPlan, SidePlan, TuftPlan } from './plan/types';
import type { FrontBody, SideBody } from './silhouette';

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FootGeometry {
  /** `left`, `right`, `near` or `far`: the part is `<side>-foot` inside `<side>-leg`. */
  side: string;
  foot: EllipseShape;
  /** The contact shadow under the foot (the front and back views draw one). */
  shadow: EllipseShape | null;
  opacity: number;
}

export interface ArmGeometry {
  side: string;
  shoulder: Pt;
  d: string;
  /**
   * The arm's tight bounding box, which the limb gradient is stretched over
   * (corner to corner, as `objectBoundingBox` would). Stated explicitly
   * because rasterizers disagree on the box of a curved path.
   */
  box: Box;
  /** Points along the outline (for measuring what shows as the arm swings). */
  outline: Pt[];
  opacity: number;
}

export interface TuftGeometry {
  root: Pt;
  /**
   * How near the viewer each leaf is (the trait frame's scale), set by the
   * view that draws it. The second leaf lies in front of the first.
   */
  depths: { main: number; secondary: number };
  main: EllipseShape;
  secondary: EllipseShape;
  details: { d: string; strokeWidth: number }[];
  detailOpacity: number;
}

function buildArm(side: string, shoulder: Pt, template: ArmTemplate, size: number, mirror: boolean, opacity: number, debug: DebugMark[]): ArmGeometry {
  const place = (p: Pt) => pt(shoulder.x + (mirror ? -p.x : p.x) * size, shoulder.y + p.y * size);
  let prev = shoulder;
  const outline: Pt[] = [];
  const curves = template.map(([c1, c2, end]) => {
    const a = place(c1);
    const b = place(c2);
    const e = place(end);
    outline.push(...sampleCubic({ p0: prev, c1: a, c2: b, p1: e }, 32));
    debug.push({ kind: 'control', at: a, from: prev, group: 'limbs' }, { kind: 'control', at: b, from: e, group: 'limbs' }, { kind: 'anchor', at: e, group: 'limbs' });
    prev = e;
    return `C ${fmtPt(a)} ${fmtPt(b)} ${fmtPt(e)}`;
  });
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  return {
    side,
    shoulder,
    d: `M ${fmtPt(shoulder)} ${curves.join(' ')} Z`,
    box: { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) },
    outline,
    opacity,
  };
}

/**
 * The tuft, grown on a crown. Every point scales about the root and turns
 * with the lean; `tuftSpread` opens or closes the angle between the two
 * leaves, and `tuftLength` stretches them.
 */
export function buildTuft(plan: TuftPlan, canonApex: Pt, apex: Pt, m: BlobbiMorphology, debug: DebugMark[]): TuftGeometry {
  const shift = pt(apex.x - canonApex.x, apex.y - canonApex.y);
  const root = pt(plan.root.x + shift.x, plan.root.y + shift.y);
  // The second leaf opens away from the first, whichever way the plan leans.
  const openDir = plan.secondary.rotation >= plan.main.rotation ? 1 : -1;
  const place = (p: Pt, extraTurn = 0): Pt => {
    const scaled = pt(root.x + (p.x + shift.x - root.x) * m.tuftSize, root.y + (p.y + shift.y - root.y) * m.tuftSize);
    return rotateAbout(scaled, root, m.tuftTilt + extraTurn);
  };
  const leaf = (spec: TuftPlan['main'], extraTurn: number): EllipseShape => {
    const ry = spec.ry * m.tuftSize * m.tuftLength;
    // A longer leaf grows away from the root, not through it.
    const grown = pt(spec.cx, spec.cy - spec.ry * (m.tuftLength - 1) * 0.55);
    const c = place(grown, extraTurn);
    return { cx: c.x, cy: c.y, rx: spec.rx * m.tuftSize, ry, rotation: spec.rotation + m.tuftTilt + extraTurn };
  };
  const spread = openDir * m.tuftSpread;
  const details = plan.details.map((detail, i) => {
    const turn = i === 1 ? spread * 0.7 : 0;
    const start = place(detail.start, turn);
    const ctrl = place(pt(detail.start.x + detail.ctrl.x, detail.start.y + detail.ctrl.y), turn);
    const end = place(pt(detail.start.x + detail.end.x, detail.start.y + detail.end.y * m.tuftLength), turn);
    return { d: `M ${fmtPt(start)} Q ${fmtPt(ctrl)} ${fmtPt(end)}`, strokeWidth: detail.width * m.tuftSize };
  });
  debug.push({ kind: 'anchor', at: root, group: 'limbs' });
  return { root, depths: { main: 0, secondary: 0.05 }, main: leaf(plan.main, 0), secondary: leaf(plan.secondary, spread * 0.7), details, detailOpacity: 0.72 };
}

// ─── Front (and back) ────────────────────────────────────────────────────────

export interface FrontLimbs {
  /** Empty on a stage with no feet. */
  feet: FootGeometry[];
  groundShadow: EllipseShape;
  arms: ArmGeometry[];
  tuft: TuftGeometry | null;
  debug: DebugMark[];
}

export function buildFrontLimbs(plan: FrontPlan, canon: FrontBody, m: BlobbiMorphology, body: FrontBody): FrontLimbs {
  const debug: DebugMark[] = [];
  const canonHeight = plan.body.baseY - plan.body.top;

  // Feet: scaled about their soles so they stay planted.
  const feet = plan.feet;
  const foot = (spec: NonNullable<FrontPlan['feet']>, side: 'left' | 'right'): FootGeometry => {
    const dir = side === 'left' ? -1 : 1;
    const footCy = spec.cy + spec.ry - spec.ry * m.footSize;
    const cx = body.axisX + dir * spec.spacing * m.footSpacing * m.bodyWidth;
    debug.push({ kind: 'anchor', at: pt(cx, footCy), group: 'limbs' });
    return {
      side,
      foot: { cx, cy: footCy, rx: spec.rx * m.footSize, ry: spec.ry * m.footSize, rotation: dir * spec.rotation },
      shadow: { cx, cy: footCy + spec.shadow.dy, rx: spec.shadow.rx * m.footSize, ry: spec.shadow.ry * m.footSize },
      opacity: 1,
    };
  };

  // Arms: the template, scaled about a shoulder that rides the silhouette.
  const arms = plan.arms;
  const arm = (spec: NonNullable<FrontPlan['arms']>, side: 'left' | 'right'): ArmGeometry => {
    const dir = side === 'left' ? -1 : 1;
    const canonShoulder = spec[side];
    const inset = dir * (canon.edgeAt(dir, canonShoulder.y) - canonShoulder.x);
    const y = body.top + ((canonShoulder.y - plan.body.top) / canonHeight) * body.height + m.armHeight;
    const shoulder = pt(body.edgeAt(dir, y) - dir * inset, y);
    // The template is the left arm; the right arm mirrors it.
    return buildArm(side, shoulder, spec.template, spec.scale * m.armSize, side === 'right', 1, debug);
  };

  return {
    feet: feet ? [foot(feet, 'left'), foot(feet, 'right')] : [],
    groundShadow: { cx: body.axisX, cy: plan.groundShadow.cy, rx: plan.groundShadow.rx * m.bodyWidth, ry: plan.groundShadow.ry },
    arms: arms ? [arm(arms, 'left'), arm(arms, 'right')] : [],
    tuft: plan.tuft ? buildTuft(plan.tuft, pt(plan.body.axisX, plan.body.top), body.apex, m, debug) : null,
    debug,
  };
}

// ─── Side ────────────────────────────────────────────────────────────────────

export interface SideLimbs {
  nearFoot: FootGeometry | null;
  farFoot: FootGeometry | null;
  groundShadow: EllipseShape;
  nearArm: ArmGeometry | null;
  farArm: ArmGeometry | null;
  tuft: TuftGeometry | null;
  debug: DebugMark[];
}

export function buildSideLimbs(plan: SidePlan, canon: SideBody, m: BlobbiMorphology, body: SideBody): SideLimbs {
  const debug: DebugMark[] = [];
  const frameY = (y: number) => body.top + ((y - canon.top) / canon.height) * body.height;

  // The two feet stand either side of their own midpoint; spacing opens the stance.
  const feet = plan.feet;
  const foot = (side: 'near' | 'far'): FootGeometry | null => {
    if (!feet) return null;
    const mid = (feet.near.cx + feet.far.cx) / 2;
    const spec = feet[side];
    const sole = spec.cy + spec.ry;
    const cx = mid + (spec.cx - mid) * m.footSpacing;
    const cy = sole - spec.ry * m.footSize;
    debug.push({ kind: 'anchor', at: pt(cx, cy), group: 'limbs' });
    return {
      side,
      foot: { cx, cy, rx: spec.rx * m.footSize, ry: spec.ry * m.footSize, rotation: spec.rotation },
      shadow: null,
      opacity: side === 'far' ? feet.far.opacity : 1,
    };
  };

  let nearArm: ArmGeometry | null = null;
  let farArm: ArmGeometry | null = null;
  if (plan.arms) {
    const size = plan.arms.scale * m.armSize;
    // The near arm hangs on the flank, a fixed share of the way from the axis to the face.
    const nearCanon = plan.arms.near.start;
    const nearY = frameY(nearCanon.y) + m.armHeight;
    const reach = (nearCanon.x - plan.body.axisX) / (canon.frontAt(nearCanon.y) - plan.body.axisX);
    nearArm = buildArm('near', pt(body.axisX + reach * (body.frontAt(nearY) - body.axisX), nearY), plan.arms.near.template, size, false, 1, debug);
    // The far arm hangs from the far shoulder, placed the same way: the body
    // is between it and the viewer, so only what swings past the silhouette shows.
    const farCanon = plan.arms.far.start;
    const farY = frameY(farCanon.y) + m.armHeight;
    const farReach = (farCanon.x - plan.body.axisX) / (canon.frontAt(farCanon.y) - plan.body.axisX);
    farArm = buildArm('far', pt(body.axisX + farReach * (body.frontAt(farY) - body.axisX), farY), plan.arms.far.template, size, false, plan.arms.far.opacity, debug);
  }

  return {
    nearFoot: foot('near'),
    farFoot: foot('far'),
    groundShadow: { ...plan.groundShadow, rx: plan.groundShadow.rx * body.depthScale },
    nearArm,
    farArm,
    tuft: plan.tuft ? buildTuft(plan.tuft, canon.apex, body.apex, m, debug) : null,
    debug,
  };
}
