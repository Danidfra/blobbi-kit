import { defineConfig } from 'tsup';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';

const srcRoot = join(process.cwd(), 'src');

/**
 * Turn a bare relative specifier into an explicit ESM path with `.js`.
 * Handles directory imports (`./lib` -> `./lib/index.js`) by probing the
 * corresponding source tree, so raw Node ESM resolution never depends on
 * extension/directory guessing.
 */
function withExtension(spec: string, importerDir: string): string {
  if (extname(spec)) return spec;
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
 * rewriting intra-package specifiers for raw Node ESM:
 *   - `@blobbi/react/*` self-subpaths  -> relative `.js`
 *   - relative specifiers              -> explicit `.js` extension
 * Cross-package (`@blobbi/core`, `@blobbi/core/*`), react, @tanstack/*,
 * @nostrify/* stay bare externals resolved by the consumer's node_modules.
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
    // Self subpath imports (`@blobbi/react/lib/x`) -> relative + .js, external.
    build.onResolve({ filter: /^@blobbi\/react\// }, (args) => {
      const subpath = args.path.replace(/^@blobbi\/react\//, '');
      const target = join(srcRoot, subpath);
      let rel = relative(dirname(args.importer), target);
      if (!rel.startsWith('.')) rel = `./${rel}`;
      return { path: withExtension(rel, dirname(args.importer)), external: true };
    });
    // Relative imports -> ensure .js / /index.js, external (do not inline).
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
  external: ['@blobbi/core'],
  esbuildPlugins: [emitAsFiles],
});
