# blobbi-kit

The shared package monorepo for [Blobbi](https://github.com/blobbi) — the portable
domain logic and React hooks that power Blobbi across host apps (Ditto, Blobbi
Island, and future clients).

## Packages

| Package | Description | Environment |
| --- | --- | --- |
| [`@blobbi/core`](./packages/blobbi-core) | Framework-agnostic core domain logic (kinds, addressing, seed/identity, decay, missions, progression). | **DOM-free.** Runs in Node, React Native, or tests without a DOM. |
| [`@blobbi/react`](./packages/blobbi-react) | App-agnostic React hooks built on `@blobbi/core`. | **Browser-only.** Many hooks rely on `window`, `localStorage`, and `document.visibilityState`. |

## Status

These packages are currently **private and not published**. The first validation
target is local `file:` consumption from the host apps (Ditto and Blobbi Island).
The long-term target registry is **npm public** (`@blobbi/core`, `@blobbi/react`),
but publishing has not happened yet.

## Layout

```
blobbi-kit/
├── package.json          # npm-workspaces root (private, never published)
├── tsconfig.base.json    # shared strict compiler options
├── tsconfig.json         # editor/typecheck aggregate
├── scripts/smoke.mjs     # raw Node ESM import smoke test
└── packages/
    ├── blobbi-core/
    └── blobbi-react/
```

## Development

Requires Node `>=22`.

```sh
npm install        # links @blobbi/core into @blobbi/react via workspaces
npm run build      # builds core first, then react (tsup, ESM + .d.ts)
npm run typecheck  # tsc --noEmit for both packages
npm run test       # vitest (package unit tests)
npm run smoke      # verify dist/ imports under raw Node ESM (run after build)
npm run clean      # remove dist/ outputs
```

## Build

Both packages are built with [tsup](https://tsup.egoist.dev/):

- **ESM only** (no CJS yet).
- Emits `.d.ts` type declarations and source maps.
- Each source module is emitted 1:1, so deep imports
  (`@blobbi/core/blobbi`, `@blobbi/react/hooks/index`, …) keep working.
- Relative and self-referential imports are rewritten to explicit `.js`
  specifiers so the output is importable under **raw Node ESM** with no
  extensionless-import failures.

## Consuming locally (before publish)

Host apps can depend on the built packages via `file:` while validating:

```jsonc
// host app package.json
{
  "dependencies": {
    "@blobbi/core": "file:../blobbi-kit/packages/blobbi-core",
    "@blobbi/react": "file:../blobbi-kit/packages/blobbi-react"
  }
}
```

Run `npm run build` in blobbi-kit first so `dist/` exists.
