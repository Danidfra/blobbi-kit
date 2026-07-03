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

const runtimeEntries = [
  '@blobbi/core',
  '@blobbi/core/blobbi',
  '@blobbi/core/missions',
  '@blobbi/core/logger',
  '@blobbi/core/progression',
  '@blobbi/core/blobbi-decay',
  '@blobbi/core/blobbi-segments',
  '@blobbi/core/types/adult',
  '@blobbi/core/types/shop',
  '@blobbi/react',
  '@blobbi/react/hooks/index',
  '@blobbi/react/lib/index',
  '@blobbi/react/lib/blobbi-xp',
  '@blobbi/react/lib/blobbi-streak',
  '@blobbi/react/lib/blobbi-actions',
  '@blobbi/react/adapters/types',
];

// Type-only deep entries: assert they still load as ESM modules (types are
// fully covered by `npm run typecheck`).
const typeOnlyEntries = ['@blobbi/core/types/blobbi'];

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

if (failures > 0) {
  console.error(`\nSmoke test FAILED: ${failures} entr${failures === 1 ? 'y' : 'ies'} broken.`);
  process.exit(1);
}
console.log('\nSmoke test passed: all entries import/resolve under raw Node ESM.');
