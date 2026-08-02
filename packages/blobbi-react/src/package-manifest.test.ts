import { describe, it, expect } from 'vitest';
import { satisfies } from 'semver';

// Imported rather than read from disk: `import.meta.url` is not a file URL under
// the jsdom test environment, and this way tsc checks the shape too.
import reactManifestJson from '../package.json';
import coreManifestJson from '../../blobbi-core/package.json';

/**
 * Manifest contract tests for the *published* shape of `@blobbi-kit/react`.
 *
 * Companion to `packages/blobbi-core/src/package-manifest.test.ts`; see that file
 * for why these exist. The react package carries four peers instead of one, so
 * the additional invariant here is that **every** host-owned singleton stays a
 * peer: React, TanStack Query, `@nostrify/react`, and `@blobbi-kit/core`. Any of
 * them slipping into `dependencies` would let npm install a duplicate copy and
 * break hook context / cache identity at runtime.
 */

interface Manifest {
  name: string;
  version: string;
  files: string[];
  sideEffects: boolean;
  publishConfig?: { access?: string };
  exports: Record<string, Record<string, string>>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const manifest: Manifest = reactManifestJson;
const coreManifest: Manifest = coreManifestJson;

const NOSTRIFY = '@nostrify/nostrify';
const EXPECTED_NOSTRIFY_PEER = '^0.53.0 || ^0.54.0';

describe('@blobbi-kit/react package manifest', () => {
  it('is the expected package at the expected version', () => {
    expect(manifest.name).toBe('@blobbi-kit/react');
    expect(manifest.version).toBe('0.4.0');
  });

  describe('peer dependency set', () => {
    it('declares exactly the expected peers and ranges', () => {
      expect(manifest.peerDependencies).toEqual({
        '@blobbi-kit/core': '^0.4.0',
        '@nostrify/nostrify': EXPECTED_NOSTRIFY_PEER,
        '@nostrify/react': '^0.6.3',
        '@tanstack/react-query': '^5.56.2',
        react: '^18.0.0 || ^19.0.0',
      });
    });

    it('declares no regular runtime dependencies at all', () => {
      // Everything this package imports at runtime (@blobbi-kit/core,
      // @nostrify/react, @tanstack/react-query, react) is host-supplied.
      expect(manifest.dependencies ?? {}).toEqual({});
    });
  });

  describe('React is a peer dependency, not a regular dependency', () => {
    it.each(['react', 'react-dom'])('does not declare %s as a regular dependency', (name) => {
      expect(manifest.dependencies ?? {}).not.toHaveProperty(name);
    });

    it('declares react under peerDependencies', () => {
      expect(manifest.peerDependencies?.react).toBe('^18.0.0 || ^19.0.0');
    });

    it.each(['18.0.0', '18.3.1', '19.0.0', '19.2.4'])('accepts React %s', (version) => {
      expect(satisfies(version, manifest.peerDependencies!.react)).toBe(true);
    });

    it('rejects React 17', () => {
      expect(satisfies('17.0.2', manifest.peerDependencies!.react)).toBe(false);
    });
  });

  describe('Nostrify is a peer dependency, not a regular dependency', () => {
    it('does not declare any @nostrify/* package as a regular dependency', () => {
      const regular = Object.keys(manifest.dependencies ?? {});
      expect(regular.filter((name) => name.startsWith('@nostrify/'))).toEqual([]);
    });

    it.each(['0.53.0', '0.53.9', '0.54.0', '0.54.7'])('accepts Nostrify %s', (version) => {
      expect(satisfies(version, EXPECTED_NOSTRIFY_PEER)).toBe(true);
    });

    it.each(['0.52.9', '0.55.0', '1.0.0'])('rejects Nostrify %s', (version) => {
      expect(satisfies(version, EXPECTED_NOSTRIFY_PEER)).toBe(false);
    });

    it('accepts the @nostrify/react versions in use without widening', () => {
      const range = manifest.peerDependencies!['@nostrify/react'];
      expect(range).toBe('^0.6.3');
      expect(satisfies('0.6.3', range)).toBe(true);
      expect(satisfies('0.6.4', range)).toBe(true);
      expect(satisfies('0.7.0', range)).toBe(false);
    });

    it('accepts current TanStack Query without widening', () => {
      const range = manifest.peerDependencies!['@tanstack/react-query'];
      expect(range).toBe('^5.56.2');
      expect(satisfies('5.75.1', range)).toBe(true);
      expect(satisfies('5.101.2', range)).toBe(true);
    });
  });

  describe('lockstep with @blobbi-kit/core', () => {
    it('is released at the same version as core', () => {
      expect(manifest.version).toBe(coreManifest.version);
    });

    it('pins the core peer to the version being released', () => {
      // The economy removal (0.4.0) is a breaking change that lives in core,
      // so pairing this react release with an older core would silently
      // reintroduce the removed Coin surface through the shared types.
      expect(manifest.peerDependencies?.['@blobbi-kit/core']).toBe(
        `^${coreManifest.version}`,
      );
      expect(satisfies(coreManifest.version, manifest.peerDependencies!['@blobbi-kit/core'])).toBe(
        true,
      );
      expect(satisfies('0.3.1', manifest.peerDependencies!['@blobbi-kit/core'])).toBe(false);
    });

    it('declares the same Nostrify peer range as core', () => {
      expect(manifest.peerDependencies?.[NOSTRIFY]).toBe(
        coreManifest.peerDependencies?.[NOSTRIFY],
      );
    });

    it('links core only as a workspace devDependency', () => {
      expect(manifest.devDependencies).toEqual({ '@blobbi-kit/core': '*' });
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
