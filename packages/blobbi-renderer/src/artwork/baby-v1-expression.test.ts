/**
 * Baby V1 expressions: rules over the one authored face. Neutral is the
 * identity (the fingerprints stay), every other preset changes the markup and
 * only the face, identity (body, colours, ids) is unchanged, gaze still
 * works on an expressed face, the back and the sleeping drawing are not
 * expressed, and the rule is deterministic with no clock and no randomness.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderBlobbiSvg } from './load-blobbi-svg';
import { applyBabyV1Expression, BABY_V1_EXPRESSION_PARTS, getBabyBaseSvg } from './baby/v1';
import { BLOBBI_EMOTIONS, BLOBBI_EMOTION_PRESETS, NEUTRAL_EXPRESSION, normalizeBlobbiExpression, type BlobbiExpression } from '../expression-model';

const COLORS = { baseColor: '#55c4a2', secondaryColor: '#1f6e59', eyeColor: '#26343f' };
const baby = (expression?: BlobbiExpression, extra: Record<string, unknown> = {}) => renderBlobbiSvg({ stage: 'baby', expression, instanceId: 'baby-x', ...COLORS, ...extra });

const parts = (svg: string) => [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
/** The drawing with every expression-touched tag removed: what must never change. */
const stripFace = (svg: string) =>
  svg
    .replace(/<!-- Eyelids \(expression\) -->[\s\S]*?(?=<!-- Mouth -->)/, '')
    .replace(/<(?:path|ellipse|circle)\b[^>]*data-part="[^"]+"[^>]*\/>/g, '')
    .replace(/<!-- Mouth -->\s*<path d="M 42 62 Q 50 68 58 62"[^>]*\/>/, '<!-- Mouth -->')
    .replace(/<ellipse cx="(?:38|62)" cy="45" rx="8" ry="10"[^>]*\/>/g, '')
    .replace(/<circle cx="(?:38|62)" cy="46" r="6" fill="url\([^)]*blobbiPupilGradient\)" \/>/g, '')
    .replace(/<ellipse cx="(?:22|78)" cy="55" rx="6" ry="4" fill="rgba\(255,182,193,0\.5\)" \/>/g, '')
    .replace(/\s+/g, ' ');

describe('neutral is the identity', () => {
  it('the raw rule returns the authored string itself', () => {
    const authored = getBabyBaseSvg();
    expect(applyBabyV1Expression(authored)).toBe(authored);
    expect(applyBabyV1Expression(authored, NEUTRAL_EXPRESSION)).toBe(authored);
    expect(applyBabyV1Expression(authored, normalizeBlobbiExpression({ brows: 'raised' }))).toBe(authored);
  });

  it('through the API, no expression, "neutral" and hostile input draw the same baby', () => {
    const plain = baby().svg;
    expect(baby('neutral').svg).toBe(plain);
    expect(baby({ mouth: 'M 0 0', eyes: '<b>' } as never).svg).toBe(plain);
    expect(parts(plain)).toEqual([]);
  });
});

describe('every non-neutral preset changes the face and only the face', () => {
  const neutral = baby().svg;

  it.each(BLOBBI_EMOTIONS.filter((e) => e !== 'neutral'))('%s', (emotion) => {
    const a = baby(emotion).svg;
    expect(baby(emotion).svg).toBe(a);
    expect(a).not.toBe(neutral);
    expect(stripFace(a)).toBe(stripFace(neutral));
    for (const p of parts(a)) expect(BABY_V1_EXPRESSION_PARTS).toContain(p);
    // Identity: the body path, the colours and the namespaced ids are the same.
    expect(a).toContain('M 50 15 Q 50 10 50 15 Q 72 25 75 55');
    expect(a).toContain(COLORS.baseColor);
    expect([...a.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])).toEqual([...neutral.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  });

  it('each preset draws the parts its model asks for', () => {
    for (const emotion of BLOBBI_EMOTIONS) {
      const preset = BLOBBI_EMOTION_PRESETS[emotion];
      const svg = baby(emotion).svg;
      expect(svg.includes(`data-blobbi-mouth="${preset.mouth}"`)).toBe(preset.mouth !== 'neutral');
      const lidded = preset.eyes === 'half' || (preset.eyes === 'open' && preset.brows === 'lowered');
      expect(svg.includes('data-part="left-eyelid"'), emotion).toBe(lidded);
      expect(svg.includes('data-part="right-eyelid-line"'), emotion).toBe(lidded);
      expect(svg.includes('data-blobbi-eyes="wide"')).toBe(preset.eyes === 'wide');
      expect(svg.includes(`data-blobbi-blush="${preset.blush}"`)).toBe(preset.blush !== 'soft');
    }
  });

  it('brows are drawn as the slant of the lids: lowered on open eyes is an angry lid, raised draws nothing', () => {
    expect(baby({ brows: 'raised' }).svg).toBe(neutral);
    expect(baby({ brows: 'inner-up' }).svg).toBe(neutral);
    const angry = baby({ brows: 'lowered' }).svg;
    expect(angry).not.toBe(neutral);
    expect(angry).toContain('data-part="left-eyelid" data-blobbi-eyes="open" data-blobbi-brows="lowered"');
    // Sad, sleepy and plain half lids are three different lid shapes.
    const lid = (e: BlobbiExpression) => /data-part="left-eyelid"/.exec(baby(e).svg) && /<path d="([^"]+)"[^>]*data-part="left-eyelid"/.exec(baby(e).svg)![1];
    expect(new Set([lid({ eyes: 'half', brows: 'inner-up' }), lid({ eyes: 'half', brows: 'lowered' }), lid({ eyes: 'half' }), lid({ brows: 'lowered' })]).size).toBe(4);
    expect(readFileSync(resolve(__dirname, 'baby/v1/expression.ts'), 'utf8')).toMatch(/brow state is drawn as the\s+\*\s+SLANT of the lids/);
  });

  it('the lid is solid skin (a body-gradient stop) with a lid line in the mouth colour, after the pupils; never a gradient fill', () => {
    for (const emotion of ['sad', 'sleepy', 'upset'] as const) {
      const svg = baby(emotion).svg;
      const lid = /<path d="[^"]+" fill="([^"]+)"[^>]*data-part="left-eyelid"/.exec(svg);
      expect(lid, emotion).not.toBeNull();
      // Solid, and one of the body gradient's own stops, so it follows baseColor.
      expect(lid![1]).toMatch(/^#[0-9a-fA-F]{6}$/);
      const bodyStops = [...(/<radialGradient[^>]*blobbiBodyGradient[^>]*>([\s\S]*?)<\/radialGradient>/.exec(svg)?.[1] ?? '').matchAll(/stop-color:(#[0-9a-fA-F]{6})/g)].map((m) => m[1]);
      expect(bodyStops).toContain(lid![1]);
      const line = /<path d="[^"]+" stroke="(url\(#[^)]+\))"[^>]*data-part="left-eyelid-line"/.exec(svg);
      expect(line![1]).toContain('blobbiMouthGradient');
      expect(svg.indexOf('data-part="left-eyelid"')).toBeGreaterThan(svg.lastIndexOf('blobbiPupilGradient)'));
    }
    // A different base colour gives a different lid colour.
    const other = renderBlobbiSvg({ stage: 'baby', expression: 'sad', instanceId: 'baby-x', baseColor: '#2a6fd6' }).svg;
    expect(/fill="([^"]+)"[^>]*data-part="left-eyelid"/.exec(other)![1]).not.toBe(/fill="([^"]+)"[^>]*data-part="left-eyelid"/.exec(baby('sad').svg)![1]);
  });

  it('every mouth is the authored mouth moved a little: same neighbourhood, same stroke', () => {
    for (const mouth of ['smile', 'grin', 'frown', 'flat'] as const) {
      const tag = /<path d="([^"]+)"[^>]*data-part="mouth"[^>]*\/>/.exec(baby({ mouth }).svg)!;
      const nums = [...tag[1].matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(40);
      expect(Math.max(...xs)).toBeLessThanOrEqual(60);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(59);
      expect(Math.max(...ys)).toBeLessThanOrEqual(72);
      expect(tag[0]).toContain('stroke-width="2.5"');
      expect(tag[0]).toContain('stroke-linecap="round"');
    }
  });
});

describe('what wins', () => {
  it('sleeping wins over any expression: the sleeping drawing, not an expressed face', () => {
    const asleep = baby(undefined, { eyesClosed: true }).svg;
    for (const emotion of BLOBBI_EMOTIONS) expect(baby(emotion, { eyesClosed: true }).svg).toBe(asleep);
    expect(parts(asleep)).toEqual([]);
  });

  it('the back has no face: never expressed, and reports no expression support', () => {
    const back = baby(undefined, { facing: 'back' });
    for (const emotion of BLOBBI_EMOTIONS) expect(baby(emotion, { facing: 'back' }).svg).toBe(back.svg);
    expect(back.artwork.supports.expression).toBe(false);
    expect(baby('happy').artwork.supports.expression).toBe(true);
    expect(baby('happy', { facing: 'left' }).artwork.supports.expression).toBe(true);
  });

  it('gaze still marks the pupils on an expressed face', () => {
    const svg = baby('sleepy', { gaze: true }).svg;
    expect(svg.match(/class="blobbi-pupil"/g)?.length).toBe(4);
    expect(svg).toContain('data-part="left-eyelid"');
    expect(baby('excited', { gaze: true }).svg.match(/class="blobbi-pupil"/g)?.length).toBe(4);
  });

  it('a mirrored facing draws the same expressed face', () => {
    expect(baby('happy', { facing: 'left' }).svg).toBe(baby('happy', { facing: 'right' }).svg);
  });
});

describe('every mouth shape renders', () => {
  it('has a bounding box with height: a gradient stroke on a zero-height path draws nothing', () => {
    for (const mouth of ['smile', 'grin', 'frown', 'flat', 'open'] as const) {
      const svg = baby({ mouth }).svg;
      const tag = /<(path|ellipse)\b[^>]*data-part="mouth"[^>]*\/>/.exec(svg)?.[0] ?? '';
      expect(tag).not.toBe('');
      if (tag.startsWith('<ellipse')) continue;
      const ys = [...(/\bd="([^"]+)"/.exec(tag)?.[1] ?? '').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter((_, i) => i % 2 === 1);
      expect(new Set(ys).size).toBeGreaterThan(1);
    }
  });
});

describe('the rule is pure', () => {
  it('reads no clock and no randomness', () => {
    const source = readFileSync(resolve(__dirname, 'baby/v1/expression.ts'), 'utf8');
    expect(source).not.toMatch(/Math\.random|Date\.now|setTimeout|setInterval|requestAnimationFrame|performance\.now|document\.|window\./);
  });
});
