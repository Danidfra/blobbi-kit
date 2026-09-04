/**
 * The package's STYLING BOUNDARY.
 *
 * The renderer must look right in a host that has never heard of Tailwind, has
 * no CSS reset, and mounts nothing from this package. So every property that
 * decides where something is or how big it is travels inline, the only class
 * names emitted are the package's own namespaced ones, and the one stylesheet
 * the package offers is optional decoration.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  BlobbiRenderer,
  BLOBBI_RENDER_SIZE_PX,
  BLOBBI_RENDERER_STYLESHEET,
  BLOBBI_EFFECT_STYLESHEET,
  normalizeAccessoryPlacements,
  resolveBlobbiRenderSize,
  type BlobbiRenderSize,
} from './index';

const VISUAL = { stage: 'adult' as const, adultType: 'mushie', baseColor: '#aa5533' };
const box = (c: HTMLElement) => c.querySelector('[data-blobbi-renderer]') as HTMLElement;

/** Utility-class vocabulary a consumer build would have to generate. */
const UTILITY =
  /^(?:absolute|relative|inset-\d+|[hw]-(?:full|\d+)|size-\S+|pointer-events-\S+|select-none|object-contain|max-w-\S+|rounded\S*|shadow\S*|cursor-\S+|transition\S*|duration-\d+|hover:\S+)$/;

describe('the box is inline, from any accepted size', () => {
  it.each(Object.keys(BLOBBI_RENDER_SIZE_PX) as BlobbiRenderSize[])('token %s', (token) => {
    const { container } = render(<BlobbiRenderer visual={VISUAL} instanceId={`sz-${token}`} size={token} />);
    const el = box(container);
    expect(el.style.width).toBe(`${BLOBBI_RENDER_SIZE_PX[token]}px`);
    expect(el.style.height).toBe(el.style.width);
    expect(el.dataset.blobbiSize).toBe(token);
  });

  it('a pixel number', () => {
    const { container } = render(<BlobbiRenderer visual={VISUAL} instanceId="sz-num" size={240} />);
    expect(box(container).style.width).toBe('240px');
    expect(box(container).style.height).toBe('240px');
    expect(box(container).dataset.blobbiSize).toBe('240px');
  });

  it('a CSS length string, for hosts that size the box from its container', () => {
    const { container } = render(<BlobbiRenderer visual={VISUAL} instanceId="sz-str" size="100%" />);
    expect(box(container).style.width).toBe('100%');
    expect(box(container).dataset.blobbiSize).toBe('100%');
  });

  it('never emits NaN or zero: broken numbers fall back to the default token', () => {
    for (const bad of [NaN, 0, -5, Infinity]) {
      expect(resolveBlobbiRenderSize(bad).css).toBe(`${BLOBBI_RENDER_SIZE_PX.lg}px`);
    }
    expect(resolveBlobbiRenderSize('   ').css).toBe(`${BLOBBI_RENDER_SIZE_PX.lg}px`);
    expect(resolveBlobbiRenderSize('xl')).toEqual({ css: '128px', token: 'xl', label: 'xl' });
  });

  it('defaults to lg (96px), the historical in-world size', () => {
    const { container } = render(<BlobbiRenderer visual={VISUAL} instanceId="sz-default" />);
    expect(box(container).style.width).toBe('96px');
    expect(box(container).dataset.blobbiSize).toBe('lg');
  });

  it('a host style prop merges after the box and may override it', () => {
    const { container } = render(
      <BlobbiRenderer visual={VISUAL} instanceId="sz-style" size="lg" style={{ width: '100%', height: '100%', opacity: 0.5 }} />,
    );
    expect(box(container).style.width).toBe('100%');
    expect(box(container).style.opacity).toBe('0.5');
    expect(box(container).style.position).toBe('relative');
  });
});

describe('no class name in the rendered tree belongs to a utility framework', () => {
  it('root, body, accessories and effects carry only package-namespaced or host classes', () => {
    const { container } = render(
      <BlobbiRenderer
        visual={VISUAL}
        instanceId="cls"
        className="host-class another"
        interactive
        transparent={false}
        accessories={normalizeAccessoryPlacements([
          { code: 'headwear-x', slot: 'headwear', x: 50, y: 20, scale: 1, rot: 0, url: 'https://x.test/x.png' },
          { code: 'back-y', slot: 'back', x: 50, y: 60, scale: 1, rot: 0, url: 'https://x.test/y.png' },
        ])}
        effects={[{ id: 'celestial-aura' }, { id: 'electric-charge' }]}
        eyeOffset={{ x: 0.2, y: 0.2 }}
      />,
    );
    const everything = [box(container), ...box(container).querySelectorAll<HTMLElement>('*')];
    for (const el of everything) {
      if (el.namespaceURI === 'http://www.w3.org/2000/svg') continue; // artwork
      for (const name of el.className.split(/\s+/).filter(Boolean)) {
        expect(name, `${el.tagName} carries utility class ${name}`).not.toMatch(UTILITY);
        expect(
          /^blobbi-(renderer|fx)/.test(name) || ['host-class', 'another'].includes(name),
          `${name} is neither package-namespaced nor host-supplied`,
        ).toBe(true);
      }
    }
    expect(box(container).className).toBe(
      'blobbi-renderer blobbi-renderer--interactive blobbi-renderer--framed host-class another',
    );
  });

  it('layer geometry is inline: body, accessory groups and accessories are absolutely positioned', () => {
    const { container } = render(
      <BlobbiRenderer
        visual={VISUAL}
        instanceId="geo"
        accessories={normalizeAccessoryPlacements([
          { code: 'headwear-x', slot: 'headwear', x: 40, y: 30, scale: 1.2, rot: 10, url: 'https://x.test/x.png' },
        ])}
      />,
    );
    const body = container.querySelector('[data-blobbi-body-box]') as HTMLElement;
    const group = container.querySelector('[data-accessory-layer-group]') as HTMLElement;
    const item = container.querySelector('[data-accessory-code="headwear-x"]') as HTMLElement;
    const img = item.querySelector('img') as HTMLElement;
    for (const el of [body, group, item]) {
      expect(el.style.position).toBe('absolute');
    }
    expect(group.style.pointerEvents).toBe('none');
    expect(item.style.pointerEvents).toBe('none');
    expect(item.style.userSelect).toBe('none');
    expect(img.style.width).toBe('100%');
    expect(img.style.height).toBe('100%');
    expect(img.style.objectFit).toBe('contain');
    expect(img.style.maxWidth).toBe('none');
  });

  it('interactive sets a pointer cursor inline; the hover lift is opt-in CSS', () => {
    const { container } = render(<BlobbiRenderer visual={VISUAL} instanceId="cur" interactive onClick={() => {}} />);
    expect(box(container).style.cursor).toBe('pointer');
    const still = render(<BlobbiRenderer visual={VISUAL} instanceId="cur-2" />);
    expect(box(still.container).style.cursor).toBe('');
  });
});

describe('the optional stylesheets are namespaced and self-contained', () => {
  it('every selector in the renderer stylesheet is a blobbi-renderer class', () => {
    const selectors = [...BLOBBI_RENDERER_STYLESHEET.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(0);
    for (const s of new Set(selectors)) expect(s).toMatch(/^blobbi-renderer/);
    expect(BLOBBI_RENDERER_STYLESHEET).toContain('.blobbi-renderer--interactive');
    expect(BLOBBI_RENDERER_STYLESHEET).toContain('.blobbi-renderer--framed');
    expect(BLOBBI_RENDERER_STYLESHEET).toContain('prefers-reduced-motion');
  });

  it('the effect stylesheet is still namespaced blobbi-fx and mentions no renderer class', () => {
    const selectors = [...BLOBBI_EFFECT_STYLESHEET.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
    for (const s of new Set(selectors)) expect(s).toMatch(/^blobbi-fx-/);
  });

  it('geometry does not depend on either stylesheet being mounted', () => {
    // The whole suite renders without mounting any CSS; this states the
    // invariant explicitly for the two things a stylesheet could plausibly own.
    const { container } = render(<BlobbiRenderer visual={VISUAL} instanceId="nocss" size="xl" transparent={false} interactive />);
    expect(box(container).style.width).toBe('128px');
    expect(container.querySelector('style')).toBeNull(); // no effects, no <style> at all
  });
});
