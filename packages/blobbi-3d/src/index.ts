/**
 * @blobbi-kit/3d: a procedural 3D Blobbi for Babylon.js.
 *
 * ```ts
 * import { createBlobbi3D } from '@blobbi-kit/3d';
 * const blobbi = createBlobbi3D(identityFromTheEvent, scene);
 * scene.onBeforeRenderObservable.add(() => blobbi.update({ dt, speed, grounded, verticalVelocity }));
 * ```
 *
 * The identity, genome, colours, morphology, expressions and the measured
 * artwork plan are the kit's own (`@blobbi-kit/renderer/procedural`): this
 * package re-implements none of them, so a 3D Blobbi is the same individual
 * as its 2D drawing by construction. What this package owns is the 3D:
 *
 *   identity/    the kit's identity, resolved for building (or refused)
 *   geometry/    the body surface and the parts, in metres (Babylon mesh data)
 *   markings/    the skin texture painter (canvas 2D)
 *   face/        the 3D face (eyes, lids, strokes) and pose blending
 *   materials/   the palette as materials
 *   rig/         pivots and poses
 *   animation/   motion states to poses
 *   renderer/    `createBlobbi3D` and the gameplay profile
 */
export * from './identity';
export { buildBodySurface, buildBodyVertexData, type BodySurface, type SurfacePoint } from './geometry/body';
export { UNIT, VIEWER_X, m, worldX, worldY } from './geometry/units';
export { CANON_HEIGHT, GROUND } from './geometry/plan';
export { paintSkin } from './markings/painter';
export { lerpFacePose } from './face/pose';
// What a host needs to drive the face, from the kit's engine: the emotion names and the pose and weight shapes.
export { EMOTIONS, type Emotion, type ExpressionWeights, type FacePose } from '@blobbi-kit/renderer/procedural';
export { REST_POSE, lerpPose, clonePose, type BlobbiPose, type BlobbiRig } from './rig/rig';
export { BlobbiAnimator, MOTION_STATES, DEFAULT_TUNING, type AnimatorInput, type AnimatorTuning, type MotionState } from './animation/animator';
export { createBlobbi3D, createCanonicalBlobbi3D, type Blobbi3D, type Blobbi3DOptions, type ExpressionName } from './renderer/createBlobbi3D';
export { BLOBBI_GAMEPLAY_PROFILE, type BlobbiGameplayProfile } from './renderer/gameplay';
