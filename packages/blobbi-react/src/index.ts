/**
 * @blobbi-kit/react — portable, app-agnostic React hooks for Blobbi.
 *
 * Built on top of @blobbi-kit/core. Depends only on React, TanStack Query,
 * Nostrify, and @blobbi-kit/core — never on any host-app internals.
 *
 * This is the public package barrel. Deep imports (`@blobbi-kit/react/hooks/*`,
 * `@blobbi-kit/react/lib/*`, `@blobbi-kit/react/adapters/types`) remain supported for
 * now, but new consumers should prefer the root barrel.
 *
 * Browser-only note: many hooks and a couple of `lib` helpers rely on a
 * `window`-based `daily-missions-updated` event bus, `localStorage`, and
 * `document.visibilityState`. They run in DOM hosts only.
 */

// Dependency-injection adapter contracts (host supplies implementations).
export * from './adapters/types';

// Pure/logic helpers and browser-only stores (canonical source of the mission
// constants, incl. `HATCH_REQUIRED_INTERACTIONS`).
export * from './lib';

// React hooks.
export * from './hooks';
