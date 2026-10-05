/**
 * V3 THROUGH THE KIT: the procedural generation reached the way a host
 * reaches it, through `renderBlobbiSvg` and `<BlobbiRenderer>`.
 *
 * The engine has its own suite (`procedural/*.test.ts`). These tests pin the
 * things that only exist at this level:
 *
 *  - ROUTING: `'v3'` is drawn by the procedural engine, V1 and V2 are drawn
 *    exactly as before, and nothing unknown is ever drawn as V3;
 *  - THE PORT: for the same identity and state the kit's output IS the
 *    engine's, so there is one V3 and not two;
 *  - IDENTITY: explicit colours and trait kinds are honoured, gaps are filled
 *    deterministically from the seed, hostile input cannot reach the markup;
 *  - STATE: the kit's own vocabulary (facing, expression, sleeping, gaze,
 *    motion, egg crack) drives the engine's state, and none of it is identity;
 *  - OFFICIAL FIDELITY: the canonical V3 individual is the V2 adult, the V1
 *    baby and the V1 egg, pixel for pixel within a hair. (The DESIGNED views
 *    of an arbitrary individual have no official artwork to equal, and are
 *    judged by the engine's structural tests instead.)
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Resvg } from '@resvg/resvg-js';
import {
  BLOBBI_EMOTIONS,
  BLOBBI_V3_ALGORITHM_VERSION,
  BLOBBI_V3_MOTION_STYLESHEET,
  BLOBBI_V3_SUPPORTED_ALGORITHMS,
  BlobbiRenderer,
  createBlobbiV3Identity,
  normalizeBlobbiExpression,
  normalizeBlobbiRenderModel,
  normalizeBlobbiV3Visual,
  renderBlobbiSvg,
  resolveBlobbiV3Visual,
  type BlobbiFacing,
  type BlobbiV3Identity,
  type BlobbiVisual,
} from './index';
import { blobbiV3Genome, blobbiV3Key } from './artwork/v3/identity';
import * as engine from './procedural';

const SEED = '8f2d6c1e9b7a40f3a5d2c8e1b6f4937d0a1c5e7f2b9d4a6c8e0f1a3b5c7d9e2f';
const IDENTITY = createBlobbiV3Identity(SEED);
const STAGES = ['egg', 'baby', 'adult'] as const;
const FACINGS: readonly BlobbiFacing[] = ['front', 'right', 'left', 'back'];
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `kit-v3-${i}`);
const v3 = (stage: 'egg' | 'baby' | 'adult', more: Partial<Parameters<typeof renderBlobbiSvg>[0]> = {}) =>
  renderBlobbiSvg({ visualGeneration: 'v3', v3: IDENTITY, stage, instanceId: 't', ...more });

const body = (c: HTMLElement) => c.querySelector('[data-blobbi-body-box]') as HTMLElement;
const box = (c: HTMLElement) => c.querySelector('[data-blobbi-renderer]') as HTMLElement;
const svgOf = (c: HTMLElement) => c.querySelector('[data-blobbi-body-box] svg') as SVGSVGElement;

function raster(svg: string) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: 400 }, background: '#ffffff', font: { loadSystemFonts: false } }).render();
  return { width: image.width, height: image.height, pixels: image.pixels };
}
/** Mean absolute difference per pixel, 0..255. */
function meanDifference(a: string, b: string): number {
  const x = raster(a);
  const y = raster(b);
  expect([y.width, y.height]).toEqual([x.width, x.height]);
  let sum = 0;
  const n = x.width * x.height;
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let ch = 0; ch < 3; ch++) d = Math.max(d, Math.abs(x.pixels[i * 4 + ch] - y.pixels[i * 4 + ch]));
    sum += d;
  }
  return sum / n;
}

// ─── Routing ─────────────────────────────────────────────────────────────────

describe('generation routing', () => {
  it('draws a v3 visual with the procedural engine, at every stage, and says so', () => {
    for (const stage of STAGES) {
      const { svg, artwork } = v3(stage);
      expect(artwork.generation).toBe('v3');
      expect(artwork.stage).toBe(stage);
      expect(svg).toContain('data-blobbi-generation="v3"');
      expect(svg).toContain(`data-blobbi-stage="${stage}"`);
      expect(svg).not.toContain('v3-proto');
    }
  });

  it('leaves V1 and V2 exactly as they were: a V3 identity on their visual changes nothing', () => {
    for (const generation of ['v1', 'v2'] as const) {
      for (const stage of STAGES) {
        for (const facing of FACINGS) {
          const plain = renderBlobbiSvg({ visualGeneration: generation, stage, facing, adultType: 'catti', baseColor: '#66aa33', instanceId: 'k' });
          const withIdentity = renderBlobbiSvg({ visualGeneration: generation, stage, facing, adultType: 'catti', baseColor: '#66aa33', instanceId: 'k', v3: IDENTITY });
          expect(withIdentity.svg).toBe(plain.svg);
          expect(withIdentity.artwork.generation).not.toBe('v3');
          expect(plain.svg).not.toContain('data-rig');
        }
      }
    }
  });

  it('never draws an unknown generation as V3: it is V1, as it has always been', () => {
    for (const generation of ['v4', 'V3', 'v3 ', '', 'procedural', 3]) {
      const { svg, artwork } = renderBlobbiSvg({ visualGeneration: generation as never, stage: 'adult', v3: IDENTITY, instanceId: 'u' });
      expect(artwork.generation).toBe('v1');
      expect(svg).toBe(renderBlobbiSvg({ stage: 'adult', instanceId: 'u' }).svg);
    }
    expect(normalizeBlobbiRenderModel({ visual: { visualGeneration: 'v4' as never, v3: IDENTITY }, instanceId: 'x' }).visualGeneration).toBe('v1');
    expect(normalizeBlobbiRenderModel({ visual: { visualGeneration: 'v4' as never, v3: IDENTITY }, instanceId: 'x' }).v3).toBeNull();
    // A missing generation is V1 too, whatever else the visual carries.
    expect(renderBlobbiSvg({ stage: 'adult', v3: IDENTITY }).artwork.generation).toBe('v1');
  });

  it('carries the identity through the render model only for v3', () => {
    const model = normalizeBlobbiRenderModel({ visual: { visualGeneration: 'v3', v3: IDENTITY, stage: 'adult' }, instanceId: 'm' });
    expect(model.visualGeneration).toBe('v3');
    expect(model.v3).toEqual(IDENTITY);
    expect(model.v3Key).toBe(blobbiV3Key(IDENTITY));
    const v2 = normalizeBlobbiRenderModel({ visual: { visualGeneration: 'v2', v3: IDENTITY, stage: 'adult' }, instanceId: 'm' });
    expect(v2.v3).toBeNull();
    expect(v2.v3Key).toBe('');
  });
});

// ─── The port is the engine ──────────────────────────────────────────────────

describe('the kit draws exactly what the engine draws', () => {
  const view = (facing: BlobbiFacing) =>
    facing === 'back' ? { view: 'back' as const } : facing === 'front' ? { view: 'front' as const } : { view: 'side' as const, direction: facing };

  it('for the same identity and state, byte for byte, at every stage and facing', () => {
    for (const seed of seeds(12)) {
      const identity = createBlobbiV3Identity(seed);
      const genome = blobbiV3Genome(identity);
      for (const stage of STAGES) {
        for (const facing of FACINGS) {
          const kit = renderBlobbiSvg({ visualGeneration: 'v3', v3: identity, stage, facing, instanceId: 'same' }).svg;
          const direct = engine.renderBlobbiSvg(genome, { stage, ...view(facing) }, { idPrefix: 'same', frame: stage === 'adult' ? 'shared' : 'stage' });
          expect(kit, `${seed} ${stage} ${facing}`).toBe(direct);
        }
      }
    }
  });

  it('an explicit identity made from a seed is that seed\'s own individual: nothing is lost by stating it', () => {
    for (const seed of seeds(40)) {
      const fromSeed = engine.generateGenome(seed);
      const fromIdentity = blobbiV3Genome(createBlobbiV3Identity(seed));
      // The scheme is informational (which colour relationship the generator chose); the genome is otherwise identical.
      const { scheme: _scheme, ...rest } = fromSeed;
      expect(fromIdentity).toEqual(rest);
    }
  });

  it('is deterministic: the same identity always gives the same identity, key and markup', () => {
    expect(createBlobbiV3Identity(SEED)).toEqual(IDENTITY);
    expect(IDENTITY.algorithm).toBe(BLOBBI_V3_ALGORITHM_VERSION);
    expect(BLOBBI_V3_ALGORITHM_VERSION).toBe(1);
    for (const stage of STAGES) expect(v3(stage).svg).toBe(v3(stage).svg);
    // Through serialization, as an event would carry it.
    const revived = JSON.parse(JSON.stringify(IDENTITY)) as BlobbiV3Identity;
    expect(blobbiV3Key(revived)).toBe(blobbiV3Key(IDENTITY));
    expect(renderBlobbiSvg({ visualGeneration: 'v3', v3: revived, stage: 'adult', instanceId: 't' }).svg).toBe(v3('adult').svg);
  });

  it('pins one individual end to end, so a change anywhere between a seed and its picture is seen', () => {
    // Deliberately coarse: the identity (explicit) and the size and shape of the drawings (derived).
    expect(IDENTITY).toMatchInlineSnapshot(`
      {
        "algorithm": 1,
        "colors": {
          "base": "#1ba5d4",
          "eye": "#00222e",
          "secondary": "#006965",
        },
        "seed": "8f2d6c1e9b7a40f3a5d2c8e1b6f4937d0a1c5e7f2b9d4a6c8e0f1a3b5c7d9e2f",
        "traits": {
          "antenna": "none",
          "belly": false,
          "ears": "none",
          "freckles": false,
          "horns": "none",
          "pattern": "gradient",
          "specialMark": "heart",
          "tail": "none",
        },
      }
    `);
    expect(STAGES.map((stage) => [stage, v3(stage).svg.length, (v3(stage).svg.match(/data-part=/g) ?? []).length])).toMatchInlineSnapshot(`
      [
        [
          "egg",
          2349,
          9,
        ],
        [
          "baby",
          4336,
          22,
        ],
        [
          "adult",
          8523,
          45,
        ],
      ]
    `);
  });
});

// ─── Identity ────────────────────────────────────────────────────────────────

describe('identity: explicit where stated, the seed\'s where not', () => {
  it('honours explicit colours and trait kinds over what the seed would give', () => {
    const stated: BlobbiV3Identity = {
      seed: SEED,
      algorithm: 1,
      colors: { base: '#3FB7A5', secondary: '#2a6f8f', eye: '#5a2d12' },
      traits: { antenna: 'double', horns: 'top', ears: 'none', tail: 'leaf', pattern: 'striped', specialMark: 'star', belly: true, freckles: true },
    };
    const resolved = normalizeBlobbiV3Visual(stated)!;
    expect(resolved.colors).toEqual({ base: '#3fb7a5', secondary: '#2a6f8f', eye: '#5a2d12' });
    expect(resolved.traits).toEqual(stated.traits);
    const svg = renderBlobbiSvg({ visualGeneration: 'v3', v3: stated, stage: 'adult', instanceId: 's' }).svg;
    expect((svg.match(/data-part="antenna"/g) ?? []).length).toBe(2);
    expect((svg.match(/data-part="horn"/g) ?? []).length).toBe(2);
    expect(svg).not.toContain('data-part="ear"');
    // A tail is behind the body: seen in profile and from the back.
    expect(renderBlobbiSvg({ visualGeneration: 'v3', v3: stated, stage: 'adult', facing: 'right', instanceId: 's' }).svg).toContain('data-part="tail"');
    // The same seed with other explicit colours is the same body in other paint.
    const repainted = renderBlobbiSvg({ visualGeneration: 'v3', v3: { ...stated, colors: { base: '#d9534f', secondary: '#7a1f1c', eye: '#123456' } }, stage: 'adult', instanceId: 's' }).svg;
    const shapes = (s: string) => s.replace(/#[0-9a-f]{6}/g, '#');
    expect(repainted).not.toBe(svg);
    expect(shapes(repainted)).toBe(shapes(svg));
  });

  it('fills gaps field by field from the seed, deterministically, and treats colours as one decision', () => {
    // Only a seed: the seed's whole individual.
    expect(normalizeBlobbiV3Visual({ seed: SEED })).toEqual(IDENTITY);
    // One trait stated, the rest the seed's.
    const oneTrait = normalizeBlobbiV3Visual({ seed: SEED, traits: { tail: 'curl' } })!;
    expect(oneTrait.traits).toEqual({ ...IDENTITY.traits, tail: 'curl' });
    expect(oneTrait.colors).toEqual(IDENTITY.colors);
    // A base colour makes the colours explicit: a missing accent is then "no accent", not the seed's.
    const explicit = normalizeBlobbiV3Visual({ seed: SEED, colors: { base: '#3fb7a5' } })!;
    expect(explicit.colors).toEqual({ base: '#3fb7a5', secondary: IDENTITY.colors.secondary, eye: IDENTITY.colors.eye });
    // Without a base, a lone accent is not an explicit palette.
    expect(normalizeBlobbiV3Visual({ seed: SEED, colors: { accent: '#ff0000' } })!.colors).toEqual(IDENTITY.colors);
    // A missing algorithm version reads as the first one; that, too, is reported as inferred.
    expect(normalizeBlobbiV3Visual({ seed: SEED, colors: IDENTITY.colors, traits: IDENTITY.traits })).toEqual(IDENTITY);
  });

  it('a valid explicit field always wins, and every field taken from the seed instead is named', () => {
    const complete = resolveBlobbiV3Visual(IDENTITY);
    expect(complete).toEqual({ status: 'individual', identity: IDENTITY, inferred: [] });
    // Every explicit field differs from what this seed would give: none is replaced.
    const other: BlobbiV3Identity = {
      seed: SEED,
      algorithm: 1,
      colors: { base: '#d9534f', secondary: '#7a1f1c', eye: '#123456', accent: '#00ff88' },
      traits: { antenna: 'double', horns: 'side', ears: 'none', tail: 'curl', pattern: IDENTITY.traits.pattern === 'gradient' ? 'striped' : 'gradient', specialMark: IDENTITY.traits.specialMark === 'heart' ? 'moon' : 'heart', belly: !IDENTITY.traits.belly, freckles: !IDENTITY.traits.freckles },
    };
    expect(resolveBlobbiV3Visual(other)).toEqual({ status: 'individual', identity: other, inferred: [] });
    // Gaps are filled for drawing, and reported: the input itself is not touched.
    const partial = Object.freeze({ seed: SEED, colors: Object.freeze({ base: '#d9534f', eye: 'not a colour' }), traits: Object.freeze({ tail: 'curl', horns: 'antlers' }) });
    const resolved = resolveBlobbiV3Visual(partial);
    expect(resolved.status).toBe('individual');
    if (resolved.status !== 'individual') throw new Error('unreachable');
    expect(resolved.inferred.sort()).toEqual(['algorithm', 'colors.eye', 'colors.secondary', 'traits.antenna', 'traits.belly', 'traits.ears', 'traits.freckles', 'traits.horns', 'traits.pattern', 'traits.specialMark']);
    expect(resolved.identity.colors.base).toBe('#d9534f');
    expect(resolved.identity.traits.tail).toBe('curl');
    expect(partial).toEqual({ seed: SEED, colors: { base: '#d9534f', eye: 'not a colour' }, traits: { tail: 'curl', horns: 'antlers' } });
    expect(resolveBlobbiV3Visual({ seed: SEED }).status === 'individual' && resolveBlobbiV3Visual({ seed: SEED })).toMatchObject({ inferred: expect.arrayContaining(['algorithm', 'colors.base', 'traits.tail']) });
    expect(resolveBlobbiV3Visual(null)).toEqual({ status: 'none' });
  });

  describe('an algorithm version this package does not implement', () => {
    const future = { ...IDENTITY, algorithm: 2, colors: { base: '#d9534f', secondary: '#7a1f1c', eye: '#123456' }, traits: { ...IDENTITY.traits, horns: 'top' as const, tail: 'curl' as const } };
    const drawn = (visual: unknown, more: Partial<Parameters<typeof renderBlobbiSvg>[0]> = {}) => renderBlobbiSvg({ visualGeneration: 'v3', v3: visual as never, stage: 'adult', instanceId: 'u', ...more });

    it('implements exactly version 1, and says so', () => {
      expect(BLOBBI_V3_SUPPORTED_ALGORITHMS).toEqual([1]);
      expect(BLOBBI_V3_SUPPORTED_ALGORITHMS).toContain(BLOBBI_V3_ALGORITHM_VERSION);
    });

    it('is never resolved to an individual: there is no identity, only what was stated', () => {
      expect(normalizeBlobbiV3Visual(future)).toBeNull();
      expect(resolveBlobbiV3Visual(future)).toEqual({ status: 'unsupported-algorithm', algorithm: 2, seed: SEED, colors: future.colors, traits: future.traits });
      for (const algorithm of [2, 0, -1, 1.5, 99]) expect(resolveBlobbiV3Visual({ ...IDENTITY, algorithm }).status, String(algorithm)).toBe('unsupported-algorithm');
      // Only a stated NUMBER is a version; anything else was not a statement, and reads as absent.
      for (const algorithm of [undefined, null, '2', {}]) expect(resolveBlobbiV3Visual({ ...IDENTITY, algorithm: algorithm as never }).status).toBe('individual');
      // Malformed explicit fields are dropped, not replaced from the seed.
      expect(resolveBlobbiV3Visual({ seed: SEED, algorithm: 2, colors: { base: 'red', eye: '#123456' }, traits: { horns: 'antlers', tail: 'nub', pattern: 'plaid', specialMark: 'blush', belly: 'yes' } })).toEqual({
        status: 'unsupported-algorithm',
        algorithm: 2,
        seed: SEED,
        colors: { eye: '#123456' },
        traits: { tail: 'nub' },
      });
    });

    it('is NOT drawn as version 1: nothing is derived from its seed, and the drawing says it is a stand-in', () => {
      const v2 = drawn(future);
      const asIfV1 = drawn({ ...future, algorithm: 1 });
      expect(v2.artwork.generation).toBe('v3');
      expect(v2.artwork.unsupportedAlgorithm).toBe(2);
      expect(asIfV1.artwork.unsupportedAlgorithm).toBeUndefined();
      expect(v2.svg).toContain('data-blobbi-unsupported-algorithm="2"');
      expect(asIfV1.svg).not.toContain('data-blobbi-unsupported-algorithm');
      // Not this seed's individual under the rules this package has.
      expect(v2.svg).not.toBe(asIfV1.svg);
      // The seed plays no part: another seed with the same explicit identity is the same drawing.
      expect(drawn({ ...future, seed: 'f'.repeat(64) }).svg).toBe(v2.svg);
      expect(drawn({ ...future, seed: 'another seed entirely' }, { stage: 'baby' }).svg).toBe(drawn(future, { stage: 'baby' }).svg);
      expect(drawn({ ...future, seed: 'another seed entirely' }, { stage: 'egg' }).svg).toBe(drawn(future, { stage: 'egg' }).svg);
      // Under version 1 the same two seeds are two different bodies.
      expect(drawn({ ...future, algorithm: 1, seed: 'f'.repeat(64) }).svg).not.toBe(asIfV1.svg);
    });

    it('still shows what the identity explicitly states: its colours and its trait kinds, on the canonical body', () => {
      const v2 = drawn(future);
      expect((v2.svg.match(/data-part="horn"/g) ?? []).length).toBe(2);
      expect(drawn(future, { facing: 'right' }).svg).toContain('data-part="tail"');
      // The canonical body: the proportions of a visual with no identity at all.
      const shapes = (svg: string) => svg.replace(/#[0-9a-f]{6}/g, '#').replace(/ data-blobbi-unsupported-algorithm="\d+"/, '');
      const bare = drawn({ seed: SEED, algorithm: 2 });
      expect(shapes(bare.svg)).toBe(shapes(renderBlobbiSvg({ visualGeneration: 'v3', stage: 'adult', instanceId: 'u' }).svg));
      expect(bare.svg).not.toMatch(/data-part="(antenna|horn|ear|tail)"/);
      // Other stated colours, other paint; the same shapes.
      const repainted = drawn({ ...future, colors: { base: '#3fb7a5', secondary: '#2a6f8f', eye: '#5a2d12' } });
      expect(repainted.svg).not.toBe(v2.svg);
      expect(shapes(repainted.svg)).toBe(shapes(v2.svg));
      // It remains a working drawing: every stage, facing and state.
      for (const stage of STAGES) for (const facing of FACINGS) expect(drawn(future, { stage, facing, motion: 'walking', expression: 'happy' }).svg).not.toMatch(/NaN|undefined/);
    });

    it('is flagged through the render model and on the component, and only then', () => {
      const model = normalizeBlobbiRenderModel({ visual: { visualGeneration: 'v3', v3: future }, instanceId: 'm' });
      expect(model.v3Status).toBe('unsupported-algorithm');
      expect(model.v3).toEqual({ seed: SEED, algorithm: 2, colors: future.colors, traits: future.traits });
      expect(normalizeBlobbiRenderModel({ visual: { visualGeneration: 'v3', v3: IDENTITY }, instanceId: 'm' }).v3Status).toBe('individual');
      expect(normalizeBlobbiRenderModel({ visual: { visualGeneration: 'v3' }, instanceId: 'm' }).v3Status).toBe('none');
      expect(normalizeBlobbiRenderModel({ visual: { visualGeneration: 'v2', v3: future }, instanceId: 'm' }).v3Status).toBe('none');
      const flagged = render(<BlobbiRenderer visual={{ stage: 'adult', visualGeneration: 'v3', v3: future }} instanceId="ua1" />).container;
      expect(box(flagged).getAttribute('data-blobbi-unsupported-algorithm')).toBe('2');
      expect(svgOf(flagged).getAttribute('data-blobbi-unsupported-algorithm')).toBe('2');
      const fine = render(<BlobbiRenderer visual={{ stage: 'adult', visualGeneration: 'v3', v3: IDENTITY }} instanceId="ua2" />).container;
      expect(box(fine).hasAttribute('data-blobbi-unsupported-algorithm')).toBe(false);
      // A change of algorithm version is a change of drawing.
      const { container, rerender } = render(<BlobbiRenderer visual={{ stage: 'adult', visualGeneration: 'v3', v3: { ...future, algorithm: 1 } }} instanceId="ua3" />);
      const before = body(container).innerHTML;
      rerender(<BlobbiRenderer visual={{ stage: 'adult', visualGeneration: 'v3', v3: future }} instanceId="ua3" />);
      expect(body(container).innerHTML).not.toBe(before);
    });
  });

  it('has nothing to draw an individual from without a seed, and draws the canonical body in the visual\'s colours', () => {
    for (const bad of [undefined, null, {}, { seed: '' }, { seed: 7 }, 'seed', []]) expect(normalizeBlobbiV3Visual(bad)).toBeNull();
    const plain = renderBlobbiSvg({ visualGeneration: 'v3', stage: 'adult', instanceId: 'f' });
    expect(plain.artwork.generation).toBe('v3');
    // No traits, the canonical proportions: the same drawing whatever junk identity came with it.
    expect(renderBlobbiSvg({ visualGeneration: 'v3', stage: 'adult', instanceId: 'f', v3: { seed: '' } }).svg).toBe(plain.svg);
    expect(plain.svg).not.toMatch(/data-part="(antenna|horn|ear|tail)"/);
    const tinted = renderBlobbiSvg({ visualGeneration: 'v3', stage: 'adult', instanceId: 'f', baseColor: '#66aa33' });
    expect(tinted.svg).not.toBe(plain.svg);
  });

  const ALLOWED_ELEMENTS = ['svg', 'defs', 'g', 'path', 'ellipse', 'circle', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'filter', 'feGaussianBlur', 'style', 'rect'];

  it('cannot be made to write anything but numbers and hex colours into the markup', () => {
    const hostile = '"><script>alert(1)</script><svg onload="x';
    const visuals: unknown[] = [
      { seed: hostile },
      { seed: SEED, colors: { base: hostile, secondary: 'url(#x)', eye: 'red', accent: hostile } },
      { seed: SEED, traits: { antenna: hostile, horns: hostile, ears: hostile, tail: hostile, pattern: hostile, specialMark: hostile, belly: 1, freckles: null } },
      { seed: SEED, algorithm: hostile, colors: hostile, traits: hostile },
    ];
    for (const visual of visuals) {
      for (const stage of STAGES) {
        const { svg } = renderBlobbiSvg({ visualGeneration: 'v3', v3: visual as never, stage, instanceId: hostile, motion: 'walking', gaze: true });
        expect(svg).not.toMatch(/NaN|Infinity|undefined/);
        // Mounted as a host mounts it, it is one <svg> of the shapes the engine writes, with no handler on any of them.
        const host = document.createElement('div');
        host.innerHTML = svg;
        expect(host.children.length).toBe(1);
        expect(host.firstElementChild!.tagName).toBe('svg');
        for (const el of host.querySelectorAll('*')) {
          expect(ALLOWED_ELEMENTS, el.tagName).toContain(el.tagName);
          for (const attr of el.attributes) expect(attr.name, `${el.tagName} ${attr.name}`).not.toMatch(/^on|href/i);
        }
        // Every id and reference is a sanitized name.
        for (const id of svg.matchAll(/\sid="([^"]*)"/g)) expect(id[1]).toMatch(/^[a-zA-Z0-9_-]+$/);
      }
    }
    // A seed is external data: a very long one is cut, not hashed whole a hundred times.
    expect(normalizeBlobbiV3Visual({ seed: 'x'.repeat(100_000) })!.seed.length).toBe(256);
  });

  it('gives every individual its own picture, and a population more than a few', () => {
    const pictures = new Set(seeds(40).map((seed) => renderBlobbiSvg({ visualGeneration: 'v3', v3: createBlobbiV3Identity(seed), stage: 'adult', instanceId: 'p' }).svg));
    expect(pictures.size).toBe(40);
  });
});

// ─── State ───────────────────────────────────────────────────────────────────

describe('state: the kit\'s words drive the engine, and none of it is identity', () => {
  it('draws the four facings: front, the profile both ways, and the back', () => {
    for (const stage of ['baby', 'adult'] as const) {
      const front = v3(stage, { facing: 'front' });
      const right = v3(stage, { facing: 'right' });
      const left = v3(stage, { facing: 'left' });
      const back = v3(stage, { facing: 'back' });
      expect([front, right, left, back].map((r) => r.artwork.view)).toEqual(['front', 'side', 'side', 'back']);
      expect([front, right, left, back].map((r) => r.artwork.mirrored)).toEqual([false, false, true, false]);
      expect(right.svg).toContain('data-blobbi-direction="right"');
      expect(left.svg).toContain('data-blobbi-direction="left"');
      expect(new Set([front.svg, right.svg, left.svg, back.svg]).size).toBe(4);
      // A back has no face; everything else does.
      expect(back.artwork.supports).toEqual({ expression: false, gaze: false, motion: true });
      expect(front.artwork.supports).toEqual({ expression: true, gaze: true, motion: true });
      expect(back.svg).not.toContain('data-part="mouth"');
    }
    // An egg is one drawing from every side.
    expect(new Set(FACINGS.map((facing) => v3('egg', { facing }).svg)).size).toBe(1);
  });

  it('draws every preset, and a preset spelled as parts is that preset', () => {
    for (const stage of ['baby', 'adult'] as const) {
      const faces = new Map(BLOBBI_EMOTIONS.map((emotion) => [emotion, v3(stage, { expression: emotion }).svg]));
      expect(new Set(faces.values()).size).toBe(BLOBBI_EMOTIONS.length);
      expect(faces.get('neutral')).toBe(v3(stage).svg);
      for (const emotion of BLOBBI_EMOTIONS) {
        const parts = normalizeBlobbiExpression(emotion);
        expect(v3(stage, { expression: { eyes: parts.eyes, mouth: parts.mouth, brows: parts.brows, blush: parts.blush } }).svg).toBe(faces.get(emotion));
        // And it is the engine's own key pose at full weight.
        if (emotion !== 'neutral') {
          const direct = engine.renderBlobbiSvg(blobbiV3Genome(IDENTITY), { stage, expression: { [emotion]: 1 } }, { idPrefix: 't', frame: stage === 'adult' ? 'shared' : 'stage' });
          expect(faces.get(emotion)).toBe(direct);
        }
      }
    }
  });

  it('blends presets continuously on V3; V1 and V2 draw the preset that dominates', () => {
    const neutral = v3('adult').svg;
    const happy = v3('adult', { expression: 'happy' }).svg;
    const half = v3('adult', { expression: { blend: { happy: 0.5 } } }).svg;
    const mixed = v3('adult', { expression: { blend: { happy: 0.5, sad: 0.25 } } }).svg;
    expect(new Set([neutral, happy, half, mixed]).size).toBe(4);
    expect(v3('adult', { expression: { blend: { happy: 1 } } }).svg).toBe(happy);
    expect(v3('adult', { expression: { blend: {} } }).svg).toBe(neutral);
    // Weights are clamped and made convex before they reach the face.
    expect(v3('adult', { expression: { blend: { happy: 7 } } }).svg).toBe(happy);
    expect(normalizeBlobbiExpression({ blend: { happy: 3, sad: 1 } }).blend).toEqual({ happy: 0.5, sad: 0.5 });
    expect(normalizeBlobbiExpression({ blend: { happy: 0.9, sad: 0.3, bogus: 1, upset: Number.NaN } as never }).blend).toEqual({ happy: 0.75, sad: 0.25 });
    // The same input on authored artwork: the dominant preset, or neutral.
    const v2 = (expression: unknown) => renderBlobbiSvg({ visualGeneration: 'v2', stage: 'adult', instanceId: 'b', expression: expression as never }).svg;
    expect(v2({ blend: { happy: 0.8 } })).toBe(v2('happy'));
    expect(v2({ blend: { happy: 0.3 } })).toBe(v2('neutral'));
    expect(v2({ blend: { happy: 0.4, sad: 0.6 } })).toBe(v2('sad'));
  });

  it('sleeps: closed eyes, nothing left to gaze with, at any facing with a face', () => {
    for (const stage of ['baby', 'adult'] as const) {
      const asleep = v3(stage, { eyesClosed: true });
      expect(asleep.svg).toContain('data-blobbi-eyes="closed"');
      expect(asleep.artwork.eyesClosed).toBe(true);
      expect(asleep.artwork.gazeable).toBe(false);
      expect(asleep.svg).not.toBe(v3(stage).svg);
      expect(v3(stage, { eyesClosed: true, gaze: true }).svg).not.toContain('blobbi-pupil');
    }
  });

  it('marks live gaze the way V1 and V2 do, with this individual\'s own travel, mirrored with the profile', () => {
    const plain = v3('adult');
    const gazing = v3('adult', { gaze: true });
    expect(plain.svg).not.toContain('blobbi-pupil');
    expect((gazing.svg.match(/class="blobbi-pupil"/g) ?? []).length).toBe(2);
    const travel = Number(/--blobbi-eye-x,0\) \* (-?[0-9.]+)px/.exec(gazing.svg)![1]);
    expect(travel).toBeCloseTo(plain.artwork.gazeTravel!, 6);
    expect(travel).toBeGreaterThan(4);
    // The left profile is a reflection: screen-right must still be screen-right.
    const left = v3('adult', { facing: 'left', gaze: true }).svg;
    const right = v3('adult', { facing: 'right', gaze: true }).svg;
    expect(Number(/--blobbi-eye-x,0\) \* (-?[0-9.]+)px/.exec(left)![1])).toBeLessThan(0);
    expect(Number(/--blobbi-eye-x,0\) \* (-?[0-9.]+)px/.exec(right)![1])).toBeGreaterThan(0);
    // A gaze given as a direction is drawn into the picture instead.
    const looking = v3('adult', { gaze: { x: 1, y: 0 } }).svg;
    expect(looking).not.toContain('blobbi-pupil');
    expect(looking).not.toBe(plain.svg);
    expect(v3('adult', { gaze: { x: 0, y: 0 } }).svg).toBe(plain.svg);
  });

  it('moves by its own rig, never by the wrapper animation, and bakes a frame on request', () => {
    for (const stage of STAGES) {
      const still = v3(stage);
      expect(still.artwork.motionStyles).toBe('');
      expect(still.svg).not.toContain('data-blobbi-rig-motion');
      for (const motion of ['idle', 'walking'] as const) {
        const live = v3(stage, { motion });
        expect(live.svg).toContain(`data-blobbi-rig-motion="${motion}"`);
        // The attribute the wrapper stylesheet animates is not on a V3 drawing.
        expect(live.svg).not.toMatch(/\sdata-blobbi-motion="/);
        // The string is self-contained: it carries the part of the rig stylesheet it needs, and only that.
        expect(live.svg).toContain('<style data-blobbi-rig-motion-styles="">');
        expect(live.artwork.motionStyles!.length).toBeGreaterThan(500);
        expect(live.artwork.motionStyles!.length).toBeLessThan(BLOBBI_V3_MOTION_STYLESHEET.length / 3);
        expect(live.artwork.motionStyles).toContain('prefers-reduced-motion');
        // A baked frame is plain markup: no attribute, no stylesheet, and it differs from the still drawing.
        const frame = v3(stage, { motion, motionPhase: 0.3 });
        expect(frame.svg).not.toContain('data-blobbi-rig-motion');
        expect(frame.svg).not.toContain('<style');
        expect(frame.svg).not.toBe(still.svg);
        expect(frame.svg).toBe(v3(stage, { motion, motionPhase: 0.3 }).svg);
      }
    }
    // V2 is still wrapped, exactly as before.
    const v2 = renderBlobbiSvg({ visualGeneration: 'v2', stage: 'adult', motion: 'walking', instanceId: 'w' });
    expect(v2.svg).toMatch(/\sdata-blobbi-motion="walking"/);
    expect(v2.artwork.motionStyles).toBeUndefined();
  });

  it('gives each instance its own place in the cycle, from its id alone', () => {
    const offsets = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) => /--pb-phase:([0-9.]+)/.exec(v3('adult', { motion: 'walking', instanceId: id }).svg)?.[1] ?? '0'));
    expect(offsets.size).toBeGreaterThan(3);
    expect(v3('adult', { motion: 'walking', instanceId: 'a' }).svg).toBe(v3('adult', { motion: 'walking', instanceId: 'a' }).svg);
  });

  it('cracks the egg by the host\'s word, and only the egg', () => {
    const shells = ['none', 'light', 'medium', 'heavy'].map((eggCrack) => v3('egg', { eggCrack: eggCrack as never }).svg);
    expect(new Set(shells).size).toBe(4);
    expect(v3('adult', { eggCrack: 'heavy' }).svg).toBe(v3('adult').svg);
    expect(v3('egg', { eggCrack: 'shattered' as never }).svg).toBe(shells[0]);
  });

  it('keeps the ground shadow out unless asked, like V2', () => {
    for (const stage of ['egg', 'adult'] as const) {
      expect(v3(stage).svg).not.toContain('data-part="ground-shadow"');
      expect(v3(stage, { groundShadow: 'artwork' }).svg).toContain('data-part="ground-shadow"');
    }
  });

  it('frames each stage as its official artwork is framed, and reports sane anchors', () => {
    const viewBox = (svg: string) => /viewBox="([^"]+)"/.exec(svg)![1].split(' ').map(Number);
    const adult = viewBox(v3('adult').svg);
    expect(adult.slice(2)).toEqual([211.66666, 238.125]);
    for (const stage of ['egg', 'baby'] as const) {
      const [, , w, h] = viewBox(v3(stage).svg);
      expect(w).toBeCloseTo(h, 6);
      expect(v3(stage).artwork.viewBox.width).toBeCloseTo(w, 4);
    }
    for (const stage of STAGES) {
      for (const facing of FACINGS) {
        const { footprint, ...anchors } = v3(stage, { facing }).artwork.anchors;
        for (const value of Object.values(anchors)) {
          expect(value).toBeGreaterThan(0);
          expect(value).toBeLessThan(1);
        }
        expect(anchors.headTopY).toBeLessThan(anchors.groundY);
        // What it stands on: under it, and narrower than its frame.
        expect(footprint).toBeDefined();
        expect(Math.abs(footprint!.centerX - anchors.centerX)).toBeLessThan(0.08);
        expect(footprint!.width).toBeGreaterThan(0.2);
        expect(footprint!.width).toBeLessThan(0.75);
      }
    }
  });
});

// ─── The component ───────────────────────────────────────────────────────────

describe('<BlobbiRenderer> with a v3 visual', () => {
  const VISUAL: BlobbiVisual = { stage: 'adult', visualGeneration: 'v3', v3: IDENTITY, name: 'Sprout' };

  it('draws the same markup as the string API, in the same box as every other generation', () => {
    const { container } = render(<BlobbiRenderer visual={VISUAL} instanceId="c1" size="xl" />);
    expect(box(container).dataset.blobbiGeneration).toBe('v3');
    expect(box(container).dataset.blobbiStage).toBe('adult');
    expect(box(container).style.width).toBe('128px');
    expect(svgOf(container).getAttribute('data-blobbi-generation')).toBe('v3');
    const fromString = renderBlobbiSvg({ visualGeneration: 'v3', v3: IDENTITY, stage: 'adult', instanceId: 'c1' }).svg;
    const mounted = document.createElement('div');
    mounted.innerHTML = fromString;
    expect(body(container).innerHTML).toBe(mounted.innerHTML);
    expect(box(container).hasAttribute('data-blobbi-expression-support')).toBe(true);
  });

  it('follows the stage: one identity as an egg, a baby and an adult', () => {
    const drawings = STAGES.map((stage) => {
      const { container } = render(<BlobbiRenderer visual={{ ...VISUAL, stage }} instanceId="c2" eggCrack="medium" />);
      expect(svgOf(container).getAttribute('data-blobbi-stage')).toBe(stage);
      return body(container).innerHTML;
    });
    expect(new Set(drawings).size).toBe(3);
  });

  it('animates its own rig: the body box is not wrapped, and its stylesheet is mounted beside it', () => {
    const moving = render(<BlobbiRenderer visual={VISUAL} instanceId="c3" motion="walking" facing="right" />).container;
    expect(body(moving).hasAttribute('data-blobbi-motion')).toBe(false);
    expect(svgOf(moving).getAttribute('data-blobbi-rig-motion')).toBe('walking');
    const sheet = moving.querySelector('style[data-blobbi-rig-motion-styles]');
    expect(sheet).not.toBeNull();
    expect(sheet!.textContent).toContain('[data-blobbi-rig-motion="walking"]');
    // Still: nothing extra at all.
    const still = render(<BlobbiRenderer visual={VISUAL} instanceId="c3" />).container;
    expect(still.querySelector('style[data-blobbi-rig-motion-styles]')).toBeNull();
    expect(svgOf(still).hasAttribute('data-blobbi-rig-motion')).toBe(false);
    // V2 beside it is wrapped exactly as before.
    const v2 = render(<BlobbiRenderer visual={{ stage: 'adult', visualGeneration: 'v2' }} instanceId="c4" motion="walking" />).container;
    expect(body(v2).getAttribute('data-blobbi-motion')).toBe('walking');
    expect(v2.querySelector('style[data-blobbi-rig-motion-styles]')).toBeNull();
  });

  it('steers the eyes through the same CSS variables, without redrawing for a direction', () => {
    const { container, rerender } = render(<BlobbiRenderer visual={VISUAL} instanceId="c5" eyeOffset={{ x: 0.5, y: -0.25 }} />);
    expect(body(container).style.getPropertyValue('--blobbi-eye-x')).toBe('0.5');
    expect(svgOf(container).querySelectorAll('.blobbi-pupil').length).toBe(2);
    const before = svgOf(container);
    rerender(<BlobbiRenderer visual={VISUAL} instanceId="c5" eyeOffset={{ x: -1, y: 1 }} />);
    expect(body(container).style.getPropertyValue('--blobbi-eye-x')).toBe('-1');
    // The same SVG element: the markup was not replaced.
    expect(svgOf(container)).toBe(before);
  });

  it('does not redraw for an equal identity or an equal blend, and does for a different one', () => {
    const { container, rerender } = render(<BlobbiRenderer visual={VISUAL} instanceId="c6" expression={{ blend: { happy: 0.5 } }} />);
    const first = svgOf(container);
    rerender(<BlobbiRenderer visual={{ ...VISUAL, v3: JSON.parse(JSON.stringify(IDENTITY)) }} instanceId="c6" expression={{ blend: { happy: 0.5 } }} />);
    expect(svgOf(container)).toBe(first);
    rerender(<BlobbiRenderer visual={{ ...VISUAL, v3: { ...IDENTITY, traits: { ...IDENTITY.traits, tail: IDENTITY.traits.tail === 'leaf' ? 'curl' : 'leaf' } } }} instanceId="c6" />);
    expect(svgOf(container)).not.toBe(first);
  });

  it('sleeps and expresses through the same props as every generation', () => {
    const asleep = render(<BlobbiRenderer visual={VISUAL} instanceId="c7" isSleeping />).container;
    expect(svgOf(asleep).querySelector('[data-blobbi-eyes="closed"]')).not.toBeNull();
    const happy = render(<BlobbiRenderer visual={VISUAL} instanceId="c7" expression="happy" />).container;
    const neutral = render(<BlobbiRenderer visual={VISUAL} instanceId="c7" />).container;
    expect(body(happy).innerHTML).not.toBe(body(neutral).innerHTML);
  });
});

// ─── Official fidelity ───────────────────────────────────────────────────────

describe('official fidelity: the canonical V3 individual is the official artwork', () => {
  // A v3 visual with no identity draws the canonical genome: every gene at zero, no optional trait.
  const canonical = (stage: 'egg' | 'baby' | 'adult', more: Partial<Parameters<typeof renderBlobbiSvg>[0]> = {}) =>
    renderBlobbiSvg({ visualGeneration: 'v3', stage, instanceId: 'o', ...more }).svg;

  it('adult: the V2 adult, front and profile, and its recolouring', () => {
    const official = (more: Partial<Parameters<typeof renderBlobbiSvg>[0]> = {}) => renderBlobbiSvg({ visualGeneration: 'v2', stage: 'adult', instanceId: 'o', ...more }).svg;
    expect(meanDifference(official(), canonical('adult'))).toBeLessThan(0.05);
    expect(meanDifference(official({ facing: 'right' }), canonical('adult', { facing: 'right' }))).toBeLessThan(0.6);
    expect(meanDifference(official({ facing: 'left' }), canonical('adult', { facing: 'left' }))).toBeLessThan(0.6);
    // The plain colours of a visual go through the kit's own mapping: the same recoloured adult.
    const tint = { baseColor: '#66aa33', secondaryColor: '#aadd88', eyeColor: '#223344' };
    expect(meanDifference(official(tint), canonical('adult', tint))).toBeLessThan(0.05);
    // Sanity: the measure does see a real difference.
    expect(meanDifference(official(), official(tint))).toBeGreaterThan(5);
  });

  it('adult: the official expressions and the sleeping face', () => {
    const official = (more: Partial<Parameters<typeof renderBlobbiSvg>[0]>) => renderBlobbiSvg({ visualGeneration: 'v2', stage: 'adult', instanceId: 'o', ...more }).svg;
    for (const expression of ['happy', 'excited', 'upset'] as const) expect(meanDifference(official({ expression }), canonical('adult', { expression }))).toBeLessThan(0.1);
    expect(meanDifference(official({ eyesClosed: true }), canonical('adult', { eyesClosed: true }))).toBeLessThan(0.1);
  });

  it('baby: the official floating baby', () => {
    const official = renderBlobbiSvg({ visualGeneration: 'v1', stage: 'baby', instanceId: 'o' }).svg;
    expect(meanDifference(official, canonical('baby'))).toBeLessThan(0.5);
    expect(canonical('baby')).not.toMatch(/data-part="(left-arm|right-arm|left-foot|right-foot|tuft-main)"/);
  });

  it('egg: the official egg, at every crack level', () => {
    for (const eggCrack of ['none', 'light', 'medium', 'heavy'] as const) {
      const official = renderBlobbiSvg({ visualGeneration: 'v1', stage: 'egg', eggCrack, instanceId: 'o' }).svg;
      expect(meanDifference(official, canonical('egg', { eggCrack })), eggCrack).toBeLessThan(0.1);
    }
  });
});
