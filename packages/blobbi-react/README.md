# @blobbi-kit/react

Portable, app-agnostic React hooks for [Blobbi](https://github.com/blobbi), built
on top of [`@blobbi-kit/core`](../blobbi-core).

**Browser-only.** Many hooks and a couple of `lib` helpers rely on a
`window`-based `daily-missions-updated` event bus, `localStorage`, and
`document.visibilityState`. They run in DOM hosts only — not in SSR or Node.

> Status: prepared for public npm publication as `@blobbi-kit/react`. npm is the intended public distribution channel; local `file:` consumption is useful for development.

## What's inside

- React hooks for Blobbi care, interactions, incubation, evolution, missions,
  daily XP, and projected state.
- Dependency-injection adapter contracts (`adapters/types`) so host apps supply
  their own service implementations.
- Pure/logic helpers plus browser-only stores under `lib/*`.

Depends only on React, TanStack Query, `@nostrify/react`, and `@blobbi-kit/core`
— never on any host-app internals.

## Install

```sh
npm install @blobbi-kit/react @blobbi-kit/core react @tanstack/react-query @nostrify/react
```

All of the above are peer dependencies.

Note there is no `@nostrify/nostrify` entry: this package does not import it, and
`@nostrify/react` already brings the copy it needs. See
[Nostr integration](#nostr-integration) below.

## Usage

```tsx
import { useProjectedBlobbiState } from '@blobbi-kit/react';

// Deep imports are also supported:
import { useBlobbiInteractions } from '@blobbi-kit/react/hooks/useBlobbiInteractions';
import { computeXp } from '@blobbi-kit/react/lib/blobbi-xp';
```

## Peer dependencies

| Package | Range |
| --- | --- |
| `@blobbi-kit/core` | `^0.5.0` |
| `react` | `^18.0.0 \|\| ^19.0.0` |
| `@tanstack/react-query` | `^5.56.2` |
| `@nostrify/react` | `^0.6.3` |

Each is a genuine host-owned singleton. The hooks call `useNostr()` and TanStack
Query's hooks, so they must resolve *your* provider context and *your* query
cache — a second copy of any of these would silently break both.

## Nostr integration

Hooks read relays through [`@nostrify/react`](https://github.com/soapbox-pub/nostrify):
they call `useNostr()` and use the `nostr` object from your `NostrProvider`. That
is the only Nostr runtime coupling in the package.

`@nostrify/nostrify` is **not** a dependency of this package, in any form. The
Nostr types in hook options and results (`NostrEvent`, `NostrFilter`) come from
`@blobbi-kit/core`, which declares them itself; they are structurally identical
to the ecosystem's, so values from any Nostr library pass through unchanged. They
are re-exported here for convenience:

```ts
import type { NostrEvent, NostrFilter } from '@blobbi-kit/react';
```

This means your app can run any version of `@nostrify/nostrify` — whichever
`@nostrify/react` pins — with no npm `overrides` entry.

## Build

Built with tsup — ESM only, ships `.d.ts` declarations and source maps. Deep
imports resolve 1:1 against `dist/`. `@blobbi-kit/core` is kept external so consumers
dedupe a single copy.
