import { describe, it, expect } from 'vitest';
import { satisfies } from 'semver';

// Imported rather than read from disk: `import.meta.url` is not a file URL under
// the jsdom test environment, and this way tsc checks the shape too.
import coreManifest from '../package.json';

/**
 * Manifest contract tests for the *published* shape of `@blobbi-kit/core`.
 *
 * These assert packaging, not behavior. They exist because 0.3.0 shipped a peer
 * range (`@nostrify/nostrify: ^0.53.0`) that excluded Nostrify 0.54 — for a
 * pre-1.0 package the caret pins the minor, so `^0.53.0` is `>=0.53.0 <0.54.0`.
 * Host apps had to paper over the resulting ERESOLVE with an npm `overrides`
 * entry. A unit test can't catch that; only the manifest can.
 *
 * The invariants locked in here:
 *   1. Nostrify is a PEER, never a regular/bundled dependency. Core imports it
 *      `import type` only, so a host must be free to supply its own copy and
 *      there must never be a second one in the tree.
 *   2. The peer range accepts both supported Nostrify lines (0.53.x, 0.54.x) and
 *      still REJECTS the next unreviewed minor (0.55.0). A blanket
 *      `>=0.53.0 <1.0.0` would silently accept a future breaking change.
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
const EXPECTED_NOSTRIFY_PEER = '^0.53.0 || ^0.54.0';

describe('@blobbi-kit/core package manifest', () => {
  it('is the expected package at the expected version', () => {
    expect(manifest.name).toBe('@blobbi-kit/core');
    expect(manifest.version).toBe('0.3.1');
  });

  describe('Nostrify is a peer dependency, not a regular dependency', () => {
    it('declares Nostrify under peerDependencies', () => {
      expect(manifest.peerDependencies?.[NOSTRIFY]).toBeDefined();
    });

    it('does not declare Nostrify as a regular or dev dependency', () => {
      // A regular dependency would let npm install a *second* Nostrify nested
      // under core, giving the host two copies of NPool/NostrEvent.
      expect(manifest.dependencies ?? {}).not.toHaveProperty(NOSTRIFY);
      expect(manifest.devDependencies ?? {}).not.toHaveProperty(NOSTRIFY);
    });

    it('does not declare any @nostrify/* package as a regular dependency', () => {
      const regular = Object.keys(manifest.dependencies ?? {});
      expect(regular.filter((name) => name.startsWith('@nostrify/'))).toEqual([]);
    });
  });

  describe('Nostrify peer range', () => {
    it('is exactly the reviewed union range', () => {
      expect(manifest.peerDependencies?.[NOSTRIFY]).toBe(EXPECTED_NOSTRIFY_PEER);
    });

    it.each(['0.53.0', '0.53.1', '0.53.9', '0.54.0', '0.54.1', '0.54.7'])(
      'accepts Nostrify %s',
      (version) => {
        expect(satisfies(version, EXPECTED_NOSTRIFY_PEER)).toBe(true);
      },
    );

    it.each(['0.52.9', '0.55.0', '0.55.1', '1.0.0'])(
      'rejects Nostrify %s',
      (version) => {
        // 0.55.0 in particular: the range must not blanket-accept the next
        // pre-1.0 minor, which is where breaking changes land.
        expect(satisfies(version, EXPECTED_NOSTRIFY_PEER)).toBe(false);
      },
    );
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
