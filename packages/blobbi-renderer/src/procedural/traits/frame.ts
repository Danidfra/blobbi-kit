/**
 * THE TRAIT FRAME: how a trait finds its place on a body in a given view.
 *
 * A trait is described ANATOMICALLY, once: "on the crown, 56% of the way out
 * to the viewer's right", "on the flank, a fifth of the way down", "low on
 * the back". Each view supplies a frame that turns those positions into
 * points on the silhouette it actually drew, and says how the spot is seen:
 *
 *  - on the EDGE of the silhouette: the trait sticks out sideways, rooted
 *    behind the body;
 *  - TOWARD the viewer: the trait points out of the page, so it is drawn
 *    over the body and foreshortened;
 *  - AWAY: on the far side, not drawn.
 *
 * This is what makes one genome one Blobbi in every view: a forehead horn is
 * a nub over the brow from the front, a spike off the face in profile and
 * invisible from behind, without the horn code knowing about views.
 *
 * Angles around the body are in degrees: 0 is the middle of the face, +90
 * the flank on the viewer's right in the front view, 180 the middle of the
 * back.
 */
import { type Pt, pt } from '../geometry';
import type { View } from '../plan/types';
import type { FrontBody, SideBody } from '../silhouette';

export type Facing = 'edge' | 'toward' | 'away';

export interface Mount {
  at: Pt;
  facing: Facing;
  /** For an edge mount: the screen direction pointing out of the body. */
  out: Pt;
  /**
   * The body's surface at this point, measured on the silhouette that was
   * actually drawn: the unit vector along it, and the one pointing out of
   * it. A trait's root follows these, so it sits ON this body's curve.
   */
  tangent: Pt;
  normal: Pt;
  /**
   * How near the viewer this spot is, relative to the crown's ridge as this
   * view sees it. Positive is on the viewer's side of the ridge: the root is
   * on the surface the view shows. Negative is beyond it: the head hides the
   * root. It is also what is drawn in front of what where things overlap.
   */
  depth: number;
  /**
   * How far toward the viewer the spot is set along the head's OWN front-to-
   * back axis (crown half-depths), leaving out the slight turn of the view.
   * A head is a dome, so this is what makes a root sit lower: on the face of
   * the head when positive, behind it when negative. Zero off the crown.
   */
  toward: number;
  /** On the side of the body that is turned from the viewer (the profile's far flank). */
  far: boolean;
  /**
   * How far below the silhouette's edge the spot lies in this drawing. Zero
   * on an edge. In profile a place out on the crown's flank is lower than
   * the ridge the silhouette shows, by as much as the head has curved down
   * by there: the trait is rooted ON the flank, not on the skyline.
   */
  inset: number;
}

export interface SurfacePoint {
  at: Pt;
  /** Horizontal foreshortening of a mark lying on the surface there (0..1). */
  squash: number;
}

export interface TraitFrame {
  view: View;
  /** Size of a root unit at this stage, relative to the adult. */
  scale: number;
  top: number;
  height: number;
  /** The silhouette's path, for clipping marks to the body. */
  bodyD: string;
  /**
   * A point on the crown: `lat` -1..1 across it, `fore` -1..1 from back to
   * front. `onRidge` asks for the silhouette's own top line there instead,
   * whatever the anatomy says (a trait drawn standing on the skyline).
   */
  crown(lat: number, fore: number, onRidge?: boolean): Mount;
  /** A point on the body's surface at an angle round it and a fraction of its height. */
  mount(theta: number, yFraction: number): Mount;
  /** Where a flat mark at that position is drawn, or null when it faces away. */
  surface(theta: number, yFraction: number): SurfacePoint | null;
  /** The depth of a crown position, on the same scale as a mount's. */
  depthAt(lat: number, fore: number): number;
  /** The screen direction of an anatomical one: sideways, up and forward components. */
  project(lat: number, up: number, fore: number): Pt;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Tangent and outward normal of a surface through two nearby points on it; `outward` picks the normal's side. */
function surfaceAt(a: Pt, b: Pt, outward: Pt): { tangent: Pt; normal: Pt } {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const tangent = pt((b.x - a.x) / len, (b.y - a.y) / len);
  const n = pt(tangent.y, -tangent.x);
  return { tangent, normal: n.x * outward.x + n.y * outward.y >= 0 ? n : pt(-n.x, -n.y) };
}
/** A spot facing the viewer has no silhouette to follow. */
const FLAT = { tangent: pt(1, 0), normal: pt(0, -1) };
/**
 * The front and back drawings are a slightly diagonal view (the authored
 * face shows it: the viewer's-left eye sits lower and further out). So what
 * is on the viewer's left of the crown is a little NEARER than what is on
 * the right, by this much per crown half-width.
 */
const YAW = 0.25;
const STEP = 5;

/**
 * The front view's frame; with `away` it is the back view's. The back view
 * is drawn from a morphology already reflected left to right, so the only
 * thing that changes here is which half of the body faces the viewer.
 */
export function frontFrame(body: FrontBody, scale: number, away: boolean): TraitFrame {
  const yAt = (f: number) => body.top + f * body.height;
  const halfAt = (y: number, side: -1 | 1) => Math.abs(body.edgeAt(side, y) - body.axisX);
  const facesViewer = (theta: number) => (away ? -Math.cos(rad(theta)) : Math.cos(rad(theta)));
  // Nearer the viewer: further forward on the head (further back, seen from behind), and further to the viewer's left.
  const depthAt = (lat: number, fore: number) => (away ? -fore : fore) - YAW * lat;
  return {
    depthAt,
    view: away ? 'back' : 'front',
    scale,
    top: body.top,
    height: body.height,
    bodyD: body.d,
    crown: (lat, fore) => {
      const x = body.apex.x + lat * body.crownHalfWidth;
      const surface = surfaceAt(pt(x - STEP, body.topAt(x - STEP)), pt(x + STEP, body.topAt(x + STEP)), pt(0, -1));
      return { at: pt(x, body.topAt(x)), facing: 'edge', out: pt(0, -1), far: false, inset: 0, toward: away ? -fore : fore, depth: depthAt(lat, fore), ...surface };
    },
    mount: (theta, f) => {
      const y = yAt(f);
      const s = Math.sin(rad(theta));
      const side = s >= 0 ? 1 : -1;
      if (Math.abs(s) > 0.7) {
        const surface = surfaceAt(pt(body.edgeAt(side, y - STEP), y - STEP), pt(body.edgeAt(side, y + STEP), y + STEP), pt(side, 0));
        // A flank is the crown's edge: as far across as it goes, and as far forward as its angle round the body.
        return { at: pt(body.edgeAt(side, y), y), facing: 'edge', out: pt(side, 0), far: false, inset: 0, toward: 0, depth: depthAt(side, Math.cos(rad(theta))), ...surface };
      }
      const toward = facesViewer(theta) > 0;
      return { at: pt(body.axisX + s * halfAt(y, side), y), facing: toward ? 'toward' : 'away', out: pt(0, 0), far: false, inset: 0, toward: 0, depth: toward ? 1 : -1, ...FLAT };
    },
    surface: (theta, f) => {
      // A mark is seen a little way round the edge, as the authored side-pattern is.
      if (facesViewer(theta) < -0.8) return null;
      const y = yAt(f);
      const s = Math.sin(rad(theta));
      return { at: pt(body.axisX + s * halfAt(y, s >= 0 ? 1 : -1), y), squash: Math.min(1, Math.abs(Math.cos(rad(theta))) + 0.3) };
    },
    project: (lat, up) => pt(lat, -up),
  };
}

/**
 * The profile's frame, for a drawing that faces right. `near` is the sign of
 * the flank turned to the viewer (-1: the one on the viewer's left in the
 * front view, which is what a right-facing Blobbi shows). `crownY` is the
 * height of the head's surface at a place across the crown: read off the
 * FRONT silhouette of the same individual, which the profile cannot show.
 */
export function sideFrame(body: SideBody, scale: number, near: -1 | 1, crownHalfDepth: number, crownY: (lat: number) => number): TraitFrame {
  const yAt = (f: number) => body.top + f * body.height;
  const span = (y: number) => {
    const front = body.frontAt(y);
    const back = body.backAt(y);
    return { front, back, mid: (front + back) / 2, half: (front - back) / 2 };
  };
  // In profile, nearer means further out on the flank turned to the viewer; forward counts only to break a tie.
  const depthAt = (lat: number, fore: number) => lat * near + 0.1 * fore;
  return {
    depthAt,
    view: 'side',
    scale,
    top: body.top,
    height: body.height,
    bodyD: body.d,
    crown: (lat, fore, onRidge = false) => {
      const far = lat * near < -0.05;
      // The far side of the crown shows a little ahead of the near side: a hint of depth.
      const x = body.apex.x + fore * crownHalfDepth * body.depthScale + (far ? 15 * scale : 0);
      const surface = surfaceAt(pt(x - STEP, body.topAt(x - STEP)), pt(x + STEP, body.topAt(x + STEP)), pt(0, -1));
      // The profile's top line is the head's ridge. A place out across the
      // crown is on a flank, lower than the ridge there by as much as the
      // head has curved down across itself (the front view's own curve): in
      // plain view on the near flank, behind the head on the far one.
      const inset = onRidge ? 0 : Math.max(0, crownY(lat) - body.top);
      return { at: pt(x, body.topAt(x) + inset), facing: 'edge', out: pt(0, -1), far, inset, toward: 0, depth: depthAt(lat, fore), ...surface };
    },
    mount: (theta, f) => {
      const y = yAt(f);
      const c = Math.cos(rad(theta));
      const s = Math.sin(rad(theta));
      const { front, back, mid, half } = span(y);
      if (Math.abs(c) > 0.7) {
        const edge = (at: number) => (c > 0 ? body.frontAt(at) : body.backAt(at));
        const surface = surfaceAt(pt(edge(y - STEP), y - STEP), pt(edge(y + STEP), y + STEP), pt(c > 0 ? 1 : -1, 0));
        return { at: pt(c > 0 ? front : back, y), facing: 'edge', out: pt(c > 0 ? 1 : -1, 0), far: false, inset: 0, toward: 0, depth: 0, ...surface };
      }
      const visible = s * near > 0;
      return { at: pt(mid + c * half, y), facing: visible ? 'toward' : 'away', out: pt(0, 0), far: !visible, inset: 0, toward: 0, depth: visible ? 1 : -1, ...FLAT };
    },
    surface: (theta, f) => {
      const s = Math.sin(rad(theta)) * near;
      if (s < 0.2) return null;
      const y = yAt(f);
      const { mid, half } = span(y);
      return { at: pt(mid + Math.cos(rad(theta)) * half * 0.92, y), squash: Math.min(1, s + 0.35) };
    },
    project: (_lat, up, fore) => pt(fore, -up),
  };
}
