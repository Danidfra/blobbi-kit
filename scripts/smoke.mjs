/**
 * Node ESM smoke test for the built blobbi-kit packages.
 *
 * Verifies that the emitted `dist/` output is importable under *raw* Node ESM
 * resolution (i.e. via each package's `exports` map and real node_modules
 * linking), with no extensionless-import failures. Run after `npm run build`.
 *
 * The packages are ESM-only, so resolution is validated with dynamic `import()`
 * (the `import` export condition) rather than the CJS `require.resolve`.
 */

import { readFile, readdir } from 'node:fs/promises';

const runtimeEntries = [
  '@blobbi-kit/core',
  '@blobbi-kit/core/blobbi',
  '@blobbi-kit/core/missions',
  '@blobbi-kit/core/logger',
  '@blobbi-kit/core/progression',
  '@blobbi-kit/core/blobbi-decay',
  '@blobbi-kit/core/blobbi-segments',
  '@blobbi-kit/core/types/adult',
  '@blobbi-kit/core/types/shop',
  '@blobbi-kit/react',
  '@blobbi-kit/react/hooks/index',
  '@blobbi-kit/react/lib/index',
  '@blobbi-kit/react/lib/blobbi-xp',
  '@blobbi-kit/react/lib/blobbi-streak',
  '@blobbi-kit/react/lib/blobbi-actions',
  '@blobbi-kit/react/adapters/types',
];

// Type-only deep entries: assert they still load as ESM modules (types are
// fully covered by `npm run typecheck`).
const typeOnlyEntries = ['@blobbi-kit/core/types/blobbi'];

let failures = 0;

for (const entry of runtimeEntries) {
  try {
    const mod = await import(entry);
    const keys = Object.keys(mod);
    console.log(`  ok  import ${entry}  (${keys.length} named exports)`);
  } catch (err) {
    failures++;
    console.error(`  FAIL import ${entry}\n        ${err?.message ?? err}`);
  }
}

for (const entry of typeOnlyEntries) {
  try {
    await import(entry);
    console.log(`  ok  import ${entry}  (type-only entry, module loads)`);
  } catch (err) {
    failures++;
    console.error(`  FAIL import ${entry}\n        ${err?.message ?? err}`);
  }
}

// ─── Removed public API (0.3.0 storage, 0.4.0 economy) ────────────────────────
//
// The deprecated kind:11125 consumable-inventory surface was removed in 0.3.0,
// and the obsolete profile-Coin economy surface (the three onboarding economy
// constants and `BlobbonautProfile.coins`) in 0.4.0. Assert both are gone from
// the *built* output — the runtime named exports and the emitted `.d.ts`
// declarations — so a stale `dist/` or a reintroduced export can never ship.
// This is the packaged-artifact counterpart to the unit tests.

const REMOVED_RUNTIME_EXPORTS = [
  'parseStorageTags',
  'createStorageTags',
  'INITIAL_BLOBBONAUT_COINS',
  'BLOBBI_PREVIEW_REROLL_COST',
  'BLOBBI_ADOPTION_COST',
];

// Declaration patterns are anchored to *declaration shape*, not prose: the
// emitted `.d.ts` files retain JSDoc that legitimately discusses `storage` and
// `coins` tags, and a loose /\bstorage\s*:/ would match a sentence like
// "extension tags: preserved". `^\s*storage\??\s*:/m` only matches an actual
// interface member at the start of a line.
const REMOVED_TYPE_DECLARATIONS = [
  {
    file: 'packages/blobbi-core/dist/blobbi.d.ts',
    patterns: [
      /\bStorageItem\b/,
      /^\s*storage\??\s*:/m,
      /^\s*coins\??\s*:/m,
      /\bINITIAL_BLOBBONAUT_COINS\b/,
      /\bBLOBBI_PREVIEW_REROLL_COST\b/,
      /\bBLOBBI_ADOPTION_COST\b/,
    ],
  },
  // `index.d.ts` is an explicit `export { ... }` name list, so a reintroduced
  // export would appear here verbatim.
  {
    file: 'packages/blobbi-core/dist/index.d.ts',
    patterns: [
      /\bStorageItem\b/,
      /\bINITIAL_BLOBBONAUT_COINS\b/,
      /\bBLOBBI_PREVIEW_REROLL_COST\b/,
      /\bBLOBBI_ADOPTION_COST\b/,
    ],
  },
  {
    file: 'packages/blobbi-react/dist/hooks/useFreshBlobbiBeforeAction.d.ts',
    patterns: [/\bprofileStorage\b/, /\bStorageItem\b/],
  },
  {
    file: 'packages/blobbi-react/dist/hooks/useBlobbiIncubation.d.ts',
    patterns: [/\bprofileStorage\b/, /\bStorageItem\b/],
  },
  {
    file: 'packages/blobbi-react/dist/hooks/useBlobbiEvolve.d.ts',
    patterns: [/\bprofileStorage\b/, /\bStorageItem\b/],
  },
];

let exportFailures = 0;
for (const entry of [
  '@blobbi-kit/core',
  '@blobbi-kit/core/blobbi',
  '@blobbi-kit/react',
  '@blobbi-kit/react/hooks/index',
]) {
  let mod;
  try {
    mod = await import(entry);
  } catch (err) {
    exportFailures++;
    console.error(`  FAIL cannot import ${entry} for export check\n        ${err?.message ?? err}`);
    continue;
  }
  for (const name of REMOVED_RUNTIME_EXPORTS) {
    if (name in mod) {
      exportFailures++;
      console.error(`  FAIL ${entry} still exports removed symbol \`${name}\``);
    }
  }
}
failures += exportFailures;
if (exportFailures === 0) {
  console.log('  ok  built output exports no removed consumable-storage or economy API');
}

for (const { file, patterns } of REMOVED_TYPE_DECLARATIONS) {
  let dts;
  try {
    dts = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  } catch (err) {
    failures++;
    console.error(`  FAIL cannot read declaration ${file}\n        ${err?.message ?? err}`);
    continue;
  }
  const hits = patterns.filter((p) => p.test(dts));
  if (hits.length > 0) {
    failures++;
    console.error(`  FAIL ${file} still declares removed API: ${hits.join(', ')}`);
  } else {
    console.log(`  ok  ${file} declares no removed storage/economy API`);
  }
}
// ─── Packaged-artifact contract ───────────────────────────────────────────────
//
// Both packages once declared `peer @nostrify/nostrify`, and for a pre-1.0
// package the caret pins the minor — so every Nostrify minor release broke
// `npm install` for hosts, who suppressed the ERESOLVE with an npm `overrides`
// entry. Widening the range each time only reset the clock; the dependency was
// misclassified, not mis-ranged. Nostrify is now gone from both manifests and
// the kit declares its own protocol contracts in `@blobbi-kit/core`'s
// `nostr-protocol` module. The lesson stands: a dependency *classification*
// mistake is invisible to unit tests, so it needs assertions of its own.
//
// Division of labour, to keep exactly one owner per fact:
//
//   packages/*/src/package-manifest.test.ts  — what the manifests DECLARE
//     (versions, peer ranges and their semver semantics, files, exports,
//      lockstep). Pure data; no build or install required.
//
//   this file                                — what the built ARTIFACT and the
//     installed TREE actually do. Only checks that cannot run without `dist/`
//     or `node_modules/` belong here.
//
// So nothing below re-asserts a range or a version. Instead it cross-checks the
// two sides: every bare specifier the emitted JavaScript imports must be
// declared in the manifest. The manifest is therefore its own allowlist — a new
// runtime dependency cannot be added without declaring it — and a peer that is
// meant to be type-only must not appear in the emitted JavaScript at all.

const NOSTRIFY = '@nostrify/nostrify';

const fail = (msg) => {
  failures++;
  console.error(`  FAIL ${msg}`);
};

const readJson = async (path) =>
  JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

/**
 * Every bare (non-relative) specifier the emitted `.js` files import, reduced to
 * its package name. Covers the three module-loading forms esbuild can emit:
 * `import … from`, `export … from`, side-effect `import`, and dynamic
 * `import()`. Static forms are anchored to the start of a line, because an
 * unanchored /from ["']x["']/ also matches prose inside template literals
 * (e.g. `Repaired state from '${currentState}' to 'active'`).
 */
async function runtimeExternals(distDir) {
  const patterns = [
    /^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  const found = new Set();
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(`${dir}/${entry.name}`);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      const src = await readFile(new URL(`../${dir}/${entry.name}`, import.meta.url), 'utf8');
      for (const re of patterns) {
        for (const [, spec] of src.matchAll(re)) {
          if (spec.startsWith('.') || spec.startsWith('/')) continue; // intra-package
          const parts = spec.split('/');
          found.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
        }
      }
    }
  };
  await walk(distDir);
  return found;
}

for (const dir of ['packages/blobbi-core', 'packages/blobbi-react']) {
  let manifest;
  try {
    manifest = await readJson(`${dir}/package.json`);
  } catch (err) {
    fail(`cannot read ${dir}/package.json\n        ${err?.message ?? err}`);
    continue;
  }

  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const externals = await runtimeExternals(`${dir}/dist`);

  if (externals.size === 0) {
    fail(`${manifest.name} dist imports nothing — is dist/ built?`);
    continue;
  }

  // A bare import that no manifest field declares would resolve only by luck,
  // via whatever the host happens to have hoisted.
  const undeclared = [...externals].filter((spec) => !declared.has(spec));
  if (undeclared.length) {
    fail(
      `${manifest.name} dist imports ${undeclared.join(', ')} at runtime, ` +
        `but neither dependencies nor peerDependencies declares it`,
    );
  }

  // Nostrify is not a dependency of either package in any form. If it ever
  // reaches the emitted JavaScript it has become a real runtime coupling that
  // no manifest declares, and the host would have to supply a matching copy.
  if (externals.has(NOSTRIFY)) {
    fail(`${manifest.name} dist imports ${NOSTRIFY} at runtime, but declares no dependency on it`);
  }

  console.log(
    `  ok  ${manifest.name} dist imports only declared externals ` +
      `(${[...externals].sort().join(', ')}); no ${NOSTRIFY}`,
  );
}

// ─── Declaration-surface contract ─────────────────────────────────────────────
//
// The emitted JavaScript never referenced Nostrify even before this refactor —
// the imports were all `import type`. What actually forced consumers to install
// it was the *declaration* surface: `dist/**/*.d.ts` carried
// `import { NPool, NostrEvent } from '@nostrify/nostrify'`, so typechecking a
// consumer's app required the module to resolve. tsup's declaration rollup also
// emitted a bare `import '@nostrify/nostrify';` into modules that used no
// Nostrify symbol at all, widening the coupling past the files that imported one.
//
// This is therefore the assertion that proves the peer is genuinely gone rather
// than merely undeclared. Comments are stripped first and the remaining *code*
// is substring-scanned, rather than matching an import-statement regex: a stray
// bare import, a re-exported type, and an inlined `import('...')` type query all
// have to be caught, while a docblock that merely names the package in prose is
// not a module reference and must not trip the check.

/**
 * Remove `//` and block comments, leaving string literals intact.
 *
 * Deliberately small rather than a real parser: `.d.ts` output is generated, so
 * it has no regex literals or template-literal nesting to confuse the scan.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (quote) {
      if (ch === '\\') {
        out += ch + (next ?? '');
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

async function declarationFiles(distDir) {
  const found = [];
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(`${dir}/${entry.name}`);
        continue;
      }
      if (entry.name.endsWith('.d.ts')) found.push(`${dir}/${entry.name}`);
    }
  };
  await walk(distDir);
  return found;
}

for (const dir of ['packages/blobbi-core', 'packages/blobbi-react']) {
  const files = await declarationFiles(`${dir}/dist`);

  if (files.length === 0) {
    fail(`${dir}/dist contains no .d.ts files — is dist/ built?`);
    continue;
  }

  const offenders = [];
  for (const file of files) {
    const dts = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    if (stripComments(dts).includes(NOSTRIFY)) offenders.push(file);
  }

  if (offenders.length) {
    fail(
      `${dir} publishes declarations that reference ${NOSTRIFY}: ${offenders.join(', ')}. ` +
        `Consumers would need it installed to typecheck. Import the kit's own ` +
        `NostrEvent/NostrFilter/NostrQuerier from @blobbi-kit/core/nostr-protocol instead.`,
    );
  } else {
    console.log(
      `  ok  ${dir} declarations are Nostrify-free (${files.length} .d.ts files scanned)`,
    );
  }
}

// ─── Dev-fixture sanity: exactly one Nostrify in the workspace ───────────────
//
// Neither published package depends on Nostrify any more, so nothing here is a
// consumer-facing constraint. Nostrify remains a *root devDependency* purely as
// a compatibility fixture: `packages/blobbi-core/src/nostr-protocol.test.ts`
// typechecks the kit's own `NostrEvent`/`NostrFilter`/`NostrQuerier` against the
// real ones, which is what keeps the local declarations structurally
// interchangeable with the ecosystem.
//
// That fixture is only meaningful if there is exactly one copy to check against.
// `@nostrify/react` pins `@nostrify/nostrify` to an EXACT version
// (0.6.3 -> 0.53.0, 0.6.4 -> 0.54.0, 0.6.5 -> 0.54.1), so bumping one without the
// other leaves a second copy nested under `@nostrify/react` — and the compat test
// would then be validating against a version the React peer does not use.
//
// No version range is asserted. There is no longer one to assert.
{
  const root = await readJson(`node_modules/${NOSTRIFY}/package.json`).catch(() => null);

  if (!root) {
    fail(
      `${NOSTRIFY} is not installed — it is the dev-only compatibility fixture for ` +
        `nostr-protocol.test.ts. Run npm install.`,
    );
  } else {
    // Any copy nested one level deep under another installed package.
    const nested = [];
    for (const scope of await readdir(new URL('../node_modules/', import.meta.url), {
      withFileTypes: true,
    })) {
      if (!scope.isDirectory()) continue;
      const pkgDirs = scope.name.startsWith('@')
        ? (await readdir(new URL(`../node_modules/${scope.name}/`, import.meta.url))).map(
            (n) => `${scope.name}/${n}`,
          )
        : [scope.name];
      for (const pkgDir of pkgDirs) {
        const copy = await readJson(
          `node_modules/${pkgDir}/node_modules/${NOSTRIFY}/package.json`,
        ).catch(() => null);
        if (copy) nested.push(`${pkgDir} -> ${copy.version}`);
      }
    }

    if (nested.length) {
      fail(
        `duplicate ${NOSTRIFY} in the dev tree: root ${root.version}, also nested under ` +
          `${nested.join(', ')}. The compatibility fixture must match the copy ` +
          `@nostrify/react resolves; upgrade ${NOSTRIFY} and @nostrify/react together ` +
          `(@nostrify/react pins nostrify exactly).`,
      );
    } else {
      console.log(
        `  ok  exactly one ${NOSTRIFY} in the dev tree (${root.version}), ` +
          `usable as the type-compatibility fixture`,
      );
    }
  }
}

// ─── Published manifests declare no Nostrify ─────────────────────────────────
//
// The unit tests own this too (packages/*/src/package-manifest.test.ts), but
// asserting it here as well is cheap and keeps `npm run smoke` a complete
// standalone gate for the packaging contract.
for (const dir of ['packages/blobbi-core', 'packages/blobbi-react']) {
  const manifest = await readJson(`${dir}/package.json`).catch(() => null);
  if (!manifest) {
    fail(`cannot read ${dir}/package.json`);
    continue;
  }
  const fields = [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
    'devDependencies',
    'bundledDependencies',
    'bundleDependencies',
  ];
  const declaredIn = fields.filter((field) => {
    const value = manifest[field];
    const names = Array.isArray(value) ? value : Object.keys(value ?? {});
    return names.includes(NOSTRIFY);
  });

  if (declaredIn.length) {
    fail(`${manifest.name} declares ${NOSTRIFY} under ${declaredIn.join(', ')}; it must declare none`);
  } else {
    console.log(`  ok  ${manifest.name} declares no ${NOSTRIFY} dependency`);
  }
}

if (failures > 0) {
  console.error(`\nSmoke test FAILED: ${failures} check${failures === 1 ? '' : 's'} broken.`);
  process.exit(1);
}
console.log('\nSmoke test passed: all entries import/resolve under raw Node ESM.');
