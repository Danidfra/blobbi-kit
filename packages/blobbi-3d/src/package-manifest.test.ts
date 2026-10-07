import { describe, it, expect } from 'vitest';
import { satisfies } from 'semver';

// Imported rather than read from disk: `import.meta.url` is not a file URL under
// the jsdom test environment, and this way tsc checks the shape too.
import manifestJson from '../package.json';
import rendererManifestJson from '../../blobbi-renderer/package.json';

/**
 * Manifest contract test for the *published* shape of `@blobbi-kit/3d`.
 *
 * Companion to the core and react manifest tests. One invariant: this package
 * builds its character from `@blobbi-kit/renderer/procedural`, the V3 engine,
 * and that subpath exists only from renderer 0.6.0. The dependency range once
 * read `*`, which npm publishes verbatim; a host already holding renderer
 * 0.4.0 satisfied it and the package failed to import
 * (`ERR_PACKAGE_PATH_NOT_EXPORTED` on `./procedural`). The range must name the
 * renderer being released, exactly as react pins its core peer.
 */

interface Manifest {
  name: string;
  version: string;
  exports: Record<string, Record<string, string>>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const manifest: Manifest = manifestJson;
const rendererManifest: Manifest = rendererManifestJson;

const RENDERER = '@blobbi-kit/renderer';

describe('@blobbi-kit/3d package manifest', () => {
  it('is the expected package at the expected version', () => {
    expect(manifest.name).toBe('@blobbi-kit/3d');
    expect(manifest.version).toBe('0.1.1');
  });

  describe(`depends on a ${RENDERER} that ships the procedural engine`, () => {
    it('declares the renderer as a regular dependency, not a peer', () => {
      // The renderer is the single implementation of the V3 algorithm and is
      // pure data in, data out; this package needs its own copy to resolve,
      // whatever the host draws with.
      expect(manifest.dependencies?.[RENDERER]).toBeDefined();
      expect(manifest.peerDependencies?.[RENDERER]).toBeUndefined();
    });

    it('pins the renderer to the version being released', () => {
      expect(manifest.dependencies?.[RENDERER]).toBe(`^${rendererManifest.version}`);
      expect(satisfies(rendererManifest.version, manifest.dependencies![RENDERER])).toBe(true);
    });

    it('rejects every renderer that has no `./procedural` subpath', () => {
      // 0.4.0 is the last renderer on the registry before the subpath existed.
      for (const old of ['0.4.0', '0.5.0']) {
        expect(satisfies(old, manifest.dependencies![RENDERER])).toBe(false);
      }
    });

    it('names a renderer whose manifest actually exports `./procedural`', () => {
      expect(rendererManifest.exports['./procedural']).toEqual({
        types: './dist/procedural/index.d.ts',
        import: './dist/procedural/index.js',
      });
    });
  });
});
