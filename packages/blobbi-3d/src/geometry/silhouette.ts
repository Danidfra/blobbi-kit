/**
 * SILHOUETTES: the kit's own builders (`buildFrontBody`, `buildSideBody`),
 * fed the adult plan by default. The 3D body is a surface of these two:
 * at every height its half-width is the front silhouette's and its depth
 * the profile's, so the same six body genes shape it exactly as they shape
 * the 2D drawings.
 */
import { buildFrontBody as kitFront, buildSideBody as kitSide, CANONICAL_PARAMS, type BodyParams, type FrontBody, type SideBody } from '@blobbi-kit/renderer/procedural';
import { FRONT_BODY, SIDE_BODY } from './plan';

export { CANONICAL_PARAMS, type BodyParams, type FrontBody, type SideBody };

export const buildFrontBody = (p: BodyParams, plan = FRONT_BODY): FrontBody => kitFront(plan, p);
export const buildSideBody = (p: BodyParams, plan = SIDE_BODY): SideBody => kitSide(plan, p);
