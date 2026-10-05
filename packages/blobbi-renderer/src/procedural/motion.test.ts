import { describe, expect, it } from 'vitest';
import { generateGenome } from './genome';
import { MOTION_STYLESHEET, RIG_PARTS, motionPose, poseTransform } from './motion';
import { BABY_PLAN, VIEWS } from './plan';
import { renderBlobbiSvg } from './renderer';
import { attrOf, problemsIn } from './test-helpers';

const PHASES = Array.from({ length: 32 }, (_, i) => i / 32);

describe('the walk', () => {
  it('alternates the feet in profile: each is planted for half the cycle, then lifted and swung forward', () => {
    for (const p of PHASES) {
      const near = motionPose('walking', 'side', 'near-leg', p);
      const far = motionPose('walking', 'side', 'far-leg', p);
      // Never both feet in the air.
      expect(near.ty === 0 || far.ty === 0).toBe(true);
      // The far leg is the near leg half a cycle later.
      expect(far.tx).toBeCloseTo(motionPose('walking', 'side', 'near-leg', p + 0.5).tx, 9);
      expect(near.ty).toBeLessThanOrEqual(0);
    }
    // Planted: carried steadily backward along the ground.
    expect(motionPose('walking', 'side', 'near-leg', 0.1).tx).toBeGreaterThan(motionPose('walking', 'side', 'near-leg', 0.4).tx);
    expect(motionPose('walking', 'side', 'near-leg', 0.25).ty).toBe(0);
    // Lifted: highest in the middle of the swing.
    expect(motionPose('walking', 'side', 'near-leg', 0.75).ty).toBeLessThan(-20);
  });

  it('is a loop: the end of the cycle is its beginning, with no jump in between', () => {
    for (const view of VIEWS) {
      for (const part of RIG_PARTS) {
        expect(motionPose('walking', view, part, 1)).toEqual(motionPose('walking', view, part, 0));
        let previous = motionPose('walking', view, part, 0);
        for (let i = 1; i <= 200; i++) {
          const pose = motionPose('walking', view, part, i / 200);
          expect(Math.abs(pose.tx - previous.tx)).toBeLessThan(3);
          expect(Math.abs(pose.ty - previous.ty)).toBeLessThan(3);
          expect(Math.abs(pose.rot - previous.rot)).toBeLessThan(1.5);
          previous = pose;
        }
      }
    }
  });

  it('bounces the body over the planted foot, swings the arms against the legs, and lets the soft parts follow', () => {
    const body = (p: number) => motionPose('walking', 'side', 'body', p).ty;
    expect(body(0)).toBeCloseTo(0, 9);
    expect(body(0.25)).toBeLessThan(-5);
    // The near arm is back when the near foot is forward.
    expect(motionPose('walking', 'side', 'near-leg', 0).tx).toBeGreaterThan(0);
    expect(motionPose('walking', 'side', 'near-arm', 0).rot).toBeGreaterThan(0);
    // The far arm swings the other way, and a little wider.
    expect(motionPose('walking', 'side', 'far-arm', 0).rot).toBeLessThan(-motionPose('walking', 'side', 'near-arm', 0).rot);
    for (const part of ['tuft', 'antenna', 'ear', 'tail'] as const) {
      const swings = PHASES.map((p) => motionPose('walking', 'side', part, p).rot);
      expect(Math.max(...swings)).toBeGreaterThan(1);
      expect(Math.min(...swings)).toBeLessThan(-1);
      expect(Math.max(...swings.map(Math.abs))).toBeLessThan(12);
    }
  });

  it('takes smaller steps at a smaller stage', () => {
    const adult = motionPose('walking', 'side', 'near-leg', 0);
    const baby = motionPose('walking', 'side', 'near-leg', 0, BABY_PLAN.scale);
    expect(baby.tx).toBeCloseTo(adult.tx * BABY_PLAN.scale, 9);
  });

  it('steps in place from the front and back', () => {
    for (const p of PHASES) {
      const left = motionPose('walking', 'front', 'left-leg', p);
      const right = motionPose('walking', 'front', 'right-leg', p);
      expect(left.tx).toBe(0);
      // One foot is up at a time.
      expect(left.ty < -1 && right.ty < -1).toBe(false);
    }
  });
});

describe('motion is state on the same geometry', () => {
  const genome = generateGenome({ seed: 'walker', antenna: 'single', tail: 'curl' });

  it('never changes a shape: a walking frame is the standing drawing plus transforms', () => {
    const strip = (svg: string) => svg.replace(/ transform="(?:translate|rotate)[^"]*"/g, '').replace(/ style="[^"]*"/g, '').replace(/ data-blobbi-rig-motion="[^"]*"/, '');
    for (const view of VIEWS) {
      const standing = renderBlobbiSvg(genome, { view });
      for (const phase of [0, 0.2, 0.55, 0.9]) {
        const frame = renderBlobbiSvg(genome, { view, motion: 'walking', phase });
        expect(frame).not.toBe(standing);
        expect(strip(frame)).toBe(strip(standing));
        expect(problemsIn(frame)).toEqual([]);
      }
      expect(strip(renderBlobbiSvg(genome, { view, motion: 'walking' }))).toBe(strip(standing));
    }
  });

  it('bakes a frame when given a phase, and names the motion for the stylesheet when not', () => {
    const baked = renderBlobbiSvg(genome, { view: 'side', motion: 'walking', phase: 0.75 });
    expect(baked).not.toContain('data-blobbi-rig-motion');
    expect(attrOf(baked, 'near-leg', 'transform')).toMatch(/^translate\(/);
    const live = renderBlobbiSvg(genome, { view: 'side', motion: 'walking' });
    expect(live).toContain('data-blobbi-rig-motion="walking"');
    expect(attrOf(live, 'near-leg', 'transform')).toBeUndefined();
    expect(attrOf(live, 'near-leg', 'style')).toMatch(/^transform-origin:/);
    // Standing still carries neither.
    const still = renderBlobbiSvg(genome, { view: 'side' });
    expect(still).not.toContain('data-blobbi-rig-motion');
    expect(still).not.toContain('transform-origin');
  });

  it('is deterministic frame by frame', () => {
    for (const phase of [0, 0.125, 0.5, 0.875]) {
      expect(renderBlobbiSvg(genome, { view: 'side', motion: 'walking', phase })).toBe(renderBlobbiSvg(genome, { view: 'side', motion: 'walking', phase }));
    }
    // Phase wraps: a cycle later is the same frame.
    expect(renderBlobbiSvg(genome, { view: 'side', motion: 'walking', phase: 1.25 })).toBe(renderBlobbiSvg(genome, { view: 'side', motion: 'walking', phase: 0.25 }));
  });

  it('writes nothing for a part at rest', () => {
    expect(poseTransform(motionPose('still', 'side', 'near-leg', 0.3), { x: 1, y: 2 })).toBe('');
    expect(poseTransform({ tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 }, { x: 1, y: 2 })).toBe('');
    expect(poseTransform({ tx: 3, ty: -4, rot: 10, sx: 1, sy: 1 }, { x: 5, y: 6 })).toBe('translate(3 -4) rotate(10 5 6)');
  });
});

describe('the live stylesheet', () => {
  it('is generated from the same motion functions, scoped to procedural Blobbis, and stops for reduced motion', () => {
    expect(MOTION_STYLESHEET).toContain('@keyframes pb-walking-side-near-leg');
    expect(MOTION_STYLESHEET).toContain('@keyframes pb-walking-front-left-leg');
    expect(MOTION_STYLESHEET).toContain('@keyframes pb-idle-side-body');
    expect(MOTION_STYLESHEET).toContain('@media (prefers-reduced-motion: reduce)');
    expect(MOTION_STYLESHEET).toContain('animation:none !important');
    for (const rule of MOTION_STYLESHEET.split('\n').filter((line) => line.includes('{') && !line.startsWith('@'))) {
      expect(rule.startsWith('[data-blobbi-generation="v3"]')).toBe(true);
    }
    expect(MOTION_STYLESHEET).not.toMatch(/NaN|undefined/);
    // The keyframe at a quarter of the near leg's cycle is the pose at that phase.
    const pose = motionPose('walking', 'side', 'near-leg', 0.25);
    expect(MOTION_STYLESHEET).toContain(`25%{transform:translate(calc(var(--pb-scale,1)*${pose.tx}px),calc(var(--pb-scale,1)*${pose.ty}px))`);
  });
});
