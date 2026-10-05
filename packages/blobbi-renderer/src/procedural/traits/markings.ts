/**
 * MARKINGS: flank spots, a belly patch and cheek freckles.
 *
 * A mark lies ON the body, so it has a place round the body (an angle) and
 * up it (a fraction of its height), and the view's frame says where that is
 * drawn and how foreshortened. The flank spots are the authored V2
 * side-pattern: three soft ovals on the rear of one flank, which is why the
 * authored front shows them at the body's edge and the authored profile
 * shows them behind the middle. They are placed there, so they stay on the
 * same flank from every side.
 *
 * The belly patch is a soft light glow low on the front (the Baby V1 drawing
 * has one), fading to nothing at its edge.
 *
 * Everything is tone on tone and clipped to the silhouette. No textures, no
 * noise. Flank STRIPES were tried here and removed: on the front they sit
 * beside the eyes and read as whiskers, in profile as gills.
 */
import type { CheekGeometry } from '../face';
import { type DebugMark, type EllipseShape, pt } from '../geometry';
import type { BlobbiMorphology } from '../morphology';
import type { Prim } from './appendages';
import type { TraitFrame } from './frame';

export interface MarkingsGeometry {
  /** Flank spots: drawn over the body at `markOpacity`, clipped to it. */
  marks: EllipseShape[];
  markOpacity: number;
  /** The belly patch, clipped to the body; null when absent or turned away. */
  belly: Prim | null;
  freckles: { cx: number; cy: number; r: number }[];
  freckleOpacity: number;
  debug: DebugMark[];
}

export function buildMarkings(m: BlobbiMorphology, frame: TraitFrame, cheeks: readonly CheekGeometry[]): MarkingsGeometry {
  const debug: DebugMark[] = [];
  const marks: EllipseShape[] = [];
  for (const mark of m.spots) {
    const where = frame.surface(mark.side * mark.theta, mark.yFraction);
    if (!where) continue;
    const at = pt(where.at.x, where.at.y + mark.dy);
    debug.push({ kind: 'anchor', at, group: 'markings' });
    // The authored profile turns its marks exactly as the authored front does.
    const turn = frame.view === 'side' ? mark.rotation : mark.side * mark.rotation;
    marks.push({ cx: at.x, cy: at.y, rx: mark.rx * where.squash, ry: mark.ry, rotation: turn });
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

  return { marks, markOpacity: 0.56, belly, freckles, freckleOpacity: 0.5, debug };
}
