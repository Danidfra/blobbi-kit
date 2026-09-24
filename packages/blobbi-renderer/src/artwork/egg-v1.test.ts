/**
 * The egg draws as an egg: its own shell, seed colours, four crack states,
 * no face, and the same markup for every generation and facing.
 */
import { describe, expect, it } from 'vitest';
import { buildBlobbiMarkup, resolveBlobbiArtwork } from './registry';
import { renderBlobbiSvg } from './load-blobbi-svg';
import { BLOBBI_EGG_CRACKS, eggCrackLevel, normalizeBlobbiEggCrack } from '../egg-model';

const egg = (eggCrack?: 'none' | 'light' | 'medium' | 'heavy') =>
  resolveBlobbiArtwork({ stage: 'egg', visualGeneration: 'v1', facing: 'front', eyesClosed: false, eggCrack });

const crackGroups = (svg: string) => (svg.match(/data-part="egg-crack-\d"/g) ?? []).length;

describe('egg model', () => {
  it('normalizes unknown input to the intact shell and ranks the states', () => {
    expect(normalizeBlobbiEggCrack(undefined)).toBe('none');
    expect(normalizeBlobbiEggCrack('cracked')).toBe('none');
    expect(normalizeBlobbiEggCrack('heavy')).toBe('heavy');
    expect(BLOBBI_EGG_CRACKS.map(eggCrackLevel)).toEqual([0, 1, 2, 3]);
  });
});

describe('egg artwork', () => {
  it('has a shell, spots and no face parts', () => {
    const svg = egg().markup;
    expect(svg).toContain('data-part="egg-shell"');
    expect(svg).toContain('data-part="egg-spots"');
    expect(svg).not.toMatch(/pupil|mouth|eye/i);
    expect(egg().supports).toEqual({ expression: false, gaze: false, motion: true });
    expect(egg().gazeable).toBe(false);
  });

  it('crack groups are cumulative: none 0, light 1, medium 2, heavy 3', () => {
    expect(crackGroups(egg('none').markup)).toBe(0);
    expect(crackGroups(egg().markup)).toBe(0);
    expect(crackGroups(egg('light').markup)).toBe(1);
    expect(crackGroups(egg('medium').markup)).toBe(2);
    expect(crackGroups(egg('heavy').markup)).toBe(3);
    expect(egg('heavy').markup).toContain('data-part="egg-crack-1"');
  });

  it('is the same drawing for every facing and generation (a shell has no sides)', () => {
    const front = egg('medium').markup;
    for (const facing of ['back', 'left', 'right'] as const) {
      for (const visualGeneration of ['v1', 'v2'] as const) {
        expect(resolveBlobbiArtwork({ stage: 'egg', visualGeneration, facing, eyesClosed: true, eggCrack: 'medium' }).markup).toBe(front);
      }
    }
  });

  it('takes the shell colour from baseColor and the spots from secondaryColor, deterministically', () => {
    const request = { stage: 'egg' as const, visualGeneration: 'v1' as const, facing: 'front' as const, eyesClosed: false };
    const a = buildBlobbiMarkup(request, { baseColor: '#f2a0c0', secondaryColor: '#3366cc' }, 'egg-a').svg;
    const b = buildBlobbiMarkup(request, { baseColor: '#f2a0c0', secondaryColor: '#3366cc' }, 'egg-a').svg;
    expect(a).toBe(b);
    expect(a).toContain('stop-color:#f2a0c0');
    expect(a).toContain('stop-color:#3366cc');
    expect(a).toContain('id="b_egg-a_blobbiEggGradient"');
    const plain = buildBlobbiMarkup(request, {}, 'egg-a').svg;
    expect(plain).toContain('stop-color:#d6b487');
    const unsafe = buildBlobbiMarkup(request, { baseColor: 'url(javascript:1)' }, 'egg-a').svg;
    expect(unsafe).toBe(plain);
  });

  it('renders through the string API with eggCrack and reports the egg stage', () => {
    const { svg, artwork } = renderBlobbiSvg({ stage: 'egg', baseColor: '#aabbcc', eggCrack: 'heavy', instanceId: 'x' });
    expect(artwork.stage).toBe('egg');
    expect(crackGroups(svg)).toBe(3);
    expect(svg).toContain('width="100%"');
  });

  it('other stages ignore eggCrack', () => {
    const baby = resolveBlobbiArtwork({ stage: 'baby', visualGeneration: 'v1', facing: 'front', eyesClosed: false, eggCrack: 'heavy' });
    expect(crackGroups(baby.markup)).toBe(0);
    expect(baby.stage).toBe('baby');
  });
});
