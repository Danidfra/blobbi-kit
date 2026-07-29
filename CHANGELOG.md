# Changelog

All notable changes to the `blobbi-kit` packages are recorded here. Both
packages (`@blobbi-kit/core`, `@blobbi-kit/react`) are versioned and released in
lockstep.

The project is pre-1.0, so a **minor** bump is used for breaking changes
(`0.MINOR.PATCH`), per the `0.x` convention.

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
