import { describe, expect, it } from 'vitest';
import { createRng, geneRng, hashSeed } from './rng';

describe('rng', () => {
  it('produces the same stream for the same seed', () => {
    const a = createRng('abc');
    const b = createRng('abc');
    for (let i = 0; i < 200; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different streams for different seeds', () => {
    const a = createRng('abc');
    const b = createRng('abd');
    const same = Array.from({ length: 50 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBe(0);
  });

  it('is pinned: these exact values are the wire contract of a seed', () => {
    // If this fails, every existing seed would draw a different Blobbi.
    expect(hashSeed('abc123')).toEqual(hashSeed('abc123'));
    const rng = createRng('abc123');
    const first = [rng.next(), rng.next(), rng.next()];
    expect(first).toMatchInlineSnapshot(`
      [
        0.41990440781228244,
        0.021425183163955808,
        0.010849691461771727,
      ]
    `);
  });

  it('stays inside its ranges', () => {
    const rng = createRng('ranges');
    for (let i = 0; i < 5000; i++) {
      const u = rng.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      const c = rng.centered();
      expect(c).toBeGreaterThan(-1);
      expect(c).toBeLessThan(1);
      const r = rng.range(3, 7);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThan(7);
      const n = rng.int(4);
      expect([0, 1, 2, 3]).toContain(n);
    }
  });

  it('centres genes on zero', () => {
    const rng = createRng('centre');
    let sum = 0;
    let near = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const c = rng.centered();
      sum += c;
      if (Math.abs(c) < 0.5) near++;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.02);
    // Triangular: three quarters of individuals sit in the inner half of the range.
    expect(near / n).toBeGreaterThan(0.72);
    expect(near / n).toBeLessThan(0.78);
  });

  it('gives each gene its own stream, independent of any other', () => {
    expect(geneRng('s', 'body.width').next()).toBe(geneRng('s', 'body.width').next());
    expect(geneRng('s', 'body.width').next()).not.toBe(geneRng('s', 'body.height').next());
    expect(geneRng('s', 'body.width').next()).not.toBe(geneRng('t', 'body.width').next());
    // The seed/key boundary is unambiguous: ("ab","c") is not ("a","bc").
    expect(geneRng('ab', 'c').next()).not.toBe(geneRng('a', 'bc').next());
  });
});
