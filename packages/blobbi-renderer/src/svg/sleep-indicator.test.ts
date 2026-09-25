/**
 * The baked Zzz of the V1 sleeping drawings is one block per drawing and can
 * be removed as a whole, leaving the creature asleep and everything else
 * byte-identical; awake drawings and V2 are never touched.
 */
import { describe, it, expect } from 'vitest';
import { hasSleepIndicator, removeSleepIndicator, normalizeBlobbiSleepIndicator } from './sleep-indicator';
import { getBabyBaseSvg, getBabySleepingSvg } from '../artwork/baby/v1';
import { ADULT_FORMS, getAdultBaseSvg, getAdultSleepingSvg } from '../artwork/adult/v1';
import { renderBlobbiSvg } from '../artwork/load-blobbi-svg';

const SLEEPING: Array<[string, string]> = [['baby', getBabySleepingSvg()], ...ADULT_FORMS.map((f) => [f, getAdultSleepingSvg(f)] as [string, string])];
const AWAKE: Array<[string, string]> = [['baby', getBabyBaseSvg()], ...ADULT_FORMS.map((f) => [f, getAdultBaseSvg(f)] as [string, string])];

describe('every V1 sleeping drawing carries exactly one removable Zzz', () => {
  it.each(SLEEPING)('%s', (_name, svg) => {
    expect(hasSleepIndicator(svg)).toBe(true);
    const bare = removeSleepIndicator(svg);
    expect(hasSleepIndicator(bare)).toBe(false);
    expect(bare.length).toBeLessThan(svg.length);
    expect(bare).toContain('</svg>');
    // Exactly the label and its Z texts went, nothing else: removing those by
    // hand from the original gives the same drawing (whitespace aside).
    const byHand = svg
      .replace(/<!--\s*(?:Z's for sleeping|"Zzz" dormindo|"Zzz" sleeping)\s*-->/g, '')
      .replace(/<text\b[^>]*>\s*z+\s*<\/text>/gi, '');
    expect(bare.replace(/\s+/g, '')).toBe(byHand.replace(/\s+/g, ''));
    // In particular the defs (the body gradients follow the Zzz in several forms) are all still there.
    expect((bare.match(/<defs>/g) ?? []).length).toBe((svg.match(/<defs>/g) ?? []).length);
    expect((bare.match(/<radialGradient/g) ?? []).length).toBe((svg.match(/<radialGradient/g) ?? []).length);
    expect(bare).not.toMatch(/<text\b[^>]*>\s*z+\s*<\/text>/i);
    // Idempotent and pure.
    expect(removeSleepIndicator(bare)).toBe(bare);
    expect(removeSleepIndicator(svg)).toBe(bare);
  });

  it('keeps the closed eyes: the creature is still asleep without the Zzz', () => {
    const baby = removeSleepIndicator(getBabySleepingSvg());
    expect(baby).toContain('<!-- Sleeping eyes -->');
    expect(baby).toContain('<!-- Peaceful mouth -->');
    expect(baby).not.toMatch(/<text[^>]*>Z<\/text>/);
  });
});

describe('awake drawings and V2 are untouched', () => {
  it.each(AWAKE)('%s comes back as the same string', (_name, svg) => {
    expect(hasSleepIndicator(svg)).toBe(false);
    expect(removeSleepIndicator(svg)).toBe(svg);
  });

  it('V2 has no baked Zzz, asleep or awake', () => {
    for (const facing of ['front', 'right', 'back'] as const) {
      const asleep = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, eyesClosed: true, instanceId: 'z' }).svg;
      expect(hasSleepIndicator(asleep)).toBe(false);
      expect(renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, eyesClosed: true, sleepIndicator: 'none', instanceId: 'z' }).svg).toBe(asleep);
    }
  });
});

describe('through the render API', () => {
  it("'artwork' is the default and draws what 0.3.0 drew; 'none' strips only the Zzz", () => {
    const baby = renderBlobbiSvg({ stage: 'baby', eyesClosed: true, instanceId: 'b' }).svg;
    expect(renderBlobbiSvg({ stage: 'baby', eyesClosed: true, sleepIndicator: 'artwork', instanceId: 'b' }).svg).toBe(baby);
    expect(baby).toMatch(/<text[^>]*>Z<\/text>/);
    const bare = renderBlobbiSvg({ stage: 'baby', eyesClosed: true, sleepIndicator: 'none', instanceId: 'b' }).svg;
    expect(bare).not.toMatch(/<text[^>]*>Z<\/text>/);
    expect(bare).toContain('Sleeping eyes');
    for (const form of ADULT_FORMS) {
      const a = renderBlobbiSvg({ stage: 'adult', adultType: form, eyesClosed: true, instanceId: 'a' }).svg;
      const n = renderBlobbiSvg({ stage: 'adult', adultType: form, eyesClosed: true, sleepIndicator: 'none', instanceId: 'a' }).svg;
      expect(a).toMatch(/Zzz/);
      expect(n).not.toMatch(/Zzz/);
      expect(n.length).toBeLessThan(a.length);
    }
  });

  it("'none' changes nothing while awake", () => {
    for (const stage of ['baby', 'adult'] as const) {
      const awake = renderBlobbiSvg({ stage, instanceId: 'w' }).svg;
      expect(renderBlobbiSvg({ stage, sleepIndicator: 'none', instanceId: 'w' }).svg).toBe(awake);
    }
  });

  it('the option is a closed vocabulary; anything else means artwork', () => {
    expect(normalizeBlobbiSleepIndicator('none')).toBe('none');
    expect(normalizeBlobbiSleepIndicator('artwork')).toBe('artwork');
    expect(normalizeBlobbiSleepIndicator('NONE')).toBe('artwork');
    expect(normalizeBlobbiSleepIndicator(undefined)).toBe('artwork');
    expect(normalizeBlobbiSleepIndicator({ toString: () => 'none' })).toBe('artwork');
  });
});
