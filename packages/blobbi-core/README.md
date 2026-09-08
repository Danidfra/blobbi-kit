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
  under the `BlobbiTypes`, `AdultTypes` and `ShopTypes` namespaces.
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
- The seed is authoritative for visual traits. `base_color`,
  `secondary_color`, `eye_color`, `pattern`, `special_mark`, `size` and the
  adult form are rewritten from the seed on every republish; edits to those
  tags do not survive.
- `validateAndRepairBlobbiTags` (tag schema module) drops deprecated tags,
  filters tags by stage, and can restore required or persistent tags from the
  previous event. It will not invent a `name`, `seed`, `d` or personality tag
  that was not there before. It returns errors instead of throwing.

An event without `visual_generation` is V1; an unknown value is also V1. An
unknown `progression_state` becomes `none`.

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
