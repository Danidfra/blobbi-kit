# Release: `@blobbi-kit/core` and `@blobbi-kit/react` 0.11.1

**Status: prepared, NOT published.** Nothing has been sent to npm and no
0.11.1 tag exists. Publication is the owner's step (§4).

A backward-compatible patch over 0.11.0: world travel **relay convergence**.
The fix is in core. React's code is unchanged; it is released in lockstep
(the kit's manifest contract), with its core peer raised to `^0.11.1`.

## 1. What 0.11.1 contains

- **The fix.** A relay that missed a move (it refused, timed out, or was down)
  is healed with the **same signed event**:
  - the event is sent unchanged (same id, `created_at`, tags, content and
    signature), with no new signature and no signer prompt;
  - nothing is ever sent over a newer location, or to a relay pinned by a
    future-dated one;
  - at most 3 heals per relay and event, 30 s, 60 s and 120 s apart;
  - none after a permanent refusal.
  - The spec is `packages/blobbi-core/WORLD-TRAVEL.md` §8a.
- **New exports (core, additive):** `HEAL_MAX_ATTEMPTS`, `HEAL_RETRY_MS`,
  `HEAL_VERIFY_MS` and `isPermanentRefusal`, plus the new field
  `WorldTravelSnapshot.diagnostics.laggingRelays`.
- **Unchanged:**
  - every event format, kind, tag and filter;
  - every other 0.11.0 export and declaration;
  - React's code (only its `version` and core peer range changed).

## 2. Compatibility with 0.11.0 (checked against the npm 0.11.0 tarballs)

**Core.** The files that differ:
- `dist/world-travel-session.{js,js.map,d.ts}` and `dist/index.d.ts`;
- `WORLD-TRAVEL.md`;
- `package.json` (version).

The declaration diff is purely additive: the four exports and
`laggingRelays`.

**React.** Only `package.json` differs: `version` 0.11.1, and the
`@blobbi-kit/core` peer `^0.11.1`.

**Behaviour change an app may notice.** A session may publish its owner's
already-signed World Location to a lagging relay on a look, including on
load. A test that counted publications on load over disagreeing relays will
see it.

## 3. Artifacts

Built from the release commit with
`npm run build && npm pack --workspace @blobbi-kit/core --workspace @blobbi-kit/react`.

| Package | Tarball | Size | Unpacked | Files | sha256 |
|---|---|---|---|---|---|
| core | `blobbi-kit-core-0.11.1.tgz` | 235,711 | 865,388 | 82 | `df40e7cbef802f65a4660187872087e7f8f4c9152bc52b61d0b5bca51aadd785` |
| react | `blobbi-kit-react-0.11.1.tgz` | 128,054 | 549,991 | 102 | `f3427ba3bc7f0c90d57405a8db822f4af8b209119d027c8a63b713ffe96ab98b` |

npm integrity:
- core: `sha512-rKTxKgq621/dcx5rzWOE/HOJQ3T8sXbj8WHM+b3Fzugzch6CLq9qJ3apSz8bWW02jHEiLi1OPSDp2UHTLY6vyg==`
- react: `sha512-JET2fdBbwRmfwgbHzDDu5oJ/wEqG8vmBlx4Mqm1N56cVGrh9/SoLYCBMaCxoGKZb1xiT/YvmLoai5B2bAlEq3Q==`

The tarballs are in `~/Developer/blobbi-kit-m16-packs/release-0.11.1-rc.*`,
with `pack.json` (npm's own listing).

## 4. Publication order and commands (owner only; NOT run)

```sh
cd ~/Developer/blobbi-kit-m16-packs/release-0.11.1-rc.*
shasum -a 256 blobbi-kit-core-0.11.1.tgz blobbi-kit-react-0.11.1.tgz   # must match §3

npm publish blobbi-kit-core-0.11.1.tgz --access public --dry-run
npm publish blobbi-kit-core-0.11.1.tgz --access public
# core first: react's peer ^0.11.1 needs it on the registry
npm publish blobbi-kit-react-0.11.1.tgz --access public --dry-run
npm publish blobbi-kit-react-0.11.1.tgz --access public

# Tags on the release commit, then main and tags pushed
cd ~/Developer/blobbi-kit-world-travel
git tag -a core-v0.11.1  -m "@blobbi-kit/core 0.11.1"  <release commit>
git tag -a react-v0.11.1 -m "@blobbi-kit/react 0.11.1" <release commit>
git push origin <release commit>:main core-v0.11.1 react-v0.11.1   # main fast-forwards
```

## 5. After publication

1. Check the registry:
   - `npm view @blobbi-kit/core@0.11.1 dist.integrity` matches §3;
   - the same for react;
   - `npm pack @blobbi-kit/core@0.11.1` matches the sha256.
2. Apps:
   - **Standalone:** `npm install @blobbi-kit/core@^0.11.1 @blobbi-kit/react@^0.11.1`.
   - **Pixel:** `npm install -D @blobbi-kit/core@^0.11.1`.
   - Then run the gates and the cross-device checks.

## 6. Verification

- **Kit:** `npm run verify` passes (typecheck, 2407 tests, build, smoke).
  - 18 new session tests cover relay convergence.
  - Mutation checks: disabling healing fails 14 of them; dropping the
    attempt bound fails 3; dropping the permanent-refusal rule fails 2.
- **Apps:** Standalone and Pixel at their integrated commits, with these
  tarballs installed in throwaway clones, pass their gates.
- **Browser:** the cross-device checks pass, with check 14 added for relay
  convergence.

## 7. Not validated

- No public relay was written to.
- No real NIP-07 extension or NIP-46 bunker was used.
- No physical device was used.
