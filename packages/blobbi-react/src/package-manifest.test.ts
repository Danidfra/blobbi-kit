import { describe, it, expect } from 'vitest';
import { satisfies } from 'semver';

// Imported rather than read from disk: `import.meta.url` is not a file URL under
// the jsdom test environment, and this way tsc checks the shape too.
import reactManifestJson from '../package.json';
import coreManifestJson from '../../blobbi-core/package.json';

/**
 * Manifest contract tests for the *published* shape of `@blobbi-kit/react`.
 *
 * Companion to `packages/blobbi-core/src/package-manifest.test.ts`; see that
 * file for the history behind them.
 *
 * Two invariants, and the distinction between them is the whole point:
 *
 *   1. Every host-owned *singleton* stays a peer — React, TanStack Query,
 *      `@nostrify/react`, and `@blobbi-kit/core`. Each is genuinely shared with
 *      the host: this package calls `useNostr()` at runtime and must read the
 *      host's provider context, so a duplicate copy in `dependencies` would
 *      break hook context and cache identity.
 *
 *   2. `@nostrify/nostrify` is NOT one of them and must appear nowhere. It was
 *      only ever a type-only import, and the types now come from
 *      `@blobbi-kit/core/nostr-protocol`. It also arrives transitively anyway:
 *      `@nostrify/react` declares it as an exact-version dependency, so the kit
 *      declaring a second, narrower range could only ever create conflicts it
 *      had no standing to impose.
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
const NOSTRIFY_REACT = '@nostrify/react';

/** Every manifest field npm reads when installing this package into a host. */
const HOST_FACING_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'devDependencies',
  'bundledDependencies',
  'bundleDependencies',
] as const;

describe('@blobbi-kit/react package manifest', () => {
  it('is the expected package at the expected version', () => {
    expect(manifest.name).toBe('@blobbi-kit/react');
    expect(manifest.version).toBe('0.5.0');
  });

  describe('peer dependency set', () => {
    it('declares exactly the expected peers and ranges', () => {
      expect(manifest.peerDependencies).toEqual({
        '@blobbi-kit/core': '^0.5.0',
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

  describe('@nostrify/nostrify is not a dependency of any kind', () => {
    it.each(HOST_FACING_FIELDS)('does not declare Nostrify under %s', (field) => {
      const declared = (manifest as unknown as Record<string, unknown>)[field];
      const names = Array.isArray(declared)
        ? declared
        : Object.keys((declared as Record<string, string>) ?? {});
      expect(names).not.toContain(NOSTRIFY);
    });

    it('imposes no Nostrify version constraint on hosts', () => {
      // A host on Nostrify 0.55.0 (or any other version) must install cleanly
      // without an npm `overrides` entry. The kit has no standing to constrain
      // a package it does not import.
      const constraint =
        manifest.peerDependencies?.[NOSTRIFY] ??
        manifest.dependencies?.[NOSTRIFY] ??
        manifest.devDependencies?.[NOSTRIFY];
      expect(constraint).toBeUndefined();
    });

    it('declares @nostrify/react as the only @nostrify/* package it needs', () => {
      const names = HOST_FACING_FIELDS.flatMap((field) => {
        const declared = (manifest as unknown as Record<string, unknown>)[field];
        return Array.isArray(declared)
          ? declared
          : Object.keys((declared as Record<string, string>) ?? {});
      });
      expect(names.filter((name) => name.startsWith('@nostrify/'))).toEqual([NOSTRIFY_REACT]);
    });
  });

  describe('@nostrify/react is a genuine runtime peer', () => {
    it('is declared as a peer, never a regular dependency', () => {
      // This package calls `useNostr()` at runtime and must resolve the host's
      // NostrProvider context, so the host has to own the single copy.
      expect(manifest.peerDependencies?.[NOSTRIFY_REACT]).toBe('^0.6.3');
      expect(manifest.dependencies ?? {}).not.toHaveProperty(NOSTRIFY_REACT);
    });

    it.each(['0.6.3', '0.6.4', '0.6.5', '0.6.7'])(
      'accepts @nostrify/react %s',
      (version) => {
        // 0.6.7 is the version Ditto ships; it must resolve without widening.
        expect(satisfies(version, manifest.peerDependencies![NOSTRIFY_REACT])).toBe(true);
      },
    );

    it('does not blanket-accept the next @nostrify/react minor', () => {
      // Unlike Nostrify, this one is a real runtime contract: `useNostr`'s
      // context shape is API this package consumes, so 0.7.0 needs a review.
      expect(satisfies('0.7.0', manifest.peerDependencies![NOSTRIFY_REACT])).toBe(false);
    });
  });

  describe('other host-owned singletons', () => {
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
      // Every breaking change so far has lived in core and reached this
      // package through the shared types — 0.4.0 removed the Coin surface,
      // 0.5.0 moved the Nostr protocol types out of Nostrify. Pairing this
      // release with an older core would silently reintroduce the old contract,
      // so the peer must pin the version being released.
      expect(manifest.peerDependencies?.['@blobbi-kit/core']).toBe(
        `^${coreManifest.version}`,
      );
      expect(satisfies(coreManifest.version, manifest.peerDependencies!['@blobbi-kit/core'])).toBe(
        true,
      );
      expect(satisfies('0.4.0', manifest.peerDependencies!['@blobbi-kit/core'])).toBe(false);
    });

    it('agrees with core that Nostrify is not a dependency', () => {
      // Both packages source their Nostr types from core's `nostr-protocol`
      // module, so neither may reintroduce a Nostrify constraint on its own.
      expect(manifest.peerDependencies?.[NOSTRIFY]).toBeUndefined();
      expect(coreManifest.peerDependencies?.[NOSTRIFY]).toBeUndefined();
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
