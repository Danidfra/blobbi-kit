/**
 * IMAGE SEMANTICS of the rendered root.
 *
 * A Blobbi is a picture. Named, it is an image with that name; unnamed and
 * non-interactive, it is decoration and must not be announced as an anonymous
 * graphic. The API is deliberately small: `label` names it, `title` is a
 * tooltip that doubles as the name, and nothing else is needed.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BlobbiRenderer } from './index';

const VISUAL = { stage: 'baby' as const, baseColor: '#ff6699', name: 'Bubbles' };
const root = (c: HTMLElement) => c.querySelector('[data-blobbi-renderer]') as HTMLElement;

describe('accessibility', () => {
  it('is an image with the given label', () => {
    const { container } = render(
      <BlobbiRenderer visual={VISUAL} instanceId="a11y-label" label="Bubbles, a baby Blobbi" />,
    );
    const el = root(container);
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Bubbles, a baby Blobbi');
    expect(el.getAttribute('aria-hidden')).toBeNull();
  });

  it('falls back to the title as its accessible name', () => {
    const { container } = render(
      <BlobbiRenderer visual={VISUAL} instanceId="a11y-title" title="Bubbles" />,
    );
    const el = root(container);
    expect(el.getAttribute('title')).toBe('Bubbles');
    expect(el.getAttribute('aria-label')).toBe('Bubbles');
    expect(el.getAttribute('aria-hidden')).toBeNull();
  });

  it('prefers an explicit label over the tooltip text', () => {
    const { container } = render(
      <BlobbiRenderer visual={VISUAL} instanceId="a11y-both" title="tooltip" label="name" />,
    );
    expect(root(container).getAttribute('aria-label')).toBe('name');
    expect(root(container).getAttribute('title')).toBe('tooltip');
  });

  it('is hidden from assistive technology when unnamed and not clickable (decorative)', () => {
    const { container } = render(<BlobbiRenderer visual={VISUAL} instanceId="a11y-deco" />);
    const el = root(container);
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('aria-label')).toBeNull();
  });

  it('is never hidden when it can be clicked, even without a name', () => {
    const { container } = render(
      <BlobbiRenderer visual={VISUAL} instanceId="a11y-click" onClick={() => {}} interactive />,
    );
    expect(root(container).getAttribute('aria-hidden')).toBeNull();
  });

  it('accessory images carry their code as alt text; effect pieces carry no text', () => {
    const { container } = render(
      <BlobbiRenderer
        visual={VISUAL}
        instanceId="a11y-acc"
        accessories={[
          {
            id: 'headwear-hat', code: 'headwear-hat', slot: 'headwear', layer: 'front', layerRank: 40,
            xPercent: 50, yPercent: 20, scale: 1, rotationDeg: 0, flipX: false,
            imageUrl: 'https://x.test/hat.png', sources: ['https://x.test/hat.png'],
          },
        ]}
        effects={[{ id: 'golden-sparkles' }]}
      />,
    );
    expect(container.querySelector('img')!.getAttribute('alt')).toBe('headwear-hat');
    for (const piece of container.querySelectorAll('.blobbi-fx-piece')) {
      expect(piece.textContent).toBe('');
    }
  });
});
