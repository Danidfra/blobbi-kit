import { defineConfig } from 'tsup';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const srcRoot = join(process.cwd(), 'src');

/**
 * Turn a bare relative specifier into an explicit ESM path with `.js`.
 * Handles directory imports (`./svg` -> `./svg/index.js`) by probing the
 * corresponding source tree, so raw Node ESM resolution never depends on
 * extension/directory guessing.
 */
function withExtension(spec: string, importerDir: string): string {
  // Only a REAL module extension counts. A dotted basename such as
  // `./types/adult.types` has `extname() === '.types'` and still needs `.js`.
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
 * Emit each source file 1:1 (no duplication, shared singletons preserved) while
 * rewriting intra-package relative specifiers to explicit `.js` paths for raw
 * Node ESM. The only bare externals this package may emit are `react` and
 * `react/jsx-runtime`, resolved from the consumer's node_modules; the smoke
 * test and `package-purity.test.ts` both assert that list.
 */
const emitAsFiles = {
  name: 'blobbi-emit-as-files',
  setup(build: {
    onResolve: (
      opts: { filter: RegExp },
      cb: (args: { path: string; importer: string; kind: string }) =>
        | { path: string; external: boolean }
        | undefined,
    ) => void;
  }) {
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (args.kind === 'entry-point') return undefined;
      return { path: withExtension(args.path, dirname(args.importer)), external: true };
    });
  },
};

function entries(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (
        /\.tsx?$/.test(e.name) &&
        !/\.test\.tsx?$/.test(e.name) &&
        !/\.d\.ts$/.test(e.name)
      ) {
        out.push(full);
      }
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
  external: ['react', 'react/jsx-runtime'],
  esbuildPlugins: [emitAsFiles],
});
