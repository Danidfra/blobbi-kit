# blobbi-kit

Shared TypeScript layer for Blobbi, a virtual pet whose state is stored as
Nostr events. The kit provides the shared event shapes, the parsing rules,
the domain behaviour such as stat decay, the seed-derived visual identity,
and the rendering. Host applications build their own UI, signing, relay
setup and economy around it.

Repository: <https://github.com/Danidfra/blobbi-kit>. Packages are published on
npm under the `@blobbi-kit` scope.

## Packages

| Package | Version | What it is | Runtime dependencies |
| --- | --- | --- | --- |
| [`@blobbi-kit/core`](./packages/blobbi-core) | 0.5.2 | Event kinds, parsing, domain rules, decay, seed identity. No React, no DOM, no Nostr library. | `@noble/hashes` |
| [`@blobbi-kit/react`](./packages/blobbi-react) | 0.5.2 | React hooks over core: reading a user's Blobbis, projecting state, syncing and publishing through host-supplied functions. Browser only. | peers: core, `react`, `@tanstack/react-query`, `@nostrify/react` |
| [`@blobbi-kit/renderer`](./packages/blobbi-renderer) | 0.1.0 | React component and string API that draws a Blobbi as SVG from plain visual data. Imports neither kit package. | peer: `react` |
| [`renderer-consumer-fixture`](./packages/blobbi-renderer-consumer) | private | Test-only consumer of the renderer. Proves it renders with no provider, no host CSS and no kit package around it. | |

`core` and `react` are versioned and released together. `renderer` is versioned
on its own. Each package has its own README with the details; this file is the
map.

## What each package owns

### `@blobbi-kit/core`

- Kind constants, the `b` namespace tag, canonical `d` tag shapes and the
  `kind:pubkey:d` address form.
- Parsing kind 31124 and 11125 events into typed objects, and classifying a
  31124 event as modern, legacy or invalid (see Compatibility below).
- Tag merge helpers for republishing an event after a change, backed by a
  declarative tag schema (`@blobbi-kit/core/blobbi-tag-schema`, deep import
  only) that knows which tags are required, per stage, persistent, or derived.
- Seed identity: a Blobbi's seed is `sha256("blobbi:v1|pubkey:d:created_at")`,
  derived once and never recomputed. Colours, pattern, mark, size and adult
  form are read from byte ranges of that seed. Stored trait tags are mirrors
  and are rewritten from the seed on republish. Colour guardrails keep the
  generated HSL inside a range the renderer's lighten/darken can handle.
- Decay: pure, per-hour stat decay with stage-specific rates, health penalties
  when other stats are low, reduced decay and energy regen while sleeping, and
  no decay at all for eggs.
- Building and parsing kind 1124 interaction events, and projecting them onto
  stats without writing anything.
- Mission, XP and level tables. Level is always derived from XP.
- `fetchFreshEvent` and `fetchFreshBlobbonautProfile`, which take any object
  with a `query(filters, opts)` method (`NostrQuerier`). Nostrify's pool
  satisfies that structurally, so does a test double.
- A no-op logger you can swap with `setBlobbiLogger`.

### `@blobbi-kit/react`

- `useBlobbisCollection`: reads one owner's kind 31124 events, keeps the newest
  per `d`, drops legacy events, and exposes a `status` of
  `idle | loading | empty | ready | error`.
- `useProjectedBlobbiState`: applies decay and pending social interactions on
  the client every 60 seconds for display. Publishes nothing.
- `useCanonicalSync`: once per selected Blobbi, re-reads it from relays,
  persists accrued decay and consumed interactions in a single publish, and
  advances the social checkpoint.
- Hooks for the care streak, incubation and evolution processes, hatch and
  evolve task progress, daily missions, rerolls and daily XP.
- Reads go through `useNostr()` from `@nostrify/react`, so the host's
  `NostrProvider` must be mounted. Results are cached with TanStack Query.
- Every hook that writes takes a `publish` function from the host. The package
  never signs and never talks to a relay to publish.
- Mission progress lives in in-memory session stores and a `window` event bus.
  The package does not use `localStorage`.

### `@blobbi-kit/renderer`

- `BlobbiRenderer` (React) and `renderBlobbiSvg` / `loadBlobbiSvg` (strings).
- Input is plain, JSON-serializable visual data: stage, artwork generation,
  adult form, three colours, plus facing, sleeping, gaze, accessory placements
  and named effects. Incomplete or invalid input falls back to defaults rather
  than throwing. Colours must be `#rgb` or `#rrggbb`; anything else is treated
  as absent.
- Output is one `role="img"` element containing inline SVG. Same props give
  byte-identical markup, effects included. Particle placement is seeded from
  `instanceId` and the effect id, not `Math.random`.
- Two artwork generations: V1 (sixteen adult forms plus a baby, with a derived
  rear view) and V2 (one adult anatomy with `data-part` selectors, authored
  front and side views, derived back and closed eyes). Which generation a
  Blobbi uses is carried on its event as `visual_generation`; absent means V1.
- Every SVG id is prefixed with the `instanceId` you pass, so several Blobbis
  can share a page.
- It draws one Blobbi in one box. World position, shadows, z-order, inventory
  lookup and page layout are the host's.
- It does not import core. Core's `getBlobbiVisualIdentity(companion)` returns
  an object shaped to fit the renderer's `BlobbiVisual`, so a host can pass it
  through.

## What the host application owns

The kit does not do any of the following:

- Key management and signing.
- Publishing. Hooks receive a `publish(template)` function and call it.
- Relay selection and the relay pool. Core takes a `NostrQuerier`; react takes
  whatever `useNostr()` returns.
- Choosing which pubkey to read. The collection hook queries
  `authors: [pubkey]` with the pubkey you give it.
- Verifying signatures or ownership. Core checks event shape only. It does not
  compare `event.pubkey` with the `d` tag, and it trusts an existing `seed`
  tag without recomputing it. If you need those checks, do them before events
  reach the kit.
- Economy, coins, consumable inventory and equipment. Earlier versions had a
  profile coin and storage model; both were removed (see the
  [CHANGELOG](./CHANGELOG.md)). Their old tags are preserved as opaque data.
- Routing, layout, toasts, and all UI outside the renderer's box.

## Blobbi state on Nostr

These are Blobbi-specific event kinds and are not part of any NIP. All of
them carry `["b", "blobbi:ecosystem:v1"]`.

| Kind | Type | Meaning |
| --- | --- | --- |
| 31124 | addressable | One Blobbi. `d` is `blobbi-<12 hex of owner pubkey>-<10 hex pet id>`. |
| 11125 | replaceable | The Blobbonaut, meaning the player profile. `d` is `blobbonaut-<12 hex of pubkey>`. |
| 1124 | regular | One social interaction with someone's Blobbi. |
| 31125 | addressable, deprecated | The old profile kind. Still read as a fallback, never written. |

**Kind 31124.** Required tags are `d`, `b`, `stage` (`egg`, `baby`, `adult`),
`state` (`active`, `sleeping`, `hibernating`) and `last_interaction`.
Everything else is optional with defaults: the five stats, `seed`, `name`,
`experience`, care streak, `progression_state` (`incubating` or `evolving`),
`last_decay_at`, `visual_generation`, the mirrored trait tags, and `task`
progress. Content is JSON and may carry `evolution` missions and a
`social_checkpoint`. Unknown content keys survive rewrites.

**Kind 11125.** Requires only `d` and `b`. Carries `current_companion`,
`has` (owned Blobbi `d` tags), `xp`, `level`, onboarding flags and a name.
Content holds daily mission progress. A pubkey is queried for both 11125 and
31125; when both exist, 11125 wins even if the 31125 event is newer.

**Kind 1124.** Tags: `a` (the Blobbi's `31124:pubkey:d` address), `p` (the
owner), `action` (`feed`, `play`, `clean`, `medicate`, `boost`), `source`,
and an `alt`. Core builds these and parses them. The react hooks only read
them: they fold interactions from the last six hours (bounded to 30 events)
into displayed stats, and `useCanonicalSync` consumes them into the owner's
31124 event. Owner-authored interactions are ignored on read, because the
owner's own action already changed the 31124 event directly.

Addresses are the raw `31124:<pubkey>:<d>` string. There is no NIP-19 helper.

## Compatibility behaviour

`classifyBlobbiEvent(event)` returns one of three values, and
`parseModernBlobbiEvent(event)` returns `undefined` for anything but the first:

- **modern**: kind 31124 with the required tags above and none of the old
  markers.
- **legacy**: an event from the old Blobbi app. Detected by structure only: old
  schema tag names (`incubation_time`, `egg_temperature`, `fees`, and so on),
  a non-canonical `d`, a missing or malformed `seed`, a missing `name`, or
  `incubating` / `evolving` stored in `state` instead of `progression_state`.
  Client branding tags like `["client", "blobbi"]` are not evidence either
  way.
- **invalid**: wrong kind or missing required tags.

Legacy events are identified and skipped. Nothing in the kit migrates,
rewrites or republishes them. The collection hook, the fresh-fetch step before
every mutation and the canonical sync all use the same predicate.

On republish, tags the kit does not manage are passed through in order and
with their original arity. Tests cover host extension tags such as `equip`
and `inv`, and the removed `storage` and `coins` tags. A repair pass can
restore required system tags from the previous event, but it will never
invent a `name`, `seed`, `d` or personality tag that was not there before.

An event without `visual_generation` is V1. An unknown value is also V1, so
the Blobbi is still drawn. An unknown
`progression_state` becomes `none` rather than hiding the Blobbi.

## Install and use

```sh
npm install @blobbi-kit/core
npm install @blobbi-kit/react @blobbi-kit/core react @tanstack/react-query @nostrify/react
npm install @blobbi-kit/renderer react
```

Node 22 or newer. All packages are ESM only and ship `.d.ts` files. Deep
imports such as `@blobbi-kit/core/blobbi-decay` resolve one to one against
`dist/`.

Classify an event and project its stats forward, with no React and no relay:

```ts
import { classifyBlobbiEvent, parseModernBlobbiEvent, applyBlobbiDecay } from '@blobbi-kit/core';

classifyBlobbiEvent(event); // 'modern' | 'legacy' | 'invalid'

const blobbi = parseModernBlobbiEvent(event);
if (blobbi) {
  const { stats } = applyBlobbiDecay({
    stage: blobbi.stage,
    state: blobbi.state,
    stats: blobbi.stats,
    lastDecayAt: blobbi.lastDecayAt,
  });
}
```

Read a user's Blobbis and show live stats inside a host that already mounts
`NostrProvider` and `QueryClientProvider`:

```tsx
import { useBlobbisCollection, useProjectedBlobbiState } from '@blobbi-kit/react';

function Pet({ pubkey }: { pubkey: string }) {
  const { companions, status } = useBlobbisCollection(undefined, pubkey);
  const projected = useProjectedBlobbiState(companions[0] ?? null);

  if (status !== 'ready' || !projected) return null;
  return <pre>{JSON.stringify(projected.stats)}</pre>;
}
```

Draw one, either from a parsed companion or from hand-written data:

```tsx
import { getBlobbiVisualIdentity } from '@blobbi-kit/core';
import { BlobbiRenderer, renderBlobbiSvg } from '@blobbi-kit/renderer';

<BlobbiRenderer visual={getBlobbiVisualIdentity(blobbi)} instanceId={blobbi.d} size="lg" />;

const { svg } = renderBlobbiSvg({
  stage: 'adult',
  adultType: 'catti',
  baseColor: '#f2a0c0',
  facing: 'left',
  instanceId: 'card-1',
});
```

## Development

```sh
npm install        # workspaces link core into react
npm run build      # tsup, in dependency order: core, react, renderer
npm run typecheck  # tsc --noEmit for all four workspaces
npm run test       # vitest, all packages, jsdom environment
npm run smoke      # imports every dist entry under raw Node ESM; run after build
npm run clean
```

`npm run preview --workspace @blobbi-kit/renderer` (after a build) writes a
static page to `packages/blobbi-renderer/preview/index.html` showing every
artwork generation, facing and palette.

The renderer's V1 output is pinned by SHA-256 fingerprints. If you change V1
artwork on purpose, regenerate them with
`BLOBBI_UPDATE_FINGERPRINTS=1 npx vitest run v1-fingerprints`.

The build emits one file per source module with explicit `.js` specifiers
rather than a bundle. That keeps module-level singletons (the logger, the
mission stores) shared across deep imports, and it is what the smoke test
checks.

## Status

The packages are pre-1.0. Breaking changes and their rationale are recorded
in the [CHANGELOG](./CHANGELOG.md).

What is verified in this repository:

- `npm run typecheck`, `npm run test` (46 files, 1400 tests), `npm run build`
  and `npm run smoke` all pass.
- Manifest tests assert the exact peer sets, the core/react version lockstep,
  and that no `@nostrify/nostrify` dependency exists. The smoke script scans
  the emitted JavaScript for undeclared imports and the emitted `.d.ts` for
  removed APIs.
- The renderer has an import-graph purity test (no DOM globals, timers,
  network, randomness, or kit packages), a determinism test, and the
  fingerprint suite.

Limitations worth knowing:

- There is no CI configuration in the repository. The checks above run
  locally.
- Core validates event shape, not authorship. Author scoping is a relay filter
  in the react package, and signature verification is the host's job.
- Streak days and daily missions use the device's local date.
- The react package's mission stores are per browser tab and reset on reload.
- Egg to baby hatching is not in the kit; only the baby to adult transition
  hook exists.
- V2 artwork does not yet draw `pattern`, `specialMark` or `theme`, and there
  is no V2 baby. Those fall back to V1 behaviour.
- The evolution task definitions in `@blobbi-kit/react` reference a few
  host-ecosystem event kinds and URLs, so that package is less host-neutral
  than core.

## Layout

```
blobbi-kit/
├── package.json                      npm workspaces root, private
├── tsconfig.base.json                shared strict compiler options
├── vitest.config.ts                  aliases @blobbi-kit/* to package sources
├── scripts/smoke.mjs                 built-output checks
├── CHANGELOG.md
└── packages/
    ├── blobbi-core/
    ├── blobbi-react/
    ├── blobbi-renderer/
    └── blobbi-renderer-consumer/     private test fixture
```

## License

MIT. Each published package ships its own `LICENSE` file.
