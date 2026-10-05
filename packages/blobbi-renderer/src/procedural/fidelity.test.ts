/**
 * The baseline, guarded: the canonical procedural Blobbi must stay visually
 * identical to the kit's Adult V2 front drawing. Both are rasterized and
 * compared pixel by pixel, so any change to the engine that moves the
 * canonical Blobbi away from the current one fails here.
 */
import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { renderBlobbiSvg as renderKit } from '@blobbi-kit/renderer';
import { EMOTIONS } from './expressions';
import { canonicalGenome } from './genome';
import { deriveMorphology } from './morphology';
import { buildBlobbiGeometry, renderBlobbiSvg, renderGeometryToSvg } from './renderer';
import type { BlobbiState } from './state';

function raster(svg: string) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: 424 }, background: '#ffffff', font: { loadSystemFonts: false } }).render();
  // `pixels` copies the whole buffer on every read: take it once.
  return { width: image.width, height: image.height, pixels: image.pixels };
}

/** Mean absolute difference per pixel (0..255) and the share of pixels that differ visibly. */
function compare(kit: Parameters<typeof renderKit>[0], state?: Partial<BlobbiState>, colors = {}) {
  const a = raster(renderKit({ stage: 'adult', visualGeneration: 'v2', ...kit }).svg);
  const b = raster(renderBlobbiSvg({ ...canonicalGenome(), colors }, state, { groundShadow: kit.groundShadow === 'artwork' }));
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  const n = a.width * a.height;
  let sum = 0;
  let visible = 0;
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let ch = 0; ch < 3; ch++) d = Math.max(d, Math.abs(a.pixels[i * 4 + ch] - b.pixels[i * 4 + ch]));
    sum += d;
    if (d > 24) visible++;
  }
  return { mean: sum / n, visible: visible / n };
}

/** The official baby (the kit's Baby V1) against the procedural baby, each in the baby's own square frame. */
function compareBaby(kit: Parameters<typeof renderKit>[0], state?: Partial<BlobbiState>, colors = {}) {
  const a = raster(renderKit({ stage: 'baby', visualGeneration: 'v1', sleepIndicator: 'none', ...kit }).svg);
  const b = raster(renderBlobbiSvg({ ...canonicalGenome(), colors }, { stage: 'baby', ...state }, { frame: 'stage' }));
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  const n = a.width * a.height;
  let sum = 0;
  let visible = 0;
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let ch = 0; ch < 3; ch++) d = Math.max(d, Math.abs(a.pixels[i * 4 + ch] - b.pixels[i * 4 + ch]));
    sum += d;
    if (d > 24) visible++;
  }
  return { mean: sum / n, visible: visible / n };
}

describe('fidelity to the official egg', () => {
  /** The official egg (the kit's Egg V1) against the procedural egg, each in the egg's own square frame. */
  function compareEgg(kit: Parameters<typeof renderKit>[0], state?: Partial<BlobbiState>, colors = {}) {
    const a = raster(renderKit({ stage: 'egg', ...kit }).svg);
    const b = raster(renderBlobbiSvg({ ...canonicalGenome(), colors }, { stage: 'egg', ...state }, { frame: 'stage' }));
    expect([b.width, b.height]).toEqual([a.width, a.height]);
    const n = a.width * a.height;
    let sum = 0;
    let visible = 0;
    for (let i = 0; i < n; i++) {
      let d = 0;
      for (let ch = 0; ch < 3; ch++) d = Math.max(d, Math.abs(a.pixels[i * 4 + ch] - b.pixels[i * 4 + ch]));
      sum += d;
      if (d > 24) visible++;
    }
    return { mean: sum / n, visible: visible / n };
  }

  it('draws the canonical egg as the kit draws its Egg V1', () => {
    const { mean, visible } = compareEgg({});
    expect(mean).toBeLessThan(0.05);
    expect(visible).toBe(0);
  });

  it('matches at every crack level', () => {
    for (const crack of ['light', 'medium', 'heavy'] as const) {
      const { mean, visible } = compareEgg({ eggCrack: crack }, { eggCrack: crack });
      expect(mean, crack).toBeLessThan(0.05);
      expect(visible, crack).toBeLessThan(0.0005);
    }
  });

  it('matches recoloured by the kit rule, with and without a secondary colour', () => {
    const both = { base: '#3fb6a8', secondary: '#1f6f8f', mapping: 'kit' as const };
    expect(compareEgg({ baseColor: both.base, secondaryColor: both.secondary }, undefined, both).mean).toBeLessThan(0.05);
    expect(compareEgg({ baseColor: both.base }, undefined, { base: both.base, mapping: 'kit' as const }).mean).toBeLessThan(0.05);
  });
});

describe('fidelity to the official baby', () => {
  it('draws the canonical baby as the kit draws its Baby V1', () => {
    // The remaining difference is the body gradient, by two units of lightness:
    // it is laid over the body path's bounding box, and this rasterizer boxes
    // the path's control points where browsers (and this engine) box the curve.
    const { mean, visible } = compareBaby({});
    expect(mean).toBeLessThan(0.3);
    expect(visible).toBeLessThan(0.001);
  });

  it('matches from behind and recoloured by the kit rule', () => {
    expect(compareBaby({ facing: 'back' }, { view: 'back' }).mean).toBeLessThan(0.35);
    const colors = { base: '#3fb6a8', secondary: '#1f6f8f', eye: '#3a2412', mapping: 'kit' as const };
    const tinted = compareBaby({ baseColor: colors.base, secondaryColor: colors.secondary, eyeColor: colors.eye }, undefined, colors);
    expect(tinted.mean).toBeLessThan(0.35);
    expect(tinted.visible).toBeLessThan(0.001);
  });

  it('stays close to the kit baby asleep and in each expression', () => {
    // These are the same faces reached through the shared pose system rather
    // than the kit's per-state baby shapes, so they agree in kind, not to the pixel.
    expect(compareBaby({ eyesClosed: true }, { sleeping: true }).mean).toBeLessThan(1.6);
    for (const emotion of EMOTIONS) {
      const { mean, visible } = compareBaby({ expression: emotion }, { expression: { [emotion]: 1 } });
      expect(mean, emotion).toBeLessThan(3);
      expect(visible, emotion).toBeLessThan(0.04);
    }
  });
});

describe('fidelity to the current Blobbi', () => {
  it('draws the neutral canonical Blobbi indistinguishably from the kit', () => {
    const { mean, visible } = compare({});
    expect(mean).toBeLessThan(0.02);
    expect(visible).toBe(0);
  });

  it('matches with the ground shadow, asleep, and recoloured', () => {
    expect(compare({ groundShadow: 'artwork' }).mean).toBeLessThan(0.02);
    expect(compare({ eyesClosed: true }, { sleeping: true }).mean).toBeLessThan(0.02);
    // `mapping: 'kit'` asks for the Adult V2 colour rule, so the hexes are the kit's own.
    const colors = { base: '#3fb6a8', secondary: '#1f6f8f', eye: '#3a2412', mapping: 'kit' as const };
    expect(compare({ baseColor: colors.base, secondaryColor: colors.secondary, eyeColor: colors.eye }, undefined, colors).mean).toBeLessThan(0.02);
  });

  it("reaches each of the kit's expressions at full intensity", () => {
    for (const emotion of EMOTIONS) {
      const { mean, visible } = compare({ expression: emotion }, { expression: { [emotion]: 1 } });
      // Differences are anti-aliasing along the lid and the open mouth's outline.
      expect(mean, emotion).toBeLessThan(0.08);
      expect(visible, emotion).toBeLessThan(0.002);
    }
  });

  it("draws the profile, both ways, as the kit's authored side view", () => {
    // The kit's profile always carries its flank spots; the canonical genome has
    // none, so the comparison gives it the same three on the flank it shows.
    const spotted = (side: 'left' | 'right') => {
      const genome = canonicalGenome();
      genome.traits.pattern = { ...genome.traits.pattern, kind: 'spotted', spots: { ...genome.traits.pattern.spots, side, backCount: 2 } };
      return genome;
    };
    const profile = (facing: 'left' | 'right', kit: Parameters<typeof renderKit>[0] = {}, state: Partial<BlobbiState> = {}) => {
      const a = raster(renderKit({ stage: 'adult', visualGeneration: 'v2', facing, ...kit }).svg);
      // The kit's drawing has the flank's three marks and nothing on the back: compare those.
      const geo = buildBlobbiGeometry(deriveMorphology(spotted(facing === 'right' ? 'left' : 'right')), { view: 'side', direction: facing, ...state });
      const b = raster(renderGeometryToSvg({ ...geo, markings: { ...geo.markings, marks: geo.markings.marks.filter((mark) => mark.zone === 'flank') } }));
      let sum = 0;
      for (let i = 0; i < a.width * a.height; i++) {
        let d = 0;
        for (let ch = 0; ch < 3; ch++) d = Math.max(d, Math.abs(a.pixels[i * 4 + ch] - b.pixels[i * 4 + ch]));
        sum += d;
      }
      return sum / (a.width * a.height);
    };
    // Everything but the spots matches to anti-aliasing. The spots do not line
    // up exactly, on purpose: the kit's front and profile place them
    // inconsistently (matching the profile would put two of them behind the
    // eye from the front), so they sit where both views can show them.
    expect(profile('right')).toBeLessThan(0.45);
    expect(profile('left')).toBeLessThan(0.45);
    expect(profile('right', { expression: 'happy' }, { expression: { happy: 1 } })).toBeLessThan(0.45);
    expect(profile('left', { eyesClosed: true }, { sleeping: true })).toBeLessThan(0.45);
    // Without spots, the only difference left is the kit's three marks themselves.
    const bare = (() => {
      const a = raster(renderKit({ stage: 'adult', visualGeneration: 'v2', facing: 'right' }).svg);
      const b = raster(renderBlobbiSvg(canonicalGenome(), { view: 'side' }));
      let visible = 0;
      for (let i = 0; i < a.width * a.height; i++) {
        let d = 0;
        for (let ch = 0; ch < 3; ch++) d = Math.max(d, Math.abs(a.pixels[i * 4 + ch] - b.pixels[i * 4 + ch]));
        if (d > 24) visible++;
      }
      return visible / (a.width * a.height);
    })();
    expect(bare).toBeLessThan(0.007);
  });
});
