# @blobbi-kit/core

Portable, framework-agnostic core domain logic for [Blobbi](https://github.com/blobbi).

**DOM-free.** This package makes no browser assumptions and runs in Node, React
Native, or tests without a DOM.

> Status: currently private / not published. Target registry is npm public.

## What's inside

- Blobbi kinds, addressing, seed/identity derivation, event parsing, and tag merging.
- Behavioral pure-logic modules: decay, segments, social projection, interactions.
- Missions, progression/XP, and color guardrails.
- Async Nostr helpers (`fetchFreshEvent`, `fetchFreshBlobbonautProfile`).
- A parallel type system under `./types/*`, re-exported from the root barrel under
  the `BlobbiTypes`, `AdultTypes`, and `ShopTypes` namespaces.

## Install

```sh
npm install @blobbi-kit/core @nostrify/nostrify
```

`@nostrify/nostrify` is a peer dependency.

## Usage

```ts
import { buildBlobbiAddress, applyBlobbiDecay } from '@blobbi-kit/core';

// Deep imports are also supported:
import { blobbiLogger } from '@blobbi-kit/core/logger';
import type { Blobbi } from '@blobbi-kit/core/types/blobbi';
```

## Peer dependencies

| Package | Range |
| --- | --- |
| `@nostrify/nostrify` | `^0.53.0` |

## Build

Built with tsup — ESM only, ships `.d.ts` declarations and source maps. Deep
imports resolve 1:1 against `dist/`.
