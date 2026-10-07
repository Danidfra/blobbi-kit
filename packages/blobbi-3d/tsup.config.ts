import { defineConfig } from 'tsup';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const srcRoot = join(process.cwd(), 'src');

/** Turn a bare relative specifier into an explicit ESM path with `.js` (see the renderer's tsup config). */
function withExtension(spec: string, importerDir: string): string {
  if (/\.(?:js|mjs|cjs|json)$/.test(spec)) return spec;
  const abs = join(importerDir, spec);
  if (existsSync(`${abs}.ts`) || existsSync(`${abs}.tsx`)) return `${spec}.js`;
  try {
    if (statSync(abs).isDirectory()) return `${spec}/index.js`;
  } catch {
    /* fall through */
  }
  return `${spec}.js`;
}

/**
 * Emit each source file 1:1 with explicit `.js` relative specifiers. The
 * bare externals this package emits are `@babylonjs/core` (and its deep
 * paths, a peer) and `@blobbi-kit/renderer` (and its `procedural` subpath).
 */
const emitAsFiles = {
  name: 'blobbi-emit-as-files',
  setup(build: {
    onResolve: (opts: { filter: RegExp }, cb: (args: { path: string; importer: string; kind: string }) => { path: string; external: boolean } | undefined) => void;
  }) {
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (args.kind === 'entry-point') return undefined;
      return { path: withExtension(args.path, dirname(args.importer)), external: true };
    });
    // Babylon's deep paths are written without `.js` (bundlers resolve them);
    // raw Node ESM needs the extension, so the emitted output carries it.
    // (esbuild's `external` list would win over this hook and keep the bare path, so Babylon is not listed there.)
    build.onResolve({ filter: /^@babylonjs\/core(\/|$)/ }, (args) => ({ path: args.path.includes('/', 11) && !/\.js$/.test(args.path) ? `${args.path}.js` : args.path, external: true }));
  },
};

/** Test-only modules, never shipped. */
const TEST_SUPPORT = new Set(['test-seeds.ts']);

function entries(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !TEST_SUPPORT.has(e.name)) out.push(full);
    }
  };
  walk(srcRoot);
  return out;
}

export default defineConfig({
  entry: entries(),
  format: ['esm'],
  bundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'es2020',
  // Babylon's deep paths are externalized (and given `.js`) by the plugin above, so they are not listed here.
  external: [/^@blobbi-kit\/renderer(\/|$)/],
  // tsup externalizes every peer itself before user plugins run; opting Babylon out of that lets the plugin above
  // externalize it WITH the extension.
  noExternal: [/^@babylonjs\/core(\/|$)/],
  esbuildPlugins: [emitAsFiles],
});
