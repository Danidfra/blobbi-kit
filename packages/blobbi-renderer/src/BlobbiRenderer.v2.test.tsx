/**
 * Adult V2 through the React renderer: generation from the visual model,
 * facing, gaze on the semantic movable groups, and the V1 default.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BlobbiRenderer, normalizeBlobbiRenderModel, type BlobbiVisual } from './index';

const V2: BlobbiVisual = {
  stage: 'adult',
  visualGeneration: 'v2',
  baseColor: '#66aa33',
  secondaryColor: '#aadd88',
  eyeColor: '#223344',
  name: 'Canon',
};
const V1: BlobbiVisual = { ...V2, visualGeneration: undefined, adultType: 'catti' };

const box = (c: HTMLElement) => c.querySelector('[data-blobbi-renderer]') as HTMLElement;
const body = (c: HTMLElement) => c.querySelector('[data-blobbi-body-box]') as HTMLElement;
const svg = (c: HTMLElement) => c.querySelector('[data-blobbi-body-box] svg') as SVGSVGElement;

describe('generation comes from the visual, and defaults to V1', () => {
  it('a visual without a generation draws V1 and says so', () => {
    const { container } = render(<BlobbiRenderer visual={V1} instanceId="g1" />);
    expect(box(container).dataset.blobbiGeneration).toBe('v1');
    expect(svg(container).getAttribute('data-blobbi-generation')).toBeNull();
    expect(svg(container).querySelector('[data-part]')).toBeNull();
  });

  it('a v2 visual draws V2 and says so', () => {
    const { container } = render(<BlobbiRenderer visual={V2} instanceId="g2" />);
    expect(box(container).dataset.blobbiGeneration).toBe('v2');
    expect(svg(container).getAttribute('data-blobbi-generation')).toBe('v2');
    expect(svg(container).querySelector('[data-part="body-base"]')).not.toBeNull();
  });

  it('an unknown generation from external JSON falls back to V1', () => {
    const model = normalizeBlobbiRenderModel({ visual: { ...V2, visualGeneration: 'v9' as never }, instanceId: 'x' });
    expect(model.visualGeneration).toBe('v1');
    expect(normalizeBlobbiRenderModel({ visual: V2, instanceId: 'x', facing: 'sideways' as never }).facing).toBe('front');
  });

  it('adds only two data attributes to the box; wrapper geometry is unchanged', () => {
    const { container } = render(<BlobbiRenderer visual={V2} instanceId="g3" size="xl" />);
    expect(box(container).style.width).toBe('128px');
    expect(box(container).dataset.blobbiSize).toBe('xl');
    expect(box(container).dataset.blobbiFacing).toBe('front');
  });
});

describe('facing', () => {
  it.each([
    ['front', 'front', false],
    ['back', 'back', false],
    ['right', 'side', false],
    ['left', 'side', true],
  ] as const)('%s draws the %s view (mirrored: %s)', (facing, view, mirrored) => {
    const { container } = render(<BlobbiRenderer visual={V2} instanceId={`f-${facing}`} facing={facing} />);
    expect(box(container).dataset.blobbiFacing).toBe(facing);
    expect(svg(container).getAttribute('data-blobbi-view')).toBe(view);
    expect(svg(container).querySelector('[data-blobbi-mirrored]') !== null).toBe(mirrored);
  });

  it('V1 keeps its historical behavior for the two new facings: front artwork', () => {
    const front = render(<BlobbiRenderer visual={V1} instanceId="v1f" facing="front" />);
    const left = render(<BlobbiRenderer visual={V1} instanceId="v1f" facing="left" />);
    expect(body(left.container).innerHTML).toBe(body(front.container).innerHTML);
  });

  it('the V2 back view carries no face at all', () => {
    const { container } = render(<BlobbiRenderer visual={V2} instanceId="fb" facing="back" />);
    expect(svg(container).querySelectorAll('[data-part$="eye"], [data-part="mouth"], [data-part$="cheek"], [data-part$="eyebrow"]')).toHaveLength(0);
    expect(svg(container).querySelectorAll('[data-part$="arm"]')).toHaveLength(2);
  });
});

describe('gaze on V2 targets the movable eye groups only', () => {
  it('marks the inner-eye groups, sets the CSS variables, and leaves whites and body unmarked', () => {
    const { container } = render(
      <BlobbiRenderer visual={V2} instanceId="gz" facing="front" eyeOffset={{ x: 0.6, y: -0.3 }} />,
    );
    const wrapper = body(container);
    expect(wrapper.style.getPropertyValue('--blobbi-eye-x')).toBe('0.6');
    expect(wrapper.style.getPropertyValue('--blobbi-eye-y')).toBe('-0.3');

    const marked = [...svg(container).querySelectorAll('.blobbi-pupil')];
    expect(marked.map((el) => el.getAttribute('data-part')).sort()).toEqual(['left-eye-inner', 'right-eye-inner']);
    for (const el of marked) expect(el.tagName.toLowerCase()).toBe('g');
    for (const part of ['left-eye-white', 'right-eye-white', 'body-base', 'left-eye', 'right-eye']) {
      expect(svg(container).querySelector(`[data-part="${part}"]`)!.classList.contains('blobbi-pupil')).toBe(false);
    }
    // The stylesheet moves the marked class by the variables.
    const style = svg(container).querySelector('style[data-blobbi-gaze-style]')!;
    expect(style.textContent).toContain('.blobbi-pupil{transform:translate(calc(var(--blobbi-eye-x,0) * 12px)');
  });

  it('the profile has one movable group; the back has none and gets no gaze markup', () => {
    const side = render(<BlobbiRenderer visual={V2} instanceId="gs" facing="right" eyeOffset={{ x: 1, y: 0 }} />);
    expect([...svg(side.container).querySelectorAll('.blobbi-pupil')].map((el) => el.getAttribute('data-part'))).toEqual(['eye-inner']);

    const back = render(<BlobbiRenderer visual={V2} instanceId="gb" facing="back" eyeOffset={{ x: 1, y: 0 }} />);
    expect(svg(back.container).querySelector('.blobbi-pupil')).toBeNull();
    expect(svg(back.container).querySelector('style[data-blobbi-gaze-style]')).toBeNull();
    expect(body(back.container).style.getPropertyValue('--blobbi-eye-x')).toBe('');
  });

  it('a gaze change re-uses the same SVG string; only the variables move', () => {
    const a = render(<BlobbiRenderer visual={V2} instanceId="same" eyeOffset={{ x: -1, y: 1 }} />);
    const b = render(<BlobbiRenderer visual={V2} instanceId="same" eyeOffset={{ x: 1, y: -1 }} />);
    expect(body(a.container).innerHTML).toBe(body(b.container).innerHTML);
  });
});

describe('isolation and determinism through the component', () => {
  it('two V2 instances share no id and every reference resolves', () => {
    const { container } = render(
      <div>
        <BlobbiRenderer visual={V2} instanceId="iso-a" facing="left" />
        <BlobbiRenderer visual={V2} instanceId="iso-b" facing="front" />
      </div>,
    );
    const ids = [...container.querySelectorAll('svg [id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ref of [...container.innerHTML.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])) {
      expect(ids).toContain(ref);
    }
  });

  it('renders identically twice, sleeping or not (V2 has no closed-eye art yet)', () => {
    const a = render(<BlobbiRenderer visual={V2} instanceId="d" />);
    const b = render(<BlobbiRenderer visual={V2} instanceId="d" />);
    const asleep = render(<BlobbiRenderer visual={V2} instanceId="d" isSleeping />);
    expect(a.container.innerHTML).toBe(b.container.innerHTML);
    expect(body(asleep.container).innerHTML).toBe(body(a.container).innerHTML);
  });
});
