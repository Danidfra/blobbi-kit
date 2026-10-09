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

```
the same V3 seed  ─►  the same Blobbi (V3 is Algorithm 1, forever)
```

The same Blobbi, not the same SVG and not the same pixels. `version.ts`
lists exactly what Algorithm 1 freezes and what it does not.
Tuning a frozen thing changes what existing Blobbis look like, so it is not
a tuning pass: it is a new visual generation (`v4`) for Blobbis born into
it. V3 Blobbis stay V3, drawn by Algorithm 1.

Where version 1 is held:

| What | Where | How it must match |
| --- | --- | --- |
| seed hash, streams, genes, rolls, genomes, eggs of fixed seeds | `vectors.json` | exactly |
| what a seed is given (trait odds, crowding) | `../artwork/v3/reference/reference.test.ts` | the table |
| morphology: egg, baby, adult of twelve reference Blobbis, and of two bodies with every gene at an end of its range | `../artwork/v3/reference/morphology.json` | exactly |
| every colour role derived from the four identity colours | `../artwork/v3/reference/palette.json` | exactly in JavaScript |
| what each reference Blobbi paints: egg, baby, adult; front, side, back | `../artwork/v3/reference/paint.json` | positions within 0.02 units, paint exactly |
| paint order, clipping, opacities, colour roles, the four mark shapes, in words | `../artwork/v3/reference/art-structure.test.ts` | |

The drawings are compared as PAINT LISTS (`paint-list.ts`): each painted
shape's place, size and paint, in order, with every transform applied. Ids,
grouping, attribute order, number formatting, an ellipse written as a path:
none of it reaches the comparison, so the SVG writer can be rewritten, and
a shape that moves a tenth of a unit cannot.

The seed is canonical before it reaches this engine: 64 lower-case
hexadecimal digits (`canonicalBlobbiV3Seed`, in the adapter). The engine
itself is a function of any string, which its own tests use; no public door
passes it anything but a canonical seed.

What may change freely: the colour GENERATOR (a Blobbi's colours are explicit
in its identity, so retuning it repaints nobody), and anything that is state.

To rewrite the pinned files on purpose (an addition, or a change shown to
alter no picture; never an existing version 1 entry once such Blobbis exist):

```
UPDATE_VECTORS=1 npx vitest run packages/blobbi-renderer/src/procedural/vectors.test.ts
UPDATE_REFERENCE=1 npx vitest run packages/blobbi-renderer/src/artwork/v3/reference/reference.test.ts
```
