# @blobbi-kit/core

Framework-agnostic domain logic for Blobbi, a virtual pet whose state is
stored as Nostr events. This is the package the other `@blobbi-kit` packages
build on; see the [repository README](../../README.md) for the overall map.

**DOM-free.** No browser assumptions. Runs in Node, React Native, or tests
without a DOM.

Published on npm. Pre-1.0; breaking changes and their reasons are recorded in
the [CHANGELOG](../../CHANGELOG.md).

## What's inside

- Event kinds, the `b` namespace tag, canonical `d` tag shapes, and the
  `kind:pubkey:d` address helpers.
- Parsing kind 31124 and 11125 events into typed objects, and classifying a
  31124 event as modern, legacy or invalid.
- Tag merge helpers for republishing an event after a change, and a
  declarative tag schema (`@blobbi-kit/core/blobbi-tag-schema`, deep import
  only).
- Seed identity: deriving colours, pattern, mark, size and adult form from a
  Blobbi's seed, plus colour guardrails.
- Pure behaviour modules: decay, display segments, social projection,
  interaction event building and parsing, missions, progression and XP.
- `fetchFreshEvent` and `fetchFreshBlobbonautProfile`, async helpers that
  query a relay pool or store you pass in.
- A parallel type system under `./types/*`, re-exported from the root barrel
  under the `BlobbiTypes`, `AdultTypes` and `ShopTypes` namespaces. Ditto's
  egg renderer and shop consume it directly (`Blobbi`, `BlobbiStats`,
  `ShopItem`, `ItemEffect`), so it is public API, distinct from the parsed
  `BlobbiCompanion` model.
- A no-op logger you can replace with `setBlobbiLogger`.

## Install

```sh
npm install @blobbi-kit/core
```

No peer dependencies. `@noble/hashes` is the only runtime dependency and is
installed for you.

## Event kinds

These are Blobbi-specific kinds. They are not part of any NIP.

| Constant | Kind | What it is |
| --- | --- | --- |
| `KIND_BLOBBI_STATE` | 31124 | One Blobbi. Addressable; `d` is `blobbi-<12 hex of owner pubkey>-<10 hex pet id>`. |
| `KIND_BLOBBONAUT_PROFILE` | 11125 | The player profile (owned Blobbis, XP, level, onboarding, daily missions). Replaceable; `d` is `blobbonaut-<12 hex of pubkey>`. |
| `KIND_BLOBBI_INTERACTION` | 1124 | One social interaction with a Blobbi: `a` address, `p` owner, `action`, `source`. Regular event. |
| `KIND_BLOBBONAUT_PROFILE_LEGACY` | 31125 | Deprecated profile kind. `fetchFreshBlobbonautProfile` still reads it as a fallback and prefers 11125 when both exist. Nothing here writes it. |

Every event carries `["b", "blobbi:ecosystem:v1"]` (`BLOBBI_ECOSYSTEM_NAMESPACE`).
Addresses are the raw `31124:<pubkey>:<d>` string from `buildBlobbiAddress`;
there is no NIP-19 helper.

## Usage

```ts
import {
  classifyBlobbiEvent,
  parseModernBlobbiEvent,
  applyBlobbiDecay,
  getBlobbiVisualIdentity,
} from '@blobbi-kit/core';

classifyBlobbiEvent(event); // 'modern' | 'legacy' | 'invalid'

const blobbi = parseModernBlobbiEvent(event); // undefined unless modern
if (blobbi) {
  const decayed = applyBlobbiDecay({
    stage: blobbi.stage,
    state: blobbi.state,
    stats: blobbi.stats,
    lastDecayAt: blobbi.lastDecayAt,
  });
  const visual = getBlobbiVisualIdentity(blobbi); // plain data a renderer can draw
}
```

Deep imports work for every module:

```ts
import { blobbiLogger } from '@blobbi-kit/core/logger';
import { validateAndRepairBlobbiTags } from '@blobbi-kit/core/blobbi-tag-schema';
import type { Blobbi } from '@blobbi-kit/core/types/blobbi';
```

## Visual identity

`getBlobbiVisualIdentity(companion)` is the canonical projection of a Blobbi
onto the plain data a renderer draws from. It is the one place hosts should
read a Blobbi's appearance; `@blobbi-kit/renderer`'s `BlobbiVisual` accepts
the result as-is.

```ts
interface BlobbiVisualIdentity {
  stage: 'egg' | 'baby' | 'adult';
  visualGeneration: 'v1' | 'v2' | 'v3';        // absent tag means 'v1'
  v3?: { seed?, algorithm? };                  // 'v3' only: see V3 identity, below
  adultType?: AdultForm;           // one of ADULT_FORMS; seed-derived for adults
  baseColor: string;               // '#RRGGBB'
  secondaryColor: string;
  eyeColor: string;
  pattern: 'solid' | 'spotted' | 'striped' | 'gradient';
  specialMark: 'none' | 'star' | 'heart' | 'sparkle' | 'blush';
  size: 'small' | 'medium' | 'large';
  theme?: string;                  // the `theme` extension tag, opaque
  name?: string;
}
```

- Every seed-derived trait is present: the six values `deriveVisualTraits`
  resolves (three colours, pattern, mark, size) plus the adult form.
- `adultType` is typed over the canonical vocabulary. `ADULT_FORMS`,
  `AdultForm`, `isValidAdultForm` and `deriveAdultFormFromSeed` are exported
  from the root barrel. A value outside the vocabulary (a raw legacy
  `adult_type` tag) is omitted rather than passed through.
- `theme` is a property of the creature, written on its kind 31124 event by
  whichever feature themed it. The protocol defines no vocabulary for it, so
  it is carried as the opaque tag value. It is not an application UI theme,
  and the kit draws nothing from it.
- Not included: render state (facing, sleeping, gaze, box size), host inputs
  (accessories, effects) and transport (the event, `d`, the seed). The one
  exception is `v3.seed`: for a procedural Blobbi the seed is what its
  proportions derive from, so it is visual identity. Core derives it from the
  Blobbi's address (author pubkey, `d`), so a minimal source must carry
  `event: { pubkey }` with its `allTags` to have one.
- For a V3 Blobbi the plain colour, pattern, mark and size fields are its
  seed read in the older generations' mapping, NOT its colours: a V3
  Blobbi's colours and traits are Algorithm 1's, from
  `createBlobbiV3Identity(v3.seed)` in `@blobbi-kit/renderer`.

The projection is pure and deterministic, and the result survives
`JSON.parse(JSON.stringify(...))`.

## V3 identity

A `visual_generation = v3` Blobbi is drawn procedurally, and its event states
almost nothing about who it is:

```
visual_generation = v3            the visual system
visual_algorithm  = 1             the frozen procedural algorithm that turns the seed into the Blobbi
(the address: pubkey, d)          the seed, hashed from it: deriveBlobbiV3Seed(pubkey, d), below
```

Everything a V3 Blobbi is, intrinsically, follows from those:

```
(pubkey, d) ─► seed ─► Algorithm 1 ─► colours, anatomy (antenna, horns, ears, tail),
                                      pattern, special mark, belly, freckles, every proportion
```

Algorithm 1 is the renderer's (core and the renderer never import each
other): core resolves the address to the seed, and
`createBlobbiV3Identity(seed)` in `@blobbi-kit/renderer` gives the colours and
trait kinds, frozen under `visual_algorithm = 1` (the colour generator
included). A V3 event carries no `seed`, no colour, `pattern` or
`special_mark` (the V1/V2 seed mirrors), none of the pre-release V3 trait tags
(`accent_color`, `antenna`, `horns`, `ears`, `tail`, `belly`, `freckles`), and
no `size` or `adult_type`: `BLOBBI_V3_ABSENT_TAG_NAMES`. Creation writes none
of them, parsing ignores any it finds, and every kit write drops them.

### The seed is the address

A kind 31124 event is parameterized replaceable: every event at one address
(author pubkey, `d`) is a version of the same Blobbi. A seed the event stated
could be restated by any replacement, rerolling who the Blobbi is at the same
address. So a V3 seed is never stated; it is derived from the address, and
any client holding only the current event derives the same one:

```
seed = lowercase_hex( SHA-256(
         u8(21) || "blobbi:visual-seed:v1"      the domain, ASCII, length-prefixed
         || PUBKEY                              the author's 32-byte x-only key (NIP-01: 64 lower-case hex digits)
         || u32_be(len(D)) || D ))              D = the `d` value as UTF-8, exactly as on the event
```

- `deriveBlobbiV3Seed(pubkey, d)` is the function; `blobbiV3SeedPreimage`
  returns the exact bytes it hashes; `getBlobbiV3Seed(event)` reads an
  event's address (`undefined` without exactly one non-empty, well-formed
  `d` tag and a NIP-01 pubkey). `blobbi-v3-seed.vectors.json` pins it, made by
  an independent implementation, for other languages to check against.
- The pubkey is taken only as Nostr writes it (64 lower-case hex digits) and
  `d` byte for byte: no trimming, case folding or Unicode normalization (relays
  address by the exact string, so two spellings are two Blobbis). A `d` with a
  lone UTF-16 surrogate has no single UTF-8 encoding and no seed.
- Neither the kind nor `visual_algorithm` is hashed. The domain already
  scopes the hash to a Blobbi's visual seed, and the seed is who the Blobbi
  is while the algorithm is how it is drawn: a future algorithm reads the same
  seed, so editing that tag can never select another seed.
- A `seed` tag on a V3 event is never read, and every kit write drops it
  (`BLOBBI_V3_ABSENT_TAG_NAMES`). V1 and V2 keep theirs exactly as before.
- No birth record or earlier event is needed to draw a V3 Blobbi.

```ts
const tags = buildEggTags(pubkey, petId, createdAt, name, { visualGeneration: 'v3' });  // needs nothing else
parseBlobbiEvent(event).v3Identity;          // { seed, algorithm, missing }
getBlobbiVisualIdentity(companion).v3;       // { seed, algorithm }: what a renderer takes

import { createBlobbiV3Identity } from '@blobbi-kit/renderer';
createBlobbiV3Identity(seed);                // its colours and trait kinds, for any host that needs them
```

- **Intrinsic means unchangeable at the address.** No tag holds a colour or
  a trait, so no replacement event can repaint or reshape the Blobbi. A
  forged `seed`, colour or trait tag is ignored and dropped
  (`blobbi-v3-identity.test.ts` tries every one).
- **Not mirrors, deliberately.** A mirror is a second source that can
  disagree with the first; relays do not index multi-letter tags, so it would
  buy no query; and any client that draws a Blobbi already runs Algorithm 1.
  A client that wants to know "does it have horns" calls
  `createBlobbiV3Identity(seed)`.
- **Customization is not genetics.** Clothing, accessories or dyes belong
  to a separate, deliberately mutable layer when one exists; they never
  rewrite intrinsic tags, because there are none.
- **Breeding** can read parents' genetics from their addresses
  (address → seed → genome), never from a tag a parent's owner could edit.
- **The V3 seed has one spelling.** A procedural algorithm hashes the
  seed's characters, so two spellings of the same bytes would be two
  Blobbis. `canonicalBlobbiV3Seed(value)` is the rule for a seed handed over
  as a value: 64 hexadecimal digits read as their lower-case form, which is
  what `deriveBlobbiV3Seed` produces; anything else is not a V3 seed.
- **V1 and V2 are untouched.** Their `base_color`, `secondary_color`,
  `eye_color`, `pattern`, `special_mark` and `size` stay mirrors of their
  `seed` tag, rewritten on every republish exactly as before.
- **A client on an older kit** finds no `seed` tag on a V3 event, so its kit
  classifies the event as legacy and neither shows nor republishes it: clients
  must be updated before V3 Blobbis are created for real.
- **Opt-in.** `NEW_BLOBBI_VISUAL_GENERATION` is still `'v2'`.
- **The algorithm version is the one stated input.** It is reported as
  stated (a missing or malformed one is in `missing`); whether a renderer
  can draw it is the renderer's to say. Editing it cannot select a different
  individual while version 1 is the only one: an unknown version is drawn as a
  stand-in.

## Tags and compatibility

`classifyBlobbiEvent` sorts a kind 31124 event into one of three classes:

- **modern**: has `d`, `b`, `stage`, `state` and `last_interaction`, and none
  of the old markers. Everything else is optional and defaulted on parse.
- **legacy**: an event from the old Blobbi app, detected by structure only:
  old schema tag names, a non-canonical `d`, a missing or malformed `seed`, a
  missing `name`, or `incubating` / `evolving` stored in `state`. Client
  branding tags such as `["client", "blobbi"]` are not evidence either way.
- **invalid**: wrong kind or missing required tags.

Legacy events are identified so callers can skip them. This package does not
migrate, rewrite or republish them. `parseBlobbiEvent` still parses one and
sets `isLegacy`; `parseModernBlobbiEvent` returns `undefined` instead.

When you republish through `updateBlobbiTags`, `updateBlobbonautTags` or the
`merge*TagsForRepublish` helpers:

- Managed tags are replaced from your updates.
- Tags the package does not manage are passed through in order with their
  original shape. This is tested for host extension tags (`equip`, `inv`) and
  for the removed `storage` and `coins` tags, which can be read from
  `allTags` but can no longer be written through these helpers.
- On V1 and V2 the seed is authoritative for visual traits. `base_color`,
  `secondary_color`, `eye_color`, `pattern`, `special_mark`, `size` and the
  adult form are rewritten from the seed on every republish; edits to those
  tags do not survive. On V3 the three colour tags are explicit identity and
  are left alone (see "V3 identity"); the other mirrors behave the same.
- `validateAndRepairBlobbiTags` (tag schema module) drops deprecated tags,
  filters tags by stage, and can restore required or persistent tags from the
  previous event. It will not invent a `name`, `seed`, `d` or personality tag
  that was not there before. It returns errors instead of throwing.

An event without `visual_generation` is V1; an unknown value is also V1
(`v1`, `v2` and `v3` are the known ones). An unknown `progression_state`
becomes `none`.

## What this package does not do

- **Verify signatures or ownership.** It checks event shape, not
  `event.pubkey`. It does not compare the pubkey with the `d` tag, and it
  trusts an existing 64-character `seed` tag without recomputing it. Do those
  checks before events reach this package if you need them.
- **Choose relays or publish.** The fetch helpers only call `query` on the
  object you pass. `emitInteractionEvent` calls a publish function you supply
  and does not await it.
- **Own an economy or inventory.** The earlier profile coin and consumable
  storage models were removed in 0.4.0 and 0.3.0. Their old tags are treated
  as opaque unknown tags.

## Nostr integration

This package does not depend on any Nostr library and does not require your
app to install or version-match one.

It declares the protocol-level contracts it needs itself, in
[`nostr-protocol`](./src/nostr-protocol.ts):

| Type | What it is |
| --- | --- |
| `NostrEvent` | The NIP-01 signed event, field-for-field |
| `NostrFilter` | The NIP-01 subscription filter, including `#`-prefixed tag filters |
| `NostrQuerier` | The one method the package needs from a relay pool or store: `query(filters, opts?)` |

All three are plain structural interfaces with no classes, brands or nominal
markers, so events and filters from any Nostr library pass in and out without
conversion. `NostrQuerier` is satisfied by anything that can answer a filter
query. The repository's test suite checks a Nostrify `NPool`, any `NRelay`,
any `NStore`, and a bare `{ query: async () => [] }` test double.

```ts
import { fetchFreshBlobbonautProfile } from '@blobbi-kit/core';

// Nostrify's NPool satisfies NostrQuerier structurally.
const profile = await fetchFreshBlobbonautProfile(nostr, pubkey);
```

`fetchFreshEvent(querier, filter)` forces `limit: 1`, applies a 10 second
timeout merged with any signal you pass, and returns the newest event by
`created_at`. `fetchFreshBlobbonautProfile(querier, pubkey)` has the same
timeout but takes no signal.

`src/nostr-protocol.test.ts` typechecks these declarations against the real
`@nostrify/nostrify` types when the repository's typecheck and test commands
run, so they stay interchangeable with that library.

## Peer dependencies

None.

## Build

Built with tsup. ESM only, ships `.d.ts` declarations and source maps. Each
source module is emitted as its own file, so deep imports resolve one to one
against `dist/`.
