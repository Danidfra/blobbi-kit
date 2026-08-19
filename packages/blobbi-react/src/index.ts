/**
 * @blobbi-kit/react — portable, app-agnostic React hooks for Blobbi.
 *
 * Built on top of @blobbi-kit/core. Depends only on React, TanStack Query,
 * @nostrify/react, and @blobbi-kit/core — never on any host-app internals.
 *
 * Note what is absent: the core Nostrify library. The Nostr types used
 * throughout this package come from @blobbi-kit/core's `nostr-protocol` module,
 * and relay access goes through @nostrify/react's `useNostr()`.
 *
 * This is the public package barrel. Deep imports (`@blobbi-kit/react/hooks/*`,
 * `@blobbi-kit/react/lib/*`, `@blobbi-kit/react/adapters/types`) remain supported for
 * now, but new consumers should prefer the root barrel.
 *
 * Browser-only note: many hooks and a couple of `lib` helpers rely on a
 * `window`-based `daily-missions-updated` event bus, `localStorage`, and
 * `document.visibilityState`. They run in DOM hosts only.
 */

// Protocol-level Nostr contracts, re-exported from @blobbi-kit/core so hooks
// consumers can name the types this package's options and results use without
// taking a dependency on any Nostr library. Core is the single canonical
// definition; this package never declares its own copy.
export type {
  NostrEvent,
  NostrFilter,
  NostrQuerier,
  NostrQueryOptions,
} from '@blobbi-kit/core/nostr-protocol';

// Dependency-injection adapter contracts (host supplies implementations).
export * from './adapters/types';

// Pure/logic helpers and browser-only stores (canonical source of the mission
// constants, incl. `HATCH_REQUIRED_INTERACTIONS`).
export * from './lib';

// React hooks.
export * from './hooks';
