# @blobbi-kit/3d

A procedural 3D Blobbi for Babylon.js: the same V3 identity
`@blobbi-kit/renderer` draws as SVG, built as a reusable game character.

```
identity (the event's seed, colours, trait kinds)
   │
   ├──► @blobbi-kit/renderer            2D, SVG
   └──► @blobbi-kit/3d                  3D, Babylon.js   ← this package
            │
            └── built on @blobbi-kit/renderer/procedural: genome, colours,
                morphology, expressions, the measured artwork plan.
                Nothing is re-implemented, so the 3D Blobbi is the same
                individual as its drawing by construction.
```

## Use

```ts
import { createBlobbi3D } from '@blobbi-kit/3d';

// `identity` is the kit's V3 identity: core's parsed `v3Identity`, the
// renderer's `createBlobbiV3Identity(seed)`, or just a 64-digit seed.
const blobbi = createBlobbi3D(identity, scene, { shadows: shadowGenerator });

scene.onBeforeRenderObservable.add(() => {
  blobbi.rig.root.position.copyFrom(whereTheGameSaysItIs);
  blobbi.update({ dt, speed, grounded, verticalVelocity, jumped, landed, impact });
});
blobbi.setExpression('happy');
blobbi.setGaze(0.3, -0.1);
```

`createBlobbi3D` returns a handle with the resolved `identity` (and
`inferred`, the fields taken from the seed because the input did not state
them), the `genome`, `morphology`, body `surface`, `rig`, `parts`, `face`,
`materials`, `skin` texture, `animator`, every `mesh`, and `dispose()`.
`createCanonicalBlobbi3D(scene)` is the comparison point: every gene at
zero, the authored purple.

The character faces +Z and stands 1.05 m (the canonical body is 1.0 m from
base to crown); one root unit of the artwork is `UNIT` metres. Runtime state
(animation, blinks, gaze, expression easing) is the host's to drive;
everything derived from the identity is deterministic.

## What is the kit's and what is this package's

| Layer | Owner |
| --- | --- |
| Seed, keyed RNG, colours and palette, genome, adult morphology, expression key poses and lids, the measured Adult V2 plan, front and side silhouettes | `@blobbi-kit/renderer/procedural` |
| The identity contract (`createBlobbiV3Identity`, `resolveBlobbiV3Visual`) | `@blobbi-kit/renderer` (same shape as `@blobbi-kit/core`) |
| Body surface in metres (half-width from the front silhouette, depth from the profile), skin painter, 3D face, swept traits with surface-conforming roots, materials, rig, animator, `createBlobbi3D` | this package |

## Visual body vs gameplay body

`BLOBBI_GAMEPLAY_PROFILE` declares one normalized capsule, reach, mass and
speeds for every player. Visual morphology varies by identity; the renderer
never reads the profile and a game must never derive colliders from the mesh.

## Package layout

```
src/
  identity/    the kit's identity, resolved for building (or refused)
  geometry/    plan (the kit's), silhouettes (the kit's), body surface, units, sweep, parts
  markings/    the skin texture painter (canvas 2D)
  face/        eyes, strokes, features, pose blending
  materials/   the palette as materials
  rig/         pivots and poses
  animation/   motion states to poses
  renderer/    createBlobbi3D, the gameplay profile
```

Tests run on Babylon's `NullEngine` and need no GPU: determinism, bounds,
root attachment, eye and stroke conformity, the horn curve, animator states.

## Status

0.1.0, Visual V0: adult only, standard materials, no physics. The playground
that drives it lives in the `blobbi-3d` repository.
