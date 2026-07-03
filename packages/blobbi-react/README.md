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

Depends only on React, TanStack Query, Nostrify, and `@blobbi-kit/core` — never on any
host-app internals.

## Install

```sh
npm install @blobbi-kit/react @blobbi-kit/core react @tanstack/react-query @nostrify/nostrify @nostrify/react
```

All of the above (plus `@blobbi-kit/core`) are peer dependencies.

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
| `@blobbi-kit/core` | `^0.1.0` |
| `react` | `^18.0.0 \|\| ^19.0.0` |
| `@tanstack/react-query` | `^5.56.2` |
| `@nostrify/nostrify` | `^0.53.0` |
| `@nostrify/react` | `^0.6.3` |

## Build

Built with tsup — ESM only, ships `.d.ts` declarations and source maps. Deep
imports resolve 1:1 against `dist/`. `@blobbi-kit/core` is kept external so consumers
dedupe a single copy.
