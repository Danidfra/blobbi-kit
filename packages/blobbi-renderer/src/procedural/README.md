# `procedural/`: the V3 engine

The engine that draws a `visual_generation = v3` Blobbi from a genome.
Internal to `@blobbi-kit/renderer`: reached only through `artwork/v3/` and
the artwork registry, never exported.

```
seed ──► genome ──► morphology ──► geometry ──► SVG          state ──► pose / expression / motion ──┘
rng.ts   genome.ts  morphology.ts  silhouette, face, limbs,  state.ts, expressions.ts, motion.ts
         colors.ts  plan/          traits/, views/, egg.ts
```

No React, no DOM, no clock, no `Math.random()`. Every gene has its own keyed
stream (`rng.ts`), so adding a gene never moves an existing one.

## Provenance

Ported file for file from the `blobbi-procedural` prototype (snapshot commit
`0cc5be5`, "feat: complete procedural Blobbi V3 prototype"). It is the same
engine, not a rewrite; the differences are these, and only these:

| File | Change | Why |
| --- | --- | --- |
| `version.ts` (new), `genome.ts` | the working label `v3-proto` became `PROCEDURAL_GENERATION = 'v3'` and `PROCEDURAL_ALGORITHM_VERSION = 1` | the public generation and the frozen rules are two different things |
| `renderer.ts`, `motion.ts` | a live drawing's root carries `data-blobbi-rig-motion`, not `data-blobbi-motion` | the kit's wrapper stylesheet animates any element with the latter |
| `motion.ts` | `motionStylesheetFor(motion, gait, view)`; a start delay read from `--pb-phase` | one drawing mounts only its own rules; a crowd does not move in step |
| `renderer.ts`, `svg.ts` | `RenderOptions.motionOffset` | sets `--pb-phase` |
| `expressions.ts`, `state.ts`, `views/` | `FaceParts`, `applyFaceParts`, `state.face` | the kit names a face by parts; each part is a shape the key poses are made of |
| `face.ts` | `EyeGeometry.travel` | the kit's live gaze moves the inner eye through CSS variables |

Since the port, and before any version 1 Blobbi existed outside a
development machine, the SURFACE MODEL was finished here and not in the
prototype: the prototype's independent `spots` boolean became one `pattern`
(`solid`, `spotted`, `striped`, `gradient`) plus a special mark (`traits/markings.ts`,
`plan/types.ts` `SurfacePlan`), and the ears root on the flank in profile.
Every gene the prototype had is still drawn from the same keyed stream and
has the same value: `vectors.test.ts` holds that against the prototype's own
history files (`vectors.pre-*.json`). The prototype repository is the record
of where the engine came from, no longer byte for byte what it is.

## The rule that matters

Everything that turns a seed into a body is **frozen per algorithm version**:
gene names and their stream keys, trait odds, ranges, the stage plans, the
crowding rules. `vectors.json` pins it. Tuning any of it changes what
existing Blobbis look like, so it is not a tuning pass: it is a new algorithm
version, added beside this one and selected by the version an identity
carries. See `version.ts`.

What may change freely: the colour GENERATOR (a Blobbi's colours are explicit
in its identity, so retuning it repaints nobody), and anything that is state.

To rewrite the vectors on purpose:

```
UPDATE_VECTORS=1 npx vitest run packages/blobbi-renderer/src/procedural/vectors.test.ts
```
