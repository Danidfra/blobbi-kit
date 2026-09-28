/**
 * The V2 ground shadow is the world's to draw: off by default, removable
 * exactly once, and never something a V1 drawing has.
 */
import { describe, expect, it } from 'vitest';
import { BLOBBI_GROUND_SHADOWS, GROUND_SHADOW_PART, hasGroundShadow, normalizeBlobbiGroundShadow, removeGroundShadow } from './ground-shadow';
import { ADULT_V2_VIEWS } from '../artwork/adult/v2';
import { getAdultBaseSvg, getAdultSleepingSvg } from '../artwork/adult/v1';
import { getBabyBaseSvg } from '../artwork/baby/v1';

describe('normalizeBlobbiGroundShadow', () => {
  it('is none unless artwork is asked for, exactly', () => {
    expect(BLOBBI_GROUND_SHADOWS).toEqual(['none', 'artwork']);
    expect(normalizeBlobbiGroundShadow('artwork')).toBe('artwork');
    for (const v of [undefined, null, '', 'none', 'Artwork', 'shadow', 1, {}]) expect(normalizeBlobbiGroundShadow(v)).toBe('none');
  });
});

describe('removeGroundShadow', () => {
  it('removes the one ground-shadow element from every V2 view and nothing else', () => {
    for (const [view, art] of Object.entries(ADULT_V2_VIEWS)) {
      expect(hasGroundShadow(art.markup), view).toBe(true);
      const out = removeGroundShadow(art.markup);
      expect(hasGroundShadow(out)).toBe(false);
      expect(out).not.toContain(`data-part="${GROUND_SHADOW_PART}"`);
      // Exactly one element gone: every other part is still there, once each as before.
      const parts = (svg: string) => [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
      expect(parts(out)).toEqual(parts(art.markup).filter((p) => p !== GROUND_SHADOW_PART));
      // The creature's own contact shading stays.
      expect(out).toContain('data-part="body-shadow"');
      if (view !== 'side') expect(out).toContain('data-part="left-foot-shadow"');
      expect(out.length).toBeLessThan(art.markup.length);
    }
  });

  it('is idempotent, and the identity on markup without a ground shadow (every V1 drawing)', () => {
    const once = removeGroundShadow(ADULT_V2_VIEWS.front.markup);
    expect(removeGroundShadow(once)).toBe(once);
    for (const svg of [getBabyBaseSvg(), getAdultBaseSvg('bloomi'), getAdultSleepingSvg('bloomi')]) {
      expect(hasGroundShadow(svg)).toBe(false);
      expect(removeGroundShadow(svg)).toBe(svg);
    }
  });
});
