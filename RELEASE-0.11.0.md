# Release: `@blobbi-kit/core` and `@blobbi-kit/react` 0.11.0

**Status: release candidate, prepared and audited locally. NOT published.**
- Nothing has been published to npm, and no tag was created.
- Nothing was pushed.
- The 0.10.0 tags (`core-v0.10.0`, `react-v0.10.0`, annotated, on `7220ca6`)
  are untouched.

**Kinds.** The kinds 31126 (World Location) and 21124 (Active Presence) are
approved by the owner as the **experimental** identifiers of the Blobbi World
Travel protocol (`WORLD_TRAVEL_KINDS_STATUS = 'experimental'`). They are not
a NIP and are not standardized by the Nostr community.

## 1. What 0.11.0 contains

World travel is the only feature since 0.10.0. See `CHANGELOG.md` and
`packages/blobbi-core/WORLD-TRAVEL.md`:
- §0 is the product model;
- §13 covers security;
- §14 lists the known limitations.

**core:**
- `world-travel.ts`
- `world-travel-session.ts`
- `world-travel-sync.ts`
- `world-travel-follow.ts`
- `WORLD-TRAVEL.md`, shipped in the package

**react:**
- `useWorldTravel`
- `useWorldTravelSync`
- `poolWorldTravelRelays`

## 2. Compatibility with 0.10.0 (checked against the npm tarballs)

**Additive only.**
- No runtime export was removed: core went from 175 to 242 named exports,
  react from 114 to 117.
- Every 0.10.0 declaration file is byte-identical in 0.11.0, except the index
  files, which only gained lines.
- No existing kind or tag changed meaning.

A minor bump is right under the `0.x` convention: it marks a new feature
surface. React's peer range on core moves from `^0.10.0` to `^0.11.0`, so the
two packages are upgraded together, as they were for 0.10.0.

## 3. Artifacts (reproducible from the release commit)

The tarballs were built by `npm run build`, then
`npm pack --workspace @blobbi-kit/core --workspace @blobbi-kit/react`.

| Package | Tarball | Size | Unpacked | Files | sha256 |
|---|---|---|---|---|---|
| `@blobbi-kit/core@0.11.0` | `blobbi-kit-core-0.11.0.tgz` | 230 088 B | 846 908 B | 82 | `4b26a5cd…bcec331` |
| `@blobbi-kit/react@0.11.0` | `blobbi-kit-react-0.11.0.tgz` | 128 054 B | 549 991 B | 102 | `5c6a5f6c…2e32e7a` |

The tarballs are in `~/Developer/blobbi-kit-m16-packs/release-0.11.0-rc/`,
with `pack.json` (npm's own listing and sha512 integrity).

**Contents:**
- `dist/` (`.js`, `.js.map`, `.d.ts`), `LICENSE`, `README.md` and
  `package.json`;
- core also ships `WORLD-TRAVEL.md`.

**Checked absent:**
- tests, `*.test-helpers.*` and fixtures;
- scratch files, logs, `.env` files and local paths;
- private keys, `nsec` strings and 64-hex literals;
- install scripts.

The source maps reference `../src/*.ts`, which is public MIT source. The only
URLs in the code are the two default relays
(`wss://relay.ditto.pub`, `wss://relay.primal.net`), as data. No module opens
a socket or calls `fetch` itself.

**Dependencies:**
- core: `@noble/hashes ^1.3.1`, unchanged;
- react: peers only (`@blobbi-kit/core ^0.11.0`, `@nostrify/react ^0.6.3`,
  `@tanstack/react-query ^5.56.2`, `react ^18 || ^19`);
- no `file:`, workspace or unpublished dependencies.

## 4. Publication order and commands (owner only; NOT run)

Core first: react's peer `^0.11.0` must resolve against the published core.
Publish the **audited tarballs** themselves, so npm receives exactly what was
tested:

```sh
cd ~/Developer/blobbi-kit-m16-packs/release-0.11.0-rc
shasum -a 256 blobbi-kit-core-0.11.0.tgz blobbi-kit-react-0.11.0.tgz   # must match §3
npm whoami                                                             # the account that owns @blobbi-kit
npm publish blobbi-kit-core-0.11.0.tgz --access public --dry-run
npm publish blobbi-kit-core-0.11.0.tgz --access public
npm view @blobbi-kit/core@0.11.0 version                               # wait until it answers 0.11.0
npm publish blobbi-kit-react-0.11.0.tgz --access public --dry-run
npm publish blobbi-kit-react-0.11.0.tgz --access public
```

`publishConfig.access` is already `public`. Both publish to the `latest`
dist-tag, which is what a stable 0.11.0 should be.

**Tags and push, after both publish:**

```sh
cd ~/Developer/blobbi-kit-world-travel
git tag -a core-v0.11.0  -m "@blobbi-kit/core 0.11.0"  <release commit>
git tag -a react-v0.11.0 -m "@blobbi-kit/react 0.11.0" <release commit>
git push origin feat/m16-world-travel core-v0.11.0 react-v0.11.0
```

The tags follow the existing annotated `core-vX.Y.Z` / `react-vX.Y.Z` scheme.
How `feat/m16-world-travel` reaches `main` is the owner's merge decision.

## 5. Post-publication checklist

1. Check the dist-tags:
   - `npm view @blobbi-kit/core dist-tags` and
     `npm view @blobbi-kit/react dist-tags` both show `latest: 0.11.0`;
   - `npm view @blobbi-kit/react@0.11.0 peerDependencies` shows
     `@blobbi-kit/core: ^0.11.0`.
2. `npm view @blobbi-kit/core@0.11.0 dist.integrity` equals the `pack.json`
   integrity (`sha512-JGr6NPs3…`), and the same for react (`sha512-4M+6lLJC…`).
3. Do a fresh consumer install from the registry, in an empty directory:
   - `npm install @blobbi-kit/core@0.11.0 @blobbi-kit/react@0.11.0` with its
     peers;
   - import both, `createWorldTravel`, `useWorldTravel`, and
     `KIND_WORLD_LOCATION === 31126`.
4. In each app, on its own branch: replace the `file:` tarball with
   `"@blobbi-kit/core": "^0.11.0"` (and `@blobbi-kit/react` in the
   Standalone), then:
   - run `npm install`;
   - check the lockfile `resolved` URL is registry.npmjs.org;
   - run typecheck, test and build;
   - restart the dev servers with `--force`;
   - rerun `e2e/world-travel/cross-device.mjs`.
5. Push the tags (§4).

## 6. Verification of this release candidate (2026-10-17)

**Kit** (`npm run verify`):
- typecheck passes;
- 2389 tests in 104 files pass;
- build passes;
- smoke passes: 31 entries under raw Node ESM, including the 6 new
  world-travel subpaths.

**Clean consumer**: an empty directory with its own npm cache, installing the
two tarballs.
- The lockfile integrity equals `pack.json`, and there is one core (0.11.0),
  with no workspace links.
- **Runtime:**
  - nothing is signed on load;
  - an explicit move signs exactly one valid 31126 event (real Schnorr
    signature, throwaway key, in-memory relays);
  - a second device resolves the Blobbi as away;
  - an expired presence moves nothing;
  - future-dated and forged events are ignored;
  - no socket is opened.
- **React:** `useWorldTravel` renders under jsdom
  (`null → pending → confirmed`).
- **Types:** strict `tsc` passes with library checks on, under both
  `bundler` and `nodenext` resolution.

**Apps** (throwaway clones of each `feat/m16-world-travel`, switched to the
RC tarballs; the app repositories are untouched):

| App | Typecheck | Lint | Tests | Build |
|---|---|---|---|---|
| Standalone (`e1c375c`) | ok | ok (1 existing warning in `TravelAnnouncer.tsx`) | 1809/1809 | ok |
| Pixel (`fd76440`) | ok | none | 1420/1421 | ok |

Pixel's one failure is the known CPU-time test
`world.test.ts › generates a default world quickly`:
- it also failed in the M16.2 gates with m16.4;
- it passes alone (12/12);
- it does not touch the kit.

When both suites ran at once, two more load timeouts appeared, both absent on
a sequential run: a Vitest worker RPC timeout in the Standalone, and Pixel's
`cinematic.test.ts`, which passes alone (24/24).

**Cross-device browsers** (`e2e/world-travel`, against the RC clones, with
dev servers started with `--force`):
- 68/68 checks pass;
- both apps' optimized bundles contain `WORLD_TRAVEL_KINDS_STATUS =
  "experimental"`, a value only the RC has;
- no socket other than the local relay was attempted.

## 7. Not validated

- **No physical device** (iPhone, Android).
- **No real NIP-07 extension or NIP-46 bunker.** The e2e uses a NIP-07 shim;
  the consumer test uses a throwaway random key.
- **No public relay was used for writing.** The kinds were researched with
  read-only queries only.

## 8. API notes (not blockers; frozen as they are at 0.11.0)

- **Timing constants are exported individually.** Changing a default later is
  a semver question.
- **`useWorldTravel` returns `snapshot: null` on its first render.**
- **`interact()` returns `'ignored'` while `pending`.**
- **Some world-travel helpers have generic names at the root** (`ACTIVE_MS`,
  `VISIBLE_GRACE_MS`, `isPlayedNow`, `isMeaningfulInput`, `KIND_DELETION`).
  They are documented as world-travel helpers.
