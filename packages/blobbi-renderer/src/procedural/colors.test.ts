import { describe, expect, it } from 'vitest';
import {
  AUTHORED_PALETTE,
  COLOR_SCHEMES,
  MAX_BODY_LIGHTNESS,
  MIN_BODY_CHROMA,
  MIN_BODY_LIGHTNESS,
  chooseCheek,
  composite,
  contrast,
  derivePalette,
  distance,
  generateColors,
  hexToOklch,
  oklchToHex,
  type BlobbiPalette,
} from './colors';
import { canonicalGenome, generateGenome } from './genome';
import { deriveMorphology } from './morphology';
import { seeds } from './test-helpers';

const HEX = /^#[0-9a-f]{6}$/;
const POPULATION = seeds(3000, 'palette');

describe('colour math', () => {
  it('round-trips sRGB through OKLCH', () => {
    for (const hex of ['#8749ef', '#ff7ab7', '#21102e', '#ffffff', '#000000', '#3fb6a8', '#f0c590', '#808080']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });

  it('gives up chroma, not lightness or validity, for a colour the screen cannot show', () => {
    const hex = oklchToHex({ l: 0.9, c: 0.4, h: 265 });
    expect(hex).toMatch(HEX);
    expect(hexToOklch(hex).l).toBeCloseTo(0.9, 1);
  });
});

describe('the canonical palette', () => {
  it('is the authored one, literal for literal', () => {
    expect(derivePalette(undefined)).toEqual(AUTHORED_PALETTE);
    expect(derivePalette({})).toEqual(AUTHORED_PALETTE);
    expect(deriveMorphology(canonicalGenome()).palette).toEqual(AUTHORED_PALETTE);
    expect(deriveMorphology(canonicalGenome(), 'baby').palette).toEqual(AUTHORED_PALETTE);
    for (const hex of Object.values(AUTHORED_PALETTE)) expect(hex).toMatch(HEX);
  });

  it('is what its own rules give back: the role offsets are measured on it', () => {
    // Deriving from the authored body colour reproduces the authored body roles to within rounding.
    const derived = derivePalette({ base: AUTHORED_PALETTE.bodyMid, eye: AUTHORED_PALETTE.irisMid });
    for (const role of ['bodyLight', 'bodyDark', 'limbLight', 'limbDark', 'footLight', 'footDark', 'line', 'irisLight', 'irisDark'] as const) {
      expect(distance(derived[role], AUTHORED_PALETTE[role]), role).toBeLessThan(0.012);
    }
    expect(derived.cheek).toBe(AUTHORED_PALETTE.cheek);
  });

  it("keeps the kit's own colour rule available for Blobbis that already have colours", () => {
    const kit = derivePalette({ base: '#3fb6a8', mapping: 'kit' });
    expect(kit.bodyMid).toBe('#3fb6a8');
    expect(kit.bodyLight).toBe('#81f8ea');
    expect(kit.bodyDark).toBe('#0f8678');
  });
});

describe('generated palettes', () => {
  const palettes = POPULATION.map((seed) => ({ seed, genome: generateGenome(seed), palette: deriveMorphology(generateGenome(seed)).palette }));
  const worst = (measure: (p: BlobbiPalette) => number) => Math.min(...palettes.map((p) => measure(p.palette)));

  it('are deterministic and made only of valid colours', () => {
    for (const { seed, palette, genome } of palettes.slice(0, 500)) {
      expect(generateColors(seed)).toEqual(generateColors(seed));
      for (const hex of Object.values(palette)) expect(hex).toMatch(HEX);
      for (const hex of [genome.colors.base, genome.colors.secondary, genome.colors.eye]) expect(hex).toMatch(HEX);
      expect(COLOR_SCHEMES).toContain(genome.scheme);
    }
  });

  it('reach right round the hue wheel, in every scheme', () => {
    const buckets = new Set(palettes.map((p) => Math.floor(hexToOklch(p.palette.bodyMid).h / 15)));
    expect(buckets.size).toBe(24);
    for (const scheme of COLOR_SCHEMES) expect(palettes.filter((p) => p.genome.scheme === scheme).length).toBeGreaterThan(450);
  });

  it('never make a body too dark for its features, too pale for its eyes, or grey', () => {
    for (const { palette } of palettes) {
      const body = hexToOklch(palette.bodyMid);
      expect(body.l).toBeGreaterThanOrEqual(MIN_BODY_LIGHTNESS - 0.005);
      expect(body.l).toBeLessThanOrEqual(MAX_BODY_LIGHTNESS + 0.005);
      expect(body.c).toBeGreaterThanOrEqual(MIN_BODY_CHROMA - 0.003);
    }
  });

  it('keep the face readable on every body', () => {
    // The authored purple is the reference: no generated Blobbi is more than a quarter point harder to read.
    const authored = contrast(AUTHORED_PALETTE.feature, AUTHORED_PALETTE.bodyMid);
    expect(worst((p) => contrast(p.feature, p.bodyMid))).toBeGreaterThanOrEqual(authored - 0.25);
    expect(worst((p) => contrast(p.feature, p.bodyMid))).toBeGreaterThan(3);
    // Brows are a darker tone of the body, on the body.
    expect(worst((p) => contrast(p.line, p.bodyMid))).toBeGreaterThan(1.8);
    // The iris against the eye white, and the eye white against the body.
    expect(worst((p) => contrast(p.irisMid, p.white))).toBeGreaterThan(10);
    expect(worst((p) => contrast(p.white, p.bodyMid))).toBeGreaterThan(1.35);
    expect(worst((p) => hexToOklch(p.irisMid).l)).toBeLessThan(0.32);
  });

  it('keep markings, cheeks, limbs, horns and accents distinct from the body they sit on', () => {
    expect(worst((p) => distance(composite(p.marking, p.bodyMid, 0.56), p.bodyMid))).toBeGreaterThan(0.09);
    expect(worst((p) => distance(composite(p.cheek, p.bodyMid, 0.74), p.bodyMid))).toBeGreaterThan(0.08);
    expect(worst((p) => distance(p.limbDark, p.bodyMid))).toBeGreaterThan(0.1);
    expect(worst((p) => Math.min(distance(p.hornLight, p.bodyMid), distance(p.hornDark, p.bodyMid)))).toBeGreaterThan(0.1);
    for (const { genome, palette } of palettes) {
      if (genome.colors.accent) expect(distance(palette.accentLight, palette.bodyMid)).toBeGreaterThan(0.15);
      // Markings are always darker than the body: tone on tone, never a clash.
      expect(hexToOklch(palette.marking).l).toBeLessThan(hexToOklch(palette.bodyMid).l - 0.15);
    }
  });

  it('give the body a light, a mid and a dark, in that order', () => {
    for (const { palette } of palettes) {
      const [light, mid, dark] = [palette.bodyLight, palette.bodyMid, palette.bodyDark].map((hex) => hexToOklch(hex).l);
      expect(light).toBeGreaterThan(mid + 0.04);
      expect(mid).toBeGreaterThan(dark + 0.06);
      expect(hexToOklch(palette.footDark).l).toBeLessThan(hexToOklch(palette.limbLight).l);
    }
  });

  it('swap the cheek only when the authored pink would vanish', () => {
    expect(chooseCheek('#8749ef')).toBe('#ff7ab7');
    expect(chooseCheek('#3fb6a8')).toBe('#ff7ab7');
    // On a pink body the authored pink is invisible; another cheek is chosen.
    expect(chooseCheek('#ff7ab7')).not.toBe('#ff7ab7');
    const swapped = palettes.filter((p) => p.palette.cheek !== '#ff7ab7').length / palettes.length;
    expect(swapped).toBeGreaterThan(0.02);
    expect(swapped).toBeLessThan(0.3);
  });

  it('apply the same guardrails to colours that are stated rather than generated', () => {
    const palette = derivePalette({ base: '#ff7ab7', secondary: '"><script>', eye: 'red' });
    expect(palette.cheek).not.toBe('#ff7ab7');
    expect(palette.marking).toBe(AUTHORED_PALETTE.marking);
    expect(palette.irisMid).toBe(AUTHORED_PALETTE.irisMid);
    for (const hex of Object.values(palette)) expect(hex).toMatch(HEX);
  });
});
