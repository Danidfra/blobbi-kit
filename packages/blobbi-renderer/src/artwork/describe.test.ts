/**
 * `describeBlobbiArtwork`: the renderer measures its own drawing, so a host
 * that lays things out around a Blobbi (a ground shadow, most of all) does
 * not have to guess from the frame.
 */
import { describe, expect, it } from 'vitest';
import { anchorsInSquare, createBlobbiV3Identity, describeBlobbiArtwork, renderBlobbiSvg } from '../index';

const FACINGS = ['front', 'back', 'left', 'right'] as const;
const identities = Array.from({ length: 40 }, (_, i) => createBlobbiV3Identity(`describe-${i}`));

describe('describeBlobbiArtwork', () => {
  it('says what the renderer would draw, without drawing: the same anchors `renderBlobbiSvg` reports', () => {
    for (const v3 of identities.slice(0, 8)) {
      for (const stage of ['egg', 'baby', 'adult'] as const) {
        for (const facing of FACINGS) {
          const described = describeBlobbiArtwork({ visualGeneration: 'v3', v3, stage, facing });
          const drawn = renderBlobbiSvg({ visualGeneration: 'v3', v3, stage, facing }).artwork;
          expect(described.anchors).toEqual(drawn.anchors);
          expect(described.viewBox).toEqual(drawn.viewBox);
          expect([described.generation, described.stage, described.view, described.mirrored]).toEqual([drawn.generation, drawn.stage, drawn.view, drawn.mirrored]);
          expect(described.boxAnchors).toEqual(anchorsInSquare(drawn.anchors, drawn.viewBox));
        }
      }
    }
  });

  it('a V3 footprint is what the drawing stands on: under it, on the ground, sized to the stage and the individual', () => {
    const widths = { egg: [] as number[], baby: [] as number[], adult: [] as number[] };
    for (const v3 of identities) {
      for (const stage of ['egg', 'baby', 'adult'] as const) {
        for (const facing of FACINGS) {
          const { boxAnchors: a } = describeBlobbiArtwork({ visualGeneration: 'v3', v3, stage, facing });
          const footprint = a.footprint!;
          expect(footprint, `${stage} ${facing}`).toBeDefined();
          // Under the body, in the square the component draws in.
          expect(Math.abs(footprint.centerX - a.centerX)).toBeLessThan(0.07);
          expect(Math.abs(footprint.centerX - 0.5)).toBeLessThan(0.1);
          expect(a.groundY).toBeGreaterThan(0.8);
          expect(a.groundY).toBeLessThan(1);
          expect(a.headTopY).toBeLessThan(a.groundY);
          if (facing === 'front') widths[stage].push(footprint.width);
        }
      }
      // A profile is the same Blobbi turned: both profiles stand on the same ground, mirrored about the middle.
      for (const stage of ['baby', 'adult'] as const) {
        const left = describeBlobbiArtwork({ visualGeneration: 'v3', v3, stage, facing: 'left' }).boxAnchors;
        const right = describeBlobbiArtwork({ visualGeneration: 'v3', v3, stage, facing: 'right' }).boxAnchors;
        expect(left.footprint!.width).toBe(right.footprint!.width);
        expect(left.footprint!.centerX + right.footprint!.centerX).toBeCloseTo(1, 2);
        expect(left.groundY).toBe(right.groundY);
      }
    }
    const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    // An adult stands on two feet; a baby is a small thing in the air, with a small shadow.
    expect(mean(widths.adult)).toBeGreaterThan(0.4);
    expect(mean(widths.adult)).toBeLessThan(0.52);
    expect(mean(widths.baby)).toBeGreaterThan(0.28);
    expect(mean(widths.baby)).toBeLessThan(0.4);
    expect(Math.max(...widths.baby)).toBeLessThan(Math.min(...widths.adult));
    expect(mean(widths.egg)).toBeGreaterThan(0.4);
    expect(mean(widths.egg)).toBeLessThan(0.62);
    // Individuals differ: a wide body stands on more ground.
    expect(new Set(widths.adult).size).toBeGreaterThan(10);
  });

  it('fits anchors into the square as the component fits the drawing: whole, centred', () => {
    // The V3 adult's viewBox is taller than wide: its sides are letterboxed.
    const tall = anchorsInSquare({ centerX: 0.5, headTopY: 0.1, groundY: 0.9, eyeLineY: 0.4, footprint: { centerX: 0.25, width: 0.5 } }, { width: 100, height: 200 });
    expect(tall).toEqual({ centerX: 0.5, headTopY: 0.1, groundY: 0.9, eyeLineY: 0.4, footprint: { centerX: 0.375, width: 0.25 } });
    const wide = anchorsInSquare({ centerX: 0.5, headTopY: 0, groundY: 1 }, { width: 200, height: 100 });
    expect(wide).toEqual({ centerX: 0.5, headTopY: 0.25, groundY: 0.75 });
    const square = { centerX: 0.4, headTopY: 0.2, groundY: 0.8 };
    expect(anchorsInSquare(square, { width: 50, height: 50 })).toEqual(square);
  });

  it('describes V1 and V2 as before, with no footprint: their artwork has not been measured', () => {
    for (const visualGeneration of ['v1', 'v2'] as const) {
      for (const stage of ['egg', 'baby', 'adult'] as const) {
        const described = describeBlobbiArtwork({ visualGeneration, stage });
        expect(described.anchors.footprint).toBeUndefined();
        expect(described.anchors).toEqual(renderBlobbiSvg({ visualGeneration, stage }).artwork.anchors);
      }
    }
  });
});
