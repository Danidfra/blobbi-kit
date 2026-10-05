/**
 * MARKINGS: what lies ON the skin. The body's one pattern, a special mark, a
 * belly patch and cheek freckles.
 *
 * A marking has a place round the body (an angle) and up it (a fraction of
 * its height), and the view's frame says where that is drawn and how
 * foreshortened. So a marking is on the same patch of skin from every side:
 * it is seen square on, slides to the silhouette's edge as the body turns,
 * and is gone when its patch faces away. Nothing is ever moved to another
 * place to stay in view.
 *
 * THE PATTERN is one of three, and each keeps clear of the face:
 *
 *  - `spotted`: the authored V2 side-pattern (three soft ovals on the rear of
 *    a flank, which is why the authored front shows them at the body's edge
 *    and the authored profile behind the middle), and a few more across the
 *    back.
 *  - `striped`: tapered bands across the back. At the height of the face a
 *    band ends behind the flank; above the brows it comes over the side of
 *    the head, and below the mouth it runs round to the belly. (Short flank
 *    stripes beside the eyes were tried and removed: from the front they
 *    read as whiskers, in profile as gills. A band that starts on the back
 *    and thins out before it nears the face does neither.)
 *  - `gradient`: the body deepens toward its base, the same from every side.
 *
 * THE SPECIAL MARK is a small shape on one of a few patches of skin nothing
 * else uses (`SurfacePlan.marks`), chosen by the seed among those this body
 * leaves free.
 *
 * The belly patch is a soft light glow low on the front (the Baby V1 drawing
 * has one), fading to nothing at its edge.
 *
 * Everything is tone on tone and clipped to the silhouette. No textures, no
 * noise.
 */
import type { CheekGeometry } from '../face';
import { type DebugMark, type EllipseShape, type Pt, fmt, pt } from '../geometry';
import type { MarkKind } from '../genome';
import type { BlobbiMorphology, StripeMorphology } from '../morphology';
import type { MarkRegionName } from '../plan';
import type { Prim } from './appendages';
import type { TraitFrame } from './frame';

/** The special mark as drawn: where, how large, how foreshortened. */
export interface SpecialMarkGeometry {
  kind: Exclude<MarkKind, 'none'>;
  region: MarkRegionName;
  cx: number;
  cy: number;
  /** Half its size, in units, before foreshortening. */
  r: number;
  /** Horizontal foreshortening (0..1): the patch it lies on is turned this far from the viewer. */
  squash: number;
  rotation: number;
}

export interface MarkingsGeometry {
  /** Spots: drawn over the body at `markOpacity`, clipped to it. Each says which of the pattern's two groups it is in. */
  marks: (EllipseShape & { zone: 'flank' | 'back' })[];
  markOpacity: number;
  /** The bands of a striped body that this view shows, as closed paths. */
  stripes: string[];
  stripeOpacity: number;
  /** A gradient body: the pattern colour fades in from `y0` to `strength` at `y1`. */
  gradient: { y0: number; y1: number; strength: number } | null;
  /** The special mark, or null when there is none or its patch faces away. */
  mark: SpecialMarkGeometry | null;
  /** The belly patch, clipped to the body; null when absent or turned away. */
  belly: Prim | null;
  freckles: { cx: number; cy: number; r: number }[];
  freckleOpacity: number;
  debug: DebugMark[];
}

/** A mark turned this far from the viewer (the cosine) is a sliver: it is not drawn. */
const MARK_MIN_FACING = 0.16;
const BAND_STEP = 6;

/** A closed, softly rounded outline through `points` (quadratics through the midpoints). */
function softOutline(points: readonly Pt[]): string {
  const n = points.length;
  const mid = (a: Pt, b: Pt) => pt((a.x + b.x) / 2, (a.y + b.y) / 2);
  const start = mid(points[n - 1], points[0]);
  let d = `M ${fmt(start.x)},${fmt(start.y)}`;
  for (let i = 0; i < n; i++) {
    const m = mid(points[i], points[(i + 1) % n]);
    d += ` Q ${fmt(points[i].x)},${fmt(points[i].y)} ${fmt(m.x)},${fmt(m.y)}`;
  }
  return `${d} Z`;
}

/**
 * One band, as this view shows it. The band lies across the back, `reach`
 * degrees each way from the spine, thickest on the spine and thinning to
 * nothing at both ends. A view shows the stretches of it that face the
 * viewer: all of it from behind, the near half in profile, and from the
 * front only what has come round the edges.
 */
function bandPaths(band: StripeMorphology, sag: number, frame: TraitFrame): string[] {
  const at = (a: number) => {
    const p = frame.around(180 + a, band.yFraction);
    const u = Math.abs(a) / band.reach;
    return { ...p, a, half: (band.thickness / 2) * Math.pow(Math.max(0, 1 - u * u), 0.8) };
  };
  // Where the band crosses the silhouette's edge, between a sample that faces the viewer and one that does not.
  const edge = (a: number, b: number) => {
    let seen = a;
    let hidden = b;
    for (let i = 0; i < 12; i++) {
      const m = (seen + hidden) / 2;
      if (frame.around(180 + m, band.yFraction).facing >= 0) seen = m;
      else hidden = m;
    }
    return seen;
  };
  // Sampled outward from the spine, the same on both sides: a band is one shape, whichever flank shows it.
  const outward: number[] = [];
  for (let a = BAND_STEP; a < band.reach; a += BAND_STEP) outward.push(a);
  outward.push(band.reach);
  const angles = [...outward.map((a) => -a).reverse(), 0, ...outward];

  const runs: ReturnType<typeof at>[][] = [];
  let run: ReturnType<typeof at>[] = [];
  let previous: number | null = null;
  for (const a of angles) {
    const visible = frame.around(180 + a, band.yFraction).facing >= 0;
    const wasVisible = previous !== null && frame.around(180 + previous, band.yFraction).facing >= 0;
    if (previous !== null && visible !== wasVisible) {
      run.push(at(visible ? edge(a, previous) : edge(previous, a)));
      if (!visible) {
        runs.push(run);
        run = [];
      }
    }
    if (visible) run.push(at(a));
    previous = a;
  }
  if (run.length > 0) runs.push(run);

  return runs
    .filter((points) => points.length >= 2 && points.some((p) => p.half > 0.6))
    .map((points) => {
      // The nearer the viewer, the lower the ring sits: it bows toward them.
      const upper = points.map((p) => pt(p.x, p.y + sag * p.facing - p.half));
      const lower = points.map((p) => pt(p.x, p.y + sag * p.facing + p.half)).reverse();
      return softOutline([...upper, ...lower]);
    });
}

export function buildMarkings(m: BlobbiMorphology, frame: TraitFrame, cheeks: readonly CheekGeometry[]): MarkingsGeometry {
  const debug: DebugMark[] = [];
  const marks: MarkingsGeometry['marks'] = [];
  for (const mark of m.spots) {
    const where = frame.surface(mark.side * mark.theta, mark.yFraction);
    if (!where) continue;
    const at = pt(where.at.x, where.at.y + mark.dy);
    debug.push({ kind: 'anchor', at, group: 'markings' });
    // The authored profile turns its marks exactly as the authored front does.
    const turn = frame.view === 'side' ? mark.rotation : mark.side * mark.rotation;
    marks.push({ cx: at.x, cy: at.y, rx: mark.rx * where.squash, ry: mark.ry, rotation: turn, zone: mark.zone });
  }

  const stripes = m.stripes ? m.stripes.bands.flatMap((band) => bandPaths(band, m.stripes!.sag, frame)) : [];
  const gradient = m.gradient ? { y0: frame.top + m.gradient.start * frame.height, y1: frame.top + frame.height, strength: m.gradient.strength } : null;

  let mark: SpecialMarkGeometry | null = null;
  if (m.mark) {
    const where = frame.around(m.mark.side * m.mark.theta, m.mark.yFraction);
    if (where.facing >= MARK_MIN_FACING) {
      mark = { kind: m.mark.kind, region: m.mark.region, cx: where.x, cy: where.y, r: m.mark.r, squash: Math.min(1, where.facing * 0.94 + 0.14), rotation: m.mark.rotation };
      debug.push({ kind: 'anchor', at: pt(where.x, where.y), group: 'markings' });
    }
  }

  let belly: Prim | null = null;
  if (m.bellyPatch) {
    const where = frame.surface(0, m.bellyPatch.yFraction);
    if (where && frame.view !== 'back') {
      // From the front the patch is centred; in profile it wraps the front edge.
      const profile = frame.view === 'side';
      const halfWidth = profile ? m.bellyPatch.rx * 0.62 : m.bellyPatch.rx;
      const cx = profile ? where.at.x - halfWidth * 0.18 : where.at.x;
      belly = { part: 'belly-patch', ellipse: { cx, cy: where.at.y, rx: halfWidth, ry: m.bellyPatch.ry }, fill: 'belly', opacity: m.bellyPatch.opacity };
    }
  }

  // Freckles sit on the cheeks that are drawn; positive dx points away from the nose.
  const freckles = cheeks.flatMap((cheek) => {
    const dir = cheek.part.startsWith('right') ? 1 : -1;
    return m.freckles.map((f) => {
      const dot = { cx: cheek.base.cx + dir * f.dx * m.cheekSize, cy: cheek.base.cy + f.dy * m.cheekSize, r: f.r };
      debug.push({ kind: 'anchor', at: pt(dot.cx, dot.cy), group: 'markings' });
      return dot;
    });
  });

  return { marks, markOpacity: 0.56, stripes, stripeOpacity: 0.5, gradient, mark, belly, freckles, freckleOpacity: 0.5, debug };
}
