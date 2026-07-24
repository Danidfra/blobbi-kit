# Audit: Migrating Consumable Inventory Away From kind:11125

**Scope:** repository-wide audit of `blobbi-kit` (`@blobbi-kit/core` + `@blobbi-kit/react`).
**Status:** audit only — no production code changed, no dependencies installed, no versions bumped, no migration performed.
**Method:** every finding below was verified through call sites and tests, not inferred from names alone.

---

## 0. Implementation Status (backward-compatible, Phase 1 + Phase 2 decoupling)

The product decisions have been implemented as a **backward-compatible** change (no public API removed, no version bump performed). Legacy `storage` tags are **preserved opaquely and ignored as an active inventory source**; there is no backfill, no dual read/write, no automatic transfer, and no kind:31633 publication from the kit. `@nostr-games/inventory` was **not** added as a dependency, and no `InventoryAdapter` was introduced (no concrete current need surfaced).

Changes made:

| Change | Location | Kind |
| --- | --- | --- |
| `@deprecated` on `StorageItem` | `blobbi.ts:339` | Docs |
| `@deprecated` on `BlobbonautProfile.storage` (now documented legacy read-only) | `blobbi.ts` | Docs |
| `@deprecated` on `parseStorageTags` (legacy read only) | `blobbi.ts` | Docs |
| `@deprecated` on `createStorageTags` (no kit callers) | `blobbi.ts` | Docs |
| Removed `'storage'` from `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES` — now opaque, preserved like `inv` | `blobbi.ts` | **Behavior (backward-compatible)** |
| `mergeBlobbonautTagsForRepublish` drops any `storage` update key (dev warning) so the kit never writes new consumable storage tags; existing tags still preserved | `blobbi.ts` | **Behavior (backward-compatible)** |
| `parseBlobbonautEvent` comment clarifies `.storage` is legacy read-only | `blobbi.ts` | Docs |
| `@deprecated` on `profileStorage` fields (`FreshBlobbiResult`, `CanonicalIncubationResult`, `CanonicalActionResult`) — kept for public compat, not removed | `useFreshBlobbiBeforeAction.ts`, `useBlobbiIncubation.ts`, `useBlobbiEvolve.ts` | Docs |
| Regression tests for opaque preservation + write-refusal + `inv` independence | `blobbi-extension-tags.test.ts` | Tests |

Explicitly **not** done (per product decision / constraints): no removal of deprecated public APIs, no `@nostr-games/inventory` dependency, no `InventoryAdapter`, no kind:31632/31633 persistence, no Ditto changes, no version bump.

Verification: `npm run test` → 143 passing; `npm run typecheck` → clean.

The remainder of this document is the original audit, retained as the reference for the decisions above.

---

## 1. Executive Summary

The consumable-inventory surface in `blobbi-kit` is **much smaller and much more loosely coupled than a name-based scan suggests**. The key results:

- **kind:11125 (Blobbonaut Profile) does model consumable inventory today**, but only as a *parse + serialize + preserve* concern via the `storage` tag (`['storage', 'itemId:quantity']`). This is the food/toy/medicine/hygiene/energy inventory referenced by the task.
- **The kit never reads inventory to gate a care action, never validates availability, and never decrements/consumes quantities.** No hook consumes `BlobbonautProfile.storage`. The only *write path* for `storage` is passive preservation inside the generic profile tag-merge helpers.
- **Care-effect calculation is already fully decoupled from inventory.** Stat effects are computed in `@blobbi-kit/core/blobbi-social-projection` from kind:1124 interaction events, using an injected `CareItemEffectResolver`/`CatalogAdapter`. There is no inventory check anywhere in that path. **Requirement (6) — separating care effect from inventory validation/consumption — is already satisfied by design.**
- **`inv` is NOT consumable inventory in the kit.** It is treated purely as an opaque *host extension tag* (Blobbi Island's accessory/equipment/cosmetic inventory). A dedicated test (`blobbi-extension-tags.test.ts`) locks in that core must never touch it. The consumable inventory in the kit is the **`storage`** tag, not `inv`.
- **`kind:31632`, `kind:31633`, and `@nostr-games/inventory` do not appear anywhere in the repository** (source, tests, docs, or `package.json`). Blobbi Island's migration has not landed in the kit.

**Consequence:** removing consumable inventory from kind:11125 in the kit is a **small, mostly additive/deprecation change**. The at-risk pieces are four public core symbols (`StorageItem`, `parseStorageTags`, `createStorageTags`, `BlobbonautProfile.storage`), `'storage'` in the managed-tag set, and one unused `profileStorage` field carried on two React hook result types. A breaking major bump is **not** required for phase 1; a minor + `@deprecated` is sufficient. A breaking bump becomes justified only if/when `storage` is fully removed from the profile model and the managed-tag set (phase 3).

---

## 2. Relevant Files and Symbols

### `@blobbi-kit/core`

| File | Symbol | Role |
| --- | --- | --- |
| `packages/blobbi-core/src/blobbi.ts` | `KIND_BLOBBONAUT_PROFILE = 11125` (`blobbi.ts:19`) | The profile kind. Must remain. |
| `blobbi.ts` | `interface StorageItem` (`blobbi.ts:339`) | Consumable inventory item shape (`itemId`, `quantity`). |
| `blobbi.ts` | `BlobbonautProfile.storage: StorageItem[]` (`blobbi.ts:372`) | Consumable inventory on the parsed profile. |
| `blobbi.ts` | `parseStorageTags(tags)` (`blobbi.ts:536`) | **Read** path: `['storage','itemId:quantity']` → `StorageItem[]`. |
| `blobbi.ts` | `createStorageTags(storage)` (`blobbi.ts:556`) | **Write** builder: `StorageItem[]` → `['storage',...]`. **No callers in repo.** |
| `blobbi.ts` | `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES` incl. `'storage'` (`blobbi.ts:1521`) | Marks `storage` as a client-managed tag (preserved across republish). |
| `blobbi.ts` | `parseBlobbonautEvent` (`blobbi.ts:1341`, uses `parseStorageTags` at `:1365`) | Populates `.storage` on every parsed profile. |
| `blobbi.ts` | `mergeBlobbonautTagsForRepublish` / `updateBlobbonautTags` (`blobbi.ts:1745`, `:1810`) | Generic profile write path; preserves `storage` + opaque `inv`. |
| `blobbi.ts` | `INITIAL_BLOBBONAUT_COINS`, `coins` field (`blobbi.ts:65`, `:362`, `:1360`) | Coins — profile data, **must remain** in 11125. |
| `packages/blobbi-core/src/blobbi-social-projection.ts` | `CareItemEffect`, `CareItemEffectResolver`, `applySocialInteractions`, `consolidateSocialInteractions` | Care-effect calculation. **Inventory-free.** |
| `packages/blobbi-core/src/blobbi-interaction.ts` | `InteractionEventParams.itemId`, `buildInteractionEventTemplate`, kind:1124 | Interaction log carries an `item` tag; no quantity/consumption. |
| `packages/blobbi-core/src/types/shop.ts` | `ShopItemCategory`, `ItemEffect`, `ShopItem`, `PurchaseRequest` | Catalog/effect types; `ItemEffect` aliased as `CareItemEffect`. |
| `packages/blobbi-core/src/missions.ts` | `MissionsContent`, `ProfileContent`, `parseProfileContent`, `serializeProfileContent` | kind:11125 **content JSON** (daily missions). Not inventory. |
| `packages/blobbi-core/src/progression.ts` | `buildXpTagUpdates` | XP/level tags on kind:11125. Not inventory. |
| `packages/blobbi-core/src/index.ts` | barrel `export * from './blobbi'` etc. (`index.ts:23`) | Re-exports all the storage symbols at the package root. |

### `@blobbi-kit/react`

| File | Symbol | Role |
| --- | --- | --- |
| `packages/blobbi-react/src/hooks/useFreshBlobbiBeforeAction.ts` | `FreshBlobbiResult.profileStorage: StorageItem[]` (`:47`, populated `:144`) | Exposes `profile.storage` to callers. **Nothing in the kit consumes it.** |
| `packages/blobbi-react/src/hooks/useBlobbiIncubation.ts` | `CanonicalIncubationResult.profileStorage: StorageItem[]` (`:52`) | **Unused field** on the result type; never read at runtime. |
| `packages/blobbi-react/src/hooks/useBlobbiEvolve.ts` | `CanonicalActionResult.profileStorage: StorageItem[]` (`:61`) | **Unused field** on the result type; never read at runtime. |
| `packages/blobbi-react/src/hooks/useAwardDailyXp.ts` | publishes kind:11125 (`:104`) | Writes `xp`/`level` tags + missions content. Preserves `storage` via `updateBlobbonautTags`. |
| `packages/blobbi-react/src/hooks/usePersistDailyProgress.ts` | publishes kind:11125 (`:125`) | Writes content only, `tags: prev.tags` verbatim. Preserves `storage`. |
| `packages/blobbi-react/src/adapters/types.ts` | `CatalogAdapter.resolveCareItemEffect` (`:56`) | DI contract that decouples effect resolution from any catalog/inventory. |
| `packages/blobbi-react/src/hooks/useCanonicalSync.ts` | `resolveCareItemEffect` wiring | Consolidates kind:1124 → 31124 stats. **No inventory access.** |
| `packages/blobbi-react/src/hooks/useBlobbiCareActivity.ts` | streak update | Publishes kind:31124. **No inventory access.** |
| `packages/blobbi-react/src/lib/blobbi-actions.ts` | `InventoryAction = 'feed'\|'play'\|'clean'\|'medicine'\|'boost'` (`:13`) | Action taxonomy (naming only); does not touch stored inventory. |
| `packages/blobbi-react/src/lib/daily-mission-tracker.ts` | `trackInventoryDailyActions` (`:225`) | Maps a care action to daily-mission tallies. **No inventory read/write.** |

### Tests

| File | Role |
| --- | --- |
| `packages/blobbi-core/src/blobbi-extension-tags.test.ts` | Locks in the `inv` (11125) and `equip` (31124) extension-preservation invariant. Explicitly states core does NOT standardize `inv`/`equip` and does NOT add an inventory kind (`:19–24`). |
| `packages/blobbi-core/src/blobbi.test.ts` | Profile/address parsing tests. No `storage`-specific tests. |
| `packages/blobbi-core/src/blobbi-social-projection.test.ts` | Care-effect projection tests via resolver. Inventory-free. |
| `packages/blobbi-core/src/blobbi-interaction.test.ts` | kind:1124 parse/build; uses `itemId` on interactions. |

---

## 3. Current 11125 Inventory Model

Consumable inventory is stored as **repeated `storage` tags** on the kind:11125 Blobbonaut Profile event:

```
['storage', 'itemId:quantity']   // e.g. ['storage', 'food_cake:3']
```

- Parsed by `parseStorageTags` (`blobbi.ts:536`) into `StorageItem[]` (`{ itemId, quantity }`, quantity coerced via `parseInt`, filtered to `quantity > 0`).
- Surfaced on `BlobbonautProfile.storage` (`blobbi.ts:372`) by `parseBlobbonautEvent` (`blobbi.ts:1365`).
- Serialized by `createStorageTags` (`blobbi.ts:556`) — **defined but never called** anywhere in the repository (dead public API in the kit; presumably called by host apps).
- Declared a **managed** tag via `'storage'` in `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES` (`blobbi.ts:1521`), so the generic profile merge helpers preserve it and will overwrite it if an update passes a `storage` key.

`storage` covers exactly the consumable categories named in `ShopItemCategory` (`types/shop.ts:6`): `food | toy | medicine | hygiene | energy`.

Other kind:11125 data that is **profile, not inventory** and MUST remain (see §16):
`coins`, `has` (owned Blobbis), `current_companion`, `blobbi_onboarding_done`/`onboarding_done`, `name`, `xp`, `level`, `pettingLevel`, `room`, plus content-JSON daily missions, plus opaque host extension tags (`inv`, room layouts, etc.).

- Reachable: **yes** (parse path runs on every profile read).
- Recommended action: **deprecate** the `storage` inventory API; **preserve** all other profile fields.

---

## 4. Read Paths

| Path | Location | Behavior | Reachable | Action |
| --- | --- | --- | --- | --- |
| `parseStorageTags` | `blobbi.ts:536` | Turns `storage` tags into `StorageItem[]`. | Yes (via `parseBlobbonautEvent`). | Deprecate (keep for back-compat read of legacy events). |
| `parseBlobbonautEvent` → `.storage` | `blobbi.ts:1365` | Every parsed profile carries `.storage`. | Yes | Preserve field during phase 1; deprecate; remove in phase 3 (breaking). |
| `fetchFreshBlobbonautProfile` | `fetchFreshBlobbonautProfile.ts` | Fetches + parses profile (thus includes `.storage`). | Yes | Preserve (inventory-agnostic). |
| `useFreshBlobbiBeforeAction` → `profileStorage` | `useFreshBlobbiBeforeAction.ts:144` | Exposes `profile.storage` to the caller. | Yes (returned), **but no kit consumer reads it**. | Deprecate the `profileStorage` result field. |
| `useBlobbiIncubation`/`useBlobbiEvolve` `profileStorage` | `:52`, `:61` | Declared on result types, **never accessed**. | No (dead field) | Remove (internal, non-breaking to behavior; type-level change). |

**No read path uses inventory to gate, validate, or branch a care action.** Confirmed by reading `useCanonicalSync`, `useBlobbiCareActivity`, `useBlobbiIncubation`, `useBlobbiEvolve`, `useProjectedBlobbiState`, and the social-projection module.

---

## 5. Write Paths

| Path | Location | Behavior w.r.t. `storage` | Reachable | Action |
| --- | --- | --- | --- | --- |
| `createStorageTags` | `blobbi.ts:556` | Builds `storage` tags from `StorageItem[]`. | **No callers in repo.** | Deprecate; remove in phase 3. |
| `mergeBlobbonautTagsForRepublish` / `updateBlobbonautTags` | `blobbi.ts:1745`, `:1810` | Because `'storage'` is in the managed set: (a) existing `storage` tags **preserved** when no `storage` update is passed; (b) **overwritten** if a `storage` key is passed. | Yes | Preserve merge helper; change is only whether `storage` stays managed. |
| `useAwardDailyXp` (publish 11125) | `useAwardDailyXp.ts:92–108` | Calls `updateBlobbonautTags(prev.tags, buildXpTagUpdates(...))` — no `storage` key ⇒ existing `storage` **preserved untouched**. | Yes | Preserve. |
| `usePersistDailyProgress` (publish 11125) | `usePersistDailyProgress.ts:124–130` | Publishes with `tags: prev.tags` verbatim ⇒ `storage` **preserved untouched**. | Yes | Preserve. |
| `buildBlobbonautTags` | `blobbi.ts:1377` | New profile: emits `d`, `b`, `blobbi_onboarding_done`, `pettingLevel`. **No `storage`.** | Yes | Preserve. |
| `buildNormalizedProfileTags` | `blobbi.ts:1850` | Normalizes petting/onboarding tags; passes through `storage`. | Yes | Preserve. |

**Net:** the kit never *creates* or *mutates* consumable inventory. It only *preserves* it (managed-tag passthrough) and provides a builder (`createStorageTags`) that nothing in the kit calls.

---

## 6. Accessory `inv` vs Consumable Inventory

**These are two different things. Do not conflate them.**

- **`storage`** = the **consumable** inventory (food/toy/medicine/hygiene/energy) — this is what the migration targets. Modeled in `blobbi.ts` as above.
- **`inv`** = an **opaque host extension tag** owned by Blobbi Island, explicitly documented as accessories/equipment/cosmetics-style inventory that **core must never interpret or clobber**:
  - `blobbi-extension-tags.test.ts:19–24`: "Host apps … attach their own tags … future accessories, `equip` on kind 31124, `inv` on kind 11125. Core does not understand these tags but must never clobber them. We are intentionally NOT standardizing `equip`/`inv` … and not adding an inventory kind."
  - `blobbi.ts:1774–1776`: "apps attach their own tags to kind 11125 profiles (e.g. Blobbi Island's inventory `inv` tags). Core must never clobber them."
  - Tests assert repeated `inv` tags survive `updateBlobbonautTags` and `mergeBlobbonautTagsForRepublish` (`:97–133`).

**Practical meaning of `inv`:** In the kit it is **neither read nor written as consumables** — it is preserved verbatim as an unmanaged extension tag. Its concrete semantics (accessory/equipment/cosmetic) live in the host app, not the kit. **Per the constraints, do not change `inv` behavior.** The preservation invariant (and its tests) must be **kept as-is**.

- Reachable: yes (preservation path + tests).
- Action: **preserve / document** — no change.

---

## 7. Care-Action Flow and Coupling

**Observed flow (verified in code):**

1. UI chooses a care action (`feed | play | clean | medicine | boost`; `blobbi-actions.ts:13`).
2. A kind:1124 interaction event is built (`buildInteractionEventTemplate`, `blobbi-interaction.ts:130`) with an optional `item` tag (`itemId`).
3. Effects are projected later, read-only, in `blobbi-social-projection.ts`:
   - `resolveEffect` (`:184`) → if `itemId` + injected `resolveCareItemEffect` returns an effect, apply it; else fall back to `FALLBACK_EFFECTS[action]` (`:57`).
   - `applyEffect` (`:196`) clamps stats to `[STAT_MIN, STAT_MAX]`.
4. `useCanonicalSync` consolidates pending interactions into canonical kind:31124 stats and advances the social checkpoint.
5. `useBlobbiCareActivity` updates the care streak on kind:31124.

**Coupling to inventory: none.**
- No step reads `BlobbonautProfile.storage`.
- No step checks availability or decrements a quantity.
- The catalog is injected via `CatalogAdapter.resolveCareItemEffect` (`adapters/types.ts:56`) / the `CareItemEffectResolver` type, keeping `@blobbi-kit/core` decoupled from any concrete catalog.

**Which care actions depend on inventory availability/consumption?** In the kit: **none.** Any availability/consumption enforcement lives in host-app hooks that do not exist in this repo (the doc comment in `daily-mission-tracker.ts:219` references `useBlobbiUseInventoryItem`/`useBlobbiItemUse`, which are host-app hooks, not present here).

- Reachable: yes.
- Action: **preserve** the effect pipeline; it already meets requirement (6).

---

## 8. Public API Impact

Symbols exported from the package root (`core/src/index.ts:23` re-exports all of `./blobbi`) that relate to consumable inventory:

| Public symbol | Impact | Classification |
| --- | --- | --- |
| `StorageItem` (type) | Consumers may import it. | Deprecate (phase 1) → remove (phase 3, breaking). |
| `parseStorageTags` | Read helper. | Deprecate → remove (breaking). |
| `createStorageTags` | Write builder, no kit callers. | Deprecate → remove (breaking). |
| `BlobbonautProfile.storage` | Field on a widely-used type. | Deprecate → remove (breaking). |
| `'storage'` in `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES` | Behavioral: controls preserve/overwrite. Removing it from the managed set would make `storage` an *unmanaged/opaque* tag (preserved like `inv`) instead of clobberable. | Change (backward-compatible for reads/preservation; see §13). |
| `FreshBlobbiResult.profileStorage` (react) | Result field. | Deprecate → remove (breaking for that type). |
| `CanonicalIncubationResult.profileStorage`, `CanonicalActionResult.profileStorage` (react) | **Unused** result fields. | Remove (internal; type-level). |

Symbols that are **NOT** inventory and must remain public and unchanged: `KIND_BLOBBONAUT_PROFILE`, `coins`/`INITIAL_BLOBBONAUT_COINS`, `has`, `current_companion`, onboarding tags, `xp`/`level`, `pettingLevel`, `room`, `ShopItem`/`ItemEffect`/`CareItemEffect`/`CareItemEffectResolver`, all mission/content APIs.

---

## 9. Recommended Target Architecture

**Principle: keep kind:11125 as the Blobbonaut/profile event; treat consumable inventory as a separate concern the kit does not own.**

1. **Care-effect calculation stays in `@blobbi-kit/core`** (already inventory-free). No change to `blobbi-social-projection` or the `CareItemEffectResolver`/`CatalogAdapter` contract.
2. **Consumable inventory ownership moves out of the profile model.** The kit stops treating `storage` as a first-class profile field and a *managed* tag:
   - Phase 1: mark `StorageItem`, `parseStorageTags`, `createStorageTags`, `BlobbonautProfile.storage`, and the three `profileStorage` fields `@deprecated`; keep behavior identical.
   - Phase 2: reclassify `storage` from *managed* to *opaque extension tag* (same treatment as `inv`) so legacy `storage` tags are **preserved, never clobbered** — this decouples the kit from the semantics without dropping data.
   - Phase 3 (breaking): remove the deprecated symbols and drop `storage` from `BlobbonautProfile`.
3. **Inventory (definitions kind:31632 / player inventory kind:31633) is provided by an optional adapter, not baked into core.** See §10.
4. **Ditto** keeps using the effect pipeline with a resolver that returns effects for free/infinite items, and simply never persists kind:31633. See §11.

---

## 10. Recommended Role of `@nostr-games/inventory`

Currently absent from the repo. Recommendation:

- **`@blobbi-kit/core` should NOT depend on `@nostr-games/inventory`.** Core is DOM-free, catalog-agnostic, and already exposes the `CareItemEffect`/`CareItemEffectResolver` seam. Hard-coupling to an inventory library would break its "no concrete catalog" invariant.
- **`@blobbi-kit/react` should NOT hard-depend on it either.** Instead, extend the existing adapter pattern: an **optional `InventoryAdapter`** (parallel to `CatalogAdapter`) that the host implements — e.g. backed by `@nostr-games/inventory` in Blobbi Island, or by a free/infinite stub in Ditto.
- **Provide an optional adapter package/module** (e.g. a thin `@blobbi-kit/react` sub-path or a separate `@blobbi-kit/inventory-adapter`) that wraps `@nostr-games/inventory@0.1.0` behind the `InventoryAdapter` interface, so apps that want it can opt in without forcing the dependency on everyone.
- **Leave inventory persistence (kinds 31632/31633) entirely to applications.** The kit should never read/write those kinds directly.

Net: **inventory is optional, adapter-injected; not a core/react dependency.**

---

## 11. Ditto Infinite-Item Compatibility

Ditto gives care items for free with infinite availability and does not need to persist kind:31633.

**Sketch of the Ditto flow (no inventory check):**

```
choose care action (feed/play/clean/medicine/boost)
   → build kind:1124 interaction (buildInteractionEventTemplate) with optional itemId
   → publish interaction (emitInteractionEvent)   [no availability check, no decrement]
   → useCanonicalSync consolidates 1124 → 31124 stats using
        resolveCareItemEffect(itemId) supplied by Ditto's catalog adapter
   → publish updated kind:31124 state (+ streak via useBlobbiCareActivity)
```

**API shape that enables this:** the *existing* `CatalogAdapter.resolveCareItemEffect(itemId)` already lets Ditto map any item id to an effect **without any inventory backing**. To make "free/infinite" explicit and future-proof, add an **optional** `InventoryAdapter` whose default (Ditto) implementation is:

```ts
interface InventoryAdapter {
  // How many of an item the player has; Infinity = unlimited (Ditto).
  getQuantity(itemId: string): number;           // Ditto: () => Infinity
  // Whether a care action may proceed; Ditto always true.
  canUse(itemId: string): boolean;               // Ditto: () => true
  // Consume on use; Ditto is a no-op (no persistence).
  consume(itemId: string, amount?: number): void; // Ditto: () => {}
}
```

Hooks accept `inventory?: InventoryAdapter`; when omitted, behavior is **free/infinite** (matching Ditto today). Blobbi Island supplies an adapter backed by `@nostr-games/inventory` that reads kind:31633 and enforces/decrements. This keeps Ditto zero-persistence and the kit inventory-agnostic.

---

## 12. Required Tests

Tests to add/adjust (test-only; not part of the "no production change" constraint, but listed for the implementation phase):

1. **Preservation of legacy `storage` tags** through `updateBlobbonautTags` / `mergeBlobbonautTagsForRepublish` once `storage` is reclassified as opaque (mirror the existing `inv` tests in `blobbi-extension-tags.test.ts`). Assert `storage` survives verbatim and is no longer clobbered by a `storage` update key.
2. **`inv` invariant unchanged** — keep the existing `blobbi-extension-tags.test.ts` cases green (regression guard that the migration did not disturb accessories).
3. **Care effect without inventory** — extend `blobbi-social-projection.test.ts` to assert effects apply regardless of any inventory state (already effectively true; make it explicit).
4. **Deprecation surface** — a compile/type test confirming deprecated symbols still export in phase 1 (no accidental removal).
5. **`InventoryAdapter` default = infinite** — unit test that hooks proceed with no adapter (Ditto path) and enforce/decrement with a stub adapter (Island path), once the adapter lands.
6. **Profile round-trip** — `parseBlobbonautEvent` → publish via daily-XP/daily-progress paths preserves non-inventory profile fields (coins, has, xp/level, room, missions content).

---

## 13. Migration Phases (safest, phased)

**Phase 0 — Freeze & document (this audit).** No code change.

**Phase 1 — Deprecate (minor, backward-compatible).**
- Add `@deprecated` JSDoc to `StorageItem`, `parseStorageTags`, `createStorageTags`, `BlobbonautProfile.storage`, and the three `profileStorage` fields.
- Keep all behavior identical (`storage` stays managed; still parsed).
- Add the `InventoryAdapter` contract (optional, defaults to infinite) to `@blobbi-kit/react/adapters/types` **without** wiring it into any hook yet.
- No breaking changes; `0.1.x → 0.2.0`.

**Phase 2 — Decouple semantics (minor, backward-compatible).**
- Reclassify `'storage'` from `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES` to an **opaque extension tag** (preserved verbatim like `inv`, never clobbered). Add a preservation test.
- Optionally wire the `InventoryAdapter` into the care-action hooks with a default infinite implementation so Ditto behavior is unchanged and Island can enforce.
- Remove the **unused** `profileStorage` fields from `useBlobbiIncubation`/`useBlobbiEvolve` result types (internal; behavior unchanged).
- Provide the optional `@nostr-games/inventory`-backed adapter as an opt-in module.

**Phase 3 — Remove (breaking, major).**
- Drop `BlobbonautProfile.storage`, `StorageItem`, `parseStorageTags`, `createStorageTags`, and `FreshBlobbiResult.profileStorage`.
- Bump to `1.0.0` (or `0.x` → next major) with a changelog + migration note.
- Only do this after Blobbi Island and Ditto no longer import these symbols from the kit.

---

## 14. Risks and Open Questions

**Risks**
- **Silent data loss of legacy `storage`** if it is dropped from the managed set *and* not simultaneously preserved as opaque. Mitigation: phase 2 preservation test (mirror `inv`).
- **External consumers** (Blobbi Island / Ditto) may import `StorageItem`/`parseStorageTags`/`createStorageTags` today. Removing them (phase 3) breaks those imports. Mitigation: deprecate first, verify host imports, then remove.
- **`profileStorage` on `FreshBlobbiResult` is actually returned** (unlike the incubation/evolve ones which are dead). A host might read it. Removing it is breaking for that type; deprecate first.
- **Do not touch `inv`** — any change risks accessories/cosmetics regression in Island.

**Open questions (product input — see chat summary):**
- Should legacy `storage` tags be **migrated** into kind:31633 by a host, or simply **abandoned** (preserved-but-ignored) once free/infinite (Ditto) becomes the model?
- Is there any host today that still **relies on the kit's `createStorageTags`/`parseStorageTags`** for writing 31633-independent inventory, or has that moved entirely into `@nostr-games/inventory`?

---

## 15. Ditto Flow (as-implemented target)

```
[User taps "Feed"]
      │
      ▼
resolveCareItemEffect(itemId)   ← Ditto catalog adapter (free/infinite)
      │   (no InventoryAdapter check, or InventoryAdapter.canUse → true)
      ▼
buildInteractionEventTemplate({ action:'feed', itemId, ... })  → kind:1124
      │
      ▼
publish(kind:1124)     ← emitInteractionEvent (fire-and-forget)
      │
      ▼
useCanonicalSync → consolidateSocialInteractions(stats, [ix], checkpoint, resolveCareItemEffect)
      │
      ▼
publish(kind:31124)    ← updated stats + social checkpoint
      │
      ▼
useBlobbiCareActivity  ← streak update on kind:31124
      │
      ▼
[No kind:31633 written. No inventory decremented.]
```

---

## 16. Fields That MUST Remain in kind:11125

Confirmed profile (non-inventory) data — **preserve**:

- `coins` (`blobbi.ts:362`, `:1360`; `INITIAL_BLOBBONAUT_COINS` `:65`)
- `has` — owned Blobbis (`:360`, `:1359`; dedup logic `deduplicateHasTags`)
- `current_companion` (`:354`, `:1355`)
- `blobbi_onboarding_done` / `onboarding_done` (`:356`, `:1356`)
- `name` (`:358`, `:1358`)
- `xp`, `level` (`:366–368`, `:1362–1363`; `progression.ts`)
- `pettingLevel` / `petting_level` (`:363`, `:1361`)
- `room` (`:369`, `:1364`)
- content-JSON daily missions (`missions.ts` `MissionsContent` / `ProfileContent`)
- opaque host extension tags, incl. **`inv`** (accessories/equipment/cosmetics) and room layouts — preserved verbatim.

Achievements are not modeled as a dedicated field in the kit today; if a host stores them on 11125, they fall under opaque extension tags and are preserved.

---

## 17. Exact Implementation Checklist

> Phase 1 (deprecate, non-breaking) unless noted. Do **not** start until product answers §14 open questions.

- [ ] `blobbi.ts:339` — add `@deprecated` to `interface StorageItem` (consumable inventory moved out of profile).
- [ ] `blobbi.ts:372` — add `@deprecated` to `BlobbonautProfile.storage`.
- [ ] `blobbi.ts:536` — add `@deprecated` to `parseStorageTags` (keep for legacy read).
- [ ] `blobbi.ts:556` — add `@deprecated` to `createStorageTags` (no kit callers).
- [ ] `useFreshBlobbiBeforeAction.ts:47` — add `@deprecated` to `FreshBlobbiResult.profileStorage`.
- [ ] `useBlobbiIncubation.ts:52`, `useBlobbiEvolve.ts:61` — mark `profileStorage` `@deprecated` (Phase 1) → remove (Phase 2, unused).
- [ ] `adapters/types.ts` — add optional `InventoryAdapter` contract (default = infinite); do **not** wire into hooks yet.
- [ ] **Phase 2:** `blobbi.ts:1521` — remove `'storage'` from `MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES`; verify it is then preserved as an opaque tag (like `inv`). Add preservation test to `blobbi-extension-tags.test.ts`.
- [ ] **Phase 2:** wire optional `InventoryAdapter` into care hooks; default keeps Ditto free/infinite.
- [ ] **Phase 2:** provide opt-in `@nostr-games/inventory`-backed adapter module.
- [ ] **Phase 3 (breaking, major):** remove `StorageItem`, `parseStorageTags`, `createStorageTags`, `BlobbonautProfile.storage`, `FreshBlobbiResult.profileStorage`; update barrels; changelog + migration note.
- [ ] Keep **all** `inv` behavior and its tests unchanged throughout.
- [ ] Keep the care-effect pipeline (`blobbi-social-projection`, `CareItemEffectResolver`, `CatalogAdapter`) unchanged.
