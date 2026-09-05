/**
 * The artwork registry: deterministic selection across generations and views.
 */
import { describe, it, expect } from 'vitest';
import { resolveBlobbiArtwork, buildBlobbiMarkup, viewForFacing } from './registry';
import { loadBlobbiSvg, renderBlobbiSvg } from './load-blobbi-svg';
import { ADULT_FORMS } from './adult/v1/types/adult.types';
import type { ArtworkRequest, BlobbiFacing } from './types';

const FACINGS: BlobbiFacing[] = ['front', 'back', 'left', 'right'];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

describe('view selection', () => {
  it('V1 has no profile: left and right draw the front, back draws the derived rear', () => {
    expect(viewForFacing('v1', 'front')).toEqual({ view: 'front', mirrored: false });
    expect(viewForFacing('v1', 'left')).toEqual({ view: 'front', mirrored: false });
    expect(viewForFacing('v1', 'right')).toEqual({ view: 'front', mirrored: false });
    expect(viewForFacing('v1', 'back')).toEqual({ view: 'back', mirrored: false });
  });

  it('V2 draws front, back, and one authored side that is mirrored for left', () => {
    expect(viewForFacing('v2', 'front')).toEqual({ view: 'front', mirrored: false });
    expect(viewForFacing('v2', 'back')).toEqual({ view: 'back', mirrored: false });
    expect(viewForFacing('v2', 'right')).toEqual({ view: 'side', mirrored: false });
    expect(viewForFacing('v2', 'left')).toEqual({ view: 'side', mirrored: true });
  });
});

describe('V1 resolution is unchanged', () => {
  it.each(ADULT_FORMS)('%s resolves to its own artwork, awake and sleeping', (form) => {
    const awake = resolveBlobbiArtwork({ stage: 'adult', visualGeneration: 'v1', adultType: form, facing: 'front', eyesClosed: false });
    const asleep = resolveBlobbiArtwork({ stage: 'adult', visualGeneration: 'v1', adultType: form, facing: 'front', eyesClosed: true });
    expect(awake.generation).toBe('v1');
    expect(awake.form).toBe(form);
    expect(awake.markup).not.toBe(asleep.markup);
    expect(awake.gazeable).toBe(true);
    expect(asleep.gazeable).toBe(false);
  });

  it('an unknown V1 form falls back to the default form, as before', () => {
    const resolved = resolveBlobbiArtwork({ stage: 'adult', visualGeneration: 'v1', adultType: 'wormhole', facing: 'front', eyesClosed: false });
    expect(resolved.form).toBe('catti');
  });

  it('egg and baby draw the V1 baby; a V2 baby draws the V1 baby until Baby V2 exists', () => {
    const baby = resolveBlobbiArtwork({ stage: 'baby', visualGeneration: 'v1', facing: 'front', eyesClosed: false });
    const egg = resolveBlobbiArtwork({ stage: 'egg', visualGeneration: 'v1', facing: 'front', eyesClosed: false });
    const v2baby = resolveBlobbiArtwork({ stage: 'baby', visualGeneration: 'v2', facing: 'front', eyesClosed: false });
    expect(baby.stage).toBe('baby');
    expect(egg.markup).toBe(baby.markup);
    expect(v2baby.generation).toBe('v1');
    expect(v2baby.markup).toBe(baby.markup);
  });

  it('renderBlobbiSvg with no generation equals loadBlobbiSvg for every form and view', () => {
    for (const form of ADULT_FORMS) {
      for (const [facing, view] of [['front', 'front'], ['back', 'rear']] as const) {
        const modern = renderBlobbiSvg({ stage: 'adult', adultType: form, baseColor: '#f2a0c0', eyeColor: '#3a2a1a', facing, instanceId: 'eq' }).svg;
        const legacy = loadBlobbiSvg('adult', form, '#f2a0c0', undefined, '#3a2a1a', false, 'eq', view);
        expect(modern).toBe(legacy);
      }
    }
  });
});

describe('V2 resolution', () => {
  it.each(FACINGS)('facing %s resolves predictably', (facing) => {
    const resolved = resolveBlobbiArtwork({ stage: 'adult', visualGeneration: 'v2', facing, eyesClosed: false });
    expect(resolved.generation).toBe('v2');
    expect(resolved.stage).toBe('adult');
    expect(resolved.viewBox).toEqual({ width: 211.66666, height: 238.125 });
    expect(resolved.markup).toContain('data-blobbi-generation="v2"');
    const expected = viewForFacing('v2', facing);
    expect(resolved.view).toBe(expected.view);
    expect(resolved.mirrored).toBe(expected.mirrored);
    expect(resolved.markup).toContain(`data-blobbi-view="${expected.view}"`);
    expect(resolved.gazeable).toBe(facing !== 'back');
  });

  it.each(['front', 'left', 'right'] as const)('closed eyes on %s derive from the awake drawing and are not gazeable', (facing) => {
    const asleep = resolveBlobbiArtwork({ stage: 'adult', visualGeneration: 'v2', facing, eyesClosed: true });
    const awake = resolveBlobbiArtwork({ stage: 'adult', visualGeneration: 'v2', facing, eyesClosed: false });
    expect(asleep.eyesClosed).toBe(true);
    expect(asleep.gazeable).toBe(false);
    expect(awake.gazeable).toBe(true);
    expect(asleep.markup).not.toBe(awake.markup);
    expect(asleep.markup).toContain('-closed"');
    expect(awake.markup).not.toContain('-closed"');
    // Same view, same mirroring, same anchors: only the eyes differ.
    expect(asleep.view).toBe(awake.view);
    expect(asleep.mirrored).toBe(awake.mirrored);
    expect(asleep.anchors).toEqual(awake.anchors);
  });

  it('closed eyes on the back view are the identity: no eyes to close', () => {
    const asleep = resolveBlobbiArtwork({ stage: 'adult', visualGeneration: 'v2', facing: 'back', eyesClosed: true });
    const awake = resolveBlobbiArtwork({ stage: 'adult', visualGeneration: 'v2', facing: 'back', eyesClosed: false });
    expect(asleep.markup).toBe(awake.markup);
    expect(asleep.eyesClosed).toBe(true);
    expect(asleep.gazeable).toBe(false);
  });

  it('ignores adultType: V2 is one anatomy', () => {
    const a = buildBlobbiMarkup({ stage: 'adult', visualGeneration: 'v2', adultType: 'froggi', facing: 'front', eyesClosed: false }, {}, 'x').svg;
    const b = buildBlobbiMarkup({ stage: 'adult', visualGeneration: 'v2', adultType: 'pandi', facing: 'front', eyesClosed: false }, {}, 'x').svg;
    expect(a).toBe(b);
  });

  it('left is the right profile mirrored about the viewBox center, and nothing else differs', () => {
    const right = buildBlobbiMarkup({ stage: 'adult', visualGeneration: 'v2', facing: 'right', eyesClosed: false }, {}, 'm').svg;
    const left = buildBlobbiMarkup({ stage: 'adult', visualGeneration: 'v2', facing: 'left', eyesClosed: false }, {}, 'm').svg;
    expect(right).not.toContain('data-blobbi-mirrored');
    expect(left).toContain('<g data-blobbi-mirrored="x" transform="matrix(-1,0,0,1,211.66666,0)">');
    // Strip the wrapper: the drawing inside is byte-identical to the right profile.
    const unwrapped = left
      .replace('<g data-blobbi-mirrored="x" transform="matrix(-1,0,0,1,211.66666,0)">', '')
      .replace(/<\/g><\/svg>$/, '</svg>');
    expect(unwrapped).toBe(right);
  });

  it('is deterministic: identical requests yield identical markup, repeatedly', () => {
    for (const facing of FACINGS) {
      const req: ArtworkRequest = { stage: 'adult', visualGeneration: 'v2', facing, eyesClosed: false };
      const colors = { baseColor: '#66aa33', secondaryColor: '#aadd88', eyeColor: '#223344' };
      const a = buildBlobbiMarkup(req, colors, 'det').svg;
      const b = buildBlobbiMarkup(req, colors, 'det').svg;
      const c = buildBlobbiMarkup(req, colors, 'det').svg;
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  });

  it('never mutates or requires mutable inputs', () => {
    const req = deepFreeze<ArtworkRequest>({ stage: 'adult', visualGeneration: 'v2', facing: 'left', eyesClosed: false });
    const colors = deepFreeze({ baseColor: '#66aa33', secondaryColor: '#aadd88', eyeColor: '#223344' });
    const before = JSON.stringify({ req, colors });
    expect(() => buildBlobbiMarkup(req, colors, 'frozen')).not.toThrow();
    expect(JSON.stringify({ req, colors })).toBe(before);
  });

  it('namespaces every id per instance, and two instances share none', () => {
    const a = buildBlobbiMarkup({ stage: 'adult', visualGeneration: 'v2', facing: 'front', eyesClosed: false }, {}, 'one').svg;
    const b = buildBlobbiMarkup({ stage: 'adult', visualGeneration: 'v2', facing: 'front', eyesClosed: false }, {}, 'two').svg;
    const ids = (svg: string) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(a).every((id) => id.startsWith('b_one_'))).toBe(true);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
    // Every reference still resolves inside its own document.
    for (const ref of [...a.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2])) {
      expect(ids(a)).toContain(ref);
    }
  });
});
