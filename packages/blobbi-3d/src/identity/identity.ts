/**
 * BLOBBI IDENTITY, as the 3D renderer takes it: the kit's own V3 identity,
 * unchanged. `@blobbi-kit/renderer` owns the creation rule
 * (`createBlobbiV3Identity`) and the resolution of loose input
 * (`resolveBlobbiV3Visual`); `@blobbi-kit/core` states the same shape on the
 * event side. A host hands either straight in. Nothing here re-implements
 * any of it: this module only turns the renderer's three-way resolution into
 * the one thing a 3D scene can do with it, build a Blobbi or refuse.
 *
 * ```
 *   identity ──► genome ──► morphology ──► meshes, materials, rig
 *   (the kit)    (the kit)  (the kit)      (this package)
 * ```
 */
import { canonicalBlobbiV3Seed, createBlobbiV3Identity, resolveBlobbiV3Visual, type BlobbiV3Identity, type BlobbiV3Visual } from '@blobbi-kit/renderer';
import { generateGenome, type BlobbiGenome } from '@blobbi-kit/renderer/procedural';

export type BlobbiIdentity = BlobbiV3Identity;
export type BlobbiIdentityInput = BlobbiV3Visual;

/** The identity a seed creates, exactly as the kit creates it. @throws TypeError for anything that is not a V3 seed. */
export const createBlobbiIdentity = createBlobbiV3Identity;
/** The canonical spelling of a V3 seed (64 lower-case hexadecimal digits), or undefined: the kit's rule. */
export const canonicalBlobbiSeed = canonicalBlobbiV3Seed;

/**
 * Resolve loose input (a seed, or a possibly incomplete identity) to the
 * identity to build, through the kit's resolver: a stated field always
 * wins, a gap is filled from the seed and reported in `inferred`.
 *
 * @throws TypeError when there is no individual to build: no V3 seed, or an
 * algorithm version this kit does not implement. A 3D scene cannot draw a
 * fallback silhouette the way the SVG renderer can, so it refuses instead.
 */
export function resolveBlobbiIdentity(input: BlobbiIdentityInput | string): { identity: BlobbiIdentity; inferred: string[] } {
  const visual: BlobbiIdentityInput = typeof input === 'string' ? { seed: input } : input;
  const resolution = resolveBlobbiV3Visual(visual);
  if (resolution.status === 'individual') return { identity: resolution.identity, inferred: resolution.inferred };
  if (resolution.status === 'unsupported-algorithm') {
    throw new TypeError(`[blobbi-kit/3d] resolveBlobbiIdentity: algorithm ${resolution.algorithm} is not implemented by this kit.`);
  }
  throw new TypeError('[blobbi-kit/3d] resolveBlobbiIdentity: a Blobbi seed is 64 hexadecimal digits.');
}

/** The genome of an identity: its stated colours and trait kinds, and the seed's micro-geometry, from the kit's generator. */
export function genomeOf(identity: BlobbiIdentity): BlobbiGenome {
  return generateGenome({
    seed: identity.seed,
    colors: identity.colors,
    antenna: identity.traits.antenna,
    horns: identity.traits.horns,
    ears: identity.traits.ears,
    tail: identity.traits.tail,
    pattern: identity.traits.pattern,
    mark: identity.traits.specialMark,
    belly: identity.traits.belly,
    freckles: identity.traits.freckles,
  });
}
