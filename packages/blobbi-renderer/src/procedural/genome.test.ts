import { describe, expect, it } from 'vitest';
import { ANTENNA_GENES, MORPHOLOGY_GENES, canonicalGenome, clampGene, generateGenome } from './genome';
import { ANTENNA_RANGES, MORPHOLOGY_RANGES, deriveMorphology } from './morphology';
import { AUTHORED_PALETTE } from './colors';
import { deepFreeze, seeds } from './test-helpers';

describe('generateGenome', () => {
  it('is deterministic: the same seed always gives the same genome', () => {
    expect(generateGenome('abc')).toEqual(generateGenome('abc'));
    expect(generateGenome({ seed: 'abc' })).toEqual(generateGenome('abc'));
    // Not affected by what was generated in between.
    const before = generateGenome('abc');
    for (const seed of seeds(50)) generateGenome(seed);
    expect(generateGenome('abc')).toEqual(before);
    expect(JSON.stringify(generateGenome('abc'))).toBe(JSON.stringify(before));
  });

  it('gives different seeds different genomes', () => {
    const all = seeds(300).map((seed) => JSON.stringify(generateGenome(seed).morphology));
    expect(new Set(all).size).toBe(300);
    expect(generateGenome('abc').morphology).not.toEqual(generateGenome('abd').morphology);
  });

  it('keeps every gene inside [-1, 1]', () => {
    for (const seed of seeds(500)) {
      const g = generateGenome(seed);
      for (const name of MORPHOLOGY_GENES) {
        expect(g.morphology[name]).toBeGreaterThanOrEqual(-1);
        expect(g.morphology[name]).toBeLessThanOrEqual(1);
      }
      for (const name of ANTENNA_GENES) expect(Math.abs(g.traits.antenna[name])).toBeLessThanOrEqual(1);
      expect([0, 1, 2]).toContain(g.traits.antenna.count);
      expect([-1, 1]).toContain(g.traits.antenna.side);
      for (const mark of g.traits.pattern.spots.marks) for (const v of Object.values(mark)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
      for (const hex of Object.values(g.colors)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('is serializable: a genome survives JSON unchanged', () => {
    const g = generateGenome('roundtrip');
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  it('lets explicit semantic identity override the seed without touching micro-geometry', () => {
    const plain = generateGenome('abc');
    const stated = generateGenome({ seed: 'abc', antenna: 'double', pattern: 'spotted', freckles: false, colors: { base: '#3FB6A8' } });
    expect(stated.traits.antenna.count).toBe(2);
    expect(stated.traits.pattern.kind).toBe('spotted');
    expect(stated.traits.freckles.enabled).toBe(false);
    expect(stated.colors).toEqual({ base: '#3fb6a8' });
    // The shape of the body, and the shape the antenna has, belong to the seed.
    expect(stated.morphology).toEqual(plain.morphology);
    expect({ ...stated.traits.antenna, count: 0 }).toEqual({ ...plain.traits.antenna, count: 0 });
    expect(stated.traits.pattern.spots.marks).toEqual(plain.traits.pattern.spots.marks);
  });

  it('rejects colours that are not bare hex', () => {
    const g = generateGenome({ seed: 'x', colors: { base: '"><script>', secondary: 'red', eye: '#abc' } });
    expect(g.colors).toEqual({ eye: '#aabbcc' });
    expect(generateGenome({ seed: 'x', colors: 'authored' }).colors).toEqual({});
  });

  it('spreads the optional traits across a population without making them the norm', () => {
    const population = seeds(2000).map((seed) => generateGenome(seed));
    const share = (test: (g: (typeof population)[number]) => boolean) => population.filter(test).length / population.length;
    expect(share((g) => g.traits.antenna.count === 0)).toBeGreaterThan(0.5);
    expect(share((g) => g.traits.antenna.count === 1)).toBeGreaterThan(0.24);
    expect(share((g) => g.traits.antenna.count === 2)).toBeGreaterThan(0.1);
    expect(share((g) => g.traits.pattern.kind === 'spotted')).toBeLessThan(0.36);
    // The new traits are the exception, not the rule, and the head is never crowded.
    expect(share((g) => g.traits.horns.kind !== 'none')).toBeLessThan(0.25);
    expect(share((g) => g.traits.ears.kind !== 'none')).toBeLessThan(0.16);
    expect(share((g) => g.traits.tail.kind !== 'none')).toBeGreaterThan(0.4);
    expect(share((g) => g.traits.horns.kind !== 'none' && g.traits.ears.kind !== 'none')).toBe(0);
    expect(share((g) => g.traits.horns.kind === 'top' && g.traits.antenna.count > 0)).toBe(0);
    expect(share((g) => g.traits.freckles.enabled)).toBeLessThan(0.28);
  });
});

describe('canonicalGenome', () => {
  it('is all zeros, with no optional trait and the authored colours', () => {
    const g = canonicalGenome();
    for (const name of MORPHOLOGY_GENES) expect(g.morphology[name]).toBe(0);
    expect(g.traits.antenna.count).toBe(0);
    expect(g.traits.pattern.kind).toBe('solid');
    expect(g.traits.freckles.enabled).toBe(false);
    expect(g.colors).toEqual({});
  });

  it('resolves to the canonical morphology: every parameter at its base', () => {
    const m = deriveMorphology(canonicalGenome());
    for (const name of MORPHOLOGY_GENES) expect(m[name]).toBe(MORPHOLOGY_RANGES[name].base);
    expect(m.antennae).toEqual([]);
    expect([m.horns, m.ears, m.tail, m.bellyPatch]).toEqual([null, null, null, null]);
    expect(m.spots).toEqual([]);
    expect(m.freckles).toEqual([]);
    expect(m.palette).toEqual(AUTHORED_PALETTE);
  });
});

describe('deriveMorphology', () => {
  it('keeps every parameter inside its Blobbi-safe range', () => {
    for (const seed of seeds(500)) {
      const m = deriveMorphology(generateGenome({ seed, antenna: 'double', pattern: 'spotted', freckles: true }));
      for (const name of MORPHOLOGY_GENES) {
        const { base, spread } = MORPHOLOGY_RANGES[name];
        expect(m[name]).toBeGreaterThanOrEqual(base - spread - 1e-9);
        expect(m[name]).toBeLessThanOrEqual(base + spread + 1e-9);
      }
      const [first] = m.antennae;
      expect(m.antennae).toHaveLength(2);
      expect(first.position).toBeGreaterThanOrEqual(ANTENNA_RANGES.position.base - ANTENNA_RANGES.position.spread);
      expect(first.position).toBeLessThanOrEqual(ANTENNA_RANGES.position.base + ANTENNA_RANGES.position.spread);
      for (const a of m.antennae) {
        expect(a.length).toBeGreaterThan(50);
        expect(a.length).toBeLessThan(100);
        expect(a.thickness).toBeGreaterThan(0);
        expect(a.tipRadius).toBeGreaterThan(0);
      }
      for (const spot of m.spots) {
        expect(spot.rx).toBeGreaterThan(0);
        expect(spot.ry).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the ranges conservative: no dimension strays more than 16% from canonical', () => {
    for (const name of MORPHOLOGY_GENES) {
      const range = MORPHOLOGY_RANGES[name];
      if (range.unit === 'scale') expect(range.spread).toBeLessThanOrEqual(0.16);
    }
    // The silhouette itself is tighter still.
    for (const name of ['bodyWidth', 'bodyHeight', 'topWidth', 'belly'] as const) {
      expect(MORPHOLOGY_RANGES[name].spread).toBeLessThanOrEqual(0.1);
    }
  });

  it('clamps genes that are out of range or not numbers', () => {
    expect(clampGene(5)).toBe(1);
    expect(clampGene(-5)).toBe(-1);
    expect(clampGene(Number.NaN)).toBe(0);
    expect(clampGene(Infinity)).toBe(0);
    expect(clampGene('1')).toBe(0);
    const wild = canonicalGenome();
    wild.morphology.bodyWidth = 99;
    wild.morphology.eyeSize = Number.NaN;
    wild.morphology.bodyHeight = -Infinity;
    const m = deriveMorphology(wild);
    expect(m.bodyWidth).toBe(MORPHOLOGY_RANGES.bodyWidth.base + MORPHOLOGY_RANGES.bodyWidth.spread);
    expect(m.eyeSize).toBe(1);
    expect(m.bodyHeight).toBe(1);
  });

  it('never mutates the genome', () => {
    const g = deepFreeze(generateGenome({ seed: 'frozen', antenna: 'double', pattern: 'spotted', freckles: true }));
    expect(() => deriveMorphology(g)).not.toThrow();
    expect(deriveMorphology(g)).toEqual(deriveMorphology(g));
  });

  it('derives a pair of antennae as one antenna mirrored, not two unrelated ones', () => {
    for (const seed of seeds(100)) {
      const [a, b] = deriveMorphology(generateGenome({ seed, antenna: 'double' })).antennae;
      expect(a.side).toBe(-b.side);
      expect(a.position).toBe(b.position);
      expect(a.thickness).toBe(b.thickness);
      expect(Math.abs(a.length - b.length) / a.length).toBeLessThanOrEqual(0.07 + 1e-9);
      expect(Math.abs(a.tilt - b.tilt)).toBeLessThanOrEqual(3 + 1e-9);
    }
  });
});
