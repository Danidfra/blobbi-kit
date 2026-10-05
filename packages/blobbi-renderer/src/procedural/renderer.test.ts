import { describe, expect, it } from 'vitest';
import { ADULT_PLAN } from './plan';
import { CANONICAL_PARAMS, buildFrontBody } from './silhouette';
import { EMOTIONS } from './expressions';
import { ANTENNA_GENES, canonicalGenome, generateGenome } from './genome';
import { deriveMorphology } from './morphology';
import { buildBlobbiGeometry, generateBlobbi, renderBlobbiSvg, renderGeometryToSvg } from './renderer';
import type { BlobbiState } from './state';
import { ROOT_BOUNDS, attrOf, deepFreeze, problemsIn, seeds } from './test-helpers';

const BODY_CANON = ADULT_PLAN.front.body;
const CANONICAL_BODY = buildFrontBody(BODY_CANON, CANONICAL_PARAMS);

/** The authored Adult V2 `body-base` path, verbatim from the kit's front artwork. */
const AUTHORED_BODY =
  'm 408.65657,136.79346 c 72,0 130,36.36624 174,95.70063 47,63.16242 76,154.07802 90,255.52069 16,115.79777 -42,213.41241 -141,254.56369 -37,15.3121 -78,22.96815 -123,24.88216 -45,-1.91401 -86,-9.57006 -123,-24.88216 -99,-41.15128 -157,-138.76592 -141,-254.56369 14,-101.44267 43,-192.35827 90,-255.52069 44,-59.33439 102,-95.70063 174,-95.70063 z';

/** Absolute coordinates of a relative `m … c …` path. */
function authoredAbsolute(d: string): number[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  let x = nums[0];
  let y = nums[1];
  const out = [x, y];
  for (let i = 2; i < nums.length; i += 6) {
    for (let j = 0; j < 6; j += 2) out.push(x + nums[i + j], y + nums[i + j + 1]);
    x += nums[i + 4];
    y += nums[i + 5];
  }
  return out;
}

const STATES: Partial<BlobbiState>[] = [
  {},
  { sleeping: true },
  { gaze: { x: 1, y: -1 } },
  { expression: { happy: 0.37 } },
  { expression: { surprised: 1 }, gaze: { x: -1, y: 1 } },
  { expression: { sad: 0.5, sleepy: 0.8, excited: 0.9 } },
  ...EMOTIONS.map((e) => ({ expression: { [e]: 1 } })),
];

describe('the canonical silhouette', () => {
  it('reproduces the authored body path from control points', () => {
    const authored = authoredAbsolute(AUTHORED_BODY);
    const generated = CANONICAL_BODY.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(generated).toHaveLength(authored.length);
    generated.forEach((value, i) => expect(Math.abs(value - authored[i])).toBeLessThan(0.002));
  });

  it('is symmetric about its axis and stands on the authored ground line', () => {
    for (const y of [200, 300, 420, 560, 700]) {
      const right = CANONICAL_BODY.edgeAt(1, y) - BODY_CANON.axisX;
      const left = BODY_CANON.axisX - CANONICAL_BODY.edgeAt(-1, y);
      expect(right).toBeCloseTo(left, 9);
      expect(right).toBeGreaterThan(100);
    }
    expect(CANONICAL_BODY.baseY).toBe(BODY_CANON.baseY);
    expect(CANONICAL_BODY.top).toBeCloseTo(BODY_CANON.top, 9);
  });

  it('grows upward: a taller body keeps its base on the ground', () => {
    const tall = buildFrontBody(BODY_CANON, { ...CANONICAL_PARAMS, bodyHeight: 1.05 });
    expect(tall.baseY).toBe(BODY_CANON.baseY);
    expect(tall.top).toBeLessThan(BODY_CANON.top);
  });
});

describe('renderBlobbiSvg', () => {
  it('is stable: the same genome and state always produce the same string', () => {
    for (const seed of seeds(40)) {
      const genome = generateGenome(seed);
      for (const state of STATES.slice(0, 5)) {
        const first = renderBlobbiSvg(genome, state, { idPrefix: 'a' });
        // Rerendering, and rendering other individuals in between, changes nothing.
        renderBlobbiSvg(generateGenome(`${seed}-other`), { expression: { sad: 1 } });
        expect(renderBlobbiSvg(genome, state, { idPrefix: 'a' })).toBe(first);
        expect(renderBlobbiSvg(generateGenome(seed), { ...state }, { idPrefix: 'a' })).toBe(first);
      }
    }
  });

  it('agrees with the one-call pipeline', () => {
    const { genome, morphology, svg } = generateBlobbi({ seed: 'abc123' });
    expect(genome).toEqual(generateGenome('abc123'));
    expect(morphology).toEqual(deriveMorphology(genome));
    expect(svg).toBe(renderBlobbiSvg(genome));
    expect(generateBlobbi({ seed: 'abc123' }).svg).toBe(svg);
  });

  it('never emits NaN, Infinity, undefined or an impossible dimension', () => {
    // Violations are collected and asserted once: this checks ~600k numbers.
    const problems: string[] = [];
    for (const seed of seeds(250)) {
      const genome = generateGenome({ seed, antenna: seed.endsWith('3') ? 'double' : undefined, spots: seed.endsWith('7') ? true : undefined });
      for (const state of STATES) {
        for (const problem of problemsIn(renderBlobbiSvg(genome, state, { debug: true, groundShadow: true }))) problems.push(`${seed}: ${problem}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('survives extreme and malformed genes by clamping them', () => {
    for (const value of [1, -1, 50, -50, Number.NaN, Infinity]) {
      const genome = generateGenome({ seed: 'extreme', antenna: 'double', spots: true, freckles: true });
      for (const key of Object.keys(genome.morphology) as (keyof typeof genome.morphology)[]) genome.morphology[key] = value;
      for (const key of ANTENNA_GENES) genome.traits.antenna[key] = value;
      const svg = renderBlobbiSvg(genome, { expression: { surprised: 1 } });
      expect(svg).not.toMatch(/NaN|Infinity/);
      // Clamped: a gene of 50 draws exactly what a gene of 1 draws.
      if (value === 50) {
        const one = generateGenome({ seed: 'extreme', antenna: 'double', spots: true, freckles: true });
        for (const key of Object.keys(one.morphology) as (keyof typeof one.morphology)[]) one.morphology[key] = 1;
        for (const key of ANTENNA_GENES) one.traits.antenna[key] = 1;
        expect(svg).toBe(renderBlobbiSvg(one, { expression: { surprised: 1 } }));
      }
    }
  });

  it('keeps every individual inside the viewBox', () => {
    for (const seed of seeds(300)) {
      const geo = buildBlobbiGeometry(deriveMorphology(generateGenome({ seed, antenna: 'double' })));
      if (geo.view !== 'front') throw new Error('expected the front view');
      for (const a of geo.appendages) expect(a.tip.y).toBeGreaterThan(ROOT_BOUNDS.top + 20);
      expect(Math.min(...geo.limbs.arms.map((arm) => arm.box.x1))).toBeGreaterThan(ROOT_BOUNDS.left);
      expect(Math.max(...geo.limbs.arms.map((arm) => arm.box.x2))).toBeLessThan(ROOT_BOUNDS.right);
    }
  });

  it('never mutates the genome, the morphology or the state', () => {
    const genome = deepFreeze(generateGenome({ seed: 'frozen', antenna: 'double', spots: true, freckles: true }));
    const morphology = deepFreeze(deriveMorphology(genome));
    const state = deepFreeze<Partial<BlobbiState>>({ expression: { happy: 0.5, surprised: 0.2 }, gaze: { x: 0.3, y: -0.2 }, sleeping: false, motion: 'idle' });
    expect(() => renderBlobbiSvg(genome, state, { debug: true })).not.toThrow();
    expect(() => renderGeometryToSvg(buildBlobbiGeometry(morphology, state))).not.toThrow();
  });

  it('namespaces every id, so two Blobbis on one page do not share gradients', () => {
    const svg = renderBlobbiSvg(generateGenome({ seed: 'ids', spots: true, horns: 'top', antenna: 'single' }), { expression: { sleepy: 1 } }, { idPrefix: 'one' });
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(6);
    for (const id of ids) expect(id.startsWith('one-')).toBe(true);
    for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(ref[1]);
    expect(renderBlobbiSvg(canonicalGenome(), {}, { idPrefix: '"><x' })).not.toContain('"><x');
  });
});

describe('genome and state stay separate', () => {
  it('state never changes the body: the silhouette, limbs and tuft are identical for every face', () => {
    const genome = generateGenome({ seed: 'separate', antenna: 'single', spots: true });
    const neutral = renderBlobbiSvg(genome);
    for (const state of STATES) {
      const svg = renderBlobbiSvg(genome, state);
      for (const [part, attr] of [
        ['body-base', 'd'],
        ['left-arm', 'd'],
        ['right-arm', 'd'],
        ['tuft-main', 'cx'],
        ['left-foot', 'cx'],
        ['antenna-stalk', 'd'],
        ['side-pattern-mark', 'cx'],
      ] as const) {
        expect(attrOf(svg, part, attr)).toBe(attrOf(neutral, part, attr));
      }
    }
  });

  it('an expression moves the face: the mouth changes with happiness, the eye whites do not move', () => {
    const genome = generateGenome('face');
    const neutral = renderBlobbiSvg(genome);
    const happy = renderBlobbiSvg(genome, { expression: { happy: 1 } });
    expect(attrOf(happy, 'mouth', 'd')).not.toBe(attrOf(neutral, 'mouth', 'd'));
    expect(attrOf(happy, 'left-eye-white', 'cx')).toBe(attrOf(neutral, 'left-eye-white', 'cx'));
  });

  it('two individuals make the same expression with their own faces', () => {
    const a = generateGenome('face-a');
    const b = generateGenome('face-b');
    const mouthA = attrOf(renderBlobbiSvg(a, { expression: { happy: 1 } }), 'mouth', 'd');
    const mouthB = attrOf(renderBlobbiSvg(b, { expression: { happy: 1 } }), 'mouth', 'd');
    expect(mouthA).not.toBe(mouthB);
    // Each one's smile is deeper than its own neutral mouth.
    for (const genome of [a, b]) {
      const depth = (svg: string) => {
        const n = attrOf(svg, 'mouth', 'd')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
        return n[3] - n[1];
      };
      expect(depth(renderBlobbiSvg(genome, { expression: { happy: 1 } }))).toBeGreaterThan(depth(renderBlobbiSvg(genome)));
    }
  });

  it('sleeping shuts the eyes whatever the expression, and gaze only moves the inner eye', () => {
    const genome = generateGenome('sleep');
    const asleep = renderBlobbiSvg(genome, { sleeping: true, expression: { surprised: 1 } });
    expect(asleep).toContain('data-part="left-eye-closed"');
    expect(asleep).not.toContain('data-part="left-pupil"');
    const ahead = renderBlobbiSvg(genome);
    const right = renderBlobbiSvg(genome, { gaze: { x: 1, y: 0 } });
    expect(Number(attrOf(right, 'left-pupil', 'cx'))).toBeGreaterThan(Number(attrOf(ahead, 'left-pupil', 'cx')));
    expect(attrOf(right, 'left-eye-white', 'cx')).toBe(attrOf(ahead, 'left-eye-white', 'cx'));
  });

  it('opens the mouth continuously: a closed stroke until surprise parts the lips', () => {
    const genome = canonicalGenome();
    expect(attrOf(renderBlobbiSvg(genome), 'mouth', 'fill')).toBe('none');
    expect(attrOf(renderBlobbiSvg(genome, { expression: { surprised: 1 } }), 'mouth', 'fill')).not.toBe('none');
    expect(attrOf(renderBlobbiSvg(genome, { expression: { happy: 1 } }), 'mouth', 'fill')).toBe('none');
  });
});

describe('traits', () => {
  it('draws antennae only when the genome has them, behind the body', () => {
    expect(renderBlobbiSvg(generateGenome({ seed: 't', antenna: 'none' }))).not.toContain('data-part="antenna"');
    const one = renderBlobbiSvg(generateGenome({ seed: 't', antenna: 'single' }));
    const two = renderBlobbiSvg(generateGenome({ seed: 't', antenna: 'double' }));
    expect(one.match(/data-part="antenna"/g)).toHaveLength(1);
    expect(two.match(/data-part="antenna"/g)).toHaveLength(2);
    expect(two.indexOf('data-part="antenna"')).toBeLessThan(two.indexOf('data-part="body-base"'));
  });

  it('roots each antenna inside the crown and points it up and away from the axis', () => {
    for (const seed of seeds(120)) {
      const geo = buildBlobbiGeometry(deriveMorphology(generateGenome({ seed, antenna: 'double', horns: 'none', ears: 'none', tail: 'none' })));
      if (geo.view !== 'front') throw new Error('expected the front view');
      expect(geo.appendages).toHaveLength(2);
      for (const a of geo.appendages) {
        expect(a.base.y).toBeGreaterThan(geo.body.topAt(a.base.x));
        expect(a.tip.y).toBeLessThan(a.base.y);
        expect((a.tip.x - a.base.x) * a.side).toBeGreaterThan(0);
        expect((a.base.x - geo.body.apex.x) * a.side).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the canonical Blobbi free of optional traits', () => {
    const svg = renderBlobbiSvg(canonicalGenome());
    for (const part of ['antenna', 'horn', 'ear', 'tail', 'side-pattern', 'belly-patch', 'freckles', 'left-eye-lid', 'debug']) {
      expect(svg).not.toContain(`data-part="${part}"`);
    }
  });
});
