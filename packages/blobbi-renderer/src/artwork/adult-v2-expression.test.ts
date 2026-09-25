/**
 * Adult V2 expressions through the string API: every preset on every view,
 * deterministic, only the face parts change, the back never changes, sleeping
 * wins the eyes, colours and ids still behave, and the V1 adults ignore it all.
 */
import { describe, it, expect } from 'vitest';
import { renderBlobbiSvg, loadBlobbiSvg } from './load-blobbi-svg';
import { applyAdultV2Expression, ADULT_V2_EXPRESSION_PARTS, getAdultV2Artwork } from './adult/v2';
import {
  BLOBBI_EMOTIONS,
  BLOBBI_EYE_STATES,
  BLOBBI_MOUTH_STATES,
  BLOBBI_BROW_STATES,
  BLOBBI_BLUSH_STATES,
  NEUTRAL_EXPRESSION,
  normalizeBlobbiExpression,
  type BlobbiExpression,
} from '../expression-model';
import { ADULT_FORMS } from './adult/v1';

const COLORS = { baseColor: '#55c4a2', secondaryColor: '#1f6e59', eyeColor: '#26343f' };

const v2 = (facing: 'front' | 'right' | 'left' | 'back', expression?: BlobbiExpression, extra: Record<string, unknown> = {}) =>
  renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, expression, instanceId: `x-${facing}`, ...extra });

const parts = (svg: string) => [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
const attr = (svg: string, part: string, name: string) => {
  const tag = new RegExp(`<[a-z]+\\b[^>]*\\bdata-part="${part}"[^>]*>`).exec(svg)?.[0] ?? '';
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
};

/** Remove each eye group (balanced, whatever it now contains) and every other face tag. */
function stripFace(svg: string): string {
  let out = svg;
  const open = /<g\b[^>]*data-part="(?:left-eye|right-eye|eye)"[^>]*>/g;
  for (let m = open.exec(out); m; m = open.exec(out)) {
    const tag = /<g\b|<\/g>/g;
    tag.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = -1;
    for (let t = tag.exec(out); t; t = tag.exec(out)) {
      depth += t[0] === '<g' ? 1 : -1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    if (end === -1) break;
    out = out.slice(0, m.index) + out.slice(end);
    open.lastIndex = m.index;
  }
  return out.replace(
    /<[a-z]+\b[^>]*data-part="(?:mouth|left-eyebrow|right-eyebrow|eyebrow|left-cheek-base|right-cheek-base|cheek|left-cheek-highlight|right-cheek-highlight|cheek-highlight)"[^>]*\/>/g,
    '',
  );
}

/** Every element with an id in the output, for uniqueness/namespace checks. */
const ids = (svg: string) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

describe('every preset draws on the front and the profile', () => {
  const FACE_PARTS_THAT_MAY_CHANGE = new Set([
    'mouth', 'left-eyebrow', 'right-eyebrow', 'eyebrow',
    'left-cheek-base', 'right-cheek-base', 'cheek', 'left-cheek-highlight', 'right-cheek-highlight', 'cheek-highlight',
    'left-eye', 'right-eye', 'eye', ...ADULT_V2_EXPRESSION_PARTS,
    'left-eye-closed', 'right-eye-closed', 'eye-closed',
  ]);

  for (const facing of ['front', 'right'] as const) {
    describe(facing, () => {
      const neutral = v2(facing).svg;

      it.each(BLOBBI_EMOTIONS)('%s is deterministic and touches only face parts', (emotion) => {
        const a = v2(facing, emotion).svg;
        const b = v2(facing, emotion).svg;
        expect(a).toBe(b);
        if (emotion === 'neutral') {
          expect(a).toBe(neutral);
          return;
        }
        expect(a).not.toBe(neutral);
        // Everything outside the face is byte-identical: strip the face parts
        // (their whole tag, or the whole eye group) and compare the rest.
        expect(stripFace(a)).toBe(stripFace(neutral));
        // And every part that differs from neutral is a known face part.
        const changed = new Set(parts(a).filter((p) => !parts(neutral).includes(p)));
        for (const p of changed) expect(FACE_PARTS_THAT_MAY_CHANGE.has(p), `${p} is not a face part`).toBe(true);
      });

      it('marks the requested states on the parts', () => {
        const svg = v2(facing, { eyes: 'half', mouth: 'frown', brows: 'inner-up', blush: 'strong' }).svg;
        expect(attr(svg, 'mouth', 'data-blobbi-mouth')).toBe('frown');
        expect(svg).toContain('data-blobbi-brows="inner-up"');
        expect(svg).toContain('data-blobbi-eyes="half"');
        expect(svg).toContain('data-blobbi-blush="strong"');
        const lidPart = facing === 'front' ? 'left-eye-lid' : 'eye-lid';
        expect(parts(svg)).toContain(lidPart);
        expect(parts(svg)).toContain(`${lidPart}-edge`);
      });

      it('wide eyes keep the movable inner group (gaze still works) and add a scale wrapper inside it', () => {
        const { svg, artwork } = v2(facing, 'surprised', { gaze: true });
        const inner = facing === 'front' ? 'left-eye-inner' : 'eye-inner';
        expect(artwork.gazeable).toBe(true);
        expect(svg).toMatch(new RegExp(`<g[^>]*class="blobbi-pupil"[^>]*data-part="${inner}"`));
        const innerIdx = svg.indexOf(`data-part="${inner}"`);
        const scaleIdx = svg.indexOf(`data-part="${inner.replace('-inner', '-scale')}"`);
        expect(scaleIdx).toBeGreaterThan(innerIdx);
      });

      it('the open mouth is filled with the feature colour; every other mouth stays a stroke', () => {
        expect(attr(v2(facing, { mouth: 'open' }).svg, 'mouth', 'fill')).toBe('#21102e');
        for (const mouth of BLOBBI_MOUTH_STATES.filter((m) => m !== 'open')) {
          expect(attr(v2(facing, { mouth }).svg, 'mouth', 'fill')).toBe('none');
        }
      });

      it('blush none hides both cheek ellipses; strong deepens them', () => {
        const base = facing === 'front' ? 'left-cheek-base' : 'cheek';
        expect(attr(v2(facing, { blush: 'none' }).svg, base, 'opacity')).toBe('0');
        expect(attr(v2(facing, { blush: 'soft' }).svg, base, 'opacity')).toBe('0.74');
        expect(Number(attr(v2(facing, { blush: 'strong' }).svg, base, 'opacity'))).toBeGreaterThan(0.74);
      });

      it('every primitive combination renders without throwing and stays deterministic', () => {
        for (const eyes of BLOBBI_EYE_STATES)
          for (const mouth of BLOBBI_MOUTH_STATES)
            for (const brows of BLOBBI_BROW_STATES)
              for (const blush of BLOBBI_BLUSH_STATES) {
                const e = { eyes, mouth, brows, blush };
                expect(v2(facing, e).svg).toBe(v2(facing, e).svg);
              }
      });
    });
  }
});

describe('the mirrored left profile', () => {
  it.each(BLOBBI_EMOTIONS)('%s is the right profile inside the mirror wrapper', (emotion) => {
    const right = v2('right', emotion).svg;
    const left = v2('left', emotion).svg;
    expect(left).toContain('data-blobbi-mirrored="x"');
    // Same face markup (ids differ only by instance prefix), same mouth path.
    const norm = (s: string) => s.replace(/b_x-(?:right|left)_/g, 'b_X_');
    expect(attr(norm(left), 'mouth', 'd')).toBe(attr(norm(right), 'mouth', 'd'));
    expect(parts(left)).toEqual(parts(right));
  });
});

describe('the back view', () => {
  it.each(BLOBBI_EMOTIONS)('%s: byte-identical to neutral, and reports no expression support', (emotion) => {
    const { svg, artwork } = v2('back', emotion);
    expect(svg).toBe(v2('back').svg);
    expect(artwork.supports).toEqual({ expression: false, gaze: false, motion: true });
  });
});

describe('sleeping wins the eyes', () => {
  it('eyesClosed with a wide-eyed preset draws the closed lids, keeps the mouth and brows', () => {
    const { svg, artwork } = v2('front', 'excited', { eyesClosed: true });
    expect(svg).toContain('data-blobbi-eyes="closed"');
    expect(parts(svg)).toContain('left-eye-closed');
    expect(parts(svg)).not.toContain('left-eye-scale');
    expect(parts(svg)).not.toContain('left-eye-inner');
    expect(attr(svg, 'mouth', 'data-blobbi-mouth')).toBe('grin');
    expect(svg).toContain('data-blobbi-brows="raised"');
    expect(artwork.eyesClosed).toBe(true);
    expect(artwork.gazeable).toBe(false);
  });

  it('eyes: closed through the expression is the same drawing as eyesClosed', () => {
    const a = v2('front', { eyes: 'closed', mouth: 'smile' }).svg;
    const b = v2('front', { mouth: 'smile' }, { eyesClosed: true }).svg;
    expect(a).toBe(b);
    expect(v2('front', { eyes: 'closed' }).artwork.gazeable).toBe(false);
  });
});

describe('colours and ids', () => {
  it('the half lid takes the base colour role and the brows keep their stroke role', () => {
    const svg = v2('front', 'sad', COLORS).svg;
    expect(attr(svg, 'left-eye-lid', 'fill')).toBe(COLORS.baseColor);
    expect(attr(svg, 'left-eye-lid-edge', 'stroke')).toBe('#21102e');
    // The brow stroke role is darken(base, 22); it must not be the authored purple.
    expect(attr(svg, 'left-eyebrow', 'stroke')).not.toBe('#4f239e');
    expect(attr(v2('front', 'sad').svg, 'left-eyebrow', 'stroke')).toBe('#4f239e');
  });

  it('every id is namespaced per instance and unique, including the new lid and scale ids', () => {
    for (const emotion of BLOBBI_EMOTIONS) {
      const svg = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', expression: emotion, instanceId: `inst-${emotion}` }).svg;
      const all = ids(svg);
      expect(new Set(all).size).toBe(all.length);
      for (const id of all) expect(id.startsWith(`b_inst-${emotion}_`), id).toBe(true);
    }
    const half = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', expression: 'sad', instanceId: 'k' }).svg;
    expect(ids(half)).toContain('b_k_left-eye-lid');
    const wide = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', expression: 'surprised', instanceId: 'k' }).svg;
    expect(ids(wide)).toContain('b_k_left-eye-scale');
  });

  it('accepts no geometry: a hostile expression object cannot reach the markup', () => {
    const payload = { mouth: 'M 0 0 L 999 999" onload="x', eyes: '<script>', brows: 'url(#evil)' };
    const svg = v2('front', payload as unknown as BlobbiExpression).svg;
    expect(svg).toBe(v2('front').svg);
    expect(svg).not.toContain('evil');
    expect(svg).not.toContain('onload');
  });
});

describe('applyAdultV2Expression on raw artwork', () => {
  it('neutral with open eyes returns the very same string', () => {
    const raw = getAdultV2Artwork('front').markup;
    expect(applyAdultV2Expression(raw, NEUTRAL_EXPRESSION)).toBe(raw);
    expect(applyAdultV2Expression(raw)).toBe(raw);
  });

  it('is idempotent in structure: applying a preset never leaves unbalanced groups', () => {
    for (const view of ['front', 'side', 'back'] as const) {
      const raw = getAdultV2Artwork(view).markup;
      for (const emotion of BLOBBI_EMOTIONS) {
        const out = applyAdultV2Expression(raw, normalizeBlobbiExpression(emotion));
        expect((out.match(/<g\b/g) ?? []).length).toBe((out.match(/<\/g>/g) ?? []).length);
      }
    }
  });
});

describe('V1 ignores expression', () => {
  it.each(ADULT_FORMS)('%s: any expression is the neutral drawing, and support says so', (form) => {
    const plain = renderBlobbiSvg({ stage: 'adult', adultType: form, instanceId: 'v1', ...COLORS });
    for (const emotion of BLOBBI_EMOTIONS) {
      const expressed = renderBlobbiSvg({ stage: 'adult', adultType: form, expression: emotion, instanceId: 'v1', ...COLORS });
      expect(expressed.svg).toBe(plain.svg);
      expect(expressed.artwork.supports.expression).toBe(false);
    }
    expect(plain.artwork.supports).toEqual({ expression: false, gaze: true, motion: true });
    // The historical positional API is untouched by construction.
    expect(plain.svg).toBe(loadBlobbiSvg('adult', form, COLORS.baseColor, COLORS.secondaryColor, COLORS.eyeColor, false, 'v1'));
  });

  it('the egg ignores it too (the V1 baby front draws it since 0.4.0: baby-v1-expression.test.ts)', () => {
    expect(renderBlobbiSvg({ stage: 'egg', expression: 'sad', instanceId: 'b' }).svg).toBe(renderBlobbiSvg({ stage: 'egg', instanceId: 'b' }).svg);
  });
});
