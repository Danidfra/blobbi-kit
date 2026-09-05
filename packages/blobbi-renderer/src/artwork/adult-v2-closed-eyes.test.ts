/**
 * Adult V2 closed eyes: a deterministic transformation of the canonical
 * artwork, never a separate drawing.
 */
import { describe, it, expect } from 'vitest';
import { closeAdultV2Eyes, closedEyePartFor, ADULT_V2_VIEWS, ADULT_V2_CLOSED_EYE_PARTS, ADULT_V2_PARTS } from './adult/v2';
import { ADULT_V2_FRONT_SVG } from './adult/v2/front';
import { ADULT_V2_SIDE_SVG } from './adult/v2/side';
import { ADULT_V2_BACK_SVG } from './adult/v2/back';
import { renderBlobbiSvg } from './load-blobbi-svg';
import { applyGazeMarkup } from '../svg';

const partsOf = (svg: string) => [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
/** Remove every eye group (open tag through its matching close, nesting-aware) from a drawing. */
function withoutEyeGroups(svg: string): string {
  const open = /<g\b[^>]*\bdata-part="(?:left-eye|right-eye|eye)"[^>]*>/g;
  let out = '';
  let cursor = 0;
  for (let m = open.exec(svg); m; m = open.exec(svg)) {
    const tag = /<g\b|<\/g>/g;
    tag.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = -1;
    for (let t = tag.exec(svg); t; t = tag.exec(svg)) {
      depth += t[0] === '<g' ? 1 : -1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    if (end === -1) throw new Error('unbalanced eye group');
    out += svg.slice(cursor, m.index);
    cursor = end;
    open.lastIndex = end;
  }
  return out + svg.slice(cursor);
}

describe('closeAdultV2Eyes', () => {
  it('is pure and deterministic', () => {
    const a = closeAdultV2Eyes(ADULT_V2_FRONT_SVG);
    const b = closeAdultV2Eyes(ADULT_V2_FRONT_SVG);
    expect(a).toBe(b);
    expect(ADULT_V2_FRONT_SVG).toBe(ADULT_V2_VIEWS.front.markup); // input untouched
  });

  it('front: replaces both eyes with one lid each, in the mouth stroke colour', () => {
    const closed = closeAdultV2Eyes(ADULT_V2_FRONT_SVG);
    const parts = partsOf(closed);
    expect(parts.filter((p) => p === 'left-eye-closed')).toHaveLength(1);
    expect(parts.filter((p) => p === 'right-eye-closed')).toHaveLength(1);
    for (const gone of ['left-eye-white', 'right-eye-white', 'left-eye-inner', 'right-eye-inner', 'left-iris', 'right-iris', 'left-pupil', 'right-pupil', 'left-eye-highlight-primary', 'right-eye-highlight-secondary']) {
      expect(parts, `${gone} must be removed`).not.toContain(gone);
    }
    // The eye groups themselves stay, transform intact, flagged closed.
    expect(closed).toContain('<g id="left-eye" data-part="left-eye" transform="matrix(0.69877802,0,0,0.69877802,79.280551,152.15487)" data-blobbi-eyes="closed">');
    expect(closed).toContain('<g id="right-eye" data-part="right-eye" transform="matrix(0.69877802,0,0,0.69877802,163.09607,145.17025)" data-blobbi-eyes="closed">');
    // Each lid: a round-capped path in the mouth's #21102e, no fill.
    const lids = [...closed.matchAll(/<path id="(left|right)-eye-closed"[^>]*>/g)].map((m) => m[0]);
    expect(lids).toHaveLength(2);
    for (const lid of lids) {
      expect(lid).toContain('stroke="#21102e"');
      expect(lid).toContain('fill="none"');
      expect(lid).toContain('stroke-linecap="round"');
      expect(lid).toMatch(/d="m [\d.]+,[\d.]+ q 58,44 116,0"/);
    }
    // Lids sit on their eye white's centre line: left 319.66-58, right 497.66-58.
    expect(closed).toContain('d="m 261.65656,391.79346 q 58,44 116,0"');
    expect(closed).toContain('d="m 439.65656,391.79346 q 58,44 116,0"');
  });

  it('front: everything outside the eye groups is byte-identical to the awake drawing', () => {
    const closed = closeAdultV2Eyes(ADULT_V2_FRONT_SVG);
    expect(withoutEyeGroups(closed)).toBe(withoutEyeGroups(ADULT_V2_FRONT_SVG));
    // Concretely: eyebrows, cheeks and mouth survive untouched.
    for (const kept of ['data-part="left-eyebrow"', 'data-part="right-eyebrow"', 'data-part="left-cheek-base"', 'data-part="right-cheek-highlight"', 'data-part="mouth"', 'stroke="#4f239e" stroke-width="11"']) {
      expect(closed).toContain(kept);
    }
  });

  it('side: one lid over the profile eye; the eyebrow and mouth stay', () => {
    const closed = closeAdultV2Eyes(ADULT_V2_SIDE_SVG);
    const parts = partsOf(closed);
    expect(parts.filter((p) => p === 'eye-closed')).toHaveLength(1);
    for (const gone of ['eye-white', 'eye-inner', 'iris', 'pupil', 'eye-highlight-primary', 'eye-highlight-secondary']) {
      expect(parts).not.toContain(gone);
    }
    expect(parts).toContain('eyebrow');
    expect(parts).toContain('mouth');
    expect(closed).toContain('data-part="eye" transform="matrix(0.18488502,0,0,0.18488502,50.52122,36.568003)" data-blobbi-eyes="closed"');
    expect(withoutEyeGroups(closed)).toBe(withoutEyeGroups(ADULT_V2_SIDE_SVG));
  });

  it('back: the identity, the very same string', () => {
    expect(closeAdultV2Eyes(ADULT_V2_BACK_SVG)).toBe(ADULT_V2_BACK_SVG);
  });

  it('closed output carries only contract part names', () => {
    for (const view of Object.values(ADULT_V2_VIEWS)) {
      for (const part of partsOf(closeAdultV2Eyes(view.markup))) {
        expect(ADULT_V2_PARTS, part).toContain(part);
      }
    }
    expect(ADULT_V2_CLOSED_EYE_PARTS.map((p) => p.replace(/-closed$/, ''))).toEqual(['left-eye', 'right-eye', 'eye']);
    expect(closedEyePartFor('left-eye')).toBe('left-eye-closed');
  });

  it('gaze markup finds nothing to move on a closed drawing', () => {
    const closed = closeAdultV2Eyes(ADULT_V2_FRONT_SVG);
    expect(applyGazeMarkup(closed, 'v2')).not.toContain('blobbi-pupil');
  });
});

describe('closed eyes through the pipeline', () => {
  it('trait colours apply identically to awake and closed drawings', () => {
    const colors = { baseColor: '#33aa66', secondaryColor: '#ffcc00', eyeColor: '#12abef' };
    for (const facing of ['front', 'right', 'left'] as const) {
      const awake = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, ...colors, instanceId: 'c' });
      const closed = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, ...colors, eyesClosed: true, instanceId: 'c' });
      expect(closed.artwork.eyesClosed).toBe(true);
      expect(closed.artwork.gazeable).toBe(false);
      expect(closed.svg).toContain('stroke="#21102e"'); // lids are never tinted by baseColor
      expect(withoutEyeGroups(closed.svg)).toBe(withoutEyeGroups(awake.svg));
      // The lid id is namespaced with everything else.
      expect(closed.svg).toMatch(/id="b_c_(?:left-|right-)?eye-closed"/);
    }
  });

  it('gaze requested on a sleeping V2 is ignored', () => {
    const { svg, artwork } = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing: 'front', eyesClosed: true, gaze: true, instanceId: 'g' });
    expect(artwork.gazeable).toBe(false);
    expect(svg).not.toContain('data-blobbi-gaze-style');
  });
});
