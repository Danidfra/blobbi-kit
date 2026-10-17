# Release readiness: `@blobbi-kit/core` and `@blobbi-kit/react` 0.11.0

**Status: prepared locally, NOT released.** Nothing has been published to npm.
No tag was created, and the 0.10.0 tags (`core-v0.10.0`, `react-v0.10.0`) are
untouched. The kinds 31126 and 21124 are still **provisional**
(`WORLD_TRAVEL_KINDS_STATUS = 'provisional'`). This document is the checklist
for the owner's decision.

## 1. What 0.11.0 contains

**World travel**, the only change since 0.10.0. It lives in these files:

- **core:**
  - `world-travel.ts`
  - `world-travel-session.ts`
  - `world-travel-sync.ts`
  - `world-travel-follow.ts`
  - `WORLD-TRAVEL.md`
- **react:**
  - `useWorldTravel`
  - `useWorldTravelSync`
  - `poolWorldTravelRelays`

Since `core-v0.10.0` (7220ca6), the only other changes in `packages/` are:
- the version numbers;
- index re-exports;
- the manifest tests;
- the tsup filter that keeps `*.test-helpers.ts` out of `dist`;
- the README sections;
- `WORLD-TRAVEL.md` in core's `files`.

## 2. Semver

- **Additive only.** No 0.10.0 export was removed, renamed or changed in
  behaviour. No existing kind or tag changed meaning, and nothing reuses 31634
  or Island's kinds. Under the `0.x` convention a minor bump is right: it
  marks a new feature surface whose two kinds are still provisional.
- **Between the m16 prereleases**, some defaults changed. They are listed in
  `CHANGELOG.md` (m16.2 marks them *behaviour*). Only the two local apps
  consumed those prereleases, and both are updated.

## 3. API surface (to freeze at 0.11.0)

**core: protocol.**
- Kinds and status: `KIND_WORLD_LOCATION`, `KIND_ACTIVE_PRESENCE`,
  `WORLD_TRAVEL_KINDS_STATUS`.
- Worlds: `WORLD_*`, `DEFAULT_WORLD`, `BLOBBI_WORLD_TRAVEL_RELAYS`,
  `isWorldId`, `registerWorld`, `knownWorld`.
- World Location: `isTravelBlobbiD`, `parseWorldLocation`, `replacesLocation`,
  `compareLocations`, `resolveWorldLocation`, `isFutureLocation`,
  `currentWorld`, `worldLocationFilter`, `worldLocationAddress`,
  `buildWorldLocationTemplate`, `planTransfer`.
- Timing: `transitionKind`, `arrivalDelayMs`.
- Active Presence: `parseActivePresence`, `isPresenceFresh`, `freshPresence`,
  `presenceSupports`, `buildPresenceTemplate`, `activePresenceFilter`.
- Constants: `MAX_TRANSITION_S`, `DEPARTURE_WINDOW_S`, `PRESENCE_TTL_S`,
  `MAX_PRESENCE_TTL_S`, `PRESENCE_RENEW_S`, `MAX_CLOCK_SKEW_S`,
  `MAX_LOCATION_SKEW_S`, `MIN_STAY_MS`, `LIVE_TRANSITION_MAX_AGE_S`.

**core: session.**
- `createWorldTravel` (`travel`, `retry`, `refresh`, `setVisible`,
  `noteActivity`, `interact`, `setPresenceEnabled`, `dispose`).
- Store helpers: `storedWorldLocation`, `worldLocationStoreKey`,
  `pendingMoveStoreKey`.
- Constants: `PENDING_TTL_MS`, `TRAVEL_COOLDOWN_MS`, `SLOW_SIGN_MS`,
  `PRESENCE_SIGN_BUDGET_MS`, `AUTO_RESEND_MS`, `PRESENCE_TICK_MS`,
  `RECONCILE_AFTER_MS`, `MIN_TRAVEL_MS`.
- Types: `WorldTravelSnapshot` (`resolution`, `follow`, `travel` with
  `arriving.formAt`), `TravelOutcome`, `InteractOutcome`,
  `TravelResolution`.

**core: sync and follow.**
- Sync: `syncTravel`, `reconcileTravel` (`TravelView.coming`), `travelView`,
  `isMeaningfulInput`, `isPlayedNow`, `VISIBLE_GRACE_MS`, `ACTIVE_MS`.
- Follow: `createFollowCounter`, `FOLLOW_INTERACTIONS`, `FOLLOW_WINDOW_MS`,
  `FOLLOW_GAP_MS`.

**react:** `useWorldTravel`, `useWorldTravelSync`, `poolWorldTravelRelays`
(`TravelPoolLike`).

**Worth deciding before freezing** (none is a blocker):
- **Timing constants as exports.** Exporting every constant makes changing a
  default a semver question later. They could move behind a single
  `WORLD_TRAVEL_DEFAULTS` object. They are left as they are.
- **`useWorldTravel`'s first render.** It returns `snapshot: null` on the
  first render, because the session is created in an effect. The Standalone
  fills that render itself (`useTravelStartsUnknown`). A future version could
  return an initial `pending` / `cached` snapshot synchronously.
- **`interact()` while `pending`.** It returns `'ignored'`. Pixel queues the
  press that starts play itself. A `defer` option would save each host that
  code.

## 4. Dependency boundaries (checked)

- **core:**
  - runtime dependency: `@noble/hashes` only;
  - no DOM, Canvas, WebGL or three.js. World travel imports nothing but core's
    own modules;
  - `sideEffects: false`. The only module-level state is `registerWorld`'s
    display-name map, which rules never read.
- **react:** peers only (`@blobbi-kit/core`, `@nostrify/react`,
  `@tanstack/react-query`, `react`). `poolWorldTravelRelays` takes any
  Nostrify-style pool by structure and imports no Nostrify.
- `npm run smoke` passes: every entry resolves under raw Node ESM.

## 5. Tarball contents (checked on 0.11.0-m16.4)

- **core:** 82 files.
  - It contains `dist/` (`.js`, `.js.map`, `.d.ts` for every module,
    including `world-travel-follow`), `LICENSE`, `README.md` and
    `WORLD-TRAVEL.md`.
  - It contains no tests and no `*.test-helpers.*`.
- **react:** 102 files. It contains `dist/`, `LICENSE` and `README.md`.
- **Exports:** `"."` and `"./*"`. Types resolve for every subpath.

## 6. Exact changes to make at release time (not done)

1. Versions:
   - `packages/blobbi-core/package.json`: `0.11.0-m16.4` → `0.11.0`;
   - `packages/blobbi-react/package.json`: `0.11.0-m16.4` → `0.11.0`, and the
     peer `@blobbi-kit/core` `^0.11.0-m16.4` → `^0.11.0`;
   - the two `package-manifest.test.ts` files, and `package-lock.json`.
2. `CHANGELOG.md`: merge the m16.0–m16.3 notes into one 0.11.0 entry, and
   drop "LOCAL PRERELEASE".
3. If the owner approves the kinds: set `WORLD_TRAVEL_KINDS_STATUS` to
   `'approved'`, and remove "provisional" from `WORLD-TRAVEL.md`, the READMEs
   and the kind comments.
4. Build, test, smoke, `npm pack --dry-run`, then publish, tag
   `core-v0.11.0` / `react-v0.11.0`, and push. Only the owner does this.
5. In the apps: replace `file:../blobbi-kit-m16-packs/…` with
   `"@blobbi-kit/core": "^0.11.0"` (and react for the Standalone), then run
   `npm install`.

## 7. Integration status (local)

| App | Branch | Kit | Gates |
|---|---|---|---|
| Blobbi Standalone | `feat/m16-world-travel` | `file:` m16.3 tarballs | 1803 tests, typecheck, lint, build |
| Blobbi Pixel | `feat/m16-world-travel` | `file:` m16.3 tarball | 1417 tests, typecheck, build |

- Cross-device browser checks (`e2e/world-travel`): 63/63, against a local
  relay only.
- The integration is reproducible. The tarballs in `~/Developer/blobbi-kit-m16-packs/`
  are immutable per version (m16.1, m16.2 and m16.3 are all kept), and the
  apps' lockfiles pin their sha512. A dev server must be restarted with
  `--force` after a tarball change, or the browser runs the previously
  optimised copy.

## 8. Not validated

- No physical device (iPhone, Android) has been tested.
- No real NIP-07 extension or NIP-46 bunker has been tested. The e2e uses a
  NIP-07 shim.
- No public relay has been used for writing. The kinds were researched with
  read-only queries only.
