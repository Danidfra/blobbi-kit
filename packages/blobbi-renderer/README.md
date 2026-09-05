# `@blobbi-kit/renderer`

The canonical, host-independent Blobbi renderer: a React component (and a
string function) that draws a Blobbi from plain, serializable visual data.

---

## 1. Responsibility

```
                    plain visual data + visual state
                                  │
                                  ▼
             ┌─────────────────────────────────────────┐
             │  @blobbi-kit/renderer                   │
             │    body   ──►  inline SVG (synchronous) │
             │    accessories ──► positioned <img>s    │
             │    effects ──► deterministic CSS pieces │
             └─────────────────────────────────────────┘
                                  │
                                  ▼
                              markup out
```

**Given Blobbi visual data and visual state, deterministically render the
Blobbi.** That is the whole contract.

**Non-responsibilities**, stated up front so nobody looks for them here:

- no Nostr, relays, `NostrEvent`, signing, publishing or kinds (31124, 31633,
  31634, …);
- no `BlobbiCompanion` or any other domain object: hosts map their model to
  the plain [visual model](#4-the-visual-model);
- no authentication, profiles, inventory or equipment fetching, economy,
  missions, care mutations or routing;
- no world position, ground anchor, depth scale, shadow, z-index or movement;
- no host CSS: geometry is inline, nothing here needs Tailwind or a reset;
- no state, timers, animation frames, randomness or network. The component is
  a function of its props.

## 2. Installation

```bash
npm install @blobbi-kit/renderer react
```

Inside this repository the package is a workspace member: `npm install` at the
root links it, and `@blobbi-kit/renderer` resolves to `packages/blobbi-renderer`.

Peer dependency: `react ^18.0.0 || ^19.0.0`. There are no runtime
dependencies.

## 3. Basic use

```tsx
import { BlobbiRenderer, normalizeAccessoryPlacements, type BlobbiVisual } from '@blobbi-kit/renderer';

const visual: BlobbiVisual = {
  stage: 'adult',
  adultType: 'bloomi',
  baseColor: '#F2A0C0',
  secondaryColor: '#FAD4E4',
  eyeColor: '#3A2A1A',
  name: 'Rosa',
};

const accessories = normalizeAccessoryPlacements([
  { code: 'headwear-8', slot: 'headwear', x: 50, y: 20, scale: 1, rot: 0, url: '/hat.png' },
]);

<BlobbiRenderer
  visual={visual}
  instanceId="rosa"           // required: namespaces every SVG id
  size={240}                  // or a token: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl', or '100%'
  facing="front"              // or 'back'
  isSleeping={false}
  eyeOffset={{ x: 0.4, y: -0.2 }}
  accessories={accessories}
  effects={[{ id: 'celestial-aura' }, { id: 'golden-sparkles', intensity: 0.8 }]}
  label="Rosa, an adult Bloomi"
/>;
```

Every value above survives `JSON.parse(JSON.stringify(…))`. That is the actual
contract: whatever crosses the boundary can have come off a wire.

## 4. The visual model

```ts
interface BlobbiVisual {
  stage?: 'egg' | 'baby' | 'adult';
  visualGeneration?: 'v1' | 'v2';  // absent means 'v1'; see "Artwork generations"
  adultType?: string;         // 'bloomi' | 'breezy' | … (16 V1 forms); V1 adult only
  baseColor?: string;
  secondaryColor?: string;
  eyeColor?: string;
  pattern?: string;           // carried as data; not drawn by the current bodies
  specialMark?: string;       // carried as data; not drawn by the current bodies
  theme?: string;             // carried as data only
  name?: string;              // tooltip text only
}
```

Incomplete input is handled rather than rejected (`normalizeBlobbiRenderModel`
is the single pure function that does it):

| Input | Result |
| --- | --- |
| absent / unrecognized `visualGeneration` | `'v1'` |
| absent / unrecognized `facing` | `'front'` |
| absent / unrecognized `stage` | `'baby'` |
| `stage: 'egg'` | accepted; draws the baby body (a dedicated egg drawing is a later milestone) |
| `stage: 'adult'` with no `adultType` | `'bloomi'` |
| unknown `adultType` | corrected to the default form by the artwork resolver |
| absent colors | the artwork's own colors |
| non-finite gaze axis | `0`; finite axes clamp to ±1 |
| gaze with `facing: 'back'` | dropped (that drawing has no pupils) |
| blank / punctuation-only `instanceId` | `'blobbi'` |
| non-finite accessory `x`/`y`/`scale`/`rot` | `50` / `50` / `1` / `0` |
| unknown effect id | ignored |
| non-finite / out-of-range `intensity` | `1` / clamped to 0…1.5 |

`BlobbiRenderVisual` is a deprecated alias of `BlobbiVisual`, kept for one
migration cycle.

## 5. Sizes: the canonical box

The renderer box is a square, and it is the single coordinate space for the
body, the accessories and the effects. It is applied as an **inline**
`width`/`height`, so no consumer build has to generate a class for it.

| `size` | Box |
| --- | --- |
| `'sm'` `'md'` `'lg'` `'xl'` `'2xl'` `'3xl'` | 32 / 56 / 96 / 128 / 224 / 288 px (`BLOBBI_RENDER_SIZE_PX`) |
| a number | that many pixels |
| a string | used verbatim as a CSS length (`'100%'`, `'12rem'`) |

Default is `'lg'`. `data-blobbi-size` carries the token or the CSS length.
`style` merges after the box, so a host may override it; a host that does
should not render accessories, whose sizes are fractions of the box
(`ACCESSORY_BASE_RATIO = 60/128`).

## 6. Facing, sleeping, gaze

- `facing` is `'front' | 'back' | 'left' | 'right'`. For V1, `'back'` derives
  the rear drawing from the front artwork by removing its face blocks
  (`applyRearView`) and the two profiles draw the front (V1 has no side art).
  For V2, every facing is authored artwork: `'back'` is the derived rear
  anatomy, `'right'` the authored profile and `'left'` that profile mirrored.
  Face-only accessory slots are hidden for `'back'` (`REAR_VIEW_HIDDEN_SLOTS`);
  the profiles hide nothing yet.
- `isSleeping` closes the eyes. `eyesClosed` is a legacy alias that produces
  byte-identical markup. On V1 this selects the separately drawn sleeping
  artwork; on V2 it is a deterministic transformation of the one drawing (see
  "V2: the canonical anatomy"). Closed eyes receive no gaze on either
  generation.
- `eyeOffset` (each axis −1…1) moves only the pupils, through two CSS
  variables on the body wrapper. The SVG string is generated once per visual
  change, never per gaze change, which is what makes per-frame gaze cheap. On
  V1 the marked elements are the pupil shapes; on V2 they are the semantic
  `*-eye-inner` groups (iris, pupil, highlights), so the eye whites and body
  never move. The V2 back view has no face and receives no gaze markup.

## 7. Accessories

The renderer draws exactly the accessories it is handed, already normalized:

```ts
normalizeAccessoryPlacements(items, { facing, resolveSources });
```

`x`/`y` are percentages of the box to the accessory's center; `scale`
multiplies the box-relative base size; paint order is deterministic by slot
(`ACCESSORY_SLOT_RANK`: aura and back behind the body, everything else in
front). Artwork is resolved by an `AccessorySourceResolver` that returns an
ordered list of candidate URLs; the renderer paints the first and advances on
load failure. The default resolver is "use the URL you gave me". The package
knows no asset layout, inventory or equipment event.

## 8. Visual effects

Twelve deterministic CSS effects, named by id (`BLOBBI_VISUAL_EFFECT_IDS`),
each in a slot (`EFFECT_SLOTS`), at most one per slot, drawn in
`EFFECT_SLOT_ORDER`. Effects are `position: absolute; pointer-events: none`
decoration: they change no measurement and take no click, and a Blobbi with
no effects emits no effect markup and no `<style>` at all. Particle placement
is seeded by `instanceId:effectId`, so re-renders never move anything.
Reduced motion is honored in CSS. `BLOBBI_EFFECT_STYLESHEET` lets a host mount
the rules once instead of carrying a `<style>` per effect-bearing Blobbi.

## 8b. Artwork generations

A Blobbi's **visual generation** is which family of artwork draws it. It is a
property of the Blobbi's identity, carried in its kind 31124 event by the
domain kit as `["visual_generation", "v2"]` and projected into `BlobbiVisual`
as `visualGeneration`. It is never a renderer or application version: the same
Blobbi draws the same generation in every client, today and later.

**Absence of the marker means V1.** Every Blobbi that existed before the marker
did is V1, without migration, and every consumer that never sets the field gets
exactly the drawings it always got.

### V1: the original generation

Sixteen independent adult forms (`bloomi`, `breezy`, `cacti`, `catti`, `cloudi`,
`crysti`, `droppi`, `flammi`, `froggi`, `leafy`, `mushie`, `owli`, `pandi`,
`rocky`, `rosey`, `starri`), one baby, a sleeping variant of each, per-form
color customizers, and a rear view derived by removing the face comment blocks.
Supported for compatibility for as long as V1 Blobbis exist; `loadBlobbiSvg` is
its positional API and `artwork/v1-fingerprints.test.ts` pins its output byte
for byte.

### V2: the canonical anatomy

One adult body with explicit, stable semantic parts and authored directional
artwork. Every meaningful element carries a `data-part` attribute; code selects
parts by `data-part`, never by `id` (ids are namespaced per instance) and never
by an Inkscape group name.

| view | source | notes |
| --- | --- | --- |
| `front` | authored diagonal view | two eyes with movable `*-eye-inner` groups, eyebrows, cheeks, mouth, tuft, side pattern, shine |
| `side` | authored right-facing profile | one `eye`/`eye-inner`, `near-*`/`far-*` limbs; **`left` is this drawing mirrored** (`data-blobbi-mirrored="x"`) |
| `back` | derived from the front | same body, feet, arms, tufts and shadows; arms and tufts stacked behind the body; no face parts at all |
| closed eyes | derived from any view | `isSleeping`/`eyesClosed`: each eye group keeps its transform and is marked `data-blobbi-eyes="closed"`; its white and `*-eye-inner` children are removed and one lid stroke (`left-eye-closed`, `right-eye-closed`, `eye-closed`) is drawn in the mouth's `#21102e`. Eyebrows, cheeks, mouth and body are byte-identical to the awake drawing; the back view is unchanged. No separate sleeping SVG exists. |

Parts (see `ADULT_V2_PARTS`, `ADULT_V2_FACE_PARTS`, `ADULT_V2_GAZE_PARTS`,
`ADULT_V2_CLOSED_EYE_PARTS`):
`character`, `body-base`, `body-shadow`, `ground-shadow`, `body-shine`,
`left-arm`/`right-arm` (front, back), `near-arm`/`far-arm` (side),
`left-foot`/`right-foot` and their shadows (front, back), `near-foot`/`far-foot`
(side), `tuft-main`, `tuft-secondary`, `tuft-detail-left`/`-right`,
`left-eye`/`right-eye`/`eye` with `*-eye-white`, `*-eye-inner` (movable),
`*-iris`, `*-pupil`, `*-eye-highlight-primary`/`-secondary`,
`left-eyebrow`/`right-eyebrow`/`eyebrow`, `left-cheek`/`right-cheek`/`cheek`
(with `-base`/`-highlight`), `mouth`, `side-pattern` with `side-pattern-mark`s,
and, in closed-eye output only, `left-eye-closed`/`right-eye-closed`/`eye-closed`.
In the back view, screen-left limbs are the character's right limbs and are
labeled `right-*`.

Traits on V2: `baseColor` recolors the body, limb, foot and stroke color roles;
`secondaryColor` recolors the side-pattern marks (visible on the profile; the
authored front places its pattern group outside the viewBox, so the front and
back show no marks until the artist moves it); `eyeColor` recolors the iris
gradient (the pupil stays near-black). `pattern`, `specialMark` and `theme`
are carried in identity but **not yet drawn** on V2. Closed eyes are drawn (as
a transformation, above). Baby V2 does not exist yet; a V2 baby draws the V1
baby.

V2 is the foundation for future movement, clothing and expressions. Nothing
moves yet: the renderer stays a pure function of its props, and the semantic
part map is what makes animation possible later without another artwork
rewrite.

### Adding artwork

Sources live under `src/artwork/` as typed SVG strings, one file per drawing,
with a clear source-of-truth hierarchy:

```
artwork/
  registry.ts          which drawing for (stage, generation, adultType, facing, eyesClosed)
  types.ts             BlobbiVisualGeneration, BlobbiFacing, ArtworkRequest, ResolvedArtwork
  mirror.ts            horizontal mirroring for the profile
  baby/v1/             the V1 baby (data, resolver, customizer)
  adult/v1/            the sixteen V1 forms (data, resolver, per-form customizers)
  adult/v2/            front.ts, side.ts, back.ts, closed-eyes.ts, customize.ts, parts.ts
```

- **Another V2 view** (e.g. a three-quarter back): author it under `adult/v2/`
  with the same `data-part` vocabulary (add new parts to `parts.ts`), register
  it in `ADULT_V2_VIEWS`, and teach `viewForFacing` in the registry which
  facing selects it. Add it to the parts-contract tests.
- **Adult V2 artwork changes**: edit the source file; geometry only. The
  customizer works by color role, so keep the authored palette or update the
  role table in `customize.ts`.
- **Baby V2**: add `baby/v2/` (views, parts, customizer) and a `stage ===
  'baby'` branch in the registry's `'v2'` case, mirroring the adult one; remove
  the "V2 baby draws V1 baby" fallback.
- **A future generation** (`'v3'`): add it to `BlobbiVisualGeneration` in both
  this package and `@blobbi-kit/core` (they are declared independently on
  purpose), add a `v3/` folder with its own customizer and pipeline, and one
  new `case` in each `switch` of the registry. Nothing outside `artwork/`
  should need to change.

Run `npm run build` then `npm run preview` in this package to write a static
visual preview of V1 and every V2 view and palette to `preview/index.html`.

## 9. String API

```ts
renderBlobbiSvg({ stage, visualGeneration, adultType, baseColor, secondaryColor, eyeColor, facing, eyesClosed, instanceId, gaze });
// -> { svg, artwork: { generation, view, mirrored, gazeable, ... } }

loadBlobbiSvg(stage, adultType, baseColor, secondaryColor, eyeColor, isSleeping, instanceId, view); // V1 only
```

The same synchronous pipeline the component uses, as a string: for canvas
compositing, server thumbnails or a non-React card. `renderBlobbiSvg` is the
generation-aware API; `loadBlobbiSvg` is the historical V1 positional API and
its output is byte-identical to what it always was. `applyGazeMarkup`,
`applyRearView` and `uniquifySvgIds` are exported as **provisional**
string-to-string transforms over the artwork's comment-block convention.

## 10. Accessibility

The root is `role="img"`. `label` sets its accessible name; `title` sets the
tooltip and is used as the name when `label` is absent. A Blobbi with neither,
that is not clickable, is treated as decoration and marked `aria-hidden`. A
clickable Blobbi is never hidden. Accessory images carry their code as `alt`;
effect pieces carry no text.

## 11. Styling boundary

Geometry is inline. The only class names the renderer emits are
`blobbi-renderer`, the optional modifiers `blobbi-renderer--interactive`
(when `interactive`) and `blobbi-renderer--framed` (when
`transparent={false}`), and whatever the host passes in `className`.

The modifiers do nothing unless a host mounts `BLOBBI_RENDERER_STYLESHEET`
(hover lift, circular frame) or styles them itself. `interactive` also sets
`cursor: pointer` inline. The frame's gradient fill has always been
host-defined and still is.

## 12. Sanitization boundary

The body artwork is package data compiled into the bundle. Every external
input that reaches it is a validated color, a clamped number or a sanitized id
(`normalizeInstanceId`), so the renderer ships no sanitizer and takes no
dependency on one.

Hosts that want defense in depth, or that post-process the markup, pass a pure
`sanitize?: (svg: string) => string`. It runs once per structural change on
the finished body SVG (after gaze markup) and its output is what reaches the
DOM; pass a stable function reference, since its identity is a memo
dependency. A host that renders SVG it did **not** get from this package
(user-supplied artwork, remote files) must sanitize that content itself before
it reaches any `dangerouslySetInnerHTML`, this renderer included. The renderer
never fetches or accepts remote SVG.

## 13. Instance ids

Several Blobbis routinely share a page, and SVG ids are global to the
document. `instanceId` is required: every `id`, `url(#…)` and `href="#…"` is
prefixed `b_<instanceId>_`. Sanitization (`[^a-zA-Z0-9_-]` → `_`) is part of
the contract via `normalizeInstanceId`. Two renderers given the same id share a
namespace, which is the caller getting what they asked for. With no meaningful
id, React's `useId()` is the right fallback.

## 14. Public API

Everything is exported from the package root; there are no deep imports and no
`export *`. The exact surface is asserted by `package-api.test.ts`.

| Group | Exports |
| --- | --- |
| Component | `BlobbiRenderer`, `AccessoryLayerView` (provisional), `BlobbiRendererProps`, `BlobbiSvgSanitizer`; deprecated aliases `BlobbiRendererView`, `BlobbiRendererViewProps` |
| Visual model | `BlobbiVisual`, `normalizeBlobbiRenderModel`, `normalizeInstanceId`, `DEFAULT_STAGE`, `DEFAULT_ADULT_TYPE`, `FALLBACK_INSTANCE_ID`, `BlobbiRenderModel`, `BlobbiRenderModelInput`, `BlobbiRenderView` |
| Box | `BLOBBI_RENDER_SIZE_PX`, `resolveBlobbiRenderSize`, `blobbiRenderSizePx`, `accessoryBasePx`, `ACCESSORY_BASE_RATIO`, `ACCESSORY_BASE_PERCENT`, `BlobbiRenderSize`, `BlobbiRendererSize` |
| Accessories | `normalizeAccessoryPlacements`, `ACCESSORY_SLOT_RANK`, `REAR_VIEW_HIDDEN_SLOTS`, `DEFAULT_ACCESSORY_SOURCES`, and their types |
| Effects | `BLOBBI_VISUAL_EFFECT_IDS`, `EFFECT_SLOTS`, `EFFECT_SLOT_ORDER`, `normalizeBlobbiVisualEffects`, `isBlobbiVisualEffectId`, `getBlobbiVisualEffectInfo`, intensity and piece-cap constants, and their types |
| Stylesheets | `BLOBBI_RENDERER_STYLESHEET`, `BLOBBI_EFFECT_STYLESHEET` |
| String API | `loadBlobbiSvg`, `applyGazeMarkup`, `applyRearView`, `uniquifySvgIds`, `BlobbiView` |

Deliberately **not** exported: the artwork modules and customizers, the color
helpers, the SVG id internals, the effect presets, and any Tailwind class map.

## 15. Build and compatibility

- ESM only, one file per source module, explicit `.js` specifiers, `.d.ts`
  and source maps, built with tsup. `sideEffects: false`.
- React 18 and 19 are both declared. The package uses `useMemo` and plain
  JSX only: no `use`, no ref-as-prop, no React 19-only API. The repository
  typechecks and tests against React 19; React 18 is validated by the
  consuming hosts (Blobbi Island) until a CI matrix exists.
- Bundle: all 16 adult forms and their sleeping variants are inlined
  (`artwork/adult-blobbi/lib/adult-svg-data.ts`, ~138 kB of source) behind
  one lookup table, so a subset of forms is not currently tree-shakeable.

## 16. Lineage

- The SVG engine (inlined artwork, per-form color customizers, id
  uniquification) was written in **Ditto** (`src/blobbi/adult-blobbi`,
  `src/blobbi/baby-blobbi`, March–April 2026).
- **Blobbi Island** adopted it in May 2026 (`7e6ccaf`), added the render
  model, accessory normalization, rear view, gaze markup and the effect
  system, and extracted the host-independent package `@blobbi/react` in July
  2026 (`b12b2e5`).
- This package imports that extraction with its history (`git subtree` of
  Island `packages/blobbi-react` at production `b3f9940`) and becomes the
  canonical shared implementation. The boundary changes made here: no
  `@blobbi-kit/core` dependency (the two color conversions are local), inline
  geometry instead of Tailwind utilities, numeric and CSS-length sizes, image
  semantics, and the optional sanitizer hook.

Adult V2 artwork (front and side) was authored for this package in September
2026 and the back view derived from the front; see "Artwork generations".

One behavioral note for hosts coming from `@blobbi/react`: the box is no
longer overridable through Tailwind class merging; pass `size` (a token,
number or CSS length) or `style` instead. `BLOBBI_RENDER_SIZE_CLASSES` is not
exported.
