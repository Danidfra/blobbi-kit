# @blobbi-kit/core

Portable, framework-agnostic core domain logic for [Blobbi](https://github.com/blobbi).

**DOM-free.** This package makes no browser assumptions and runs in Node, React
Native, or tests without a DOM.

> Status: prepared for public npm publication as `@blobbi-kit/core`. npm is the intended public distribution channel; local `file:` consumption is useful for development.

## What's inside

- Blobbi kinds, addressing, seed/identity derivation, event parsing, and tag merging.
- Behavioral pure-logic modules: decay, segments, social projection, interactions.
- Missions, progression/XP, and color guardrails.
- Async Nostr helpers (`fetchFreshEvent`, `fetchFreshBlobbonautProfile`).
- A parallel type system under `./types/*`, re-exported from the root barrel under
  the `BlobbiTypes`, `AdultTypes`, and `ShopTypes` namespaces.

## Install

```sh
npm install @blobbi-kit/core
```

No peer dependencies. `@noble/hashes` is the package's only runtime dependency
and is installed for you.

## Usage

```ts
import { buildBlobbiAddress, applyBlobbiDecay } from '@blobbi-kit/core';

// Deep imports are also supported:
import { blobbiLogger } from '@blobbi-kit/core/logger';
import type { Blobbi } from '@blobbi-kit/core/types/blobbi';
```

## Nostr integration

This package **does not depend on any Nostr library**, and does not require your
app to install or version-match one.

It declares the protocol-level contracts it needs itself, in
[`nostr-protocol`](./src/nostr-protocol.ts):

| Type | What it is |
| --- | --- |
| `NostrEvent` | The NIP-01 signed event, field-for-field |
| `NostrFilter` | The NIP-01 subscription filter, including `#`-prefixed tag filters |
| `NostrQuerier` | The one method the package needs from a relay pool or store: `query(filters, opts?)` |

All three are plain structural interfaces — no classes, brands, or nominal
markers — so events and filters from any Nostr library flow in and out without
conversion. `NostrQuerier` is satisfied by anything that can answer a filter
query: a Nostrify `NPool` or `NRelay1`, an `NSet`, an IndexedDB-backed store,
your own pool wrapper, or a test double written as `{ query: async () => [] }`.

```ts
import { fetchFreshBlobbonautProfile } from '@blobbi-kit/core';

// Nostrify's NPool satisfies NostrQuerier structurally — pass it straight in.
const profile = await fetchFreshBlobbonautProfile(nostr, pubkey);
```

`packages/blobbi-core/src/nostr-protocol.test.ts` typechecks these declarations
against the real `@nostrify/nostrify` types on every run, so they stay
interchangeable with the ecosystem.

## Peer dependencies

None.

## Build

Built with tsup — ESM only, ships `.d.ts` declarations and source maps. Deep
imports resolve 1:1 against `dist/`.
