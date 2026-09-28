/**
 * The V2 adult walks on its legs; V1 and the baby bob as they always have;
 * the V2 ground shadow is the world's. Pinned through the component and the
 * string API, with reduced motion and determinism.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BlobbiRenderer } from './BlobbiRenderer';
import { renderBlobbiSvg } from './artwork/load-blobbi-svg';
import { ADULT_V2_CLOSED_EYE_PARTS, ADULT_V2_LEG_PARTS, ADULT_V2_PARTS } from './artwork/adult/v2';
import { BLOBBI_MOTION_STYLESHEET } from './motion-model';

const V2 = { stage: 'adult', visualGeneration: 'v2' } as const;
const V1 = { stage: 'adult', visualGeneration: 'v1', adultType: 'bloomi' } as const;
const BABY = { stage: 'baby' } as const;

const body = (c: HTMLElement) => c.querySelector('[data-blobbi-body-box]') as HTMLElement;
const svgOf = (c: HTMLElement) => body(c).innerHTML;

describe('the V2 leg contract', () => {
  it('every V2 view carries its leg groups, each a <g> around exactly one foot, and the part list names them', () => {
    for (const leg of ADULT_V2_LEG_PARTS) expect(ADULT_V2_PARTS).toContain(leg);
    for (const [facing, legs] of [['front', ['left-leg', 'right-leg']], ['back', ['left-leg', 'right-leg']], ['right', ['near-leg', 'far-leg']], ['left', ['near-leg', 'far-leg']]] as const) {
      const { svg } = renderBlobbiSvg({ ...V2, facing, instanceId: `gait-${facing}` });
      for (const leg of legs) {
        const group = new RegExp(`<g[^>]*data-part="${leg}"[^>]*>([\\s\\S]*?)</g>`).exec(svg);
        expect(group, `${facing} ${leg}`).not.toBeNull();
        const feet = [...group![1].matchAll(/<ellipse\b[^>]*data-part="([^"]+)"/g)].map((m) => m[1]);
        expect(feet).toEqual([leg.replace('leg', 'foot')]);
        // The foot keeps its authored rotation: the group, not the foot, is what the walk moves.
        expect(group![1]).toMatch(/transform="rotate\(-?[78](?:\.\d+)?\)"/);
      }
    }
  });
});

describe('walking through the component', () => {
  it('a walking V2 adult: the body box carries the motion, the root carries the generation, and the stylesheet with the leg rules is emitted; the SVG string is the still one', () => {
    const still = render(<BlobbiRenderer visual={V2} instanceId="w" motion="still" />);
    const walking = render(<BlobbiRenderer visual={V2} instanceId="w" motion="walking" />);
    expect(walking.container.querySelector('[data-blobbi-renderer]')?.getAttribute('data-blobbi-generation')).toBe('v2');
    expect(body(walking.container).getAttribute('data-blobbi-motion')).toBe('walking');
    expect(svgOf(walking.container)).toBe(svgOf(still.container));
    const style = walking.container.querySelector('style[data-blobbi-motion-styles]')?.textContent ?? '';
    expect(style).toBe(BLOBBI_MOTION_STYLESHEET);
    expect(style).toContain('[data-part="left-leg"]');
    expect(still.container.querySelector('style[data-blobbi-motion-styles]')).toBeNull();
  });

  it('a walking V1 adult and a walking baby get the same attributes and the same stylesheet as before: the gait rules only ever match a v2 root', () => {
    for (const visual of [V1, BABY]) {
      const { container } = render(<BlobbiRenderer visual={visual} instanceId="w1" motion="walking" />);
      expect(container.querySelector('[data-blobbi-renderer]')?.getAttribute('data-blobbi-generation')).toBe('v1');
      expect(body(container).getAttribute('data-blobbi-motion')).toBe('walking');
      expect(svgOf(container)).not.toContain('data-part="left-leg"');
      // No V2 selector can match: nothing under this root is data-blobbi-generation="v2".
      expect(container.querySelectorAll('[data-blobbi-generation="v2"]')).toHaveLength(0);
    }
  });

  it('the string API puts motion on the root svg, which already names its generation, so the same rules apply', () => {
    const { svg } = renderBlobbiSvg({ ...V2, facing: 'right', instanceId: 's', motion: 'walking' });
    expect(svg).toMatch(/<svg[^>]*data-blobbi-generation="v2"[^>]*data-blobbi-motion="walking"|<svg[^>]*data-blobbi-motion="walking"[^>]*data-blobbi-generation="v2"/);
    expect(svg).toContain('data-part="near-leg"');
    expect(svg).toContain('<style data-blobbi-motion-styles>');
    const v1 = renderBlobbiSvg({ ...V1, instanceId: 's1', motion: 'walking' }).svg;
    const root = /<svg\b[^>]*>/.exec(v1)![0];
    expect(root).toContain('data-blobbi-motion="walking"');
    expect(root).not.toContain('data-blobbi-generation="v2"');
    // The stylesheet text mentions the V2 selectors, but no element of a V1 drawing can match them.
    expect(v1.replace(/<style[\s\S]*?<\/style>/g, '')).not.toContain('data-blobbi-generation="v2"');
  });
});

describe('the ground shadow', () => {
  it('is off by default on every V2 facing, kept on request, and never present on V1', () => {
    for (const facing of ['front', 'back', 'left', 'right'] as const) {
      const off = renderBlobbiSvg({ ...V2, facing, instanceId: `g-${facing}` }).svg;
      expect(off).not.toContain('data-part="ground-shadow"');
      expect(off).toContain('data-part="body-shadow"');
      const on = renderBlobbiSvg({ ...V2, facing, instanceId: `g-${facing}`, groundShadow: 'artwork' }).svg;
      expect(on).toContain('data-part="ground-shadow"');
      expect(on.replace(/<ellipse\b[^>]*data-part="ground-shadow"[^>]*\/>\s*/, '')).toBe(off);
    }
    expect(renderBlobbiSvg({ ...V1, instanceId: 'g1', groundShadow: 'artwork' }).svg).toBe(renderBlobbiSvg({ ...V1, instanceId: 'g1' }).svg);
    const { container } = render(<BlobbiRenderer visual={V2} instanceId="gc" />);
    expect(svgOf(container)).not.toContain('data-part="ground-shadow"');
    const kept = render(<BlobbiRenderer visual={V2} instanceId="gc" groundShadow="artwork" />);
    expect(svgOf(kept.container)).toContain('data-part="ground-shadow"');
  });

  it('removal leaves expressions, closed eyes and gaze exactly as they are', () => {
    const happy = renderBlobbiSvg({ ...V2, facing: 'front', instanceId: 'x', expression: 'happy' }).svg;
    expect(happy).toContain('data-blobbi-mouth="smile"');
    const asleep = renderBlobbiSvg({ ...V2, facing: 'front', instanceId: 'x', eyesClosed: true }).svg;
    expect(ADULT_V2_CLOSED_EYE_PARTS.some((part) => asleep.includes(`data-part="${part}"`))).toBe(true);
    const gazing = render(<BlobbiRenderer visual={V2} instanceId="gz" eyeOffset={{ x: 1, y: 0 }} />);
    expect(svgOf(gazing.container)).toContain('blobbi-gaze');
  });
});

describe('determinism and identity', () => {
  it('walking never changes the drawing: still, idle and walking produce one SVG string per facing', () => {
    for (const facing of ['front', 'back', 'left', 'right'] as const) {
      const strings = (['still', 'idle', 'walking'] as const).map((motion) => svgOf(render(<BlobbiRenderer visual={V2} instanceId="d" facing={facing} motion={motion} />).container));
      expect(new Set(strings).size).toBe(1);
    }
  });
});
