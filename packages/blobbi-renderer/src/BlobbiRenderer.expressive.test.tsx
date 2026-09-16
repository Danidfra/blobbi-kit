/**
 * Expressive state through the React component: expression is SVG render
 * state (it changes the body markup), motion is wrapper/CSS render state (it
 * adds attributes and a package stylesheet, never touches the SVG), gaze is
 * screen-relative on every facing, and `'still'` plus neutral is exactly the
 * DOM the component produced before either existed.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BlobbiRenderer } from './BlobbiRenderer';
import { normalizeAccessoryPlacements } from './accessory-normalize';
import { blobbiMotionPhase, BLOBBI_MOTIONS } from './motion-model';
import { BLOBBI_EMOTIONS } from './expression-model';
import type { BlobbiVisual } from './blobbi-render-model';

const V2: BlobbiVisual = { stage: 'adult', visualGeneration: 'v2', baseColor: '#55c4a2' };
const V1: BlobbiVisual = { stage: 'adult', adultType: 'catti', baseColor: '#55c4a2' };

const body = (c: HTMLElement) => c.querySelector('[data-blobbi-body-box]') as HTMLElement;
const svg = (c: HTMLElement) => body(c).querySelector('svg') as SVGSVGElement;
const HAT = normalizeAccessoryPlacements([{ code: 'headwear-1', slot: 'headwear', x: 50, y: 20, scale: 1, rot: 0, url: '/hat.png' }]);
const CAPE = normalizeAccessoryPlacements([{ code: 'back-1', slot: 'back', x: 50, y: 60, scale: 1, rot: 0, url: '/cape.png' }]);

describe('defaults reproduce the pre-expressive DOM', () => {
  it('no expression and no motion is the same DOM as neutral and still', () => {
    const a = render(<BlobbiRenderer visual={V2} instanceId="d" accessories={[...HAT, ...CAPE]} />);
    const b = render(<BlobbiRenderer visual={V2} instanceId="d" accessories={[...HAT, ...CAPE]} expression="neutral" motion="still" />);
    expect(a.container.innerHTML).toBe(b.container.innerHTML);
    expect(a.container.querySelector('[data-blobbi-motion]')).toBeNull();
    expect(a.container.querySelector('style[data-blobbi-motion-styles]')).toBeNull();
  });
});

describe('expression is SVG render state', () => {
  it.each(BLOBBI_EMOTIONS.filter((e) => e !== 'neutral'))('%s changes the body markup on V2 and only the body', (emotion) => {
    const plain = render(<BlobbiRenderer visual={V2} instanceId="e" />);
    const expressed = render(<BlobbiRenderer visual={V2} instanceId="e" expression={emotion} />);
    expect(svg(expressed.container).outerHTML).not.toBe(svg(plain.container).outerHTML);
    // The wrapper tree around the body is unchanged.
    const strip = (c: HTMLElement) => c.innerHTML.replace(/<svg[\s\S]*<\/svg>/, '');
    expect(strip(expressed.container)).toBe(strip(plain.container).replace('', ''));
    expect(expressed.container.firstElementChild?.getAttribute('data-blobbi-expression-support')).toBe('');
  });

  it('explicit parts work and hostile parts fall back to neutral', () => {
    const parts = render(<BlobbiRenderer visual={V2} instanceId="p" expression={{ mouth: 'grin', eyes: 'wide' }} />);
    expect(svg(parts.container).querySelector('[data-blobbi-mouth="grin"]')).not.toBeNull();
    expect(svg(parts.container).querySelector('[data-blobbi-eyes="wide"]')).not.toBeNull();

    const hostile = render(
      <BlobbiRenderer visual={V2} instanceId="p" expression={{ mouth: 'M 0 0', eyes: '<b>' } as never} />,
    );
    const neutral = render(<BlobbiRenderer visual={V2} instanceId="p" />);
    expect(hostile.container.innerHTML).toBe(neutral.container.innerHTML);
  });

  it('isSleeping wins the eyes but keeps the rest of the face', () => {
    const c = render(<BlobbiRenderer visual={V2} instanceId="s" expression="excited" isSleeping />).container;
    expect(svg(c).querySelector('[data-part="left-eye-closed"]')).not.toBeNull();
    expect(svg(c).querySelector('[data-part="left-eye-scale"]')).toBeNull();
    expect(svg(c).querySelector('[data-blobbi-mouth="grin"]')).not.toBeNull();
  });

  it('the back view ignores it and says it has no expression support', () => {
    const plain = render(<BlobbiRenderer visual={V2} instanceId="b" facing="back" />);
    const sad = render(<BlobbiRenderer visual={V2} instanceId="b" facing="back" expression="sad" />);
    expect(sad.container.innerHTML).toBe(plain.container.innerHTML);
    expect(sad.container.firstElementChild?.hasAttribute('data-blobbi-expression-support')).toBe(false);
  });

  it('V1 draws the same markup for every expression', () => {
    const plain = render(<BlobbiRenderer visual={V1} instanceId="v" />);
    for (const emotion of BLOBBI_EMOTIONS) {
      const c = render(<BlobbiRenderer visual={V1} instanceId="v" expression={emotion} />);
      expect(c.container.innerHTML).toBe(plain.container.innerHTML);
    }
  });
});

describe('motion is wrapper/CSS render state', () => {
  it.each(BLOBBI_MOTIONS.filter((m) => m !== 'still'))('%s marks the body box and both accessory layers, and leaves the SVG untouched', (motion) => {
    const still = render(<BlobbiRenderer visual={V2} instanceId="m" accessories={[...HAT, ...CAPE]} />);
    const moving = render(<BlobbiRenderer visual={V2} instanceId="m" accessories={[...HAT, ...CAPE]} motion={motion} />);
    expect(svg(moving.container).outerHTML).toBe(svg(still.container).outerHTML);

    const marked = [...moving.container.querySelectorAll(`[data-blobbi-motion="${motion}"]`)];
    expect(marked.map((el) => el.getAttribute('data-blobbi-body-box') !== null || el.getAttribute('data-accessory-layer-group'))).toEqual([
      'behind', true, 'front',
    ]);
    const phase = String(blobbiMotionPhase('m'));
    for (const el of marked) expect(el.getAttribute('data-blobbi-motion-phase')).toBe(phase);
    expect(moving.container.querySelector('style[data-blobbi-motion-styles]')?.textContent).toContain('@keyframes blobbi-motion-');
    // Effects layers and the root do not move.
    expect(moving.container.firstElementChild?.hasAttribute('data-blobbi-motion')).toBe(false);
  });

  it('the phase is deterministic per instance and differs across a crowd', () => {
    const phases = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const id = `crowd-${i}`;
      const a = render(<BlobbiRenderer visual={V2} instanceId={id} motion="idle" />);
      const b = render(<BlobbiRenderer visual={V2} instanceId={id} motion="idle" />);
      expect(a.container.innerHTML).toBe(b.container.innerHTML);
      phases.add(body(a.container).getAttribute('data-blobbi-motion-phase')!);
    }
    expect(phases.size).toBeGreaterThan(1);
  });

  it('works on V1 without touching its artwork', () => {
    const still = render(<BlobbiRenderer visual={V1} instanceId="v1m" />);
    const walking = render(<BlobbiRenderer visual={V1} instanceId="v1m" motion="walking" />);
    expect(svg(walking.container).outerHTML).toBe(svg(still.container).outerHTML);
    expect(body(walking.container).getAttribute('data-blobbi-motion')).toBe('walking');
  });

  it('unknown motion is still', () => {
    const c = render(<BlobbiRenderer visual={V2} instanceId="u" motion={'run' as never} />);
    expect(c.container.querySelector('[data-blobbi-motion]')).toBeNull();
  });
});

describe('gaze is screen-relative on every facing', () => {
  const travel = (c: HTMLElement) => {
    const style = svg(c).querySelector('style[data-blobbi-gaze-style]')?.textContent ?? '';
    return /--blobbi-eye-x,0\) \* (-?\d+)px/.exec(style)?.[1];
  };

  it('front and right profile translate x positively; the mirrored left profile negates it', () => {
    expect(travel(render(<BlobbiRenderer visual={V2} instanceId="gf" facing="front" eyeOffset={{ x: 1, y: 0 }} />).container)).toBe('12');
    expect(travel(render(<BlobbiRenderer visual={V2} instanceId="gr" facing="right" eyeOffset={{ x: 1, y: 0 }} />).container)).toBe('12');
    expect(travel(render(<BlobbiRenderer visual={V2} instanceId="gl" facing="left" eyeOffset={{ x: 1, y: 0 }} />).container)).toBe('-12');
  });

  it('V1 gaze is unchanged: positive travel, never mirrored', () => {
    expect(travel(render(<BlobbiRenderer visual={V1} instanceId="g1" facing="left" eyeOffset={{ x: 1, y: 0 }} />).container)).toBe('2');
  });

  it('the CSS variable itself is the caller value on every facing', () => {
    for (const facing of ['front', 'right', 'left'] as const) {
      const c = render(<BlobbiRenderer visual={V2} instanceId={`v-${facing}`} facing={facing} eyeOffset={{ x: 0.5, y: -0.25 }} />).container;
      expect(body(c).style.getPropertyValue('--blobbi-eye-x')).toBe('0.5');
      expect(body(c).style.getPropertyValue('--blobbi-eye-y')).toBe('-0.25');
    }
  });
});
