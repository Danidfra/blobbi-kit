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

import { readFile } from 'node:fs/promises';

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

if (failures > 0) {
  console.error(`\nSmoke test FAILED: ${failures} check${failures === 1 ? '' : 's'} broken.`);
  process.exit(1);
}
console.log('\nSmoke test passed: all entries import/resolve under raw Node ESM.');
