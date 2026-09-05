/**
 * Adult V2: the canonical anatomy. One body, semantic parts, authored views.
 *
 * Views:
 *  - `front`: the authored diagonal view (`front.ts`);
 *  - `side`: the authored right-facing profile (`side.ts`); the left-facing
 *    profile is the same drawing mirrored by the pipeline;
 *  - `back`: derived from the front anatomy with the face removed and the
 *    limbs and tufts stacked behind the body (`back.ts`).
 *
 * Closed eyes are not a fourth drawing: `closeAdultV2Eyes` (`closed-eyes.ts`)
 * derives them from any view by replacing each eye group's contents with one
 * lid stroke, so the sleeping Blobbi can never drift from the awake one.
 */
import type { BlobbiArtworkView } from '../../types';
import { ADULT_V2_FRONT_SVG, ADULT_V2_FRONT_VIEWBOX } from './front';
import { ADULT_V2_SIDE_SVG, ADULT_V2_SIDE_VIEWBOX } from './side';
import { ADULT_V2_BACK_SVG, ADULT_V2_BACK_VIEWBOX } from './back';

export { customizeAdultV2Svg, ADULT_V2_ROLE_COLORS } from './customize';
export { closeAdultV2Eyes, closedEyePartFor } from './closed-eyes';
export {
  ADULT_V2_PARTS,
  ADULT_V2_CLOSED_EYE_PARTS,
  ADULT_V2_FRONT_PARTS,
  ADULT_V2_SIDE_PARTS,
  ADULT_V2_BACK_PARTS,
  ADULT_V2_FACE_PARTS,
  ADULT_V2_GAZE_PARTS,
  type AdultV2Part,
} from './parts';

export interface AdultV2ViewArtwork {
  view: BlobbiArtworkView;
  markup: string;
  viewBox: { width: number; height: number };
  /** Whether the view has a face (and therefore movable pupils). */
  hasFace: boolean;
}

export const ADULT_V2_VIEWS: Readonly<Record<BlobbiArtworkView, AdultV2ViewArtwork>> = {
  front: { view: 'front', markup: ADULT_V2_FRONT_SVG, viewBox: ADULT_V2_FRONT_VIEWBOX, hasFace: true },
  side: { view: 'side', markup: ADULT_V2_SIDE_SVG, viewBox: ADULT_V2_SIDE_VIEWBOX, hasFace: true },
  back: { view: 'back', markup: ADULT_V2_BACK_SVG, viewBox: ADULT_V2_BACK_VIEWBOX, hasFace: false },
};

export function getAdultV2Artwork(view: BlobbiArtworkView): AdultV2ViewArtwork {
  return ADULT_V2_VIEWS[view];
}
