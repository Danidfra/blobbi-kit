/**
 * Safe by construction: hostile caller input cannot become markup.
 *
 * Every colour this package receives is spliced into SVG attribute values by
 * string interpolation, and the finished string is mounted through
 * `dangerouslySetInnerHTML`. These tests hand each public entry point values
 * that try to escape an attribute, a style, a gradient or an id, and assert
 * that no element, handler or URL of the caller's making reaches the output.
 * The payloads are inert: they only carry a recognisable marker.
 *
 * The other half of the contract, that VALID input still draws byte-identical
 * artwork, is pinned by `artwork/v1-fingerprints.test.ts` and `determinism.test.tsx`.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  BlobbiRenderer,
  loadBlobbiSvg,
  renderBlobbiSvg,
  normalizeBlobbiRenderModel,
  uniquifySvgIds,
} from './index';

const MARKER = 'renderer-injection-probe';

/** Payloads aimed at each context a colour or id lands in. */
const HOSTILE = {
  attribute: `"><b data-probe="${MARKER}"><!--`,
  singleQuote: `'><b data-probe='${MARKER}'>`,
  style: `#fff;background:url(x)"><b data-probe="${MARKER}">`,
  script: `<script data-probe="${MARKER}"></script>`,
  foreignObject: `"><foreignObject data-probe="${MARKER}"></foreignObject><!--`,
  handler: `" onload="${MARKER}`,
  javascriptUrl: `javascript:${MARKER}`,
  hexThenMarkup: `#ff0000"><b data-probe="${MARKER}">`,
  cssName: 'red',
} as const;

/** Anything a payload could smuggle in, in one check. */
function escaped(svg: string): boolean {
  return (
    svg.includes(MARKER) ||
    /<b\b|<script|<foreignObject|\bonload=|javascript:/i.test(svg)
  );
}

const ADULT_FORM = 'catti';
const V1_ARTWORK_COLOR = '#ff8800';

describe('colours cannot escape the artwork', () => {
  it.each(Object.entries(HOSTILE))('V1 baby drops a %s colour', (_label, value) => {
    const svg = loadBlobbiSvg('baby', undefined, value, value, value, false, 'probe');
    expect(escaped(svg)).toBe(false);
    // Refused colours mean the artwork's own: the drawing is still whole.
    expect(svg).toMatch(/^<svg|<svg\b/);
  });

  it.each(Object.entries(HOSTILE))('V1 adult drops a %s colour', (_label, value) => {
    const svg = loadBlobbiSvg('adult', ADULT_FORM, value, value, value, false, 'probe');
    expect(escaped(svg)).toBe(false);
  });

  it.each(Object.entries(HOSTILE))('V2 adult drops a %s colour', (_label, value) => {
    const { svg } = renderBlobbiSvg({
      stage: 'adult',
      visualGeneration: 'v2',
      baseColor: value,
      secondaryColor: value,
      eyeColor: value,
      instanceId: 'probe',
    });
    expect(escaped(svg)).toBe(false);
  });

  it('the component drops them too, at the DOM', () => {
    const { container } = render(
      <BlobbiRenderer
        visual={{ stage: 'baby', baseColor: HOSTILE.attribute, secondaryColor: HOSTILE.style, eyeColor: HOSTILE.script }}
        instanceId="probe"
      />,
    );
    expect(container.querySelector(`[data-probe="${MARKER}"]`)).toBeNull();
    expect(container.querySelector('script, foreignObject, b')).toBeNull();
    expect(container.innerHTML).not.toContain(MARKER);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('a refused colour draws exactly what an absent colour draws', () => {
    const absent = loadBlobbiSvg('baby', undefined, undefined, undefined, undefined, false, 'same');
    const refused = loadBlobbiSvg('baby', undefined, HOSTILE.attribute, HOSTILE.cssName, HOSTILE.javascriptUrl, false, 'same');
    expect(refused).toBe(absent);
  });

  it('a valid hex colour passes through unchanged, in either case and either length', () => {
    for (const color of ['#ff8800', '#FF8800', '#f80']) {
      expect(loadBlobbiSvg('baby', undefined, color, undefined, undefined, false, 'ok')).toContain(`stop-color:${color}`);
    }
  });

  it('normalizeBlobbiRenderModel reports only validated colours', () => {
    const model = normalizeBlobbiRenderModel({
      visual: { baseColor: HOSTILE.attribute, secondaryColor: V1_ARTWORK_COLOR, eyeColor: HOSTILE.cssName },
      instanceId: 'model',
    });
    expect(model.baseColor).toBeUndefined();
    expect(model.secondaryColor).toBe(V1_ARTWORK_COLOR);
    expect(model.eyeColor).toBeUndefined();
  });
});

describe('ids cannot escape an SVG attribute', () => {
  // An id is reduced to `[a-zA-Z0-9_-]`, so the marker's LETTERS legitimately
  // survive inside `id="…"`; what must not survive is any structure.
  const structural = (svg: string) =>
    /<b\b|<script|<foreignObject|\bonload=|javascript:|data-probe=/i.test(svg);

  it.each(Object.entries(HOSTILE))('%s as an instance id stays inside id="…"', (_label, value) => {
    expect(structural(renderBlobbiSvg({ stage: 'baby', baseColor: V1_ARTWORK_COLOR, instanceId: value }).svg)).toBe(false);
    expect(structural(loadBlobbiSvg('adult', ADULT_FORM, V1_ARTWORK_COLOR, undefined, undefined, false, value))).toBe(false);
    expect(structural(uniquifySvgIds('<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/></svg>', value))).toBe(false);
  });

  it('every id in the output is a legal SVG id', () => {
    const svg = renderBlobbiSvg({ stage: 'adult', adultType: ADULT_FORM, baseColor: V1_ARTWORK_COLOR, instanceId: HOSTILE.attribute }).svg;
    for (const [, id] of svg.matchAll(/\bid="([^"]*)"/g)) {
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });
});

describe('enumerated inputs are allow-listed, never interpolated, and never throw', () => {
  it('an unknown adult form draws the default form', () => {
    const { svg, artwork } = renderBlobbiSvg({ stage: 'adult', adultType: HOSTILE.attribute, instanceId: 'form' });
    expect(escaped(svg)).toBe(false);
    expect(artwork.form).toBe('catti');
  });

  it('unknown stage, facing and generation fall back to the defaults instead of failing', () => {
    // These arrive typed, but the string API is handed relay data directly.
    const loose = { stage: HOSTILE.attribute, facing: HOSTILE.attribute, visualGeneration: HOSTILE.attribute } as unknown as {
      stage: 'baby';
      facing: 'front';
      visualGeneration: 'v1';
    };
    const { svg, artwork } = renderBlobbiSvg({ ...loose, baseColor: V1_ARTWORK_COLOR, instanceId: 'enum' });
    expect(escaped(svg)).toBe(false);
    expect(artwork).toMatchObject({ generation: 'v1', stage: 'baby', view: 'front', mirrored: false });
  });
});
