/**
 * Adult V2 artwork: the semantic contract, the derived back view, trait colors.
 */
import { describe, it, expect } from 'vitest';
import {
  ADULT_V2_VIEWS,
  ADULT_V2_FRONT_PARTS,
  ADULT_V2_SIDE_PARTS,
  ADULT_V2_BACK_PARTS,
  ADULT_V2_FACE_PARTS,
  ADULT_V2_GAZE_PARTS,
  ADULT_V2_ROLE_COLORS,
  customizeAdultV2Svg,
} from './adult/v2';
import { ADULT_V2_FRONT_SVG } from './adult/v2/front';
import { renderBlobbiSvg } from './load-blobbi-svg';

const partsOf = (svg: string) => [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
/** The drawing without its `<defs>`: shared gradients legitimately mention eyes. */
const drawing = (svg: string) => svg.replace(/<defs[\s\S]*?<\/defs>/, '');
const elementByPart = (svg: string, part: string) => {
  const m = new RegExp(`<(\\w+)[^>]*data-part="${part}"[^>]*>`).exec(svg);
  return m ? m[0] : null;
};

describe('the semantic part contract', () => {
  it('the front view carries exactly its declared parts, each once', () => {
    const parts = partsOf(ADULT_V2_VIEWS.front.markup);
    expect(new Set(parts)).toEqual(new Set(ADULT_V2_FRONT_PARTS));
    // Every part appears once, except the three pattern marks.
    const counts = new Map<string, number>();
    for (const part of parts) counts.set(part, (counts.get(part) ?? 0) + 1);
    for (const [part, n] of counts) expect(n, part).toBe(part === 'side-pattern-mark' ? 3 : 1);
  });

  it('the side view carries exactly its declared parts', () => {
    const parts = partsOf(ADULT_V2_VIEWS.side.markup);
    expect(new Set(parts)).toEqual(new Set(ADULT_V2_SIDE_PARTS));
    expect(parts.filter((p) => p === 'side-pattern-mark')).toHaveLength(3);
  });

  it('the back view carries exactly its declared parts and no face part at all', () => {
    const parts = new Set(partsOf(ADULT_V2_VIEWS.back.markup));
    expect(parts).toEqual(new Set(ADULT_V2_BACK_PARTS));
    for (const face of ADULT_V2_FACE_PARTS) {
      expect(parts.has(face), `back view must not carry ${face}`).toBe(false);
    }
    // Shared defs keep the (unused) eye gradients; the DRAWING has no face.
    expect(drawing(ADULT_V2_VIEWS.back.markup)).not.toMatch(/eye|pupil|iris|mouth|cheek|eyebrow/i);
  });

  it('every movable gaze group is a <g> marked data-movable, holding iris and pupil', () => {
    for (const [view, art] of Object.entries(ADULT_V2_VIEWS)) {
      const groups = [...art.markup.matchAll(/<g\b[^>]*data-part="(left-eye-inner|right-eye-inner|eye-inner)"[^>]*>/g)];
      if (view === 'back') {
        expect(groups).toHaveLength(0);
        continue;
      }
      expect(groups.length).toBe(view === 'front' ? 2 : 1);
      for (const g of groups) {
        expect(g[0]).toContain('data-movable="true"');
        expect(ADULT_V2_GAZE_PARTS).toContain(g[1]);
      }
      // The eye white is a sibling OUTSIDE the movable group.
      for (const inner of groups.map((g) => g[1])) {
        const white = inner.replace('-inner', '-white');
        const start = art.markup.indexOf(`data-part="${white}"`);
        const innerStart = art.markup.indexOf(`data-part="${inner}"`);
        expect(start).toBeGreaterThan(-1);
        expect(start).toBeLessThan(innerStart);
      }
    }
  });

  it('code never needs an Inkscape group id: no gNN, pathNN, ellipseNN or circleNN carries a part', () => {
    for (const art of Object.values(ADULT_V2_VIEWS)) {
      for (const m of art.markup.matchAll(/<\w+\b[^>]*\bid="([^"]+)"[^>]*data-part=/g)) {
        expect(m[1]).not.toMatch(/^(g|path|ellipse|circle)\d/);
      }
    }
  });

  it('every view keeps the authored viewBox and no fixed width/height', () => {
    for (const art of Object.values(ADULT_V2_VIEWS)) {
      expect(art.markup).toMatch(/^<svg viewBox="0 0 211\.66666 238\.125"/);
      expect(art.markup).not.toMatch(/<svg[^>]*\swidth=/);
    }
  });
});

describe('the back view is the front anatomy, restacked', () => {
  const front = ADULT_V2_VIEWS.front.markup;
  const back = ADULT_V2_VIEWS.back.markup;

  it('reuses the exact body, foot, arm, tuft and shadow geometry', () => {
    const geometry = (svg: string, part: string) => {
      const el = elementByPart(svg, part)!;
      return el.match(/\b(d|cx|cy|rx|ry|transform)="[^"]*"/g)!.sort().join(' ');
    };
    expect(geometry(back, 'body-base')).toBe(geometry(front, 'body-base'));
    expect(geometry(back, 'ground-shadow')).toBe(geometry(front, 'ground-shadow'));
    expect(geometry(back, 'body-shadow')).toBe(geometry(front, 'body-shadow'));
    expect(geometry(back, 'tuft-main')).toBe(geometry(front, 'tuft-main'));
    expect(geometry(back, 'tuft-secondary')).toBe(geometry(front, 'tuft-secondary'));
    // Screen-left limbs are the character's RIGHT limbs from behind.
    expect(geometry(back, 'right-arm')).toBe(geometry(front, 'left-arm'));
    expect(geometry(back, 'left-arm')).toBe(geometry(front, 'right-arm'));
    expect(geometry(back, 'right-foot')).toBe(geometry(front, 'left-foot'));
    expect(geometry(back, 'left-foot')).toBe(geometry(front, 'right-foot'));
  });

  it('stacks arms and tufts BEHIND the body, unlike the front', () => {
    const order = (svg: string, part: string) => svg.indexOf(`data-part="${part}"`);
    expect(order(back, 'left-arm')).toBeLessThan(order(back, 'body-base'));
    expect(order(back, 'right-arm')).toBeLessThan(order(back, 'body-base'));
    expect(order(back, 'tuft-main')).toBeLessThan(order(back, 'body-base'));
    expect(order(back, 'tuft-secondary')).toBeLessThan(order(back, 'body-base'));
    expect(order(front, 'left-arm')).toBeGreaterThan(order(front, 'body-base'));
    expect(order(front, 'tuft-main')).toBeGreaterThan(order(front, 'body-base'));
  });

  it('shares the front defs and reflects the flank pattern about the body center', () => {
    const frontDefs = front.slice(front.indexOf('<defs'), front.indexOf('</defs>'));
    expect(back).toContain(frontDefs);
    expect(back).toContain('data-part="side-pattern" transform="matrix(-1,0,0,1,817.31314,0)"');
  });
});

describe('trait colors on V2', () => {
  const EYE = '#12abef';
  const BASE = '#33aa66';
  const SECONDARY = '#ffcc00';

  it('with no colors the artwork is untouched apart from fit and ids', () => {
    const out = customizeAdultV2Svg(ADULT_V2_FRONT_SVG, {}, 'plain');
    for (const authored of ADULT_V2_ROLE_COLORS) expect(out).toContain(authored);
    expect(out).toMatch(/<svg[^>]*width="100%" height="100%"/);
  });

  it('baseColor recolors the body, limbs, feet and stroke roles and nothing else', () => {
    const out = customizeAdultV2Svg(ADULT_V2_FRONT_SVG, { baseColor: BASE });
    expect(out).toContain(`stop-color="${BASE}"`);
    for (const authored of ['#c792ff', '#8749ef', '#5420c8', '#9c61f4', '#5422bc', '#8248e8', '#46199f', '#4f239e']) {
      expect(out, `${authored} should be recolored`).not.toContain(authored);
    }
    // Secondary and eye roles, cheeks, pupil, mouth and shadows are untouched.
    for (const kept of ['#481696', '#54308d', '#201538', '#090711', '#ff7ab7', '#080711', '#21102e', '#2d0d68', '#2f183f']) {
      expect(out, `${authored(kept)} must stay`).toContain(kept);
    }
  });

  it('secondaryColor recolors only the side-pattern marks', () => {
    const out = customizeAdultV2Svg(ADULT_V2_FRONT_SVG, { secondaryColor: SECONDARY });
    expect(out.match(new RegExp(SECONDARY, 'g'))).toHaveLength(3);
    expect(out).not.toContain('#481696');
    expect(out).toContain('#8749ef');
  });

  it('eyeColor recolors the iris gradient stops on every view with a face', () => {
    for (const facing of ['front', 'left', 'right'] as const) {
      const { svg } = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing, eyeColor: EYE, instanceId: 'e' });
      expect(svg).toContain(`stop-color="${EYE}"`);
      expect(svg).not.toContain('#201538');
      // The pupil stays the authored near-black: the eye color is the iris.
      expect(svg).toContain('#080711');
    }
    // The back shares the front defs (recolored, unused); no drawn element is an iris.
    const back = renderBlobbiSvg({ stage: 'adult', visualGeneration: 'v2', facing: 'back', eyeColor: EYE, instanceId: 'e' }).svg;
    expect(drawing(back)).not.toContain(EYE);
    expect(drawing(back)).not.toContain('data-part="iris"');
  });

  it('accepts #rgb shorthand and mixed case, ignores garbage', () => {
    const a = customizeAdultV2Svg(ADULT_V2_FRONT_SVG, { baseColor: '#3A6' });
    const b = customizeAdultV2Svg(ADULT_V2_FRONT_SVG, { baseColor: '#33aa66' });
    expect(a).toBe(b);
    const c = customizeAdultV2Svg(ADULT_V2_FRONT_SVG, { baseColor: 'not a color' });
    expect(c).toBe(customizeAdultV2Svg(ADULT_V2_FRONT_SVG, {}));
  });
});

function authored(hex: string): string {
  return hex;
}
