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
import { satisfies } from 'semver';

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

// ─── Removed public API (0.3.0) ───────────────────────────────────────────────
//
// The deprecated kind:11125 consumable-inventory surface was removed. Assert it
// is gone from the *built* output — both the runtime named exports and the
// emitted `.d.ts` declarations — so a stale `dist/` or a reintroduced export can
// never ship. This is the packaged-artifact counterpart to the unit tests.

const REMOVED_RUNTIME_EXPORTS = ['parseStorageTags', 'createStorageTags'];

// Declaration patterns are anchored to *declaration shape*, not prose: the
// emitted `.d.ts` files retain JSDoc that legitimately discusses `storage`
// tags, and a loose /\bstorage\s*:/ would match a sentence like
// "extension tags: preserved". `^\s*storage\??\s*:/m` only matches an actual
// interface member at the start of a line.
const REMOVED_TYPE_DECLARATIONS = [
  {
    file: 'packages/blobbi-core/dist/blobbi.d.ts',
    patterns: [/\bStorageItem\b/, /^\s*storage\??\s*:/m],
  },
  // `index.d.ts` is an explicit `export { ... }` name list, so a reintroduced
  // export would appear here verbatim.
  { file: 'packages/blobbi-core/dist/index.d.ts', patterns: [/\bStorageItem\b/] },
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
  console.log('  ok  built output exports no removed consumable-storage helpers');
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
    console.log(`  ok  ${file} declares no removed consumable-storage API`);
  }
}
// ─── Packaged-artifact contract ───────────────────────────────────────────────
//
// 0.3.0 shipped `peer @nostrify/nostrify: ^0.53.0`, which for a pre-1.0 package
// means `>=0.53.0 <0.54.0` and so excluded Nostrify 0.54; hosts had to suppress
// the resulting ERESOLVE with an npm `overrides` entry. The lesson is that a
// dependency *classification* mistake is invisible to unit tests, so it needs an
// assertion of its own.
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

  // Nostrify is consumed via `import type` only. If it ever reaches the emitted
  // JavaScript it has become a real runtime coupling, and the host could end up
  // with a second copy — `NPool` declares `private` members, so two copies are
  // nominally distinct types and break assignability.
  if (externals.has(NOSTRIFY)) {
    fail(`${manifest.name} dist imports ${NOSTRIFY} at runtime; it must remain type-only`);
  }

  console.log(
    `  ok  ${manifest.name} dist imports only declared externals ` +
      `(${[...externals].sort().join(', ')}); ${NOSTRIFY} type-only`,
  );
}

// ─── Installed-tree sanity: exactly one Nostrify ──────────────────────────────
//
// `@nostrify/react` pins `@nostrify/nostrify` to an EXACT version (0.6.3→0.53.0,
// 0.6.4→0.54.0), so the two must be upgraded as a matched pair. Bumping one alone
// leaves a second Nostrify nested under `@nostrify/react`, and because `NPool`
// declares `private` members it is nominally typed — the duplicate then surfaces
// as a pile of baffling `TS2345: NPool is not assignable to NPool` errors that
// mimic a version incompatibility. Fail with the real reason instead.
//
// The range is read from core's manifest rather than restated, so this stays
// correct when the peer range next changes.
{
  const declaredRange = (await readJson('packages/blobbi-core/package.json'))
    .peerDependencies?.[NOSTRIFY];
  const root = await readJson(`node_modules/${NOSTRIFY}/package.json`).catch(() => null);

  if (!root) {
    fail(`${NOSTRIFY} is not installed — run npm install`);
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
        `duplicate ${NOSTRIFY} in the installed tree: root ${root.version}, also nested under ` +
          `${nested.join(', ')}. Upgrade ${NOSTRIFY} and @nostrify/react together ` +
          `(@nostrify/react pins nostrify exactly).`,
      );
    } else if (!satisfies(root.version, declaredRange)) {
      fail(
        `installed ${NOSTRIFY} ${root.version} is outside the declared peer range ` +
          `"${declaredRange}", so typecheck/test are not validating a supported version`,
      );
    } else {
      console.log(
        `  ok  exactly one ${NOSTRIFY} installed (${root.version}), within the declared peer range "${declaredRange}"`,
      );
    }
  }
}

if (failures > 0) {
  console.error(`\nSmoke test FAILED: ${failures} check${failures === 1 ? '' : 's'} broken.`);
  process.exit(1);
}
console.log('\nSmoke test passed: all entries import/resolve under raw Node ESM.');
