# Changelog

All notable changes to the `blobbi-kit` packages are recorded here. Both
packages (`@blobbi-kit/core`, `@blobbi-kit/react`) are versioned and released in
lockstep.

The project is pre-1.0, so a **minor** bump is used for breaking changes
(`0.MINOR.PATCH`), per the `0.x` convention.

---

## 0.3.1 — Accept Nostrify 0.54 (packaging fix)

**Packaging only.** No Blobbi runtime, API, type, or protocol behavior change.
Not a single source file under `packages/*/src` differs from 0.3.0, and the
emitted `dist/` output is **byte-identical** to a build of the 0.3.0 tree — the
version is not stamped into the bundle, so only the manifests differ.

### Fixed

Both packages declared `peerDependencies["@nostrify/nostrify"] = "^0.53.0"`.
For a pre-1.0 package the caret pins the **minor**, so that range means
`>=0.53.0 <0.54.0` and excludes `0.54.0`. Host apps on Nostrify 0.54 hit
`ERESOLVE` on `npm install` and had to suppress it with an `overrides` entry.
The range is now widened to accept both lines:

| Package | Peer | 0.3.0 | 0.3.1 |
| --- | --- | --- | --- |
| `@blobbi-kit/core` | `@nostrify/nostrify` | `^0.53.0` | `^0.53.0 \|\| ^0.54.0` |
| `@blobbi-kit/react` | `@nostrify/nostrify` | `^0.53.0` | `^0.53.0 \|\| ^0.54.0` |
| `@blobbi-kit/react` | `@blobbi-kit/core` | `^0.3.0` | `^0.3.1` |

The `@blobbi-kit/core` pin moves in lockstep, as in every prior release. It is
also load-bearing here: the Nostrify fix lives in core, so `react@0.3.1` paired
with `core@0.3.0` would silently reintroduce the narrow peer.

Hosts that added a Nostrify `overrides` entry for either package can remove it
once both are on `0.3.1`.

### Why this is safe

Nostrify 0.54.0's entire delta over 0.53.0 is `BlossomUploader` (Blossom spec
update), `NIP98.verify` (error-message change), and `utils/N64`. The kit
references none of them. The complete Nostrify surface it consumes is
`NPool`, `NostrEvent`, and `NostrFilter`:

- `dist/NPool.d.ts`, `dist/NPool.js`, and the public `dist/mod.d.ts` barrel are
  byte-identical between 0.53.0 and 0.54.0.
- `NostrEvent` / `NostrFilter` come from `@nostrify/types`, which both releases
  pin to the **exact** version `0.37.0`.

### Unchanged

- `@nostrify/nostrify` remains a **peer**, and a *type-only* one: every import
  of it is `import type`, and it has zero runtime imports in the built output.
  Core's only runtime externals are `@noble/hashes/{sha256,utils}`.
- `react`, `@tanstack/react-query`, and `@nostrify/react` remain **peers** of
  `@blobbi-kit/react`, with their ranges untouched (`^18.0.0 || ^19.0.0`,
  `^5.56.2`, `^0.6.3` — all already satisfied by current host versions).
- `@noble/hashes` stays a regular dependency at `^1.3.1`. It is **not** widened:
  v2.x removed the `./sha256` export subpath that core imports.
- Everything in the 0.3.0 entry below still holds, including the legacy
  `storage`-tag preservation guarantee.

### Tests

- `packages/*/src/package-manifest.test.ts` (new) asserts the shipped manifests
  directly: Nostrify and React are peers and not regular dependencies, the new
  range accepts 0.53.x and 0.54.x and rejects 0.55.0, the two packages stay in
  lockstep, and `files`/`exports` stay correct.
- `scripts/smoke.mjs` gained the artifact-side counterpart, scoped to what only
  a built tree can show. It scans the emitted `dist/**/*.js` for bare import
  specifiers and requires each one to be declared in that package's
  `dependencies` or `peerDependencies` — the manifest is its own allowlist, so a
  new runtime dependency cannot be introduced without declaring it. It then
  asserts Nostrify is absent from the emitted JavaScript entirely, which is what
  actually proves the type-only peer is not bundled. Range and version semantics
  are deliberately *not* re-checked here; the unit tests own those.
- `scripts/smoke.mjs` also guards the installed tree against a duplicate Nostrify.
  `@nostrify/react` pins `@nostrify/nostrify` to an **exact** version
  (`0.6.3`→`0.53.0`, `0.6.4`→`0.54.0`), so the two must be upgraded as a pair;
  bumping one alone leaves a second copy nested under `@nostrify/react`, and
  since `NPool` declares `private` members it is nominally typed, so the
  duplicate surfaces as misleading `TS2345 NPool is not assignable to NPool`
  errors that mimic a version incompatibility.

### Development

Root `devDependencies` only. These are **not** published — both packages ship
`files: ["dist", "LICENSE"]`, so no dev dependency and no test file is in either
tarball, and no consumer-visible range is affected.

- Moved to the matched pair the host apps ship,
  `@nostrify/nostrify@^0.54.0` + `@nostrify/react@^0.6.4`, so `typecheck` and
  `test` validate against the Nostrify line this release adds support for. The
  published peer ranges still accept `0.53.x` with `@nostrify/react@^0.6.3`;
  because `@nostrify/react` pins Nostrify exactly, only one pair can be
  exercised at a time, and the newest supported pair is the useful one.
- Added `semver` + `@types/semver`, so the manifest range assertions use npm's
  own resolver rather than a hand-rolled reimplementation of caret semantics.

---

## 0.3.0 — Remove the deprecated kind:11125 consumable-inventory API

**Breaking.** The consumable-inventory model deprecated in 0.2.0 is removed.
Ditto and Blobbi Island have migrated away from it; hosts that need finite
inventory own it themselves (e.g. `@nostr-games/inventory`, kinds 31632/31633).
The kit itself takes no dependency on any inventory library and implements no
migration, backfill, dual-read, or dual-write behavior.

### Removed — `@blobbi-kit/core`

- `StorageItem` (interface)
- `BlobbonautProfile.storage` (field)
- `parseStorageTags(tags)`
- `createStorageTags(storage)`

All four were re-exported from the package barrel (`@blobbi-kit/core`) and from
the deep entry `@blobbi-kit/core/blobbi`; both are now clean.

### Removed — `@blobbi-kit/react`

- `FreshBlobbiResult.profileStorage`
- `CanonicalIncubationResult.profileStorage`
- `CanonicalActionResult.profileStorage`

### Unchanged — legacy `storage` tags are still preserved

This is the compatibility guarantee, and it is unchanged from 0.2.0:

- `storage` is **not** in `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES`, so pre-existing
  `storage` tags are ordinary **unknown host extension tags**.
- They survive `mergeBlobbonautTagsForRepublish` / `updateBlobbonautTags` /
  `buildNormalizedProfileTags` **tag-for-tag**, in order, with their original
  arity — including shapes the old parser would have rejected.
- The kit never parses, exposes, creates, normalizes, or deletes them. A
  `storage` key passed in `updates` is dropped with a dev-time warning, so a
  profile republish can never create or mutate consumable inventory.
- `inv` (Blobbi Island's accessory/cosmetic extension tag) is **untouched** and
  entirely independent. Its existing behavior and tests are unchanged.

### Migration

| Removed | Replacement |
| --- | --- |
| `import { StorageItem } from '@blobbi-kit/core'` | Define the shape in the host, or use the host's inventory library. |
| `profile.storage` | Read `profile.allTags` and filter for `storage` yourself, or migrate to host-owned inventory. |
| `parseStorageTags(tags)` | Host-side helper over `event.tags` / `profile.allTags`. |
| `createStorageTags(items)` | Host-side builder. Note the kit will still refuse to *write* the resulting tags through `updateBlobbonautTags`. |
| `result.profileStorage` (react hooks) | `result.profileAllTags`, which is the raw tag list. |

No event data changes. No re-publish, backfill, or migration step is required:
profiles that carry `storage` tags keep them.

### Other

- `scripts/smoke.mjs` now asserts the built `dist/` output — runtime named
  exports and emitted `.d.ts` declarations — contains none of the removed API.

---

## 0.2.0 — Decouple consumable inventory from kind:11125 (backward-compatible)

- Marked `StorageItem`, `BlobbonautProfile.storage`, `parseStorageTags`,
  `createStorageTags`, and the three `profileStorage` hook fields
  `@deprecated`. No API removed.
- Removed `'storage'` from `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES`, reclassifying
  legacy `storage` as an opaque host extension tag preserved like `inv`.
- `mergeBlobbonautTagsForRepublish` began dropping any `storage` update key so
  the kit can never write new consumable inventory.
- Added regression tests for opaque preservation, write refusal, and `inv`
  independence.

---

## 0.1.0

- Initial packaging of `@blobbi-kit/core` and `@blobbi-kit/react`.
