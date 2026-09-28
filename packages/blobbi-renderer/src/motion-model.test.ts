/**
 * The motion contract: three names, a deterministic phase, and a stylesheet
 * that is entirely package-owned and namespaced.
 */
import { describe, it, expect } from 'vitest';
import {
  BLOBBI_MOTIONS,
  BLOBBI_MOTION_PHASES,
  BLOBBI_MOTION_STYLESHEET,
  blobbiMotionAttributes,
  blobbiMotionPhase,
  normalizeBlobbiMotion,
} from './motion-model';

describe('normalizeBlobbiMotion', () => {
  it('accepts exactly still, idle and walking', () => {
    expect(BLOBBI_MOTIONS).toEqual(['still', 'idle', 'walking']);
    for (const m of BLOBBI_MOTIONS) expect(normalizeBlobbiMotion(m)).toBe(m);
  });

  it.each([undefined, null, '', 'Walking', 'run', 'walking ', 0, {}, [], () => 'idle', 'constructor'])(
    'resolves %s to still',
    (value) => {
      expect(normalizeBlobbiMotion(value)).toBe('still');
    },
  );
});

describe('the phase', () => {
  it('is a deterministic bucket of the instance id', () => {
    for (const id of ['a', 'blobbi-aaaa-0001', 'x'.repeat(64), '']) {
      const phase = blobbiMotionPhase(id);
      expect(phase).toBe(blobbiMotionPhase(id));
      expect(Number.isInteger(phase)).toBe(true);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(BLOBBI_MOTION_PHASES);
    }
  });

  it('spreads a crowd across buckets rather than moving it in lockstep', () => {
    const buckets = new Set(Array.from({ length: 64 }, (_, i) => blobbiMotionPhase(`blobbi-${i}`)));
    expect(buckets.size).toBeGreaterThan(BLOBBI_MOTION_PHASES / 2);
  });
});

describe('blobbiMotionAttributes', () => {
  it('emits nothing for still, so a motionless Blobbi has no new markup', () => {
    expect(blobbiMotionAttributes('still', 'any')).toBeNull();
  });

  it('emits the two data attributes for idle and walking', () => {
    expect(blobbiMotionAttributes('idle', 'id-1')).toEqual({
      'data-blobbi-motion': 'idle',
      'data-blobbi-motion-phase': String(blobbiMotionPhase('id-1')),
    });
    expect(blobbiMotionAttributes('walking', 'id-1')?.['data-blobbi-motion']).toBe('walking');
  });
});

describe('the motion stylesheet', () => {
  const rules = BLOBBI_MOTION_STYLESHEET;
  // Rule selectors: lines that open a declaration block and are neither an
  // at-rule nor a keyframe step (`0%,100%{`, `50%{`).
  const selectors = [...BLOBBI_MOTION_STYLESHEET.matchAll(/^([^@{}\n][^{\n]*)\{/gm)]
    .map((m) => m[1].trim())
    .filter((sel) => !/^[\d%,\s]+$/.test(sel));

  it('selects only elements carrying the package data attributes (the V2 gait scoped by the generation the drawing carries)', () => {
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors.flatMap((sel) => sel.split(','))) {
      expect(selector, `${selector} is not scoped to the package attributes`).toMatch(/^\[data-blobbi-(motion|generation="v2"\])/);
      expect(selector).toMatch(/\[data-blobbi-motion/);
    }
    // No class selectors, no element selectors, no ids: nothing a host could collide with.
    expect(BLOBBI_MOTION_STYLESHEET).not.toMatch(/^\s*[.#a-z]/m);
  });

  it('names every keyframe blobbi-motion-*, and every animation refers to one of them', () => {
    const names = [...BLOBBI_MOTION_STYLESHEET.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names.sort()).toEqual(['blobbi-motion-idle', 'blobbi-motion-step-left', 'blobbi-motion-step-right', 'blobbi-motion-stride-far', 'blobbi-motion-stride-near', 'blobbi-motion-walk', 'blobbi-motion-walk-v2']);
    const used = [...BLOBBI_MOTION_STYLESHEET.matchAll(/animation:\s*([\w-]+)/g)].map((m) => m[1]).filter((n) => n !== 'none');
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(names).toContain(name);
  });

  it('defines one delay rule per phase bucket', () => {
    for (let i = 0; i < BLOBBI_MOTION_PHASES; i++) {
      expect(rules).toContain(`[data-blobbi-motion-phase="${i}"]`);
    }
  });

  it('anchors the transform at the ground line and honours reduced motion, legs included', () => {
    expect(BLOBBI_MOTION_STYLESHEET).toContain('transform-origin:50% 100%');
    expect(BLOBBI_MOTION_STYLESHEET).toMatch(/@media \(prefers-reduced-motion: reduce\)\{\s*\[data-blobbi-motion\]\{animation:none !important;\}\s*\[data-blobbi-motion\] \[data-part\]\{animation:none !important;\}/);
  });

  it('the V1 walk is the rule it always was; the V2 gait is scoped to V2 drawings and the four leg parts, on the same cycle', () => {
    // The generic rules, byte for byte: a V1 or baby drawing gets exactly the bob it got before the V2 gait existed.
    expect(BLOBBI_MOTION_STYLESHEET).toContain('[data-blobbi-motion="walking"]{animation:blobbi-motion-walk 0.56s ease-in-out infinite;animation-delay:calc(var(--blobbi-motion-phase,0) * -0.56s);}');
    expect(BLOBBI_MOTION_STYLESHEET).toContain('@keyframes blobbi-motion-walk{\n0%,100%{transform:translateY(0) rotate(-1.4deg) scale(1.025,0.975);}\n25%{transform:translateY(-3.5%) rotate(0deg) scale(0.985,1.02);}');
    // The V2 body sways instead of bouncing; the legs carry the walk, at the walk's own cycle and phase.
    expect(BLOBBI_MOTION_STYLESHEET).toContain('[data-blobbi-generation="v2"] [data-blobbi-motion="walking"],[data-blobbi-generation="v2"][data-blobbi-motion="walking"]{animation-name:blobbi-motion-walk-v2;}');
    for (const [part, keyframes] of [['left-leg', 'blobbi-motion-step-left'], ['right-leg', 'blobbi-motion-step-right'], ['near-leg', 'blobbi-motion-stride-near'], ['far-leg', 'blobbi-motion-stride-far']]) {
      expect(BLOBBI_MOTION_STYLESHEET).toContain(`[data-blobbi-motion="walking"] [data-part="${part}"]`);
      expect(BLOBBI_MOTION_STYLESHEET).toMatch(new RegExp(`\\[data-part="${part}"\\]\\{animation:${keyframes} 0\\.56s ease-in-out infinite;animation-delay:calc\\(var\\(--blobbi-motion-phase,0\\) \\* -0\\.56s\\);\\}`));
    }
    // No leg rule for idle or still: feet move only when walking.
    expect(BLOBBI_MOTION_STYLESHEET).not.toMatch(/\[data-blobbi-motion="idle"\][^\n]*data-part/);
    // Left and right lift in opposite halves of the cycle; near and far stride half a cycle apart.
    expect(BLOBBI_MOTION_STYLESHEET).toContain('@keyframes blobbi-motion-step-left{\n0%,50%,100%{transform:translate(0,0);}\n25%{transform:translate(0,-26px);}');
    expect(BLOBBI_MOTION_STYLESHEET).toContain('@keyframes blobbi-motion-step-right{\n0%,50%,100%{transform:translate(0,0);}\n25%{transform:translate(0,5px);}\n75%{transform:translate(0,-26px);}');
    expect(BLOBBI_MOTION_STYLESHEET).toContain('@keyframes blobbi-motion-stride-near{\n0%{transform:translate(-7px,0);}\n25%{transform:translate(0,-8px);}\n50%{transform:translate(7px,0);}');
    expect(BLOBBI_MOTION_STYLESHEET).toContain('@keyframes blobbi-motion-stride-far{\n0%{transform:translate(7px,0);}\n25%{transform:translate(0,1.4px);}\n50%{transform:translate(-7px,0);}\n75%{transform:translate(0,-8px);}');
  });

  it('is plain text with no interpolation hook: identical on every read', () => {
    expect(BLOBBI_MOTION_STYLESHEET).toBe(BLOBBI_MOTION_STYLESHEET);
    expect(BLOBBI_MOTION_STYLESHEET).not.toMatch(/\$\{|url\(|javascript:|expression\(/i);
  });
});
