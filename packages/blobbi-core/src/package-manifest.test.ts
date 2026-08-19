import { describe, it, expect } from 'vitest';
import { satisfies } from 'semver';

// Imported rather than read from disk: `import.meta.url` is not a file URL under
// the jsdom test environment, and this way tsc checks the shape too.
import coreManifest from '../package.json';

/**
 * Manifest contract tests for the *published* shape of `@blobbi-kit/core`.
 *
 * These assert packaging, not behavior.
 *
 * History worth keeping, because it is why this file exists: core used to
 * declare `peerDependencies["@nostrify/nostrify"]`, first as `^0.53.0` and then
 * as `^0.53.0 || ^0.54.0`. For a pre-1.0 package the caret pins the minor, so
 * every Nostrify minor release broke `npm install` for host apps, who papered
 * over the ERESOLVE with an npm `overrides` entry. Widening the range each time
 * only reset the clock.
 *
 * The actual defect was a misclassification, not a bad range: core imports no
 * Nostrify symbol at runtime and never did. It now declares its own
 * protocol-level contracts in `./nostr-protocol` (`NostrEvent`, `NostrFilter`,
 * `NostrQuerier`), so the dependency is gone rather than re-ranged.
 *
 * The invariants locked in here:
 *   1. `@nostrify/nostrify` appears in NO host-facing dependency field. Not as a
 *      peer, not as a regular dependency, not optional, not bundled. A range is
 *      never the right answer for a package core does not use.
 *   2. No `@nostrify/*` package is a regular dependency either.
 *   3. `@noble/hashes` stays the sole regular dependency, pinned to ^1.x.
 *   4. The packaged file list / exports map stay correct.
 */

const manifest: {
  name: string;
  version: string;
  files: string[];
  sideEffects: boolean;
  publishConfig?: { access?: string };
  exports: Record<string, Record<string, string>>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} = coreManifest;

const NOSTRIFY = '@nostrify/nostrify';

/**
 * Every manifest field npm reads when installing this package into a host.
 * `devDependencies` is deliberately included: it is not installed for consumers,
 * but core declaring one would still signal that the package expects Nostrify.
 */
const HOST_FACING_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'devDependencies',
  'bundledDependencies',
  'bundleDependencies',
] as const;

describe('@blobbi-kit/core package manifest', () => {
  it('is the expected package at the expected version', () => {
    expect(manifest.name).toBe('@blobbi-kit/core');
    expect(manifest.version).toBe('0.5.0');
  });

  describe('core does not depend on Nostrify at all', () => {
    it.each(HOST_FACING_FIELDS)('does not declare Nostrify under %s', (field) => {
      const declared = (manifest as unknown as Record<string, unknown>)[field];
      // Array form (bundledDependencies) and object form both have to be clean.
      const names = Array.isArray(declared)
        ? declared
        : Object.keys((declared as Record<string, string>) ?? {});
      expect(names).not.toContain(NOSTRIFY);
    });

    it('declares no @nostrify/* package in any host-facing field', () => {
      // Core is framework- and library-agnostic: the React integration (and its
      // genuine @nostrify/react peer) lives in @blobbi-kit/react.
      const names = HOST_FACING_FIELDS.flatMap((field) => {
        const declared = (manifest as unknown as Record<string, unknown>)[field];
        return Array.isArray(declared)
          ? declared
          : Object.keys((declared as Record<string, string>) ?? {});
      });
      expect(names.filter((name) => name.startsWith('@nostrify/'))).toEqual([]);
    });

    it('declares no peer dependencies whatsoever', () => {
      // Nothing core uses is a host-owned singleton, so there is no peer to
      // negotiate. If a peer is ever added, it needs its own justification here.
      expect(manifest.peerDependencies).toBeUndefined();
    });

    it('imposes no Nostrify version constraint on hosts', () => {
      // The point of the whole exercise. A host on 0.53.x, 0.55.0, a future
      // 1.x, or no Nostrify at all resolves identically, because there is no
      // range left to satisfy — and so no npm `overrides` entry to write.
      const constraint =
        manifest.peerDependencies?.[NOSTRIFY] ??
        manifest.dependencies?.[NOSTRIFY] ??
        manifest.devDependencies?.[NOSTRIFY];
      expect(constraint).toBeUndefined();
    });
  });

  describe('regular dependencies', () => {
    it('depends only on @noble/hashes', () => {
      expect(manifest.dependencies).toEqual({ '@noble/hashes': '^1.3.1' });
    });

    it('keeps @noble/hashes on the 1.x line', () => {
      // v2.x removed the `./sha256` export subpath that core imports, so this
      // range must NOT be widened to 2.x.
      const range = manifest.dependencies?.['@noble/hashes'] as string;
      expect(satisfies('1.8.0', range)).toBe(true);
      expect(satisfies('2.0.1', range)).toBe(false);
    });
  });

  describe('packaged contents', () => {
    it('ships only dist and the license', () => {
      expect(manifest.files).toEqual(['dist', 'LICENSE']);
    });

    it('exposes the barrel and deep subpath exports as ESM with types', () => {
      expect(manifest.exports['.']).toEqual({
        types: './dist/index.d.ts',
        import: './dist/index.js',
      });
      expect(manifest.exports['./*']).toEqual({
        types: './dist/*.d.ts',
        import: './dist/*.js',
      });
    });

    it('is side-effect free and publicly published', () => {
      expect(manifest.sideEffects).toBe(false);
      expect(manifest.publishConfig?.access).toBe('public');
    });
  });
});
