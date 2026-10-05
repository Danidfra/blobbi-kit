/**
 * APPENDAGES: antennae, horns, ears and tail. None of them has artwork;
 * each is a handful of bounded numbers turned into soft shapes.
 *
 * Every builder describes its trait anatomically and asks the view's
 * `TraitFrame` where that lands, so the same numbers give a coherent trait
 * from the front, in profile and from behind. Dimensions arrive already
 * resolved for the life stage (a baby's horns are buds).
 *
 * The shapes stay inside Blobbi's vocabulary: round ends, no sharp points,
 * the limb gradient the tuft and arms use, the white highlight the eyes and
 * the body shine use.
 */
import { type DebugMark, type EllipseShape, type Pt, fmtPt, lerp, pt } from '../geometry';
import { HORN_ANCHORS as HORN, topHornLat, type AntennaMorphology, type EarMorphology, type HornMorphology, type TailMorphology } from '../morphology';
import type { Mount, TraitFrame } from './frame';

export type PaintRole = 'limb' | 'accent' | 'horn' | 'line' | 'white' | 'cheek' | 'marking' | 'belly' | 'shade';

/** One drawn shape of a trait. */
export interface Prim {
  part: string;
  d?: string;
  ellipse?: EllipseShape;
  fill?: PaintRole;
  stroke?: PaintRole;
  strokeWidth?: number;
  opacity?: number;
}

export interface Appendage {
  /** `antenna`, `horn`, `ear` or `tail`. */
  part: string;
  /**
   * Where the object is rooted, which is where it is composited.
   *  - `behind`: beyond the head's ridge (or on its edge); painted before the body, which covers the root.
   *  - `crown`: on the side of the head the view shows; painted after the body,
   *    in depth order with the tuft's leaves, its root in view.
   *  - `over`: pointing at the viewer; painted over the body.
   */
  layer: 'behind' | 'crown' | 'over';
  /** On the far side of the body: drawn first and dimmed, like the far limbs. */
  far: boolean;
  /** Where it joins the body: secondary motion turns it about this point. */
  pivot: Pt;
  /** Which secondary motion it takes; horns are rigid. */
  sway: 'antenna' | 'ear' | 'tail' | null;
  /** Which side of the body it is on: -1, 0 (on the centre line) or 1. */
  side: -1 | 0 | 1;
  /** How near the viewer its root is (the frame's scale). The whole object is painted at this one depth. */
  depth: number;
  base: Pt;
  tip: Pt;
  prims: Prim[];
  debug: DebugMark[];
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const unit = (v: Pt): Pt => {
  const len = Math.hypot(v.x, v.y) || 1;
  return pt(v.x / len, v.y / len);
};
const normal = (v: Pt): Pt => pt(v.y, -v.x);
const along = (p: Pt, dir: Pt, dist: number): Pt => pt(p.x + dir.x * dist, p.y + dir.y * dist);
const angleOf = (v: Pt) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/** A tapered stalk along a quadratic centre line: two offset quadratics, closed. */
function stalk(base: Pt, control: Pt, tip: Pt, thickness: number, taper: number): string {
  const nBase = normal(unit(pt(control.x - base.x, control.y - base.y)));
  const nTip = normal(unit(pt(tip.x - control.x, tip.y - control.y)));
  const nMid = normal(unit(pt(tip.x - base.x, tip.y - base.y)));
  const half = thickness / 2;
  const halfTip = half * taper;
  const halfMid = (half + halfTip) / 2;
  return (
    `M ${fmtPt(along(base, nBase, half))} Q ${fmtPt(along(control, nMid, halfMid))} ${fmtPt(along(tip, nTip, halfTip))} ` +
    `L ${fmtPt(along(tip, nTip, -halfTip))} Q ${fmtPt(along(control, nMid, -halfMid))} ${fmtPt(along(base, nBase, -half))} Z`
  );
}

/**
 * A soft cone: a wide base, bowed sides and a round tip. `roundness` is the
 * tip's radius as a fraction of half the base, so there is never a point.
 */
function softCone(base: Pt, control: Pt, tip: Pt, width: number, roundness: number): string {
  const nBase = normal(unit(pt(control.x - base.x, control.y - base.y)));
  const nTip = normal(unit(pt(tip.x - control.x, tip.y - control.y)));
  const half = width / 2;
  const r = half * roundness;
  const bulge = half * 0.94;
  const nMid = normal(unit(pt(tip.x - base.x, tip.y - base.y)));
  const a = along(base, nBase, half);
  const b = along(base, nBase, -half);
  const ta = along(tip, nTip, r);
  const tb = along(tip, nTip, -r);
  // The arc bulges past the tip: the horn ends in a dome.
  return (
    `M ${fmtPt(a)} Q ${fmtPt(along(control, nMid, bulge))} ${fmtPt(ta)} ` +
    `A ${r.toFixed(3)} ${r.toFixed(3)} 0 0 1 ${fmtPt(tb)} ` +
    `Q ${fmtPt(along(control, nMid, -bulge))} ${fmtPt(b)} Z`
  );
}

const marks = (base: Pt, control: Pt, tip: Pt): DebugMark[] => [
  { kind: 'anchor', at: base, group: 'antenna' },
  { kind: 'anchor', at: tip, group: 'antenna' },
  { kind: 'control', at: control, from: base, group: 'antenna' },
  { kind: 'guide', from: control, to: tip, group: 'antenna' },
];

// ─── Antenna ─────────────────────────────────────────────────────────────────

/** How far inside the silhouette a rooted trait starts, so the body covers the join. */
const SINK = 16;
/** The stalk narrows to this fraction of its base width at the tip. */
const TAPER = 0.58;
/** A root in view sits at least this far down the head's surface from the silhouette's edge. */
const ROOT_MIN = 9;
/** In profile a root in view sits this far down the flank from its anatomical place. */
const ROOT_DROP = 13;
/**
 * How much lower a root is drawn per unit it is set forward or back on the
 * crown. A head is a dome: what is set further toward the viewer is lower on
 * the face of it, and what is set further away is lower behind it, so less
 * of it shows over the top. (The slight turn of the view decides which side
 * of the ridge a root is on; it does not change how high anything is.)
 */
const DEPTH_DROP = 55;
const ROOT_MAX = 38;
/**
 * The most of a trait's length that the head may hide. A short trait rooted
 * well behind the head (a baby's, or one on the profile's far flank) would
 * be buried whole: it is shown rising from no deeper than this.
 */
const MAX_BURIED = 0.55;

/**
 * Whether a crown mount is on the VIEWER'S SIDE of the head's ridge: its
 * root is on the surface this view shows. Otherwise the head hides the root
 * and the trait rises from behind the silhouette.
 */
const onViewerSide = (mount: Mount) => !mount.far && (mount.inset > 0 || mount.depth > 0);

/**
 * WHERE A CROWN TRAIT IS ROOTED IN THIS DRAWING, from its mount alone.
 *
 * In view: `base` is on the head's surface, a little down it, and the trait
 * is drawn `extra` longer so its foot is there. Hidden: `base` is inside the
 * silhouette, where the body covers the join.
 */
function crownRoot(mount: Mount, frame: TraitFrame, length: number, sink: number): { visible: boolean; base: Pt; extra: number } {
  const s = frame.scale;
  const profile = frame.view === 'side';
  if (onViewerSide(mount)) {
    // The profile's mount is already where the flank is. From the front and
    // from behind, the further toward the viewer it is set, the lower.
    const lowered = profile ? 0 : Math.min(ROOT_MAX, DEPTH_DROP * Math.max(0, mount.toward)) * s;
    const foot = (profile ? ROOT_DROP : ROOT_MIN) * s;
    return { visible: true, base: along(mount.at, mount.normal, -(lowered + foot)), extra: foot };
  }
  // How far below the silhouette's edge the root really is, and how much of that the trait can spare.
  const below = profile ? mount.inset : DEPTH_DROP * Math.max(0, -mount.toward) * s;
  const buried = Math.min(below, length * MAX_BURIED);
  const join = Math.max(sink * s - buried, profile ? 0 : sink * s * 0.5);
  const edge = pt(mount.at.x, mount.at.y - mount.inset);
  return { visible: false, base: pt(edge.x, edge.y + buried + join), extra: join };
}

/** A soft shade where a trait meets the skin, and its angle along the surface. */
function rootShade(part: string, at: Pt, mount: Mount, half: number): Prim {
  return { part, ellipse: { cx: at.x, cy: at.y, rx: half * 1.25, ry: half * 0.56, rotation: angleOf(mount.tangent) }, fill: 'shade', opacity: 0.3 };
}

export function buildAntenna(a: AntennaMorphology, frame: TraitFrame): Appendage {
  const mount = frame.crown(a.side * a.position, a.fore);
  const root = crownRoot(mount, frame, a.length, SINK);
  const near = root.visible;
  const base = root.base;
  // Tilt leans away from the centre line; sweep leans backward.
  const tilt = rad(a.tilt);
  const sweep = rad(a.sweep);
  const dir = unit(frame.project(a.side * Math.sin(tilt), Math.cos(tilt) * Math.cos(sweep), -Math.sin(sweep)));
  const reach = a.length + root.extra;
  const tip = along(base, dir, reach);
  // Curvature bows the stalk outward from the front and backward in profile.
  const bend = frame.project(a.side * Math.cos(tilt), Math.sin(tilt), -0.7);
  const control = along(along(base, dir, reach / 2), unit(bend), a.curvature * a.length * Math.hypot(bend.x, bend.y));
  const r = a.tipRadius;
  const prims: Prim[] = [
    { part: 'antenna-stalk', d: stalk(base, control, tip, a.thickness, TAPER), fill: 'limb' },
    { part: 'antenna-tip', ellipse: { cx: tip.x, cy: tip.y, rx: r, ry: r }, fill: 'accent' },
    { part: 'antenna-highlight', ellipse: { cx: tip.x - 0.32 * r, cy: tip.y - 0.36 * r, rx: 0.3 * r, ry: 0.2 * r, rotation: -30 }, fill: 'white', opacity: 0.38 },
  ];
  if (near) {
    // A visible root: a soft shade on the skin, and a rounded foot over the stalk's cut end.
    const half = a.thickness / 2;
    prims.unshift(rootShade('antenna-root-shade', base, mount, half));
    prims.splice(2, 0, { part: 'antenna-root', ellipse: { cx: base.x, cy: base.y, rx: half * 1.18, ry: half * 0.6, rotation: angleOf(mount.tangent) }, fill: 'limb' });
  }
  return {
    part: 'antenna',
    layer: near ? 'crown' : 'behind',
    far: mount.far,
    pivot: base,
    sway: 'antenna',
    side: a.side,
    depth: mount.depth,
    base,
    tip,
    prims,
    debug: marks(base, control, tip),
  };
}

// ─── Horns ───────────────────────────────────────────────────────────────────

const rot = (v: Pt, deg: number): Pt => {
  const r = rad(deg);
  return pt(v.x * Math.cos(r) - v.y * Math.sin(r), v.x * Math.sin(r) + v.y * Math.cos(r));
};
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const UP = pt(0, -1);

/** The root is this much wider than the horn above it: the horn swells out of the body rather than meeting it at a corner. */
const ROOT_FLARE = 1.22;

interface HornShape {
  d: string;
  control: Pt;
  tip: Pt;
  rootHalf: number;
  axis: Pt;
  tipDir: Pt;
}

/**
 * A horn's outline. No part of it is a straight cut.
 *
 * The CENTRE LINE leaves the root along `dir` and turns through `curl`
 * degrees by the tip (signed: either way, or not at all), so the horn is
 * genuinely bent rather than a straight cone with a bulge.
 *
 * The ROOT is not perpendicular to the horn. It lies along `surface`, the
 * tangent of the body where the horn grows, and is flared, so the sides
 * sweep out into the body's own curve. When the root is in view (`rounded`:
 * a horn pointing at the viewer, drawn over the body) it is closed with a
 * half-ellipse, the way the base of anything round looks from in front.
 *
 * The TIP is a dome, never a point.
 */
function hornShape(base: Pt, dir: Pt, curl: number, length: number, width: number, roundness: number, surface: Pt, rounded: boolean): HornShape {
  const tipDir = rot(dir, curl);
  const control = along(base, dir, length / 2);
  const tip = along(control, tipDir, length / 2);
  const half = width / 2;
  const r = Math.min(half * 0.95, half * roundness);
  // The root runs along the body's surface; where that is nearly end on to the horn, across the horn instead.
  const across = normal(dir);
  const along0 = dot(surface, across) >= 0 ? surface : pt(-surface.x, -surface.y);
  const lean = Math.abs(dot(along0, across));
  const axis = unit(pt(lerp(across.x, along0.x, 0.75 * lean), lerp(across.y, along0.y, 0.75 * lean)));
  const rootHalf = half * ROOT_FLARE;
  // A point on the centre line and the direction there, for the sides' middle.
  const t = 0.62;
  const mid = pt(
    (1 - t) * (1 - t) * base.x + 2 * (1 - t) * t * control.x + t * t * tip.x,
    (1 - t) * (1 - t) * base.y + 2 * (1 - t) * t * control.y + t * t * tip.y,
  );
  const midDir = unit(pt(lerp(dir.x, tipDir.x, t), lerp(dir.y, tipDir.y, t)));
  const side = (sign: 1 | -1) => ({
    root: along(base, axis, sign * rootHalf),
    // Pull in from the flare quickly, then swell: a soft, inflated horn.
    c1: along(along(base, across, sign * half), dir, length * 0.2),
    c2: along(mid, normal(midDir), sign * half * 0.86),
    end: along(tip, normal(tipDir), sign * r),
  });
  const l = side(1);
  const rgt = side(-1);
  const close = rounded
    ? // The visible base: a half-ellipse bulging away from the horn.
      ` A ${rootHalf.toFixed(3)} ${(rootHalf * 0.44).toFixed(3)} ${angleOf(axis).toFixed(3)} 0 1 ${fmtPt(l.root)} Z`
    : ' Z';
  const d =
    `M ${fmtPt(l.root)} C ${fmtPt(l.c1)} ${fmtPt(l.c2)} ${fmtPt(l.end)} ` +
    `A ${r.toFixed(3)} ${r.toFixed(3)} 0 0 1 ${fmtPt(rgt.end)} ` +
    `C ${fmtPt(rgt.c2)} ${fmtPt(rgt.c1)} ${fmtPt(rgt.root)}${close}`;
  return { d, control, tip, rootHalf, axis, tipDir };
}

/** Where a horn sits, which way it leaves the body, and which way a positive curl turns it. */
interface HornPlacement {
  mount: Mount;
  side: -1 | 0 | 1;
  /** The direction it grows in, when it stands on the silhouette's edge. */
  dir: Pt;
  /** A positive curl turns the tip toward this direction. */
  curlToward: Pt;
  /** How much of the curl this view shows (a bend across the line of sight is foreshortened). */
  curlShown: number;
  /** On the crown: rooted in view or behind the head, by where it sits (see `crownRoot`). */
  crown?: boolean;
}

function hornOn(h: HornMorphology, place: HornPlacement, frame: TraitFrame): Appendage | null {
  const { mount, side } = place;
  if (mount.facing === 'away') return null;
  const toward = mount.facing === 'toward';
  const pair = side !== 0 && side === h.asymmetrySide;
  // The two horns of a pair are one horn mirrored, then one is nudged: a little longer, a little more curled.
  const curvature = Math.max(-50, Math.min(50, h.curvature + (pair ? 6 * h.asymmetry : 0)));
  const fullLength = h.length * (pair ? 1 + 0.06 * h.asymmetry : 1);
  // A stubby horn (a baby's bud) cannot bend far without folding; it takes less of the curl.
  const bendable = Math.min(1, Math.max(0.3, fullLength / (1.25 * h.width)));

  let dir: Pt;
  let curl: number;
  let length: number;
  let base: Pt;
  let width = h.width;
  let onHead = false;
  if (toward) {
    // Pointing at the viewer, a horn is seen nearly end on: upright, short,
    // its round base on the body. Its curl is toward or away from the eye, so
    // it shows as the horn standing taller (curled up) or lower (curled down).
    dir = unit(pt(side * -0.12, -1));
    curl = 0;
    length = fullLength * 0.62 * (1 + 0.24 * (curvature / 50));
    width = h.width * 1.06;
    base = mount.at;
  } else {
    dir = unit(place.dir);
    // Positive curl turns the tip toward `curlToward`; the sign of the turn follows from where that is.
    const cross = dir.x * place.curlToward.y - dir.y * place.curlToward.x;
    curl = (cross >= 0 ? 1 : -1) * curvature * place.curlShown * bendable;
    if (place.crown) {
      const root = crownRoot(mount, frame, fullLength, SINK * 0.55);
      onHead = root.visible;
      base = root.base;
      length = fullLength + root.extra;
    } else {
      // On a flank: rooted a little inside the body, along the surface's own normal, so the body covers the join.
      const sink = SINK * 0.55 * frame.scale;
      base = along(mount.at, mount.normal, -sink);
      length = fullLength + sink;
    }
  }
  const rootInView = toward || onHead;
  const shape = hornShape(base, dir, curl, length, width, h.roundness, toward ? normal(dir) : mount.tangent, rootInView);

  const prims: Prim[] = [];
  if (rootInView) {
    // A soft shade where the horn meets the skin: it grows out of the body, it is not set on it.
    const c = along(base, dir, -shape.rootHalf * 0.1);
    prims.push({
      part: 'horn-root',
      ellipse: { cx: c.x, cy: c.y, rx: shape.rootHalf * 1.2, ry: shape.rootHalf * 0.58, rotation: angleOf(shape.axis) },
      fill: 'shade',
      opacity: 0.3,
    });
  }
  prims.push({ part: 'horn-body', d: shape.d, fill: 'horn' });
  // A short highlight along the lit (viewer's-left) side, as on the antenna tip.
  const litSide = normal(shape.tipDir).x < 0 ? 1 : -1;
  const lit = along(along(shape.control, shape.tipDir, length * 0.16), normal(shape.tipDir), litSide * width * 0.17);
  prims.push({
    part: 'horn-highlight',
    ellipse: { cx: lit.x, cy: lit.y, rx: width * 0.085, ry: Math.max(width * 0.1, length * 0.15), rotation: angleOf(shape.tipDir) + 90 },
    fill: 'white',
    opacity: 0.42,
  });
  return {
    part: 'horn',
    layer: toward ? 'over' : onHead ? 'crown' : 'behind',
    far: mount.far,
    pivot: mount.at,
    sway: null,
    side,
    depth: mount.depth,
    base,
    tip: shape.tip,
    prims,
    debug: marks(base, shape.control, shape.tip),
  };
}



export function buildHorns(h: HornMorphology, frame: TraitFrame): Appendage[] {
  const out: (Appendage | null)[] = [];
  // The tilt gene leans a horn away from its resting direction, in degrees about its canonical 14.
  const tilt = h.tilt - 14;
  const profile = frame.view === 'side';
  if (h.kind === 'forehead') {
    // One horn in the middle of the brow. In profile it leaves the face
    // along the surface's own normal, turned up; its curl is up and back
    // (positive) or forward and down (negative).
    const mount = frame.mount(0, HORN.foreheadHeight + h.position * HORN.foreheadSpread);
    const dir = unit(pt(mount.normal.x + UP.x * 0.95, mount.normal.y + UP.y * 0.95));
    out.push(hornOn(h, { mount, side: 0, dir: rot(dir, -mount.out.x * tilt * 0.6), curlToward: UP, curlShown: 1 }, frame));
  } else if (h.kind === 'top') {
    // A pair on the crown, each leaving along the crown's normal where it
    // stands, eased toward upright. Positive curl turns the tips toward each
    // other; in profile that bend is across the line of sight and only a
    // trace of it shows, as a lean back.
    for (const side of [-1, 1] as const) {
      const mount = frame.crown(side * topHornLat(h.position), h.fore);
      const upright = unit(pt(mount.normal.x * 0.6 + (profile ? -0.05 : 0), mount.normal.y * 0.6 - 0.4));
      const dir = profile ? upright : rot(upright, side * tilt * 0.7);
      out.push(hornOn(h, { mount, side, dir, curlToward: profile ? pt(-1, 0) : pt(-side, 0), curlShown: profile ? 0.35 : 1, crown: true }, frame));
    }
  } else if (h.kind === 'side') {
    // A pair on the upper flanks, leaving along the flank's normal, turned
    // up. Positive curl turns the tips upward; negative lets them droop.
    for (const side of [-1, 1] as const) {
      const mount = frame.mount(side * 90, HORN.sideHeight + h.position * HORN.sideSpread);
      const lift = 0.62 + tilt / 45;
      const dir = unit(pt(mount.normal.x + UP.x * lift, mount.normal.y + UP.y * lift));
      out.push(hornOn(h, { mount, side, dir, curlToward: UP, curlShown: 1 }, frame));
    }
  }
  return out.filter((a): a is Appendage => a !== null);
}

// ─── Ears ────────────────────────────────────────────────────────────────────

/** The ears sit high on the flanks, just behind the middle of the head. */
const EAR = { theta: 100, profileFore: -0.5 } as const;

export function buildEars(e: EarMorphology, frame: TraitFrame): Appendage[] {
  const out: Appendage[] = [];
  for (const side of [-1, 1] as const) {
    // From the front and from behind an ear stands on the silhouette's edge and
    // leans out. In profile the two stand one behind the other on the back of
    // the crown, behind the tuft, tipped back: the far one shows a little ahead.
    const profile = frame.view === 'side';
    const mount = profile ? frame.crown(side * 0.84, EAR.profileFore, true) : frame.mount(side * EAR.theta, e.position);
    const tilt = rad(e.tilt);
    const dir = profile ? unit(pt(-Math.sin(rad(18)), -Math.cos(rad(18)))) : unit(pt(mount.out.x * Math.sin(tilt), -Math.cos(tilt)));
    const outward = profile ? pt(-1, 0) : pt(mount.out.x, 0);
    const sink = SINK * 0.9 * frame.scale;
    const base = along(mount.at, dir, -sink);
    // An ear shows its inside from the front and, on the near side, in profile; from behind, its back.
    const showsInside = frame.view !== 'back' && !mount.far;
    const prims: Prim[] = [];
    let tip: Pt;
    let control: Pt;
    if (e.kind === 'round') {
      const height = e.size * 1.02 + sink;
      tip = along(base, dir, height);
      control = along(base, dir, height / 2);
      const c = along(base, dir, height * 0.56);
      const rot = angleOf(dir) + 90;
      prims.push({ part: 'ear-outer', ellipse: { cx: c.x, cy: c.y, rx: e.size * 0.56, ry: height * 0.5, rotation: rot }, fill: 'limb' });
      if (showsInside) {
        const ic = along(base, dir, height * 0.6);
        prims.push({ part: 'ear-inner', ellipse: { cx: ic.x, cy: ic.y, rx: e.size * 0.3, ry: height * 0.27, rotation: rot }, fill: 'cheek', opacity: 0.62 });
      }
    } else {
      // A soft leaf: wide at the base, its tip flopping outward.
      const height = e.size * 1.28 + sink;
      const straight = along(base, dir, height);
      tip = pt(straight.x + outward.x * e.flop * e.size * 0.7, straight.y + e.flop * e.size * 0.42);
      control = along(along(base, dir, height * 0.62), outward, -e.flop * e.size * 0.12);
      prims.push({ part: 'ear-outer', d: softCone(base, control, tip, e.size * 1.16, 0.5), fill: 'limb' });
      if (showsInside) {
        const ib = along(base, dir, sink + (height - sink) * 0.2);
        const it = pt(lerp(ib.x, tip.x, 0.7), lerp(ib.y, tip.y, 0.7));
        const ictrl = pt(lerp(ib.x, control.x, 0.8), lerp(ib.y, control.y, 0.8));
        prims.push({ part: 'ear-inner', d: softCone(ib, ictrl, it, e.size * 0.52, 0.5), fill: 'cheek', opacity: 0.62 });
      }
    }
    out.push({
      part: 'ear',
      // In profile the near ear stands on the viewer's side of the head, in front of the tuft.
      layer: profile && onViewerSide(mount) ? 'crown' : 'behind',
      far: mount.far,
      pivot: mount.at,
      sway: 'ear',
      side,
      depth: mount.depth,
      base,
      tip,
      prims,
      debug: marks(base, control, tip),
    });
  }
  return out;
}

// ─── Tail ────────────────────────────────────────────────────────────────────

/** Low on the back, in the middle. */
const TAIL = { theta: 180, height: 0.8 } as const;

export function buildTail(t: TailMorphology, frame: TraitFrame): Appendage | null {
  const mount = frame.mount(TAIL.theta, TAIL.height);
  if (mount.facing === 'away') return null;
  const toward = mount.facing === 'toward';
  const lift = rad(t.lift);
  // In profile the tail points back and up; from behind it is seen end on.
  const dir = toward ? unit(pt(0.18, -1)) : unit(pt(mount.out.x * Math.cos(lift), -Math.sin(lift)));
  const sink = (toward ? 0 : SINK * 0.7) * frame.scale;
  const base = along(mount.at, dir, -sink);
  const foreshorten = toward ? 0.72 : 1;
  const prims: Prim[] = [];
  let tip: Pt;
  let control: Pt;
  if (t.kind === 'nub') {
    const r = t.size * 0.86;
    tip = along(base, dir, sink + r * (toward ? 0.2 : 0.7));
    control = base;
    prims.push({ part: 'tail-nub', ellipse: { cx: tip.x, cy: tip.y, rx: r, ry: r * (toward ? 0.94 : 1) }, fill: 'limb' });
    prims.push({ part: 'tail-highlight', ellipse: { cx: tip.x - 0.3 * r, cy: tip.y - 0.36 * r, rx: 0.3 * r, ry: 0.18 * r, rotation: -30 }, fill: 'white', opacity: 0.3 });
  } else if (t.kind === 'curl') {
    const length = t.length * foreshorten + sink;
    tip = along(base, dir, length);
    // The curl turns upward.
    const up = normal(dir).y < 0 ? normal(dir) : pt(-normal(dir).x, -normal(dir).y);
    control = along(along(base, dir, length * 0.55), up, -t.curvature * t.length * foreshorten);
    tip = along(tip, up, t.curvature * t.length * foreshorten * 0.9);
    const thick = t.size * 0.95;
    const endR = (thick / 2) * 0.72;
    prims.push({ part: 'tail-curl', d: stalk(base, control, tip, thick, 0.72), fill: 'limb' });
    prims.push({ part: 'tail-tip', ellipse: { cx: tip.x, cy: tip.y, rx: endR * 1.25, ry: endR * 1.25 }, fill: 'accent' });
  } else {
    // A leaf, in the language of the head tuft: an ellipse with one vein.
    const length = t.length * 0.95 * foreshorten + sink;
    tip = along(base, dir, length);
    control = along(base, dir, length * 0.5);
    const c = along(base, dir, sink + (length - sink) * 0.52);
    prims.push({ part: 'tail-leaf', ellipse: { cx: c.x, cy: c.y, rx: t.size * 0.62, ry: (length - sink) * 0.56, rotation: angleOf(dir) + 90 }, fill: 'limb' });
    const v0 = along(base, dir, sink + (length - sink) * 0.16);
    const v1 = along(base, dir, sink + (length - sink) * 0.78);
    const vc = along(along(v0, dir, (length - sink) * 0.3), normal(dir), t.size * 0.14);
    prims.push({ part: 'tail-vein', d: `M ${fmtPt(v0)} Q ${fmtPt(vc)} ${fmtPt(v1)}`, stroke: 'line', strokeWidth: Math.max(3, t.size * 0.17), opacity: 0.72 });
  }
  return {
    part: 'tail',
    layer: toward ? 'over' : 'behind',
    far: false,
    pivot: mount.at,
    sway: 'tail',
    side: 0,
    depth: mount.depth,
    base,
    tip,
    prims,
    debug: marks(base, control, tip),
  };
}
