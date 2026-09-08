# @blobbi-kit/react

React hooks for Blobbi, built on [`@blobbi-kit/core`](../blobbi-core). See the
[repository README](../../README.md) for how the packages fit together.

**Browser-only.** Several hooks and `lib` helpers use a `window`-based
`daily-missions-updated` event bus and `document.visibilityState`. They run in
DOM hosts only, not in SSR or Node. The package does not use `localStorage`.

Published on npm. Pre-1.0; breaking changes and their reasons are recorded in
the [CHANGELOG](../../CHANGELOG.md).

## What's inside

- Hooks for reading a user's Blobbis, projecting decayed stats for display,
  syncing accrued decay and social interactions back to the canonical event,
  and running the care streak, incubation, evolution, hatch and evolve tasks,
  daily missions and daily XP flows.
- `adapters/types`, which declares `PublishAdapter` and
  `PublishEventTemplate`: the shape of the publish function every writing hook
  takes from the host.
- Pure helpers under `lib/*` (XP tables, streak arithmetic, mission
  definitions) plus in-memory session stores for mission progress.

Runtime dependencies are React, TanStack Query, `@nostrify/react` and
`@blobbi-kit/core`, all peers. Nothing here imports a host application.

## Install

```sh
npm install @blobbi-kit/react @blobbi-kit/core react @tanstack/react-query @nostrify/react
```

All of the above are peer dependencies. Their ranges live in this package's
`package.json` and are asserted by `src/package-manifest.test.ts`; the
`@blobbi-kit/core` range is pinned to the core version released alongside.

There is no `@nostrify/nostrify` entry: this package does not import it, and
`@nostrify/react` already brings the copy it needs. See
[Nostr integration](#nostr-integration) below.

## Host boundary

- **Reads** go through `useNostr()` from `@nostrify/react`. Your app must
  mount `NostrProvider` (and TanStack's `QueryClientProvider`) above these
  hooks. Relay selection is whatever your provider does.
- **Writes** never touch a relay from this package. Each writing hook takes a
  `publish(template)` function and calls it with a kind 31124 or 11125
  template. Signing happens inside that function, in your app.
- **Author scoping** is your choice: `useBlobbisCollection` queries
  `authors: [pubkey]` with the pubkey you pass. Nothing here verifies
  signatures or ownership.
- **Mission progress** is held in in-memory stores keyed by pubkey (daily) or
  pubkey and `d` (evolution). They are cleared on page reload; the persisted
  copy lives in the 11125 and 31124 event content, and the persist hooks
  write it back on a debounce.

## Usage

```tsx
import { useBlobbisCollection, useProjectedBlobbiState, useBlobbiCareActivity } from '@blobbi-kit/react';
import type { PublishAdapter } from '@blobbi-kit/react';

function Pet({ pubkey, publish }: { pubkey: string; publish: PublishAdapter['publish'] }) {
  const { companions, status, updateCompanionEvent } = useBlobbisCollection(undefined, pubkey);
  const companion = companions[0];
  const projected = useProjectedBlobbiState(companion ?? null);
  const { registerCareActivity } = useBlobbiCareActivity({
    companion,
    updateCompanionEvent,
    pubkey,
    publish,
  });

  if (status !== 'ready' || !projected) return null;
  return <button onClick={() => registerCareActivity()}>{JSON.stringify(projected.stats)}</button>;
}
```

`useBlobbisCollection` keeps the newest event per `d`, drops legacy events,
and reports `status` as `idle | loading | empty | ready | error`. A third
`options` argument can restrict `stages` or add a `filter`; options change
what you see, not what is fetched or cached.

Deep imports are also supported:

```ts
import { useBlobbiInteractions } from '@blobbi-kit/react/hooks/useBlobbiInteractions';
import { calculateActionXP } from '@blobbi-kit/react/lib/blobbi-xp';
```

## Nostr integration

Hooks read relays through [`@nostrify/react`](https://github.com/soapbox-pub/nostrify):
they call `useNostr()` and use the `nostr` object from your `NostrProvider`.
That is the only Nostr runtime coupling in the package.

`@nostrify/nostrify` is not a dependency of this package in any form. The
Nostr types in hook options and results (`NostrEvent`, `NostrFilter`) come
from `@blobbi-kit/core`, which declares them itself; they are structurally
identical to the ecosystem's, so values from any Nostr library pass through
unchanged. They are re-exported here for convenience:

```ts
import type { NostrEvent, NostrFilter } from '@blobbi-kit/react';
```

This means your app can run whichever `@nostrify/nostrify` version
`@nostrify/react` pins, with no npm `overrides` entry.

## Build

Built with tsup. ESM only, ships `.d.ts` declarations and source maps. Each
source module is emitted as its own file, so deep imports resolve one to one
against `dist/`. `@blobbi-kit/core` is kept external so consumers dedupe a
single copy.
