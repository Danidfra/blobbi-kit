/**
 * Pins for the renderer's own color math.
 *
 * `hexToHsl` / `hslToHex` are a local copy of the two conversions in
 * `@blobbi-kit/core/color-guardrails`; the copy is what lets this package carry
 * no dependency on the domain kit. The values below were produced by the core
 * implementation and must stay identical, so the adult customizer's derived
 * tints (Pandi's tinted-white body, the dark-patch colors) render the same
 * whichever package computes them.
 */
import { describe, it, expect } from 'vitest';
import { hexToHsl, hslToHex, lightenColor, darkenColor } from './colors';

describe('hexToHsl', () => {
  it.each([
    ['#ff0000', { h: 0, s: 100, l: 50 }],
    ['#00ff00', { h: 120, s: 100, l: 50 }],
    ['#0000ff', { h: 240, s: 100, l: 50 }],
    ['#ffffff', { h: 0, s: 0, l: 100 }],
    ['#000000', { h: 0, s: 0, l: 0 }],
    ['#808080', { h: 0, s: 0, l: 50 }],
    ['#F59E0B', { h: 38, s: 92, l: 50 }],
    ['#55C4A2', { h: 162, s: 48, l: 55 }],
  ])('%s -> %o', (hex, hsl) => {
    expect(hexToHsl(hex)).toEqual(hsl);
  });

  it('expands #RGB shorthand', () => {
    expect(hexToHsl('#f00')).toEqual(hexToHsl('#ff0000'));
    expect(hexToHsl('#abc')).toEqual(hexToHsl('#aabbcc'));
  });
});

describe('hslToHex', () => {
  it.each([
    [0, 100, 50, '#FF0000'],
    [120, 100, 50, '#00FF00'],
    [240, 100, 50, '#0000FF'],
    [0, 0, 100, '#FFFFFF'],
    [0, 0, 0, '#000000'],
  ])('(%d, %d, %d) -> %s', (h, s, l, hex) => {
    expect(hslToHex(h, s, l)).toBe(hex);
  });

  it('round-trips through hexToHsl within rounding', () => {
    for (const hex of ['#F59E0B', '#55C4A2', '#8E6BE8', '#3A2A1A']) {
      const { h, s, l } = hexToHsl(hex);
      const back = hexToHsl(hslToHex(h, s, l));
      expect(Math.abs(back.h - h)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.s - s)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.l - l)).toBeLessThanOrEqual(1);
    }
  });
});

describe('lighten / darken', () => {
  it('move toward white and black and clamp', () => {
    expect(lightenColor('#000000', 100)).toBe('#FFFFFF');
    expect(darkenColor('#ffffff', 100)).toBe('#000000');
    expect(lightenColor('#808080', 0)).toBe('#808080');
    expect(lightenColor('not-a-color', 20)).toBe('not-a-color');
  });
});
