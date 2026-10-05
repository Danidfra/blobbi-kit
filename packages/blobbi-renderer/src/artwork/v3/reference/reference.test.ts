/**
 * THE REFERENCE BLOBBIS OF ALGORITHM 1, held to their pinned morphology,
 * palette and paint lists.
 *
 * What a failure here means: a `visual_algorithm = 1` Blobbi would no longer
 * be drawn as the same Blobbi. See `procedural/version.ts` for what that
 * version freezes, and `reference.ts` for when these files may be rewritten:
 *
 *   UPDATE_REFERENCE=1 npx vitest run packages/blobbi-renderer/src/artwork/v3/reference/reference.test.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BLOBBI_V3_ANTENNAE,
  BLOBBI_V3_EARS,
  BLOBBI_V3_HORNS,
  BLOBBI_V3_PATTERNS,
  BLOBBI_V3_SPECIAL_MARKS,
  BLOBBI_V3_TAILS,
  blobbiV3Genome,
  canonicalBlobbiV3Seed,
  createBlobbiV3Identity,
  resolveBlobbiV3Visual,
} from '../identity';
import { MARK_REGIONS, PROCEDURAL_ALGORITHM_VERSION, deriveMorphology, generateGenome, geneRng, type BlobbiGenome } from '../../../procedural';
import { hexSeeds } from '../../../procedural/test-helpers';
import { PALETTE_CASES, REFERENCE_CASES } from './cases';
import { TOLERANCE, paintDifferences, type PaintLayer } from './paint-list';
import {
  EXTREME_CASES,
  REFERENCE_FILES,
  REFERENCE_STAGES,
  REFERENCE_VIEWS,
  computeMorphology,
  computePalettes,
  extremeGenome,
  formatReference,
  paintOf,
  type MorphologyReference,
  type PaintReference,
  type PaletteReference,
  type ReferenceView,
} from './reference';
import morphologyFile from './morphology.json';
import paletteFile from './palette.json';
import paintFile from './paint.json';

if (process.env.UPDATE_REFERENCE === '1') {
  // jsdom gives `import.meta.url` an http scheme; the test's own path does not depend on it.
  const here = dirname(expect.getState().testPath ?? fileURLToPath(import.meta.url));
  for (const [file, compute] of Object.entries(REFERENCE_FILES)) writeFileSync(join(here, file), formatReference(compute()));
}

const morphology = morphologyFile.cases as unknown as Record<string, MorphologyReference>;
const palettes = paletteFile.cases as unknown as Record<string, PaletteReference>;
const paint = paintFile.cases as unknown as Record<string, PaintReference>;
const VIEWS = Object.keys(REFERENCE_VIEWS) as ReferenceView[];
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('the reference files', () => {
  it('name the algorithm version they pin', () => {
    expect(PROCEDURAL_ALGORITHM_VERSION).toBe(1);
    for (const file of [morphologyFile, paletteFile, paintFile]) expect(file.algorithm).toBe(PROCEDURAL_ALGORITHM_VERSION);
  });

  it('hold every reference case, and nothing else', () => {
    const names = REFERENCE_CASES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(paint)).toEqual(names);
    expect(Object.keys(morphology)).toEqual([...names, ...Object.keys(EXTREME_CASES)]);
    expect(Object.keys(palettes)).toEqual([...names, ...PALETTE_CASES.map((c) => c.name)]);
  });
});

describe('the reference Blobbis', () => {
  it('are complete, canonical version 1 identities: nothing about them is left to a seed to decide', () => {
    for (const { name, identity } of REFERENCE_CASES) {
      expect(identity.algorithm, name).toBe(1);
      expect(canonicalBlobbiV3Seed(identity.seed), name).toBe(identity.seed);
      expect(resolveBlobbiV3Visual(identity), name).toEqual({ status: 'individual', identity, inferred: [] });
    }
    expect(new Set(REFERENCE_CASES.map((c) => c.identity.seed)).size).toBe(REFERENCE_CASES.length);
  });

  it('carry every kind of every trait, a mark in every region, and a body with and without an accent colour', () => {
    const traits = REFERENCE_CASES.map((c) => c.identity.traits);
    expect(new Set(traits.map((t) => t.antenna))).toEqual(new Set(BLOBBI_V3_ANTENNAE));
    expect(new Set(traits.map((t) => t.horns))).toEqual(new Set(BLOBBI_V3_HORNS));
    expect(new Set(traits.map((t) => t.ears))).toEqual(new Set(BLOBBI_V3_EARS));
    expect(new Set(traits.map((t) => t.tail))).toEqual(new Set(BLOBBI_V3_TAILS));
    expect(new Set(traits.map((t) => t.pattern))).toEqual(new Set(BLOBBI_V3_PATTERNS));
    expect(new Set(traits.map((t) => t.specialMark))).toEqual(new Set(BLOBBI_V3_SPECIAL_MARKS));
    for (const flag of ['belly', 'freckles'] as const) expect(new Set(traits.map((t) => t[flag]))).toEqual(new Set([true, false]));
    expect(new Set(REFERENCE_CASES.map((c) => c.identity.colors.accent !== undefined))).toEqual(new Set([true, false]));
    const regions = REFERENCE_CASES.map((c) => morphology[c.name].adult.mark?.region).filter(Boolean);
    expect(new Set(regions)).toEqual(new Set(MARK_REGIONS));
    // A mark is in the same region at both stages: it is one patch of skin.
    for (const c of REFERENCE_CASES) expect(morphology[c.name].baby.mark?.region, c.name).toBe(morphology[c.name].adult.mark?.region);
  });

  it('the two written down as created are still what creation gives their seeds today (informational: creation may be retuned)', () => {
    // If this fails after a deliberate retuning of the colour generator or the
    // trait odds, that is allowed: the reference identities stay as written,
    // and this expectation is what gets updated. It is here so that such a
    // retuning is a decision, not an accident.
    for (const { name, identity } of REFERENCE_CASES.filter((c) => c.name.startsWith('as-created'))) expect(createBlobbiV3Identity(identity.seed), name).toEqual(identity);
  });
});

describe('morphology (exact)', () => {
  const actual = computeMorphology();
  for (const name of Object.keys(morphology)) {
    it(`${name}: the egg's shell, the baby and the adult resolve to exactly the pinned numbers`, () => {
      expect(plain(actual[name].egg)).toEqual(morphology[name].egg);
      for (const stage of REFERENCE_STAGES) expect(plain(actual[name][stage]), stage).toEqual(morphology[name][stage]);
    });
  }

  it('is pinned with every gene at both ends of its range, where each differs from the canonical body', () => {
    const low = morphology['every-gene-low'];
    const high = morphology['every-gene-high'];
    for (const stage of REFERENCE_STAGES) {
      const numbers = (m: MorphologyReference[typeof stage]) => Object.entries(m).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
      const lowValues = Object.fromEntries(numbers(low[stage]));
      for (const [gene, value] of numbers(high[stage])) expect(value, `${stage} ${gene}`).toBeGreaterThan(lowValues[gene]);
      for (const m of [low[stage], high[stage]]) {
        expect(m.antennae).toHaveLength(2);
        expect(m.horns && m.ears && m.mark).toBeTruthy();
        expect(m.freckles).toHaveLength(3);
        // What a baby has not grown yet is absent, not small: no tail, no belly patch.
        expect(m.tail !== null).toBe(stage === 'adult');
        expect(m.bellyPatch !== null).toBe(stage === 'adult');
      }
    }
    // The extremes are the genomes this file says they are.
    for (const end of [-1, 1] as const) {
      const walk = (value: unknown): number[] => (typeof value === 'number' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(walk) : []);
      const genome: BlobbiGenome = extremeGenome(end);
      expect(new Set(walk(genome.morphology))).toEqual(new Set([end]));
      expect(new Set(walk([genome.traits.horns, genome.traits.ears, genome.traits.tail]))).toEqual(new Set([end]));
    }
  });
});

describe('palette (exact in JavaScript; a port may be one step off in a channel)', () => {
  const actual = computePalettes();
  for (const name of Object.keys(palettes)) {
    it(`${name}: every colour role derived from its identity colours is the pinned one`, () => {
      expect(plain(actual[name])).toEqual(palettes[name]);
    });
  }

  it('is a function of the four identity colours alone: not of the seed, the traits or the stage', () => {
    for (const { name, identity } of REFERENCE_CASES) {
      const expected = palettes[name].palette;
      for (const stage of REFERENCE_STAGES) expect(deriveMorphology(blobbiV3Genome(identity), stage).palette, `${name} ${stage}`).toEqual(expected);
      const other = { ...identity, seed: REFERENCE_CASES[0].identity.seed, traits: REFERENCE_CASES[8].identity.traits };
      expect(deriveMorphology(blobbiV3Genome(other), 'adult').palette, name).toEqual(expected);
    }
  });

  it('reaches each fallback of the special mark\'s colour', () => {
    const of = (name: string) => palettes[name];
    // The accent, where it stands off the body.
    expect(of('accent-reads').palette.mark).toBe(of('accent-reads').colors.accent);
    // An accent too close to the body is passed over...
    expect(of('accent-too-close').palette.mark).not.toBe(of('accent-too-close').colors.accent);
    // ...and on a near-white body, where a pale tint would vanish too, the pattern colour is used.
    expect(of('pale-no-accent').palette.mark).toBe(of('pale-no-accent').colors.secondary);
    // The stated colours are used as stated.
    for (const { name } of [...REFERENCE_CASES, ...PALETTE_CASES]) {
      expect(of(name).palette.bodyMid, name).toBe(of(name).colors.base);
      expect(of(name).palette.marking, name).toBe(of(name).colors.secondary);
      expect(of(name).palette.irisMid, name).toBe(of(name).colors.eye);
    }
  });
});

describe(`paint lists (positions within ${TOLERANCE} units, paint exactly)`, () => {
  const drawn = new Map<string, PaintLayer[]>();
  const layersOf = (name: string, stage: 'egg' | 'baby' | 'adult', view: ReferenceView = 'front') => {
    const key = `${name} ${stage} ${view}`;
    if (!drawn.has(key)) drawn.set(key, paintOf(REFERENCE_CASES.find((c) => c.name === name)!.identity, stage, view));
    return drawn.get(key)!;
  };

  for (const { name } of REFERENCE_CASES) {
    it(`${name}: egg, baby and adult paint what the reference says, from the front, the side and behind`, () => {
      const differences = [
        ...paintDifferences(paint[name].egg, layersOf(name, 'egg')).map((d) => `egg: ${d}`),
        ...REFERENCE_STAGES.flatMap((stage) => VIEWS.flatMap((view) => paintDifferences(paint[name][stage][view], layersOf(name, stage, view)).map((d) => `${stage} ${view}: ${d}`))),
      ];
      expect(differences.slice(0, 12)).toEqual([]);
    });
  }

  it('pin what a view does NOT show, which is as much the Blobbi as what it does', () => {
    const parts = (name: string, stage: 'baby' | 'adult', view: ReferenceView) => paint[name][stage][view].map((line) => line.split(' ')[0]);
    const anywhere = (name: string, stage: 'baby' | 'adult', prefix: string) => VIEWS.some((view) => parts(name, stage, view).some((p) => p.startsWith(prefix)));
    // A baby has not grown a tail or a belly patch: stating one changes nothing about it yet.
    for (const name of ['tail', 'crowded-crown', 'as-created-1']) expect(anywhere(name, 'baby', 'tail'), name).toBe(false);
    for (const name of ['tail', 'crowded-crown', 'light-palette']) expect(anywhere(name, 'baby', 'belly-patch'), name).toBe(false);
    for (const { name } of REFERENCE_CASES) {
      for (const stage of REFERENCE_STAGES) {
        // The tail is behind the body from the front, and there is no face from behind.
        expect(parts(name, stage, 'front').some((p) => p.startsWith('tail')), `${name} ${stage}`).toBe(false);
        expect(parts(name, stage, 'back').some((p) => /eye|mouth|cheek|freckle|eyebrow/.test(p)), `${name} ${stage}`).toBe(false);
        // The belly patch is drawn from the front only (in profile its patch of skin is on the silhouette's edge).
        for (const view of ['side', 'back'] as const) expect(parts(name, stage, view), `${name} ${stage} ${view}`).not.toContain('belly-patch');
      }
    }
  });

  it('show every trait somewhere: no reference is pinning an empty picture', () => {
    const parts = (name: string, stage: 'baby' | 'adult', view: ReferenceView) => paint[name][stage][view].map((line) => line.split(' ')[0]);
    const seen = (name: string, part: string) => REFERENCE_STAGES.every((stage) => VIEWS.some((view) => parts(name, stage, view).includes(part)));
    expect(seen('antennae', 'antenna-stalk')).toBe(true);
    expect(seen('ears-and-horns', 'ear-outer') && seen('ears-and-horns', 'horn-body')).toBe(true);
    expect(seen('spotted', 'side-pattern-mark')).toBe(true);
    expect(seen('striped', 'pattern-stripe')).toBe(true);
    expect(seen('gradient', 'pattern-gradient')).toBe(true);
    expect(seen('striped', 'freckle')).toBe(true);
    // The adult's tail, in profile and from behind, and its belly patch, from the front (see the next test for the rest).
    for (const view of ['side', 'back'] as const) expect(parts('tail', 'adult', view).some((p) => p.startsWith('tail'))).toBe(true);
    expect(parts('tail', 'adult', 'front')).toContain('belly-patch');
    // Each kind of mark is drawn at both stages, in some view.
    for (const name of ['special-mark', 'gradient', 'crowded-crown', 'light-palette']) expect(seen(name, 'special-mark-shape'), name).toBe(true);
    // And every view of every case paints a body.
    for (const { name } of REFERENCE_CASES) for (const stage of REFERENCE_STAGES) for (const view of VIEWS) expect(parts(name, stage, view), `${name} ${stage} ${view}`).toContain('body-base');
  });
});

/**
 * The seed decides the explicit identity ONCE, at creation. These odds are
 * not what keeps an existing Blobbi looking the same (its identity is
 * stated), but they are part of what algorithm 1 gives a NEW seed, and a
 * renderer that fills a missing field from the seed must fill it the same
 * way everywhere. So the table is written down here, apart from the code.
 */
describe('what a seed is given (the trait odds of algorithm 1)', () => {
  const pick = <T>(roll: number, table: readonly (readonly [number, T])[]): T => table.find(([below]) => roll < below)![1];
  const ANTENNA = [[0.55, 0], [0.85, 1], [1, 2]] as const;
  const HORNS = [[0.8, 'none'], [0.88, 'forehead'], [0.94, 'top'], [1, 'side']] as const;
  const EARS = [[0.86, 'none'], [0.95, 'round'], [1, 'pointed']] as const;
  const TAIL = [[0.5, 'none'], [0.72, 'nub'], [0.88, 'curl'], [1, 'leaf']] as const;
  const PATTERN = [[0.4, 'solid'], [0.66, 'spotted'], [0.82, 'striped'], [1, 'gradient']] as const;
  const MARK = [[0.58, 'none'], [0.7, 'star'], [0.81, 'heart'], [0.91, 'sparkle'], [1, 'moon']] as const;
  const SPOT_SIDE = [[0.45, 'right'], [0.8, 'left'], [1, 'both']] as const;

  it('reads each trait off its own stream by this table, then thins a crowded head', () => {
    const tally: Record<string, number> = {};
    const count = (key: string) => (tally[key] = (tally[key] ?? 0) + 1);
    const seeds = hexSeeds(3000, 'odds');
    for (const seed of seeds) {
      const roll = (key: string) => geneRng(seed, key).next();
      const genome = generateGenome(seed);
      const t = genome.traits;
      const antenna = pick(roll('antenna.kind'), ANTENNA);
      let horns: string = pick(roll('horns.kind'), HORNS);
      let ears: string = pick(roll('ears.kind'), EARS);
      // Horns take the place of ears; crown horns move to the flanks when an antenna stands there.
      if (horns !== 'none') ears = 'none';
      if (horns === 'top' && antenna > 0) horns = 'side';
      expect(t.antenna.count, seed).toBe(antenna);
      expect(t.antenna.side, seed).toBe(roll('antenna.side') < 0.5 ? 1 : -1);
      expect(t.horns.kind, seed).toBe(horns);
      expect(t.ears.kind, seed).toBe(ears);
      expect(t.tail.kind, seed).toBe(pick(roll('tail.kind'), TAIL));
      expect(t.pattern.kind, seed).toBe(pick(roll('pattern.kind'), PATTERN));
      expect(t.pattern.spots.side, seed).toBe(pick(roll('spots.side'), SPOT_SIDE));
      expect(t.pattern.spots.count, seed).toBe(roll('spots.count') < 0.7 ? 3 : 2);
      expect(t.pattern.spots.backCount, seed).toBe(roll('spots.back.count') < 0.6 ? 3 : 2);
      expect(t.pattern.stripes.count, seed).toBe(roll('stripes.count') < 0.5 ? 4 : 3);
      expect(t.mark.kind, seed).toBe(pick(roll('mark.kind'), MARK));
      expect(t.mark.side, seed).toBe(roll('mark.side') < 0.5 ? 1 : -1);
      expect(t.mark.region, seed).toBe(roll('mark.region'));
      expect(t.belly.enabled, seed).toBe(roll('belly.enabled') < 0.25);
      expect(t.freckles.enabled, seed).toBe(roll('freckles.enabled') < 0.22);
      expect(genome.egg.spotCount, seed).toBe(roll('egg.spotCount') < 0.6 ? 4 : 3);
      // And the identity created for the seed states exactly those kinds.
      const identity = createBlobbiV3Identity(seed);
      expect(identity.traits, seed).toEqual({
        antenna: BLOBBI_V3_ANTENNAE[antenna],
        horns,
        ears,
        tail: t.tail.kind,
        pattern: t.pattern.kind,
        specialMark: t.mark.kind,
        belly: t.belly.enabled,
        freckles: t.freckles.enabled,
      });
      for (const key of [`antenna ${antenna}`, `horns ${horns}`, `ears ${ears}`, `tail ${t.tail.kind}`, `pattern ${t.pattern.kind}`, `mark ${t.mark.kind}`]) count(key);
    }
    // The population the table promises, loosely: every kind turns up, in about its share.
    const share = (key: string) => (tally[key] ?? 0) / seeds.length;
    expect(share('antenna 0')).toBeCloseTo(0.55, 1);
    expect(share('pattern solid')).toBeCloseTo(0.4, 1);
    expect(share('pattern spotted')).toBeCloseTo(0.26, 1);
    expect(share('mark none')).toBeCloseTo(0.58, 1);
    expect(share('tail none')).toBeCloseTo(0.5, 1);
    for (const key of ['antenna 1', 'antenna 2', 'horns forehead', 'horns top', 'horns side', 'ears round', 'ears pointed', 'tail nub', 'tail curl', 'tail leaf', 'pattern striped', 'pattern gradient', 'mark star', 'mark heart', 'mark sparkle', 'mark moon']) {
      expect(tally[key] ?? 0, key).toBeGreaterThan(20);
    }
  });
});
