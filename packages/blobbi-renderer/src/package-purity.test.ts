/**
 * PACKAGE-PURITY enforcement for `@blobbi-kit/renderer`.
 *
 * The package's whole value proposition is negative: it is useful to an outside
 * consumer precisely because of what it CANNOT do. It cannot open a relay, read
 * the logged-in user, parse a Nostr event, ask where in a world it is, reach
 * the Blobbi domain kit, or depend on a consumer's CSS build. Every one of
 * those properties is a property of the import graph or the emitted markup,
 * and every one is cheap to destroy with a single convenient import: so they
 * are asserted against the real graph rather than described in a comment.
 *
 * Import statements are matched, not free text, so the prose in these modules,
 * which discusses Nostr, Island and Ditto at length, does not trip the check.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const PACKAGE_ROOT = resolve(__dirname, '..');
const SRC = join(PACKAGE_ROOT, 'src');
const ENTRY = join(SRC, 'index.ts');

/** Every module specifier actually imported (static, dynamic, or re-exported). */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers = new Set<string>();
  const patterns = [
    /\bimport\s+(?:[\s\S]*?)\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:[\s\S]*?)\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

/** Resolve a RELATIVE specifier to a source file; anything else is external. */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const ext of ['.ts', '.tsx', '']) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  for (const index of ['/index.ts', '/index.tsx']) {
    const candidate = base + index;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

interface Subtree {
  files: string[];
  externals: string[];
  edges: Array<{ file: string; specifier: string }>;
}

function subtreeOf(entry: string): Subtree {
  const files = new Set<string>();
  const externals = new Set<string>();
  const edges: Array<{ file: string; specifier: string }> = [];

  const walk = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const specifier of importsOf(file)) {
      edges.push({ file: relative(PACKAGE_ROOT, file), specifier });
      const resolved = resolveSpecifier(specifier, file);
      if (resolved) walk(resolved);
      else externals.add(specifier);
    }
  };

  walk(entry);
  return {
    files: [...files].map((f) => relative(PACKAGE_ROOT, f)).sort(),
    externals: [...externals].sort(),
    edges,
  };
}

const pkg = subtreeOf(ENTRY);

/** Every source file in the package, tests included. */
function allSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return allSourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const ALL_FILES = allSourceFiles(SRC);
/** What a consumer actually gets: everything except the tests. */
const SHIPPED_FILES = ALL_FILES.filter((file) => !/\.test\.tsx?$/.test(file));

/**
 * What the package must never be able to reach.
 *
 * Each entry is a CATEGORY, not a module: the point is that no member of the
 * category can enter, so a newly added sibling is caught too.
 */
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  // ── Host-application aliases and the Blobbi domain kit ──────────────────
  { pattern: /^@\//, why: 'a host-application `@/` path alias' },
  { pattern: /^@blobbi-kit\/(core|react)(\/|$)/, why: 'the Blobbi domain kit (core or react hooks)' },
  { pattern: /^@blobbi-kit\/renderer/, why: 'itself by package name (a resolution cycle)' },
  { pattern: /^@blobbi(-kit)?\/(ui|companion)/, why: 'a downstream Blobbi package (an inverted dependency)' },
  // ── Protocol and data ───────────────────────────────────────────────────
  { pattern: /nostr/i, why: 'a Nostr library or module' },
  { pattern: /^@tanstack\//, why: 'a query client' },
  { pattern: /inventory|equipment-event|31632|31633|31634/i, why: 'the inventory/equipment protocol layer' },
  { pattern: /useBlobbis|useBlobbiEvents|useBlobbonautProfile|useOptimizedStatus/, why: 'a companion data hook' },
  { pattern: /useCurrentUser|useLoggedInAccounts|useLoginActions/, why: 'a current-user hook' },
  // ── Styling toolchains the consumer would have to run ───────────────────
  { pattern: /tailwind|clsx|classnames/i, why: 'a class-name toolchain (geometry is inline)' },
  { pattern: /dompurify/i, why: 'a sanitizer dependency (the sanitizer is a host-supplied hook)' },
  // ── Island world ────────────────────────────────────────────────────────
  { pattern: /location-|useLocation/, why: 'a location module' },
  { pattern: /world-coordinates|world-input|blobbi-world-render/, why: 'world coordinates' },
  { pattern: /boundaries/, why: 'room boundaries' },
  { pattern: /blobbi-ground|blobbi-pose|spatial-intent/, why: 'world/pose geometry' },
  { pattern: /multiplayer|IslandPresence|presence|theater/i, why: 'presence/multiplayer/theater' },
  { pattern: /useMovement|MovementBlocker|MovementController|pending-interaction/, why: 'movement state' },
  { pattern: /asset-paths|island-accessory-sources/, why: 'a host asset-path adapter' },
  // ── App shell ───────────────────────────────────────────────────────────
  { pattern: /^react-router/, why: 'a router' },
  { pattern: /contexts\//, why: 'an app context' },
  { pattern: /useLocalStorage|useAppContext|useTheme|useToast|haptics/, why: 'app-shell state' },
  { pattern: /Modal$|Modal'/, why: 'a modal component' },
  { pattern: /BlobbiActor|MovableBlobbi|CurrentBlobbiDisplay|CurrentBlobbiPreview|AccessoryOverlay/, why: 'an Island actor/wrapper component' },
  { pattern: /companion|BlobbiCompanion/i, why: 'the companion engine or a companion domain object' },
];

describe('the package reaches nothing it must not', () => {
  it('has a subtree to check, and it is small', () => {
    expect(pkg.files.length).toBeGreaterThan(10);
    // A guardrail, not a target: if the graph doubles, the boundary needs a
    // human look rather than a silently passing test.
    expect(pkg.files.length).toBeLessThan(45);
  });

  it.each(FORBIDDEN.map((f) => [f.why, f.pattern] as const))(
    'never imports %s',
    (why, pattern) => {
      const offenders = pkg.edges
        .filter(({ specifier }) => pattern.test(specifier))
        .map(({ file, specifier }) => `${file} -> ${specifier}`);
      expect(offenders, `package imports ${why}`).toEqual([]);
    },
  );

  it('uses no path aliases ANYWHERE in the package, tests included', () => {
    // The subtree walk above only covers what the entry point reaches. A `@/`
    // in a test file would still be a latent coupling to a host tsconfig, so
    // sweep every file on disk rather than only the reachable ones.
    const offenders = ALL_FILES.flatMap((file) =>
      importsOf(file)
        .filter((specifier) => specifier.startsWith('@/') || /^@blobbi-kit\/(core|react)(\/|$)/.test(specifier))
        .map((specifier) => `${relative(PACKAGE_ROOT, file)} -> ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('depends on exactly one external package: react', () => {
    // Anything arriving here is a new peer dependency, which is a decision,
    // so it is recorded in this list and in package.json.
    expect(pkg.externals).toEqual(['react']);
  });

  it('declares every external dependency as a peer dependency, and nothing else', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    expect(Object.keys(manifest.peerDependencies ?? {})).toEqual(['react']);
    expect(manifest.peerDependencies.react).toBe('^18.0.0 || ^19.0.0');
    expect(manifest.dependencies, 'the renderer has no runtime dependencies').toBeUndefined();
  });

  it('has the intended public package identity', () => {
    // The package publishes under the kit's own npm scope, alongside
    // `@blobbi-kit/core` and `@blobbi-kit/react`. Nothing else in the package
    // depends on the name, so a rename is one string here and one in the
    // manifest; pinning it keeps that a decision made in a diff.
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    expect(manifest.private).toBeUndefined();
    expect(manifest.name).toBe('@blobbi-kit/renderer');
  });

  it('contains exactly the React component files it means to', () => {
    // A LIST, not a count: widening it is a decision made visible in a diff.
    const components = pkg.files.filter((f) => f.endsWith('.tsx'));
    expect(components).toEqual([
      'src/BlobbiRenderer.tsx',
      'src/effects/BlobbiEffectLayers.tsx',
      // Lightning: the one effect that is a connected structure rather than a
      // particle scatter, drawn as instance-namespaced SVG strokes.
      'src/effects/LightningEffect.tsx',
    ]);
  });

  it('owns none of the world concerns a host actor owns', () => {
    const renderer = readFileSync(join(SRC, 'BlobbiRenderer.tsx'), 'utf8');
    for (const worldConcern of ['data-blobbi-shadow', 'zIndex', 'animate-float', 'scale-rig']) {
      expect(renderer, `renderer must not own ${worldConcern}`).not.toContain(worldConcern);
    }
  });

  it('emits no utility class a consumer build would have to generate', () => {
    // The historical renderer expressed its box and layer geometry as Tailwind
    // utilities, which only work if the consumer's Tailwind scans this package.
    // Geometry is inline now; the only class names allowed in shipped JSX are
    // the package's own namespaced ones and whatever the host passes in.
    const utility =
      /className=["'][^"']*\b(?:absolute|relative|inset-\d|[hw]-(?:full|\d)|size-|pointer-events|select-none|object-contain|max-w-|rounded|shadow|cursor-|transition|duration-|hover:)/;
    const offenders = SHIPPED_FILES.filter((file) => utility.test(readFileSync(file, 'utf8'))).map(
      (f) => relative(PACKAGE_ROOT, f),
    );
    expect(offenders).toEqual([]);

    const classLiterals = SHIPPED_FILES.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/className=["']([^"']+)["']/g)].map((m) => m[1]),
    );
    for (const literal of classLiterals) {
      for (const name of literal.split(/\s+/)) {
        expect(name, `${name} is not a package-namespaced class`).toMatch(/^blobbi-(renderer|fx)/);
      }
    }
  });

  it('never fetches, times, randomizes or reads the environment at runtime', () => {
    // Synchronous, deterministic rendering is part of the contract: a consumer
    // gets the same markup on every render, on the first render, with no
    // loading state, no network and no clock.
    const offenders = SHIPPED_FILES.filter((file) => {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return /\bfetch\s*\(|XMLHttpRequest|new\s+Image\s*\(|localStorage|sessionStorage|import\.meta\.env|Math\.random\s*\(|Date\.now\s*\(|new\s+Date\s*\(|performance\.now|setTimeout|setInterval|requestAnimationFrame|window\.|document\.|navigator\./.test(
        source,
      );
    }).map((f) => relative(PACKAGE_ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('emits a clean publishable artifact, when one has been built', () => {
    // `dist/` is gitignored, so this is a local verification rather than a
    // gate, but when the artifact IS present, the things that would break a
    // real consumer are checked properly: an unresolved path alias, a leaked
    // host module, a kit import, or a bundled React.
    const dist = join(PACKAGE_ROOT, 'dist');
    if (!existsSync(dist)) {
      expect(existsSync(join(PACKAGE_ROOT, 'tsup.config.ts'))).toBe(true);
      return;
    }

    const built = readdirSync(dist, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(js|d\.ts)$/.test(f))
      .map((f) => join(dist, f));

    const specifiers = [...new Set(built.flatMap(importsOf))];
    expect(specifiers.filter((s) => s.startsWith('@/')), 'unresolved path alias in dist').toEqual([]);
    expect(
      specifiers.filter((s) => !s.startsWith('.')).sort(),
      'dist must import only the declared peer',
    ).toEqual(['react', 'react/jsx-runtime']);
    expect(existsSync(join(dist, 'index.d.ts')), 'declarations must be emitted').toBe(true);
    expect(existsSync(join(dist, 'node_modules')), 'no vendored dependencies').toBe(false);
    // Every emitted relative specifier carries an extension, so raw Node ESM
    // resolves it (the extractor's original publication blocker).
    const bare = specifiers.filter((s) => s.startsWith('.') && !/\.(js|json)$/.test(s));
    expect(bare, 'extensionless relative specifiers in dist').toEqual([]);
  });
});
