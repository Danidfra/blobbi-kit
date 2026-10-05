/**
 * The far arm in profile hangs from the far-side shoulder, behind the body.
 * It must never look as if it grew from the back.
 */
import { describe, expect, it } from 'vitest';
import { canonicalGenome, generateGenome, type BlobbiGenome } from './genome';
import { motionPose } from './motion';
import { deriveMorphology } from './morphology';
import { buildBlobbiGeometry, renderBlobbiSvg } from './renderer';
import { attrOf, seeds } from './test-helpers';
import type { SideGeometry } from './views/side';

function profile(genome: BlobbiGenome, direction: 'left' | 'right' = 'right'): SideGeometry {
  const geo = buildBlobbiGeometry(deriveMorphology(genome), { view: 'side', direction });
  if (geo.view !== 'side') throw new Error('expected a profile');
  return geo;
}
/** The far arm's outline at a phase of the walk: turned about its shoulder, carried with the body's bounce. */
function farArmAt(geo: SideGeometry, phase: number) {
  const arm = geo.limbs.farArm!;
  const turn = (motionPose('walking', 'side', 'far-arm', phase).rot * Math.PI) / 180;
  return arm.outline.map((p) => {
    const dx = p.x - arm.shoulder.x;
    const dy = p.y - arm.shoulder.y;
    return { x: arm.shoulder.x + dx * Math.cos(turn) - dy * Math.sin(turn), y: arm.shoulder.y + dx * Math.sin(turn) + dy * Math.cos(turn) };
  });
}
const PHASES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
/** Individuals across the allowed morphology, with the body and arm genes at their extremes as well. */
function individuals(): BlobbiGenome[] {
  const out = [canonicalGenome(), ...seeds(60, 'arm').map((seed) => generateGenome(seed))];
  for (const value of [-1, 1]) {
    for (const genes of [['bodyWidth', 'belly'], ['bodyHeight'], ['armSize'], ['armHeight'], ['bodyWidth', 'bodyHeight', 'topWidth', 'belly', 'armSize', 'armHeight']] as const) {
      const genome = canonicalGenome();
      for (const gene of genes) genome.morphology[gene] = value;
      out.push(genome);
    }
  }
  return out;
}

describe('the far arm in profile', () => {
  it('hangs from a far-side shoulder: level with the near one, ahead of it, well inside the body', () => {
    for (const genome of individuals()) {
      const geo = profile(genome);
      const near = geo.limbs.nearArm!.shoulder;
      const far = geo.limbs.farArm!.shoulder;
      expect(Math.abs(far.y - near.y)).toBeLessThan(12);
      // The far side of this slightly turned profile shows ahead of the near side, as the far foot does.
      expect(far.x).toBeGreaterThan(near.x + 60);
      expect(geo.limbs.farFoot!.foot.cx).toBeGreaterThan(geo.limbs.nearFoot!.foot.cx);
      // Nowhere near the back: in the front half of the body, with the body's edge still ahead of it.
      const mid = (geo.body.frontAt(far.y) + geo.body.backAt(far.y)) / 2;
      expect(far.x).toBeGreaterThan(mid);
      expect(far.x).toBeLessThan(geo.body.frontAt(far.y) - 40);
      expect(far.x - geo.body.backAt(far.y)).toBeGreaterThan(250);
    }
  });

  it('is covered by the body when standing, as in the official profile', () => {
    for (const genome of individuals()) {
      const geo = profile(genome);
      for (const p of geo.limbs.farArm!.outline) {
        expect(p.x).toBeLessThan(geo.body.frontAt(p.y));
        expect(p.x).toBeGreaterThan(geo.body.backAt(p.y));
      }
    }
    // Drawn before the body, so the body is what hides it.
    const svg = renderBlobbiSvg(canonicalGenome(), { view: 'side' });
    expect(svg.indexOf('data-part="far-arm"')).toBeLessThan(svg.indexOf('data-part="body-base"'));
    expect(svg.indexOf('data-part="near-arm"')).toBeGreaterThan(svg.indexOf('data-part="body-base"'));
  });

  it('never shows behind the back at any phase of the walk, for any body', () => {
    for (const genome of individuals()) {
      const geo = profile(genome);
      for (const phase of PHASES) {
        for (const p of farArmAt(geo, phase)) {
          // The whole arm stays in the front two thirds of the body, far from the back edge.
          expect(p.x - geo.body.backAt(p.y)).toBeGreaterThan(180);
        }
      }
    }
  });

  it('counter-swings: forward as the near arm goes back, and that is when its hand shows past the belly', () => {
    for (const phase of PHASES) {
      const near = motionPose('walking', 'side', 'near-arm', phase).rot;
      const far = motionPose('walking', 'side', 'far-arm', phase).rot;
      expect(near * far).toBeLessThanOrEqual(1e-9);
    }
    const geo = profile(canonicalGenome());
    const past = (phase: number) => Math.max(...farArmAt(geo, phase).map((p) => p.x - geo.body.frontAt(p.y)));
    // Phase 0: the near arm is back, the far arm forward and just in view.
    expect(motionPose('walking', 'side', 'near-arm', 0).rot).toBeGreaterThan(0);
    expect(past(0)).toBeGreaterThan(2);
    expect(past(0)).toBeLessThan(40);
    // Half a cycle on it has swung back behind the body.
    expect(past(0.5)).toBeLessThan(0);
    expect(past(1)).toBeCloseTo(past(0), 9);
  });

  it('is the same arm facing left, mirrored with the rest of the drawing', () => {
    const right = profile(canonicalGenome(), 'right');
    const left = profile(canonicalGenome(), 'left');
    expect(left.limbs.farArm!.d).toBe(right.limbs.farArm!.d);
    for (const direction of ['left', 'right'] as const) {
      const frame = renderBlobbiSvg(canonicalGenome(), { view: 'side', direction, motion: 'walking', phase: 0 });
      // A baked walk frame turns the far arm about its own shoulder.
      const shoulder = right.limbs.farArm!.shoulder;
      expect(frame).toContain(`data-rig="far-arm" transform="rotate(-22 ${Math.round(shoulder.x * 1000) / 1000} ${Math.round(shoulder.y * 1000) / 1000})"`);
    }
    // Standing still or idling, it is not turned at all.
    expect(attrOf(renderBlobbiSvg(canonicalGenome(), { view: 'side' }), 'far-arm', 'd')).toBe(right.limbs.farArm!.d);
    expect(motionPose('idle', 'side', 'far-arm', 0.3).rot).toBe(0);
  });

  it('leaves the near arm as it was', () => {
    const geo = profile(canonicalGenome());
    // `m 115.95808,131.42388 …` of the kit's profile, in root units.
    expect(geo.limbs.nearArm!.shoulder.x).toBeCloseTo(436.297, 2);
    expect(geo.limbs.nearArm!.shoulder.y).toBeCloseTo(491.079, 2);
    expect(motionPose('walking', 'side', 'near-arm', 0).rot).toBe(13);
  });
});
