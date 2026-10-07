# Changelog

All notable changes to the `blobbi-kit` packages are recorded here. The two
domain packages (`@blobbi-kit/core`, `@blobbi-kit/react`) are versioned and
released in lockstep; `@blobbi-kit/renderer` and `@blobbi-kit/3d` are each
versioned independently.

The project is pre-1.0, so a **minor** bump is used for breaking changes
(`0.MINOR.PATCH`), per the `0.x` convention.

---

## `@blobbi-kit/core` 0.8.0, `@blobbi-kit/react` 0.8.0, `@blobbi-kit/renderer` 0.6.0, `@blobbi-kit/3d` 0.1.0

One release of all four packages. Before it the registry held core/react
0.6.1 and renderer 0.4.0; core/react 0.7.0 and renderer 0.5.0 were never
published separately, and their entries ship in this release (they are kept
below under their own headings). `@blobbi-kit/3d` is new and depends on
`@blobbi-kit/renderer` `^0.6.0`, the first renderer with the `procedural`
subpath, so the renderer publishes before it.

### `@blobbi-kit/3d` 0.1.0 (new): the V3 identity as a 3D game character

A procedural 3D Blobbi for Babylon.js, from the same V3 identity the SVG
renderer draws. `createBlobbi3D(identity, scene)` builds the body (a surface
grown from the kit's front and side silhouettes), a painted skin (gradient,
shine, pattern, mark, belly, freckles, cheeks), a face whose eyes, lids,
brows and mouth are patches of the skin with the kit's blended expressions,
every trait kind as swept geometry with surface-conforming roots, a pivot rig
and a procedural animator (idle, walk, run, jump, fall, land). The character
faces +Z, stands 1.05 m, and its handle exposes `setExpression`,
`setSleeping`, `setGaze`, `blink`, `update` and `dispose`. A normalized
gameplay profile (`BLOBBI_GAMEPLAY_PROFILE`) is declared beside it for hosts
that must not let visual morphology become a competitive advantage.

The package re-implements nothing of the identity: genome, colours,
morphology, expressions and the measured artwork plan are
`@blobbi-kit/renderer/procedural` (below), so a 3D Blobbi is the same
individual as its 2D drawing by construction. Depends on
`@blobbi-kit/renderer` `^0.6.0`; peer: `@babylonjs/core`.

- **Renderer: the procedural engine has a subpath.** `@blobbi-kit/renderer/procedural`
  exports the V3 engine (`generateGenome`, `deriveMorphology`,
  `derivePalette`, the expression key poses and lids, the adult plan, the
  silhouette builders, the keyed RNG) for other renderers of the same
  identity. The package root is unchanged and still exports no gene; the
  purity tests still hold the engine to importing nothing external.

**Blobbi V3.** A new visual generation (`visual_generation = v3`) whose
artwork is generated procedurally and deterministically from an explicit
identity stated on the event: a canonical seed (64 lower-case hexadecimal
digits), `visual_algorithm = 1`, four colours and the kind of each trait
(antenna, horns, ears, tail, pattern, special mark, belly, freckles). The
same identity under the same algorithm is the same Blobbi in every client,
as an egg, a baby and an adult, from the front, in profile and from behind,
with the existing expression and motion inputs. The identity is decided once
at creation and preserved by every update, hatch and evolution.
`describeBlobbiArtwork` gives hosts renderer-neutral anchors (head, eye line,
ground, footprint, mouth). V1 and V2 are unchanged and nothing migrates an
existing Blobbi to another generation; new Blobbis are V2 unless a host asks
for V3.

### V3 before release: a V3 seed is checked as one everywhere; a mouth anchor for hosts (renderer 0.6.0, core/react 0.8.0)

No drawing changed: every existing V3 test, the pinned references and
`procedural/vectors.json` are as they were.

- **Core: a V3 event's seed is classified by the V3 rule.** `isLegacyBlobbiEvent`
  checked only that a `seed` was 64 characters long, so a V3 event whose seed
  was 64 characters but not hexadecimal classified as `modern` although it has
  no V3 seed (`v3Identity.missing` named it, and the renderer drew no
  individual). For `visual_generation = v3` the seed must now be a V3 seed
  (`canonicalBlobbiV3Seed`, any letter case), or the event is `legacy`, as a
  missing seed already was. `getOrDeriveSeed` never derives a seed for a V3
  event (it returns the canonical seed, or throws), and `deriveVisualTraits`
  reads a V3 seed by the same rule. V1 and V2 keep the length check exactly.
- **Renderer: `ArtworkAnchors.mouth`.** The centre of the resting mouth,
  measured on the individual's own face geometry, for every V3 baby and adult
  drawn with a face (front and profile; mirrored with the profile). Absent for
  an egg, a back view, and V1/V2 (not measured). In `describeBlobbiArtwork`'s
  `anchors` and `boxAnchors`. Metadata only: nothing reads it to draw.

### V3 before release: what `visual_algorithm = 1` means, and one spelling for the seed (renderer 0.6.0, core/react 0.8.0)

Stability work before any V3 Blobbi exists publicly. No drawing changed:
every existing V3 test, the pinned end-to-end snapshot and
`procedural/vectors.json` are as they were.

- **The contract is written down.** The same V3 identity under the same
  `visual_algorithm` is the same Blobbi: the same shapes, in the same places,
  painted the same way; not necessarily the same SVG bytes, DOM, CSS or
  pixels. `procedural/version.ts` lists what version 1 freezes (the seed's
  reading, the random streams, the genome, the trait odds, morphology, the
  stage plans, geometry, patterns and marks, the art structure, the palette)
  and what it does not (the SVG, the backend, the pixels, state, the colour
  generator).
- **The V3 seed is canonical: 64 lower-case hexadecimal digits.**
  `canonicalBlobbiV3Seed` (core and renderer) and `BLOBBI_V3_SEED_LENGTH`
  are new. Hexadecimal digits in another letter case are the same seed, read
  as lower-case; anything else is not a seed and is never repaired into one.
  BEHAVIOUR CHANGE for V3 only: `createBlobbiV3Identity` throws a
  `TypeError` for a value that is not a seed (it used to hash any string),
  `resolveBlobbiV3Visual` resolves it to `none` (it used to draw an
  individual from it), `validateBlobbiV3Identity` rejects it, and
  `parseBlobbiV3Identity` reports it as a missing `seed`. Every seed the kit
  has ever derived is already canonical, so no existing Blobbi is affected;
  development tools that invented text seeds must use real ones. The `seed`
  tag is never rewritten, and V1 and V2 read it exactly as before.
- **Version 1 is pinned beyond the genome** (`artwork/v3/reference/`).
  Twelve reference identities, covering every kind of every trait, a mark in
  every region and a very pale body: their morphology as egg, baby and adult
  (exact; plus two bodies with every gene at an end of its range), every
  colour role derived from their four colours (and from seven more colour
  sets that reach each fallback), and what each paints as egg, baby and
  adult from the front, the side and behind.
- **Drawings are compared as paint lists, not markup.** `paint-list.ts`
  reads a drawing back as its painted shapes in order: each one's box,
  length, area and stroke width in the frame's units with every transform
  applied, its paint (fill, stroke, opacities, blur, clip), and where a
  user-space gradient lies. Positions within 0.02 units, paint exactly. Ids,
  grouping, attribute order, number spelling and an ellipse written as a
  path do not reach it (tested by rewriting real drawings); a shape that
  moves, bends, changes paint or changes place in the paint order does.
- **The writer's art decisions are stated as tests**
  (`art-structure.test.ts`): what lies on the skin is clipped to the body
  and layered wash, belly, stripes, spots, mark; the fixed opacities and
  which identity colour paints what; the four mark shapes; each stage's
  face order; what is beyond the body from behind and in profile.
- **The trait odds are written down as a table** and held against 3000
  seeds.

### V3 before release: one pattern, a special mark, ears on the flank (renderer 0.6.0, core/react 0.8.0)

Changes to the unreleased V3 entries below, made before any V3 Blobbi exists
outside a development machine. `visual_algorithm` stays `1`: what version 1
IS was settled here, and `procedural/vectors.json` was rewritten on purpose.

- **The `spots` tag and trait are gone.** A V3 Blobbi has ONE `pattern`
  (`solid | spotted | striped | gradient`, the tag's own words) and a
  `special_mark` (`none | star | heart | sparkle | moon`), both explicit
  identity: chosen by the seed at creation, authoritative afterwards, never
  rewritten on a republish. On V1 and V2 the same two tags are seed mirrors,
  exactly as before. New: `BLOBBI_V3_PATTERN_KINDS`,
  `BLOBBI_V3_SPECIAL_MARK_KINDS`, `BLOBBI_MIRRORED_IDENTITY_TAG_NAMES`,
  `BLOBBI_V3_ABSENT_TAG_NAMES` (core); `BLOBBI_V3_PATTERNS`,
  `BLOBBI_V3_SPECIAL_MARKS` (renderer). `BlobbiV3Traits` is now `antenna`,
  `horns`, `ears`, `tail`, `pattern`, `specialMark`, `belly`, `freckles`.
- **A V3 event carries no `size` and no `adult_type`.** `buildEggTags` does
  not write `size` for V3; the mirror sync and the tag repair never add
  either and drop any they find; `BlobbiCompanion.adultType` is `undefined`
  for a V3 Blobbi. V1 and V2 keep both.
- **Every value is drawn.** Spots (the authored flank pattern, and now a few
  across the back), stripes (tapered bands across the back that come round to
  the front above the brows and below the mouth), a gradient (the body
  deepens toward its base), and four mark shapes placed in one of four
  anatomical regions measured clear of the face through every expression.
  `blush` is not a V3 mark: a blush is what a cheek does.
- **Ears root on the flank in profile**, where the front view has them,
  instead of standing on the skyline at a fixed place: on a head that falls
  away steeply an ear used to hang over the slope.
- **`describeBlobbiArtwork(options)` and `ArtworkAnchors.footprint`**
  (renderer): where a drawing's head, eye line and ground are, and what it
  stands on (the middle and width of its ground contact), without drawing it;
  `boxAnchors` gives the same as fractions of the square the component uses.
  For hosts that draw their own ground shadow. `anchorsInSquare` is exported.

### `@blobbi-kit/renderer` 0.6.0 (V3: the procedural generation)

**Additive.** Every V1 fingerprint and every V2 drawing is byte-identical; a
visual that does not name `'v3'` is drawn exactly as before, whatever else it
carries.

- **`visualGeneration: 'v3'`** draws a Blobbi generated from its identity
  (`visual.v3`: a seed, four colours, its trait kinds) as an egg, a baby and
  an adult, from the front, in profile (both ways) and from behind. The
  engine is the `blobbi-procedural` prototype, ported file for file into
  `src/procedural/` (its tests with it) and reached only through the
  artwork registry (`artwork/v3/`): identity -> genome -> morphology ->
  geometry -> SVG. It is not exported.
- **Identity.** New exports `createBlobbiV3Identity(seed)` (the creation
  rule's visual half: called once, its result stored), `resolveBlobbiV3Visual`,
  `normalizeBlobbiV3Visual`, `BLOBBI_V3_ALGORITHM_VERSION` (`1`),
  `BLOBBI_V3_SUPPORTED_ALGORITHMS` and the trait vocabularies. Colours and
  trait kinds are explicit and authoritative once stated; proportions and
  trait shapes derive from the seed under a FROZEN algorithm version, pinned
  by `procedural/vectors.json` and, against the prototype's own vectors, by
  hash.
- **An algorithm version this package does not implement is never drawn as
  one it does.** `resolveBlobbiV3Visual` reports it as
  `unsupported-algorithm`; the drawing is then a flagged stand-in (the
  canonical body in the stated colours and trait kinds, nothing derived from
  the seed), with `artwork.unsupportedAlgorithm` and a
  `data-blobbi-unsupported-algorithm` attribute.
- **State is unchanged vocabulary**: `facing`, `expression`, `isSleeping`,
  `eyeOffset`, `eggCrack`, `groundShadow`, `motion`. New: an expression may
  be a blend of presets (`{ blend: { happy: 0.6 } }`), drawn continuously on
  V3 and as the dominant preset on V1 and V2; `renderBlobbiSvg` takes
  `motionPhase` (one baked frame) and a gaze direction for V3.
- **Motion.** A V3 drawing animates its own rig, so its body box is not
  wrapped in the `data-blobbi-motion` animation; the registry reports this
  through `ResolvedArtwork.motionStyles` and the component mounts the part of
  the rig stylesheet the drawing needs. `BLOBBI_V3_MOTION_STYLESHEET` is the
  whole sheet.
- **Fix, all generations:** the body's `dangerouslySetInnerHTML` object is
  now stable across renders. Under React 19 a fresh object rewrote
  `innerHTML` on every render, replacing the drawing's elements and
  restarting any animation inside it (a V2 leg mid-stride) whenever a host
  re-rendered for something unrelated, such as a gaze.
- New dev dependency (repository root): `@resvg/resvg-js`, for the raster
  fidelity tests. Nothing is added to any package's runtime dependencies.

### `@blobbi-kit/core` and `@blobbi-kit/react` 0.8.0 (V3 identity on the event)

**Breaking under 0.x in one reading only:** `parseVisualGeneration` now
returns `'v3'` for `["visual_generation", "v3"]`, which it used to read as
unknown (`'v1'`). Nothing creates V3 unless a host asks.

- **`BlobbiVisualGeneration` gains `'v3'`.** `NEW_BLOBBI_VISUAL_GENERATION`
  stays `'v2'`: V3 is opt-in, because the default is what every application
  that upgrades the kit starts writing.
- **V3 identity, in generation-independent tags** (`blobbi-v3-identity.ts`):
  the existing `base_color`, `secondary_color`, `eye_color`, `pattern` and
  `special_mark`, plus `accent_color`, `antenna`, `horns`, `ears`, `tail`,
  `belly`, `freckles` and `visual_algorithm`. The seed decides them at
  creation; the event is authoritative afterwards. New exports:
  `VISUAL_ALGORITHM_TAG`, `BLOBBI_V3_TAGS`, `BLOBBI_V3_TAG_NAMES`,
  `BLOBBI_V3_ONLY_TAG_NAMES`,
  `BLOBBI_MIRRORED_COLOR_TAG_NAMES`, `validateBlobbiV3Identity`,
  `blobbiV3IdentityTags`, `parseBlobbiV3Identity`, `normalizeBlobbiV3Color`,
  the kind vocabularies and types.
- **The colour tags are generation-aware.** On V1 and V2 they are seed
  mirrors, rewritten on every republish and never read, exactly as before.
  On V3 they are explicit identity: `syncMirrorTagsToSeed` leaves them alone
  (it neither overwrites nor adds one) and `deriveVisualTraits` reads them.
  On V3, `pattern` and `special_mark` are explicit identity too, and a V3
  event carries no `size` or `adult_type`; on V1 and V2 all four stay
  mirrors. A client that predates V3 does not make this check and would
  rewrite a V3 Blobbi's colours, pattern and mark on republish: clients must
  be updated before they write to V3 Blobbis.
- **Creation:** `buildEggTags(..., { visualGeneration: 'v3', v3 })`, where
  `v3` is a complete identity or a function of the new seed (the renderer's
  `createBlobbiV3Identity`). A V3 Blobbi is never born with a partial
  identity: it throws instead.
- **Reading:** `BlobbiCompanion.v3Identity` (what the tags state, plus
  `missing`) and `BlobbiVisualIdentity.v3`. Core never fills a gap, and
  reports the algorithm version as stated (absent when the tag is).
- **Persistence:** the tags are managed, persistent, valid at every stage and
  never invented; they survive care updates, hatch and evolve
  (`blobbi-v3-identity.test.ts`, `lifecycle-generation.test.tsx`).
- `@blobbi-kit/react` has no code change; it moves in lockstep.

Compatibility decision: V1 and V2 events, and events with no marker, are read
and republished exactly as before. A client that predates V3 draws a V3
Blobbi as V1 from its seed (not from the colour tags), carries the V3-only
tags through untouched, and rewrites its colours, pattern and mark if it
republishes.


### `@blobbi-kit/core` and `@blobbi-kit/react` 0.7.0 (a new Blobbi is born V2)

**Breaking under 0.x, for creation only.** The visual generation is identity
from birth, and the creation rule now lives in core instead of in every
application's memory of a tag.

- **`buildEggTags` writes `["visual_generation", "v2"]` by default.** New
  export `NEW_BLOBBI_VISUAL_GENERATION` (`'v2'`) names the rule; a fifth
  argument `options: { visualGeneration }` overrides it, and `'v1'` produces
  exactly the pre-0.7.0 tag list (no tag: absence is V1). New export
  `visualGenerationTags(generation)` spells the marker (`[]` for `'v1'`) for
  hosts that assemble a first kind 31124 by hand. `DEFAULT_VISUAL_GENERATION`
  (`'v1'`, how an event WITHOUT the tag is read) is unchanged, so every
  existing Blobbi stays V1 without any migration.
- **Nothing else changes a generation.** `updateBlobbiTags` carries the tag
  through every republish, the repair pass recovers it as a persistent tag,
  and neither `planHatchTransition`/`useBlobbiHatch` nor `useBlobbiEvolve`
  writes or drops it: a V2 egg hatches into a V2 baby and evolves into a V2
  adult, a V1 Blobbi stays V1 through both, and no transition ever
  "upgrades" the artwork. The adult FORM is the seed's on both generations
  (the transition only writes the seed's mirror `adult_type`). Pinned in
  `blobbi-visual-generation.test.ts` (core) and the new
  `lifecycle-generation.test.tsx` (react, at the hook level).
- `@blobbi-kit/react` has no code change of its own; it moves to 0.7.0 in
  lockstep and its core peer to `^0.7.0`.

Compatibility decision: a host that deliberately creates V1 Blobbis passes
`{ visualGeneration: 'v1' }` and gets byte-identical output; a host that
builds its first event by hand adds `...visualGenerationTags()`; every
other host gets V2 by upgrading. Existing events are never rewritten.

### `@blobbi-kit/renderer` 0.5.0 (the V2 adult walks on its legs; its ground shadow is the world's)

**Breaking under 0.x**: the default V2 output loses one element (the baked
ground shadow), and the V2 drawings gain four leg groups. Every V1 fingerprint
(`v1-fingerprints.test.ts`) and every V1 and baby walk are byte-identical.

- **Leg groups.** Each V2 foot is wrapped in a `<g>` carrying a new part:
  `left-leg`/`right-leg` (front and back) and `near-leg`/`far-leg` (the
  profile), exported as `ADULT_V2_LEG_PARTS` and listed in the view part
  lists. A group, not the foot, because the authored feet carry their own
  `transform` (a rotation about the origin) that a CSS transform on the same
  element would replace; the feet keep every authored attribute.
- **The V2 walk.** `motion="walking"` is unchanged as an input. On a V2
  drawing `BLOBBI_MOTION_STYLESHEET` now scopes a different gait by the
  `data-blobbi-generation` the drawing already carries: the body only sways
  (`blobbi-motion-walk-v2`, a degree either way and a slight rise at each
  step, no squash), and the leg groups do the walking, at the same
  `0.56 s` cycle and the same per-instance phase, so a host that keys its
  ground shadow to the cycle sees one clock. Front and back: each leg lifts
  in its half of the cycle (`blobbi-motion-step-left/right`, in the
  drawing's inner units under its 0.2646 document scale), pressing down a
  little while the other lifts so the planted foot stays on the ground as
  the body rises. Profile: near and far legs stride half a cycle apart
  (`blobbi-motion-stride-near/far`), back along the ground while planted, up
  and forward while lifted; the mirrored left profile mirrors the stride.
  Nothing moves the feet for `still` or `idle`, `prefers-reduced-motion`
  stills the legs with the body, and the SVG string is the same for every
  motion (`v2-gait.test.tsx`). The V1 and baby rules are the exact text they
  were.
- **`groundShadow: 'none' | 'artwork'`** is a new render input on
  `BlobbiRenderer`, `renderBlobbiSvg` and `BlobbiRenderModelInput`, exported
  with `BLOBBI_GROUND_SHADOWS` and `normalizeBlobbiGroundShadow`. The V2
  drawings carry a blurred `ground-shadow` ellipse on the floor under the
  creature: an environmental element, not the creature, and every host that
  moves a Blobbi through a world draws its own and showed two. **`'none'` is
  the default**: the renderer draws the creature only (`svg/ground-shadow.ts`
  removes exactly that one element, idempotently; the creature's own contact
  shading, `body-shadow` and the foot shadows, stays). `'artwork'` keeps the
  drawing as authored, for a host with no ground of its own. V1 has no
  ground shadow either way, so V1 output is unchanged.

Ownership, stated once: the renderer draws the creature, its expressions,
its sleep and how its body moves in place; the world owns position, the
floor, the bed, the ground shadow and when the creature walks.

## Earlier releases

Already on the registry before the release above (renderer 0.2.0–0.4.0,
core/react 0.6.0–0.6.1).

### `@blobbi-kit/renderer` 0.4.0 (V1 baby expressions; the sleeping Zzz becomes optional)

Two things a host game asked for. Neither changes any default output: every
V1 fingerprint (`v1-fingerprints.test.ts`) and the pre-0.4.0 DOM of the
component are byte-identical when the new inputs are left out.

- **`sleepIndicator`** is a new render input on `BlobbiRenderer`,
  `renderBlobbiSvg` and `BlobbiRenderModelInput`: `'artwork'` (default) |
  `'none'`, exported as `BLOBBI_SLEEP_INDICATORS` with
  `normalizeBlobbiSleepIndicator`. The V1 sleeping drawings (the baby and
  all sixteen adult forms) carry a small baked "Zzz" beside the head, an
  environmental cue rather than part of the creature; a host that draws its
  own animated sleep cue showed two. `'none'` removes that one comment block
  (`svg/sleep-indicator.ts`, found the way `applyRearView` finds face blocks
  and deleted only when self-contained) and nothing else: closed eyes and the
  calm mouth stay, awake drawings are returned as the same string, V2 (which
  has no baked Zzz) is untouched.
- **V1 baby expressions.** The baby front now draws the `expression` input,
  as rules over the one authored face (`artwork/baby/v1/expression.ts`)
  rather than a second drawing per emotion, applied after colouring: the
  authored mouth path moved a few units per state (`open` becomes a small
  filled ellipse in the mouth's colour), lids over the upper part of each
  eye for `half` eyes, filled with a solid skin colour from the body
  gradient and edged with a lid line in the mouth's colour (inserted after
  the pupils so gaze still works under them), grown whites and pupils for
  `wide`, and faded or deepened cheeks for `none`/`strong` blush. The baby
  has no authored brows, so a brow state is drawn as the lids' slant:
  `inner-up` droops the outer corners (sad), `lowered` makes heavy level
  lids on half eyes (sleepy) or a thin angry lid on open eyes (upset);
  `raised` draws nothing. Touched parts carry `data-part`
  (`BABY_V1_EXPRESSION_PARTS`) and `data-blobbi-mouth|eyes|brows|blush`,
  the same markers V2 uses. `supports.expression` is now `true` for the
  baby front and profiles (the faceless back stays `false`), so
  `data-blobbi-expression-support` appears on the component root. Neutral
  is the identity. `isSleeping` still selects the sleeping drawing whatever
  the expression. (Polish before release: the lids were first filled with
  the body gradient, which objectBoundingBox units re-centre on each lid,
  painting a white highlight on every lid; the mouths were also quieter
  variations of the authored one, not larger cartoon mouths.)
- Tests: `svg/sleep-indicator.test.ts` (one removable Zzz per V1 sleeping
  drawing, idempotent, awake and V2 untouched, the defaults draw what 0.3.0
  drew), `artwork/baby-v1-expression.test.ts` (neutral identity, every
  preset changes only the face, identity and ids unchanged, gaze on an
  expressed face, back and sleeping never expressed, mirrored facings equal,
  no clock or randomness in the rule), and component cases in
  `BlobbiRenderer.expressive.test.tsx`. `adult-v2-expression.test.ts` now
  asserts only the egg ignores expressions.

### `@blobbi-kit/renderer` 0.3.0 (egg artwork)

Eggs draw as eggs. `stage: 'egg'` no longer falls back to the baby body; it
resolves to a dedicated V1 shell drawing with seed colours and a cumulative
crack overlay.

- **`eggCrack`** is a new render input on `BlobbiRenderer`, `renderBlobbiSvg`
  and `BlobbiRenderModelInput`: `'none'` (default) | `'light'` | `'medium'` |
  `'heavy'`, a closed vocabulary exported as `BLOBBI_EGG_CRACKS` with
  `normalizeBlobbiEggCrack` and `eggCrackLevel`. How far along an incubation
  is stays host policy; the renderer only draws the shell it is told.
- The egg is one drawing for every generation and facing (a shell has no
  side, face or closed eyes); `supports` reports `{ expression: false, gaze:
  false, motion: true }`, and the component carries `data-blobbi-stage` and
  `data-blobbi-egg-crack`.
- Colours: `baseColor` tints the shell, `secondaryColor` the spots, through
  the same hex-only colour boundary as every other drawing.
- **Breaking under 0.x:** `ResolvedArtwork.stage` widens to
  `'egg' | 'baby' | 'adult'`, and any consumer that relied on an egg visual
  producing the baby markup through `renderBlobbiSvg` or the component now
  gets the shell. `loadBlobbiSvg('egg', …)`, the positional V1 API, still
  draws the baby and stays byte-identical (`v1-fingerprints.test.ts`).
- Tests: `artwork/egg-v1.test.ts` (shell parts, cumulative cracks, facing
  and generation invariance, deterministic colouring, unsafe colours
  refused, string API), `registry.test.ts` updated.

### `@blobbi-kit/core` and `@blobbi-kit/react` 0.6.1 (hatch primitive)

- **`useBlobbiHatch`** and the pure **`planHatchTransition`**: the egg → baby
  transition as Ditto's ceremony has published it, now shared. Same `d` and
  `seed` (mirror traits re-derived), `stage: baby`, `state: active`, every
  stat to `STAT_MAX`, streak credited, the egg's task and progression tags
  cleaned by the integrity guard, content reset, and the newborn placed in
  `evolving` with fresh evolve missions (opt out with `startEvolution:
  false`). Eligibility (`useHatchTasks().allCompleted`) stays a host gate,
  exactly as for `useBlobbiEvolve`. Additive; core carries no code change
  and is bumped only to keep the lockstep version.

### `@blobbi-kit/core` and `@blobbi-kit/react` 0.6.0 (breaking)

The canonical visual identity contract is closed: one validated, complete,
serializable description of how a Blobbi looks, for every host.

- **`BlobbiVisualIdentity.size`** is new and required. `size` is seed-derived
  identity like the pattern and the mark (`deriveVisualTraits` has always
  resolved it), but the projection dropped it and hosts reached back into
  `visualTraits` for it. The identity now carries all six seed-derived traits.
- **`BlobbiVisualIdentity.adultType` is typed `AdultForm`**, the sixteen-form
  vocabulary in `ADULT_FORMS`, instead of `string`. `getBlobbiVisualIdentity`
  emits it only when the value is a canonical form; a raw legacy `adult_type`
  tag outside the vocabulary is omitted, and the renderer's own default form
  applies. Seed-derived forms are unaffected (they are always canonical).
  Breaking only for code that constructs a `BlobbiVisualIdentity` literal with
  an arbitrary string; reading the field is unchanged.
- **`ADULT_FORMS`, `AdultForm`, `isValidAdultForm`, `getDefaultAdultForm` and
  `deriveAdultFormFromSeed` are exported from the root barrel.** They were
  reachable only through `@blobbi-kit/core/types/adult` and the `AdultTypes`
  namespace; both still work.
- **`theme` stays an opaque string.** The `theme` tag is creature identity (a
  themed Blobbi's kind 31124 event carries it; Ditto's divine eggs read it),
  not an application UI theme, and the protocol defines no vocabulary for it.
  Documented on the field; no type change.
- **Removed: the adult-type compatibility window.** `parseBlobbiEvent` used to
  rewrite the seed of an adult whose stored `adult_type` tag disagreed with
  the seed-derived form, until 2026-05-01. That date passed, the predicate
  `isAdultTypeCompatActive()` has returned `false` ever since, and the code
  path was dead. It is deleted along with the predicate export. Parsing of
  every persisted event is unchanged: the seed decides the adult form, the
  stored tag is a mirror and is rewritten on republish, and a seedless legacy
  adult still reads its raw tag (`blobbi-adult-form.test.ts` pins all three
  with fixed seed vectors). `adjustSeedForAdultType` remains, re-documented
  as a seed authoring utility (Ditto's dev editor uses it).
- `@blobbi-kit/react` has no code change; it moves to 0.6.0 in lockstep and
  its core peer to `^0.6.0`.

### `@blobbi-kit/renderer` 0.2.0 (expressive state; includes the unreleased 0.1.1 fixes)

The renderer represents visual STATE; the host owns behavioural POLICY. Every
addition below is a closed vocabulary the host names, never a shape or a rule
it supplies, and every default reproduces the previous output exactly.

- **Expression.** `expression?: BlobbiExpression` on `BlobbiRenderer` and
  `renderBlobbiSvg`: a preset (`neutral`, `happy`, `excited`, `sad`, `sleepy`,
  `surprised`, `upset`) or explicit parts (`eyes: open | half | closed | wide`,
  `mouth: neutral | smile | grin | frown | open | flat`, `brows: neutral |
  raised | lowered | inner-up`, `blush: none | soft | strong`). Drawn INTO the
  SVG on Adult V2 front and side as pure transforms of the authored face
  (mouth and brow paths rewritten relative to their authored geometry, a lid
  pair for half eyes, a scale wrapper inside the movable inner eye for wide
  eyes, cheek opacities for blush); the mirrored left profile needs nothing
  extra. `isSleeping` wins the eyes. The V2 back and every V1 drawing produce
  byte-identical markup for any expression. Normalization is total: unknown
  or hostile input is neutral, per part. New exports: `BLOBBI_EMOTIONS`,
  `BLOBBI_EMOTION_PRESETS`, `NEUTRAL_EXPRESSION`, the four state lists,
  `isBlobbiEmotion`, `normalizeBlobbiExpression`, `ADULT_V2_EXPRESSION_PARTS`
  and the types.
- **Motion.** `motion?: 'still' | 'idle' | 'walking'` (default `'still'`).
  Wrapper/CSS render state: the body box and both accessory layers (React) or
  the root `<svg>` (string API) carry `data-blobbi-motion` and
  `data-blobbi-motion-phase`, and `BLOBBI_MOTION_STYLESHEET` (namespaced
  `blobbi-motion-*`, `prefers-reduced-motion` aware) animates them: a
  four-second breath for idle, a half-second bob with sway and squash for
  walking, origin at the ground line. The phase is a hash of `instanceId`;
  no timer, no randomness. `'still'` emits no attribute and no style. Where
  the Blobbi is and why it walks stay with the host. New exports:
  `BLOBBI_MOTIONS`, `BLOBBI_MOTION_PHASES`, `BLOBBI_MOTION_STYLESHEET`,
  `normalizeBlobbiMotion`, `blobbiMotionPhase`, `blobbiMotionAttributes`.
- **Capabilities.** `artwork.supports: { expression, gaze, motion }` on every
  resolved drawing (`renderBlobbiSvg(...).artwork`), and
  `data-blobbi-expression-support` on the component root, so a host can ask
  what a drawing will honour instead of guessing. Type `BlobbiArtworkSupport`.
- **Fix: gaze on the mirrored left profile.** `eyeOffset.x` is screen-relative
  on every facing. The injected gaze style negates the horizontal travel when
  the drawing is mirrored; before, `x = 1` on `facing: 'left'` moved the
  pupils toward the viewer's left. `applyGazeMarkup` gains an optional
  `{ mirrored }` argument (`GazeMarkupOptions`). V1 never mirrors and is
  unchanged.
- The preview page (`npm run preview`) shows every preset on the front and
  both profiles, the sleeping-wins case, the unchanged back, and the three
  motion states on V2 and V1.
- **Colours are validated inside the renderer.** Every entry point
  (`BlobbiRenderer`, `renderBlobbiSvg`, `loadBlobbiSvg`) now accepts a colour
  only if it is a bare `#rgb` / `#rrggbb` hex value; anything else is treated
  as an absent colour and the artwork keeps its own. The V1 customizers splice
  colours into SVG attribute values by string interpolation, so a host that
  passed relay data straight through could have a stranger's `base_color` tag
  end up as markup. Valid colours are returned unchanged (no case folding, no
  expansion), so every existing drawing is byte-identical
  (`v1-fingerprints.test.ts`). `normalizeBlobbiRenderModel` reports the
  validated colours.
- **The string API is total.** `renderBlobbiSvg` with an unrecognized
  `visualGeneration` or `facing` now draws the V1 front, the same fallback
  `BlobbiRenderer` always applied, instead of throwing.
- New `input-hardening.test.tsx` pins both properties with inert probe payloads
  against every entry point.
- **Internal: the private copy of the Blobbi domain model is gone.** The V1
  artwork modules carried `artwork/core/blobbi-domain-types.ts` (a copy of
  core's `types/blobbi.ts`) and a set of `Blobbi`-object helpers
  (`resolveAdultSvg`, `customizeAdultSvgFromBlobbi`, `resolveAdultForm`,
  `preloadAdultSvgs`, their baby twins, and the variant/resolver-option
  types) that nothing in the package called and nothing exported. The
  package's `exports` map has a root entry only, so no consumer could import
  them. The registry now reaches the V1 modules through the form vocabulary
  and the colour input types alone. Public API and V1 output are unchanged
  (fingerprints untouched).

## 0.5.2 — One modern kind 31124 contract; configurable collection (fix + additions)

Backwards-compatible for every current producer: Blobbi Island and Ditto
events published today classify as modern exactly as before. The only event
acceptance change concerns the historical progression-in-`state` schema (see
below), which no client has written since 2026-04-18.

### `@blobbi-kit/core`

- **The modern contract is now written down on `isValidBlobbiEvent`** and
  pinned by `blobbi-modern-contract.test.ts` against fixtures modeled on a
  current Island egg, the same `d` after hatch (`baby`, `evolving`, evolution
  JSON in `content`) and a Ditto adult with `visual_generation = v2`. Required:
  kind 31124, `d`, `b = blobbi:ecosystem:v1`, `stage` in `egg|baby|adult`,
  `state` in `active|sleeping|hibernating`, `last_interaction`. Everything else
  (stats, `experience`, `care_streak*`, `generation`, `breeding_ready`,
  `progression_state`/`progression_started_at`, `last_decay_at`, visual trait
  tags, `visual_generation`, `published_at`, `content`) is optional and
  defaulted; `client`/`t` and host extension tags are never required.
- **`state` is strict.** `incubating`/`evolving` in `state` was the schema
  that preceded `progression_state` (split on 2026-04-18); the validator
  accepted it and `parseBlobbiEvent` silently rewrote it into
  `progressionState`. That read-time compatibility layer is gone: such an
  event is now `isUnsupportedLegacyBlobbiEvent`, `isLegacyBlobbiEvent`,
  invalid and unparsed. Legacy events are identified and ignored, never
  reinterpreted. New constant `BLOBBI_ACTIVITY_STATES`.
- `progression_state` is read from its own tag only; an unknown value yields
  `progressionState: 'none'` instead of leaking an arbitrary string through
  the union type.
- **Added** `classifyBlobbiEvent(event): 'modern' | 'legacy' | 'invalid'`,
  `isModernBlobbiEvent(event)` and `parseModernBlobbiEvent(event)`: the one
  path a consumer needs. `parseModernBlobbiEvent` returns `undefined` for
  legacy AND invalid input, so nobody has to check `isLegacy` by hand.
  `parseBlobbiEvent` is unchanged for callers that want the flagged companion.
- **Added** `BlobbiCompanion.publishedAt?: number` from the `published_at`
  tag (optional; not every producer writes it). No other field changed.
- Legacy policy tests made explicit: each known marker → unsupported; every
  current modern tag name → not a marker; `client`/`t` branding (Island and
  NIP-89 Ditto forms) → not legacy; `visual_generation` with any value → not
  legacy; malformed modern events → `'invalid'`, not `'legacy'`.

### `@blobbi-kit/react`

- **`useBlobbisCollection(dList?, pubkey?, options?)`** gains a third,
  optional argument (`UseBlobbisCollectionOptions`): `stages` keeps only the
  given lifecycle stages (a hatched-only world view passes
  `['baby', 'adult']`; eggs are included by default) and `filter` is an extra
  predicate. Options shape the result only: every caller shares one read, one
  cache entry per owner and the same optimistic updates.
- **Added** `status: BlobbiCollectionStatus` (`idle | loading | empty | ready
  | error`) and `isResolved` on the result. `'empty'` is the confirmed-empty
  state: a read the relay adapter resolved with no matching modern companion.
  `'idle'` (no pubkey / empty d-list), `'loading'` and `'error'` also come
  with an empty `companions` but mean "unknown", which the old shape could not
  express (a disabled query and a confirmed-empty one both read as
  `isLoading: false, companions: []`). Confirmation is exactly as strong as the
  adapter's own query resolution; the kit does not re-read to double-check.
  `resolveBlobbiCollectionStatus` (pure) and `BLOBBI_COLLECTION_KEEPS` (the
  legacy policy predicate, `isModernBlobbiEvent`) are exported.
- The collection and `updateCompanionEvent` now gate on
  `isModernBlobbiEvent`/`parseModernBlobbiEvent` from core instead of
  combining `isValidBlobbiEvent && !isLegacyBlobbiEvent` locally. Same set of
  events, one definition.
- Tests: `useBlobbisCollection.test.tsx` (loading → ready, confirmed empty,
  legacy-only owner is empty, mixed legacy/modern, idle without pubkey and
  with an empty d-list, error after retries, stage exclusion, default egg
  inclusion, filter composition, optimistic-update gating).

Versions: `@blobbi-kit/core` and `@blobbi-kit/react` 0.5.2 in lockstep; the
react peer on core moves to `^0.5.2`. `@blobbi-kit/renderer` is untouched.

---

## `@blobbi-kit/renderer` 0.1.0

Initial public release of the canonical, host-independent Blobbi renderer.

A third workspace package, `packages/blobbi-renderer`, published under the
kit's npm scope and versioned independently of the two domain packages.

It is the canonical Blobbi renderer: Blobbi Island's `@blobbi/react`
extraction (itself built on the SVG engine Ditto wrote), imported with its
git history and adapted to a package boundary. It depends on React alone and
imports neither `@blobbi-kit/core` nor `@blobbi-kit/react`; it knows no
Nostr, no inventory, no host. See `packages/blobbi-renderer/README.md`.

#### Adult V2 artwork and the artwork registry

- `BlobbiVisual.visualGeneration?: 'v1' | 'v2'` (absent means `'v1'`) and
  `BlobbiFacing = 'front' | 'back' | 'left' | 'right'` (the two profiles are
  new; V1 draws its front for both). Existing consumers need no change.
- **Adult V2**: one canonical anatomy with semantic `data-part` selectors
  (body, arms, feet, tuft, eyes with movable inner groups, eyebrows, cheeks,
  mouth) and authored directional artwork: front, a right-facing side that is
  mirrored for `left`, and a back derived from the front with the face removed
  and limbs/tufts stacked behind the body. `baseColor`, `secondaryColor` and
  `eyeColor` apply by color role; `pattern`, `specialMark` and `theme` are
  carried but not yet drawn.
- **Adult V2 closed eyes** (`isSleeping` / `eyesClosed`) are a deterministic
  transformation of the canonical drawing, not a second SVG: each eye group
  keeps its transform, loses its white and `*-eye-inner` children, and gains
  one lid stroke (`left-eye-closed`, `right-eye-closed`, `eye-closed`) in the
  mouth's stroke colour. Everything else is byte-identical to the awake
  drawing; the back view is unchanged; closed eyes receive no gaze. New export
  `ADULT_V2_CLOSED_EYE_PARTS`. The preview page shows awake | sleeping pairs
  for every facing. V1 sleeping output is untouched (fingerprints unchanged).
- An artwork REGISTRY (`artwork/registry.ts`) now decides every drawing from
  `(stage, visualGeneration, adultType, facing, eyesClosed)`; the React
  component and the string API contain no generation conditionals. V1 output
  is pinned byte for byte by `artwork/v1-fingerprints.test.ts` (142 digests
  recorded before the refactor).
- New string API `renderBlobbiSvg(options)`; `loadBlobbiSvg` is unchanged and
  V1-only. New exports `DEFAULT_VISUAL_GENERATION`, `ADULT_V2_PARTS`,
  `ADULT_V2_FACE_PARTS`, `ADULT_V2_GAZE_PARTS`; `applyGazeMarkup` accepts a
  generation. `npm run preview` (after a build) writes a static visual
  preview page under `preview/`.

---

## 0.5.1 — Branding tags no longer imply a legacy event (fix)

**Fix, no API change.** `isUnsupportedLegacyBlobbiEvent` (and therefore
`isLegacyBlobbiEvent`, `parseBlobbiEvent(...).isLegacy` and the
`useBlobbisCollection` filter) no longer treats `["client", "blobbi"]` or
`["t", "blobbi"]` as evidence of the old app. Legacy detection is now purely
schema/structure based: the old-app schema tag names (`incubation_time`,
`incubation_progress`, `egg_temperature`, `egg_status`, `shell_integrity`,
`fees`, `start_incubation`, `interact_6_progress`), the canonical `d` shape,
the 64-char `seed` and the `name` tag. None of those checks changed.

### Why

Branding tags say which client wrote an event, not which schema it follows.
Blobbi Island brands every event it publishes with `["client", "blobbi"]`, the
same value the old app once used, so every fully canonical Island-created
Blobbi was classified as unsupported: dropped from `useBlobbisCollection`,
skipped by the care hooks that early-return on `isLegacy`, and recoverable in
Ditto only through a host-side workaround. A genuine old-app event still fails
the structural checks (non-canonical `d`, no seed) or carries one of the old
schema tags, so nothing that was correctly excluded before is admitted now.

### Tests

- `blobbi-legacy-filter.test.ts`: canonical event + `client=blobbi` and
  + `t=blobbi` are not legacy; an old incubation tag on a canonical-looking
  event is still legacy; branding next to an old schema tag does not rescue it;
  bad `d`, missing/short `seed` and missing `name` stay legacy with or without
  branding; an Island-shaped kind 31124 fixture passes the visibility path and
  is retained next to a Ditto-created Blobbi.
- `blobbi.test.ts`: the per-marker test now lists only schema markers (and
  gains `interact_6_progress`); a new case asserts `t`/`client` alone stay
  current.

### Added — `@blobbi-kit/core`

- `./blobbi-visual-identity`, exporting `BlobbiVisualIdentity`,
  `BlobbiVisualIdentitySource` and `getBlobbiVisualIdentity(blobbi)`: the pure
  projection of a parsed companion's domain state (`stage`, `adultType`, the
  three colors, `pattern`, `specialMark`, the `theme` extension tag, `name`)
  onto the plain visual identity a renderer draws from. Structurally
  compatible with `@blobbi-kit/renderer`'s `BlobbiVisual` by design; neither
  package imports the other. Also re-exported from the package barrel. Hosts
  that hand-copied `visualTraits.*` into renderer input can call this instead.

- `BlobbiVisualGeneration` (`'v1' | 'v2'`), `VISUAL_GENERATION_TAG`
  (`'visual_generation'`), `DEFAULT_VISUAL_GENERATION` (`'v1'`) and
  `parseVisualGeneration(tags)` in `./blobbi`; `BlobbiCompanion.visualGeneration`
  and `BlobbiVisualIdentity.visualGeneration`. Which family of artwork draws a
  Blobbi is IDENTITY, carried in its kind 31124 event as
  `["visual_generation", "v2"]`, never a renderer or application version.
  **An event without the tag is `'v1'`**, so every pre-existing Blobbi is V1
  with no migration; an unrecognized value also resolves to `'v1'`. The tag
  is managed on republish and described by the tag schema for every stage
  (`visual`, persistent, not seed-derived, never mirrored). Nothing creates
  the tag on its own: `buildEggTags` stays V1, and a host that adopts a V2
  Blobbi adds the tag itself.

### Versions

Both packages move to 0.5.1 in lockstep, and `@blobbi-kit/react`'s peer range
on core moves to `^0.5.1` (the repository rule: the peer pins the core version
being released). Hosts that carry their own recovery for Island-branded
events can delete it once on 0.5.1.

---

## 0.5.0 — Remove the `@nostrify/nostrify` dependency (breaking)

**Breaking (type-level only).** No runtime behavior, protocol behavior, or
emitted JavaScript changes. The public `.d.ts` surface changes: signatures that
named Nostrify's types now name Blobbi Kit's own, structurally identical ones.
A **minor** bump under the `0.x` convention, because the published declaration
contract changes even though nothing executable does.

### Why

Both packages declared `peerDependencies["@nostrify/nostrify"]`. For a pre-1.0
package the caret pins the minor, so `^0.53.0 || ^0.54.0` means
`>=0.53.0 <0.55.0`. Every Nostrify minor release therefore broke `npm install`
for host apps, who had to suppress the `ERESOLVE` with an npm `overrides` entry.
0.3.1 widened the range once already; doing it again only resets the clock.

The dependency was misclassified, not mis-ranged. Neither package ever imported
a Nostrify symbol at runtime — every import was `import type`, and the emitted
JavaScript has never contained one. A peer dependency states that host and
library must *share one instance* of something; that was true of React, TanStack
Query, and `@nostrify/react`, and never true of `@nostrify/nostrify`.

### Added — `@blobbi-kit/core`

- `./nostr-protocol`, exporting `NostrEvent`, `NostrFilter`, `NostrQuerier`, and
  `NostrQueryOptions`. Also re-exported from the package barrel, and from
  `@blobbi-kit/react` for hooks consumers.

  `NostrEvent` and `NostrFilter` are the NIP-01 wire types, declared
  field-for-field. `NostrQuerier` is the single method the kit actually needs
  from a relay pool: `query(filters, opts?)`.

### Changed — `@blobbi-kit/core`

- `fetchFreshEvent` and `fetchFreshBlobbonautProfile` accept `NostrQuerier`
  instead of Nostrify's `NPool`. **This is a widening**: `NPool` is a class with
  `private` members, so it was nominally typed and only that exact class from
  that exact installed copy satisfied it. Every existing caller keeps compiling;
  callers that previously could not pass a store, cache, wrapper, or test double
  now can.

### Removed — both packages

- `peerDependencies["@nostrify/nostrify"]`. `@blobbi-kit/core` now declares no
  peer dependencies at all.

### Unchanged

- `@nostrify/react` remains a peer of `@blobbi-kit/react` at `^0.6.3`. It is a
  genuine runtime integration — the hooks call `useNostr()` and must resolve the
  host's provider context. Its range is untouched and already accepts the 0.6.5
  and 0.6.7 releases in use.
- `@noble/hashes` stays core's sole regular dependency at `^1.3.1`.
- No change to any Blobbi kind, tag, parsing rule, or the legacy `storage` /
  `coins` tag preservation guarantees.

### Versions

| Package | 0.4.0 | 0.5.0 |
| --- | --- | --- |
| `@blobbi-kit/core` | 0.4.0 | 0.5.0 |
| `@blobbi-kit/react` | 0.4.0 | 0.5.0 |
| `@blobbi-kit/react` peer `@blobbi-kit/core` | `^0.4.0` | `^0.5.0` |
| `@blobbi-kit/core` peer `@nostrify/nostrify` | `^0.53.0 \|\| ^0.54.0` | *(removed)* |
| `@blobbi-kit/react` peer `@nostrify/nostrify` | `^0.53.0 \|\| ^0.54.0` | *(removed)* |
| `@blobbi-kit/react` peer `@nostrify/react` | `^0.6.3` | `^0.6.3` |

Both packages move in lockstep, as in every prior release. The `@blobbi-kit/core`
pin is load-bearing here: the new `nostr-protocol` module lives in core, so
`react@0.5.0` paired with `core@0.4.0` would resolve its type imports against a
core that does not export them.

### Migration

For most hosts, none — delete any npm `overrides` entry that pinned Nostrify for
Blobbi Kit's sake, and `@nostrify/nostrify` becomes a normal direct dependency of
your app (or disappears, if only `@nostrify/react` needed it).

Hosts that explicitly annotated a variable with Nostrify's `NostrEvent` before
passing it to the kit still compile: the types are mutually assignable, which
`packages/blobbi-core/src/nostr-protocol.test.ts` asserts against the real
Nostrify types on every run.

### Tests

- `fetchFreshEvent.test.ts` and `fetchFreshBlobbonautProfile.test.ts` (new, 34
  tests) pin the two helpers' behavior — query shape, `limit: 1` injection,
  abort-signal merging, newest-version selection, current-kind-over-legacy
  preference, empty and invalid results. Written and run green *before* the
  refactor, so they pin existing behavior rather than the new code.
- `nostr-protocol.test.ts` (new, 16 tests) typechecks the local declarations
  against the real `@nostrify/nostrify` / `@nostrify/types` in both directions,
  and proves `NPool`, `NRelay`, `NStore`, and a bare `{ query }` object all
  satisfy `NostrQuerier`.
- `packages/*/src/package-manifest.test.ts` no longer assert a Nostrify range.
  They now assert Nostrify appears in *no* host-facing dependency field, and
  that `@nostrify/react` remains the React package's genuine peer.
- `scripts/smoke.mjs` keeps the "Nostrify absent from emitted JS" check and adds
  a declaration-surface check: no published `dist/**/*.d.ts` may reference the
  module. Comments are stripped before scanning, so prose naming the package is
  not a false positive.

### Development

`@nostrify/nostrify` remains a **root devDependency**. It is not published by
either package, and now serves only as the compatibility fixture that
`nostr-protocol.test.ts` typechecks against.

---

## 0.4.0 — Remove the obsolete profile-Coin economy surface (breaking)

**Breaking.** The kit no longer defines or exposes any Blobbi Coin economy.
Active Blobbi Coin balances are owned by host applications and live outside
blobbi-kit entirely; this release removes the last remnants of the old
kind:11125 profile-Coin model, following the same pattern the 0.3.0
consumable-storage removal established.

### Removed

- `INITIAL_BLOBBONAUT_COINS`, `BLOBBI_PREVIEW_REROLL_COST`, and
  `BLOBBI_ADOPTION_COST` — the onboarding economy constants are gone from
  `@blobbi-kit/core` (source, barrel, and built declarations). Coin allocation
  and adoption/reroll pricing are host-application policy, not library policy.
- `BlobbonautProfile.coins` — the parsed profile no longer represents legacy
  profile Coins as active state. `parseBlobbonautEvent` does not read the
  `coins` tag into the typed model.
- `coins` is no longer a member of `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES`.
  Typed profile writers (`updateBlobbonautTags`,
  `mergeBlobbonautTagsForRepublish`) can no longer create, replace, or delete
  a `coins` tag.

### Compatibility — legacy `coins` tags are tolerated and preserved

An existing kind:11125 tag such as `["coins", "200"]` is obsolete historical
data. It now behaves exactly like legacy `storage` tags:

- events carrying it (including malformed or duplicate variants) still parse;
- it reaches callers only via `allTags`/`event.tags`, as an opaque unknown tag;
- republishing an existing profile (name, `has`, companion, onboarding,
  progression updates, normalization) preserves it **verbatim** — never
  normalized, renumbered, deduplicated, or dropped;
- a `coins` key passed to an update helper is ignored with a dev-time warning
  (mirroring the `storage` guard): it can neither write a new Coin tag nor
  modify a pre-existing one.

### Versions

| Package | 0.3.1 | 0.4.0 |
| --- | --- | --- |
| `@blobbi-kit/core` | 0.3.1 | 0.4.0 |
| `@blobbi-kit/react` | 0.3.1 | 0.4.0 |
| `@blobbi-kit/react` peer `@blobbi-kit/core` | `^0.3.1` | `^0.4.0` |

`@blobbi-kit/react` has no code change of its own beyond tests; it moves in
lockstep because it re-uses core's `BlobbonautProfile` type, so the `coins`
field removal flows through its hook parameter types.

### Migration

Hosts that still read `profile.coins` should read their own Coin state instead
(it is host-owned data, outside blobbi-kit). Hosts that need the raw legacy tag
for display or migration can still find it in `profile.allTags`.

---

## 0.3.1 — Accept Nostrify 0.54 (packaging fix)

**Packaging only.** No Blobbi runtime, API, type, or protocol behavior change.
Not a single source file under `packages/*/src` differs from 0.3.0, and the
emitted `dist/` output is **byte-identical** to a build of the 0.3.0 tree — the
version is not stamped into the bundle, so only the manifests differ.

### Fixed

Both packages declared `peerDependencies["@nostrify/nostrify"] = "^0.53.0"`.
For a pre-1.0 package the caret pins the **minor**, so that range means
`>=0.53.0 <0.54.0` and excludes `0.54.0`. Host apps on Nostrify 0.54 hit
`ERESOLVE` on `npm install` and had to suppress it with an `overrides` entry.
The range is now widened to accept both lines:

| Package | Peer | 0.3.0 | 0.3.1 |
| --- | --- | --- | --- |
| `@blobbi-kit/core` | `@nostrify/nostrify` | `^0.53.0` | `^0.53.0 \|\| ^0.54.0` |
| `@blobbi-kit/react` | `@nostrify/nostrify` | `^0.53.0` | `^0.53.0 \|\| ^0.54.0` |
| `@blobbi-kit/react` | `@blobbi-kit/core` | `^0.3.0` | `^0.3.1` |

The `@blobbi-kit/core` pin moves in lockstep, as in every prior release. It is
also load-bearing here: the Nostrify fix lives in core, so `react@0.3.1` paired
with `core@0.3.0` would silently reintroduce the narrow peer.

Hosts that added a Nostrify `overrides` entry for either package can remove it
once both are on `0.3.1`.

### Why this is safe

Nostrify 0.54.0's entire delta over 0.53.0 is `BlossomUploader` (Blossom spec
update), `NIP98.verify` (error-message change), and `utils/N64`. The kit
references none of them. The complete Nostrify surface it consumes is
`NPool`, `NostrEvent`, and `NostrFilter`:

- `dist/NPool.d.ts`, `dist/NPool.js`, and the public `dist/mod.d.ts` barrel are
  byte-identical between 0.53.0 and 0.54.0.
- `NostrEvent` / `NostrFilter` come from `@nostrify/types`, which both releases
  pin to the **exact** version `0.37.0`.

### Unchanged

- `@nostrify/nostrify` remains a **peer**, and a *type-only* one: every import
  of it is `import type`, and it has zero runtime imports in the built output.
  Core's only runtime externals are `@noble/hashes/{sha256,utils}`.
- `react`, `@tanstack/react-query`, and `@nostrify/react` remain **peers** of
  `@blobbi-kit/react`, with their ranges untouched (`^18.0.0 || ^19.0.0`,
  `^5.56.2`, `^0.6.3` — all already satisfied by current host versions).
- `@noble/hashes` stays a regular dependency at `^1.3.1`. It is **not** widened:
  v2.x removed the `./sha256` export subpath that core imports.
- Everything in the 0.3.0 entry below still holds, including the legacy
  `storage`-tag preservation guarantee.

### Tests

- `packages/*/src/package-manifest.test.ts` (new) asserts the shipped manifests
  directly: Nostrify and React are peers and not regular dependencies, the new
  range accepts 0.53.x and 0.54.x and rejects 0.55.0, the two packages stay in
  lockstep, and `files`/`exports` stay correct.
- `scripts/smoke.mjs` gained the artifact-side counterpart, scoped to what only
  a built tree can show. It scans the emitted `dist/**/*.js` for bare import
  specifiers and requires each one to be declared in that package's
  `dependencies` or `peerDependencies` — the manifest is its own allowlist, so a
  new runtime dependency cannot be introduced without declaring it. It then
  asserts Nostrify is absent from the emitted JavaScript entirely, which is what
  actually proves the type-only peer is not bundled. Range and version semantics
  are deliberately *not* re-checked here; the unit tests own those.
- `scripts/smoke.mjs` also guards the installed tree against a duplicate Nostrify.
  `@nostrify/react` pins `@nostrify/nostrify` to an **exact** version
  (`0.6.3`→`0.53.0`, `0.6.4`→`0.54.0`), so the two must be upgraded as a pair;
  bumping one alone leaves a second copy nested under `@nostrify/react`, and
  since `NPool` declares `private` members it is nominally typed, so the
  duplicate surfaces as misleading `TS2345 NPool is not assignable to NPool`
  errors that mimic a version incompatibility.

### Development

Root `devDependencies` only. These are **not** published — both packages ship
`files: ["dist", "LICENSE"]`, so no dev dependency and no test file is in either
tarball, and no consumer-visible range is affected.

- Moved to the matched pair the host apps ship,
  `@nostrify/nostrify@^0.54.0` + `@nostrify/react@^0.6.4`, so `typecheck` and
  `test` validate against the Nostrify line this release adds support for. The
  published peer ranges still accept `0.53.x` with `@nostrify/react@^0.6.3`;
  because `@nostrify/react` pins Nostrify exactly, only one pair can be
  exercised at a time, and the newest supported pair is the useful one.
- Added `semver` + `@types/semver`, so the manifest range assertions use npm's
  own resolver rather than a hand-rolled reimplementation of caret semantics.

---

## 0.3.0 — Remove the deprecated kind:11125 consumable-inventory API

**Breaking.** The consumable-inventory model deprecated in 0.2.0 is removed.
Ditto and Blobbi Island have migrated away from it; hosts that need finite
inventory own it themselves (e.g. `@nostr-games/inventory`, kinds 31632/31633).
The kit itself takes no dependency on any inventory library and implements no
migration, backfill, dual-read, or dual-write behavior.

### Removed — `@blobbi-kit/core`

- `StorageItem` (interface)
- `BlobbonautProfile.storage` (field)
- `parseStorageTags(tags)`
- `createStorageTags(storage)`

All four were re-exported from the package barrel (`@blobbi-kit/core`) and from
the deep entry `@blobbi-kit/core/blobbi`; both are now clean.

### Removed — `@blobbi-kit/react`

- `FreshBlobbiResult.profileStorage`
- `CanonicalIncubationResult.profileStorage`
- `CanonicalActionResult.profileStorage`

### Unchanged — legacy `storage` tags are still preserved

This is the compatibility guarantee, and it is unchanged from 0.2.0:

- `storage` is **not** in `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES`, so pre-existing
  `storage` tags are ordinary **unknown host extension tags**.
- They survive `mergeBlobbonautTagsForRepublish` / `updateBlobbonautTags` /
  `buildNormalizedProfileTags` **tag-for-tag**, in order, with their original
  arity — including shapes the old parser would have rejected.
- The kit never parses, exposes, creates, normalizes, or deletes them. A
  `storage` key passed in `updates` is dropped with a dev-time warning, so a
  profile republish can never create or mutate consumable inventory.
- `inv` (Blobbi Island's accessory/cosmetic extension tag) is **untouched** and
  entirely independent. Its existing behavior and tests are unchanged.

### Migration

| Removed | Replacement |
| --- | --- |
| `import { StorageItem } from '@blobbi-kit/core'` | Define the shape in the host, or use the host's inventory library. |
| `profile.storage` | Read `profile.allTags` and filter for `storage` yourself, or migrate to host-owned inventory. |
| `parseStorageTags(tags)` | Host-side helper over `event.tags` / `profile.allTags`. |
| `createStorageTags(items)` | Host-side builder. Note the kit will still refuse to *write* the resulting tags through `updateBlobbonautTags`. |
| `result.profileStorage` (react hooks) | `result.profileAllTags`, which is the raw tag list. |

No event data changes. No re-publish, backfill, or migration step is required:
profiles that carry `storage` tags keep them.

### Other

- `scripts/smoke.mjs` now asserts the built `dist/` output — runtime named
  exports and emitted `.d.ts` declarations — contains none of the removed API.

---

## 0.2.0 — Decouple consumable inventory from kind:11125 (backward-compatible)

- Marked `StorageItem`, `BlobbonautProfile.storage`, `parseStorageTags`,
  `createStorageTags`, and the three `profileStorage` hook fields
  `@deprecated`. No API removed.
- Removed `'storage'` from `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES`, reclassifying
  legacy `storage` as an opaque host extension tag preserved like `inv`.
- `mergeBlobbonautTagsForRepublish` began dropping any `storage` update key so
  the kit can never write new consumable inventory.
- Added regression tests for opaque preservation, write refusal, and `inv`
  independence.

---

## 0.1.0

- Initial packaging of `@blobbi-kit/core` and `@blobbi-kit/react`.
