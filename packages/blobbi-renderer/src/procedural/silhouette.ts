/**
 * SILHOUETTES, generated from a plan's anchors and an individual's body
 * parameters.
 *
 * A silhouette is a closed chain of cubics. The FRONT one is symmetric: the
 * plan holds one side's anchors (crown, shoulder, side, …, base) and the
 * other side mirrors them. The SIDE one is a profile: a loop of anchors
 * running from the crown down the face, under the base and up the back.
 *
 * The same six body parameters shape both, each in the way that makes
 * sense for the view, which is what keeps one Blobbi one Blobbi when it
 * turns: a taller body is taller in profile, a fuller belly pushes the
 * profile's front out, a wider crown is a deeper crown. Only `lean` (a
 * sideways tilt of the crown) has no profile, and only it is invisible there.
 *
 * The base never leaves the ground line: a taller Blobbi grows upward.
 */
import {
  type Cubic,
  type DebugMark,
  type Pt,
  fmtPt,
  lerp,
  pt,
  sampleCubic,
} from './geometry';
import type { FrontPlan, PlanAnchor, SidePlan } from './plan/types';

export interface BodyParams {
  bodyWidth: number;
  bodyHeight: number;
  topWidth: number;
  belly: number;
  roundness: number;
  lean: number;
}

export interface Silhouette {
  segments: Cubic[];
  d: string;
  /** The same outline through a point mapping (the contact shadow uses it). */
  mapped(map: (p: Pt) => Pt): string;
  /** Extreme points of the outline. */
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** The highest point of the outline. */
  apex: Pt;
  /** Leftmost and rightmost x of the outline at height `y`; null outside it. */
  spanAt(y: number): { min: number; max: number } | null;
  /** The y of the outline's upper edge at `x` (the crown); the apex's y outside it. */
  topAt(x: number): number;
  debug: DebugMark[];
}

const SAMPLES = 24;

function finish(segments: Cubic[], debug: DebugMark[]): Silhouette {
  const mapped = (map: (p: Pt) => Pt) =>
    `M ${fmtPt(map(segments[0].p0))} ${segments
      .map((s) => `C ${fmtPt(map(s.c1))} ${fmtPt(map(s.c2))} ${fmtPt(map(s.p1))}`)
      .join(' ')} Z`;
  const line = segments.flatMap((s, i) => sampleCubic(s, SAMPLES).slice(i === 0 ? 0 : 1));
  let apex = line[0];
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const p of line) {
    if (p.y < apex.y) apex = p;
    if (p.y > bottom) bottom = p.y;
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
  }

  /** Every crossing of the outline with a horizontal or vertical line. */
  const crossings = (key: 'x' | 'y', value: number): number[] => {
    const other = key === 'x' ? 'y' : 'x';
    const out: number[] = [];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      if ((a[key] - value) * (b[key] - value) > 0 || a[key] === b[key]) continue;
      out.push(a[other] + ((b[other] - a[other]) * (value - a[key])) / (b[key] - a[key]));
    }
    return out;
  };

  return {
    segments,
    d: mapped((p) => p),
    mapped,
    top: apex.y,
    bottom,
    left,
    right,
    apex,
    spanAt: (y) => {
      const xs = crossings('y', y);
      return xs.length < 2 ? null : { min: Math.min(...xs), max: Math.max(...xs) };
    },
    topAt: (x) => {
      const ys = crossings('x', x);
      return ys.length === 0 ? apex.y : Math.min(...ys);
    },
    debug,
  };
}

function debugOf(segments: Cubic[]): DebugMark[] {
  const marks: DebugMark[] = [];
  for (const s of segments) {
    marks.push({ kind: 'anchor', at: s.p0, group: 'body' });
    marks.push({ kind: 'control', at: s.c1, from: s.p0, group: 'body' });
    marks.push({ kind: 'control', at: s.c2, from: s.p1, group: 'body' });
  }
  return marks;
}

/** How far an anchor moves sideways for this individual. */
const anchorScale = (a: PlanAnchor, p: BodyParams, width: number) =>
  width * lerp(1, p.topWidth, a.top ?? 0) * lerp(1, p.belly, a.belly ?? 0);

export interface FrontBody extends Silhouette {
  axisX: number;
  baseY: number;
  height: number;
  /** Nominal half-width (drives gradient and shine placement). */
  halfWidth: number;
  crownHalfWidth: number;
  /** The silhouette's x on a side (-1 left, 1 right) at height `y`; the axis outside the body. */
  edgeAt(side: -1 | 1, y: number): number;
}

/** The symmetric front (and back) silhouette. */
export function buildFrontBody(plan: FrontPlan['body'], p: BodyParams): FrontBody {
  const sx = p.bodyWidth;
  const sy = p.bodyHeight;
  const canonHeight = plan.baseY - plan.top;
  const height = canonHeight * sy;
  const top = plan.baseY - height;
  const last = plan.anchors.length - 1;

  const side = (dir: -1 | 1) => {
    const anchors = plan.anchors.map((a, i) =>
      i === 0 ? pt(plan.axisX + p.lean, top) : pt(plan.axisX + dir * a.at.x * anchorScale(a, p, sx), top + a.at.y * sy),
    );
    const handle = (i: number, which: 'in' | 'out'): Pt => {
      const h = plan.anchors[i][which];
      // Roundness lengthens the crown and base handles (a flatter dome) or
      // shortens them (a pointier droplet).
      const hx = i === 0 ? sx * p.roundness * lerp(1, p.topWidth, 0.6) : i === last ? sx * p.roundness * lerp(1, p.belly, 0.6) : sx;
      return pt(anchors[i].x + dir * h.x * hx, anchors[i].y + h.y * sy);
    };
    const segments: Cubic[] = [];
    for (let i = 0; i < last; i++) {
      segments.push({ p0: anchors[i], c1: handle(i, 'out'), c2: handle(i + 1, 'in'), p1: anchors[i + 1] });
    }
    return segments;
  };

  const right = side(1);
  const left = side(-1);
  // Down the right side, then back up the left (each left cubic reversed).
  const leftUp = [...left].reverse().map((s): Cubic => ({ p0: s.p1, c1: s.c2, c2: s.c1, p1: s.p0 }));
  const segments = [...right, ...leftUp];
  const debug: DebugMark[] = [
    { kind: 'axis', x: plan.axisX, y1: top - 70, y2: plan.baseY + 50 },
    { kind: 'bounds', x: plan.axisX - plan.halfWidth * sx, y: top, width: plan.halfWidth * sx * 2, height, group: 'body' },
    ...debugOf(segments),
  ];
  const outline = finish(segments, debug);

  return {
    ...outline,
    // The crown anchor is exact; sampling would land a hair beside it.
    apex: right[0].p0,
    top,
    axisX: plan.axisX,
    baseY: plan.baseY,
    height,
    halfWidth: plan.halfWidth * sx,
    crownHalfWidth: plan.crownHalfWidth * sx * p.topWidth,
    edgeAt: (dir, y) => {
      const span = outline.spanAt(y);
      if (!span) return plan.axisX;
      return dir === 1 ? span.max : span.min;
    },
  };
}

export interface SideBody extends Silhouette {
  axisX: number;
  baseY: number;
  height: number;
  /** The profile's front (face) edge at height `y`, facing right. */
  frontAt(y: number): number;
  /** The profile's back edge at height `y`. */
  backAt(y: number): number;
  /** How much deeper than canonical this individual is (crown features use it). */
  depthScale: number;
}

/** The canonical profile's extents, which the individual is scaled about. */
function profileFrame(plan: SidePlan['body']) {
  const canon = finish(loop(plan.anchors, (p) => p, () => 1), []);
  return { top: canon.top, bottom: canon.bottom };
}

function loop(anchors: PlanAnchor[], place: (p: Pt, a: PlanAnchor) => Pt, handleScale: (a: PlanAnchor) => number): Cubic[] {
  const at = anchors.map((a) => place(a.at, a));
  const handle = (i: number, which: 'in' | 'out'): Pt => {
    const a = anchors[i];
    const target = place(pt(a.at.x + a[which].x * handleScale(a), a.at.y + a[which].y), a);
    return target;
  };
  return anchors.map((_, i) => {
    const next = (i + 1) % anchors.length;
    return { p0: at[i], c1: handle(i, 'out'), c2: handle(next, 'in'), p1: at[next] };
  });
}

/** The profile silhouette, facing right. */
export function buildSideBody(plan: SidePlan['body'], p: BodyParams): SideBody {
  const frame = profileFrame(plan);
  // Half of a wider body is a deeper body: a chunky Blobbi is chunky all round.
  const depthScale = lerp(1, p.bodyWidth, 0.5);
  const place = (q: Pt, a: PlanAnchor): Pt =>
    pt(
      plan.axisX + (q.x - plan.axisX) * depthScale * lerp(1, p.topWidth, (a.top ?? 0) * 0.6) * lerp(1, p.belly, (a.belly ?? 0) * 0.8),
      frame.bottom - (frame.bottom - q.y) * p.bodyHeight,
    );
  const segments = loop(plan.anchors, place, (a) => (a.round ? p.roundness : 1));
  const debug: DebugMark[] = [...debugOf(segments)];
  const outline = finish(segments, debug);
  debug.push({ kind: 'bounds', x: outline.left, y: outline.top, width: outline.right - outline.left, height: outline.bottom - outline.top, group: 'body' });
  return {
    ...outline,
    axisX: plan.axisX,
    baseY: frame.bottom,
    height: outline.bottom - outline.top,
    frontAt: (y) => outline.spanAt(y)?.max ?? plan.axisX,
    backAt: (y) => outline.spanAt(y)?.min ?? plan.axisX,
    depthScale: depthScale * lerp(1, p.topWidth, 0.6),
  };
}

export const CANONICAL_PARAMS: BodyParams = { bodyWidth: 1, bodyHeight: 1, topWidth: 1, belly: 1, roundness: 1, lean: 0 };
