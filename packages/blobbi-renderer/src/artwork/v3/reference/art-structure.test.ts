/**
 * THE ART DECISIONS THAT LIVE IN THE WRITER.
 *
 * Most of what a V3 Blobbi looks like is decided before any markup exists
 * (genome, morphology, geometry). A few decisions are made only as the
 * drawing is written: what is painted over what, what is clipped to the
 * body, at which fixed opacity, in which of the identity's colours, and the
 * four special-mark shapes themselves. They are as much the Blobbi as its
 * proportions, and Algorithm 1 (V3) freezes them (see
 * `procedural/version.ts`).
 *
 * The reference paint lists already hold all of this for twelve Blobbis, as
 * numbers. This file says the same rules in words, so that a failure names
 * the rule that broke. It reads paint lists, not markup: how the writer
 * spells a rule is free to change.
 */
import { describe, expect, it } from 'vitest';
import { DOCUMENT_TRANSFORM, deriveMorphology, derivePalette } from '../../../procedural';
import { blobbiV3Genome, type BlobbiV3Identity, type BlobbiV3Traits } from '../identity';
import { REFERENCE_CASES } from './cases';
import type { PaintLayer } from './paint-list';
import { REFERENCE_STAGES, paintOf, type ReferenceStage, type ReferenceView } from './reference';

const identityOf = (name: string, traits: Partial<BlobbiV3Traits> = {}): BlobbiV3Identity => {
  const identity = REFERENCE_CASES.find((c) => c.name === name)!.identity;
  return { ...identity, traits: { ...identity.traits, ...traits } };
};
const PATTERNS = ['spotted', 'striped', 'gradient'] as const;
/** One busy individual per pattern: everything that can lie on a body, at once. */
const dressed = (pattern: (typeof PATTERNS)[number]) => identityOf('crowded-crown', { pattern, belly: true, specialMark: 'heart', freckles: true });

const SKIN = ['pattern-gradient', 'belly-patch', 'pattern-stripe', 'side-pattern-mark', 'special-mark-shape'];
const FACE = /eye|mouth|cheek|freckle/;
const where = (layers: readonly PaintLayer[], test: string | RegExp) => layers.flatMap((layer, i) => ((typeof test === 'string' ? layer.part === test : test.test(layer.part)) ? [i] : []));
const first = (layers: readonly PaintLayer[], test: string | RegExp) => where(layers, test)[0] ?? -1;
const last = (layers: readonly PaintLayer[], test: string | RegExp) => where(layers, test).at(-1) ?? -1;
const paintsOf = (layers: readonly PaintLayer[], part: string) => layers.filter((layer) => layer.part === part).map((layer) => layer.paint);
const STAGE_VIEWS = REFERENCE_STAGES.flatMap((stage) => (['front', 'side', 'back'] as const).map((view) => [stage, view] as const));

describe('what lies on the skin', () => {
  it('is painted over the body and under everything else, clipped to the body\'s own silhouette, and nothing else is', () => {
    for (const pattern of PATTERNS) {
      for (const [stage, view] of STAGE_VIEWS) {
        const layers = paintOf(dressed(pattern), stage, view);
        const label = `${pattern} ${stage} ${view}`;
        const body = first(layers, 'body-base');
        const skin = layers.flatMap((layer, i) => (SKIN.includes(layer.part) ? [i] : []));
        expect(skin.length, label).toBeGreaterThan(0);
        // Directly after the body (a baby's inner glow is part of its body), in one run, nothing between.
        const start = body + (layers[body + 1].part === 'body-glow' ? 2 : 1);
        expect(skin, label).toEqual(skin.map((_, k) => start + k));
        for (const i of skin) expect(layers[i].paint, `${label} ${layers[i].part}`).toContain(`clip layer ${body}`);
        layers.forEach((layer, i) => !skin.includes(i) && expect(layer.paint, `${label} ${layer.part}`).toContain('clip none'));
      }
    }
  });

  it('is layered in one order: the gradient\'s wash, the belly patch, stripes, spots, and the special mark on top', () => {
    for (const pattern of PATTERNS) {
      for (const [stage, view] of STAGE_VIEWS) {
        const layers = paintOf(dressed(pattern), stage, view);
        const order = layers.filter((layer) => SKIN.includes(layer.part)).map((layer) => SKIN.indexOf(layer.part));
        expect(order, `${pattern} ${stage} ${view}`).toEqual([...order].sort((a, b) => a - b));
      }
    }
    // All five kinds of thing were seen in that order somewhere, not vacuously.
    const seen = new Set(PATTERNS.flatMap((pattern) => STAGE_VIEWS.flatMap(([stage, view]) => paintOf(dressed(pattern), stage, view).map((layer) => layer.part))).filter((part) => SKIN.includes(part)));
    expect(seen).toEqual(new Set(SKIN));
  });

  it('is tone on tone: the identity\'s pattern colour at a fixed strength, the mark in its own colour, a white glow for the belly', () => {
    for (const stage of REFERENCE_STAGES) {
      const palette = derivePalette({ ...dressed('spotted').colors });
      const secondary = dressed('spotted').colors.secondary;
      expect(palette.marking).toBe(secondary);
      const all = (pattern: (typeof PATTERNS)[number]) => [...paintOf(dressed(pattern), stage, 'front'), ...paintOf(dressed(pattern), stage, 'side'), ...paintOf(dressed(pattern), stage, 'back')];

      const spots = paintsOf(all('spotted'), 'side-pattern-mark');
      expect(spots.length).toBeGreaterThan(3);
      for (const paint of spots) expect(paint).toBe(`fill ${secondary}; stroke none; opacity 1.000 in 0.560; blur 0.00; ${paint.slice(paint.indexOf('clip'))}`);

      const stripes = paintsOf(all('striped'), 'pattern-stripe');
      expect(stripes.length).toBeGreaterThan(3);
      for (const paint of stripes) expect(paint).toContain(`fill ${secondary}; stroke none; opacity 1.000 in 0.500;`);

      // The gradient: nothing at its start, 72% of its strength a little past halfway, its strength at the base.
      const washes = paintsOf(all('gradient'), 'pattern-gradient');
      expect(washes).toHaveLength(3);
      const strength = deriveMorphology(blobbiV3Genome(dressed('gradient')), stage).gradient!.strength;
      expect(strength).toBeGreaterThanOrEqual(0.42);
      expect(strength).toBeLessThanOrEqual(0.58);
      for (const paint of washes) {
        expect(paint).toContain(`fill linear(0.000:${secondary}:0.000 0.550:${secondary}:${(strength * 0.72).toFixed(3)} 1.000:${secondary}:${strength.toFixed(3)}); stroke none; opacity 1.000 in 1.000;`);
      }

      for (const paint of paintsOf(all('spotted'), 'special-mark-shape')) expect(paint).toContain(`fill ${palette.mark}; stroke none; opacity 0.920 in 1.000;`);
      for (const paint of paintsOf(all('spotted'), 'freckle')) expect(paint).toContain(`fill ${palette.line}; stroke none; opacity 1.000 in 0.500;`);
    }
    // The belly patch (an adult's, from the front): a glow that is nothing at its edge.
    const belly = paintsOf(paintOf(dressed('spotted'), 'adult', 'front'), 'belly-patch');
    expect(belly).toHaveLength(1);
    expect(belly[0]).toContain('(0.000:#ffffff:1.000 0.550:#ffffff:0.700 1.000:#ffffff:0.000); stroke none; opacity 0.300 in 1.000;');
  });
});

describe('the special mark\'s four shapes', () => {
  // The same individual with each mark in turn: the same patch of skin (its
  // forehead, square on to the viewer), the same size and turn, so what
  // differs is the shape alone. Measured in the mark's own half-size, a
  // length and an area do not depend on how it is turned.
  const SHAPES = {
    star: { length: 6.253, area: 1.163, rounding: 0.16 },
    heart: { length: 6.314, area: 2.607, rounding: 0 },
    sparkle: { length: 6.044, area: 1.12, rounding: 0.1 },
    moon: { length: 7.46, area: 1.506, rounding: 0.06 },
  } as const;

  it.each(Object.entries(SHAPES))('%s: is this outline, its points rounded by a stroke of its own colour', (kind, shape) => {
    const identity = identityOf('special-mark', { specialMark: kind as keyof typeof SHAPES });
    const mark = deriveMorphology(blobbiV3Genome(identity), 'adult').mark!;
    expect(mark.region).toBe('forehead');
    const r = mark.r * DOCUMENT_TRANSFORM.scale;
    const layer = paintOf(identity, 'adult', 'front').find((l) => l.part === 'special-mark-shape')!;
    const [, , , , length, area, stroke] = layer.where;
    expect(length / r).toBeCloseTo(shape.length, 2);
    expect(area / (r * r)).toBeCloseTo(shape.area, 2);
    expect(stroke / r).toBeCloseTo(shape.rounding, 3);
    const color = derivePalette({ ...identity.colors }).mark;
    expect(layer.paint).toContain(shape.rounding > 0 ? `fill ${color}; stroke ${color} cap butt join round opacity 1.000; opacity 0.920` : `fill ${color}; stroke none; opacity 0.920`);
  });

  it('are four different drawings in the same place', () => {
    const drawn = Object.keys(SHAPES).map((kind) => paintOf(identityOf('special-mark', { specialMark: kind as keyof typeof SHAPES }), 'adult', 'front'));
    const marks = drawn.map((layers) => layers.find((l) => l.part === 'special-mark-shape')!);
    // Nothing else about the drawing changes with the kind of mark.
    for (const layers of drawn) expect(layers.filter((l) => l.part !== 'special-mark-shape').map((l) => [l.where, l.print])).toEqual(drawn[0].filter((l) => l.part !== 'special-mark-shape').map((l) => [l.where, l.print]));
    for (const a of marks) for (const b of marks) if (a !== b) expect(Math.abs(a.where[5] - b.where[5]) + Math.abs(a.where[4] - b.where[4])).toBeGreaterThan(1);
  });
});

describe('what is in front of what', () => {
  const crowded = (stage: ReferenceStage, view: ReferenceView) => paintOf(identityOf('crowded-crown'), stage, view);

  it('adult, from the front: shadows, feet, what is rooted beyond the head, the body, its skin, the crown, the arms, the face, the shine', () => {
    const layers = crowded('adult', 'front');
    const body = first(layers, 'body-base');
    expect(layers[0].part).toBe('body-shadow');
    expect(last(layers, /foot/)).toBeLessThan(body);
    expect(first(layers, /tuft/)).toBeGreaterThan(last(layers, 'special-mark-shape'));
    expect(first(layers, /arm$/)).toBeGreaterThan(last(layers, /tuft/));
    expect(first(layers, FACE)).toBeGreaterThan(last(layers, /arm$/));
    // The face, in the adult's order: eyes, brows, cheeks, freckles, and the mouth over them.
    const order = [/-eye-|iris|pupil/, /eyebrow/, /cheek/, /freckle/, /^mouth$/].map((test) => [first(layers, test), last(layers, test)]);
    for (let k = 1; k < order.length; k++) expect(order[k][0], String(k)).toBeGreaterThan(order[k - 1][1]);
    expect(layers.at(-1)!.part).toBe('body-shine');
    expect(layers.at(-1)!.paint).toContain('fill #ffffff; stroke none; opacity 0.300 in 1.000');
    // The shadow under it: one dark tone, blurred.
    expect(layers[0].paint).toMatch(/^fill #[0-9a-f]{6}; stroke none; opacity 0\.180 in 1\.000; blur [1-9]/);
    for (const paint of paintsOf(layers, 'left-foot-shadow')) expect(paint).toMatch(/opacity 0\.220 in 1\.000; blur [1-9]/);
  });

  it('baby, from the front: the baby\'s own order, its mouth under its blush', () => {
    const layers = crowded('baby', 'front');
    const order = [/-eye-|pupil/, /^mouth$/, /cheek/, /freckle/].map((test) => [first(layers, test), last(layers, test)]);
    for (const [from] of order) expect(from).toBeGreaterThan(first(layers, 'body-base'));
    for (let k = 1; k < order.length; k++) expect(order[k][0], String(k)).toBeGreaterThan(order[k - 1][1]);
    // No limbs, no brows, no ground shadow of its own: a baby is a body and a face.
    expect(where(layers, /arm|foot|eyebrow|shadow/)).toEqual([]);
  });

  it('from behind: no face, and the arms and the tuft\'s leaves are beyond the body', () => {
    for (const stage of REFERENCE_STAGES) {
      const layers = crowded(stage, 'back');
      expect(where(layers, FACE)).toEqual([]);
      const body = first(layers, 'body-base');
      for (const i of where(layers, /arm$|tuft/)) expect(i, `${stage} ${layers[i].part}`).toBeLessThan(body);
    }
    expect(where(crowded('adult', 'back'), /arm$/).length).toBe(2);
    expect(where(crowded('adult', 'back'), /tuft-(main|secondary)/).length).toBe(2);
  });

  it('in profile: the far limbs and the far flank\'s traits are dimmed and beyond the body; the near ones are over it', () => {
    const layers = crowded('adult', 'side');
    const body = first(layers, 'body-base');
    const far = layers.flatMap((layer, i) => (layer.paint.includes(' in 0.800;') ? [i] : []));
    // An antenna, a horn and an ear on the far flank.
    expect(new Set(far.map((i) => layers[i].part.split('-')[0]))).toEqual(new Set(['antenna', 'horn', 'ear']));
    for (const i of [...far, first(layers, 'far-arm'), first(layers, 'far-foot')]) expect(i, layers[i]?.part).toBeLessThan(body);
    expect(first(layers, 'far-arm')).toBeGreaterThanOrEqual(0);
    for (const part of ['near-arm', 'near-foot']) expect(first(layers, part), part).toBeGreaterThan(body);
    // The tail grows out of the back: behind the body, at full strength.
    for (const i of where(layers, /^tail/)) {
      expect(i).toBeLessThan(body);
      expect(layers[i].paint).toContain(' in 1.000;');
    }
    // Nothing on the near side is dimmed.
    layers.slice(body).forEach((layer) => expect(layer.paint, layer.part).not.toContain(' in 0.800;'));
  });

  it('each leaf of the tuft is one object: its fill, then its own vein, with nothing between', () => {
    for (const view of ['front', 'side', 'back'] as const) {
      const layers = crowded('adult', view);
      for (const [leaf, vein] of [['tuft-main', 'tuft-detail-left'], ['tuft-secondary', 'tuft-detail-right']] as const) {
        const i = first(layers, leaf);
        expect(i, `${view} ${leaf}`).toBeGreaterThanOrEqual(0);
        expect(layers[i + 1].part, `${view} ${leaf}`).toBe(vein);
      }
    }
  });

  it('a trait with its root in view is painted root shade first, then itself, then its highlight', () => {
    const layers = crowded('adult', 'side');
    for (const trait of ['antenna', 'ear']) {
      const shade = last(layers, `${trait}-root-shade`);
      expect(shade, trait).toBeGreaterThan(first(layers, 'body-base'));
      expect(layers[shade + 1].part.startsWith(trait), trait).toBe(true);
      expect(layers[shade].paint, trait).toContain('opacity 0.300 in 1.000');
    }
    for (const i of where(layers, /highlight$/)) expect(layers[i - 1].part.split('-')[0]).toBe(layers[i].part.split('-')[0]);
  });
});
