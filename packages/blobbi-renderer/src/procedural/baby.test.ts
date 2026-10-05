/**
 * The baby is the official Blobbi Baby (the kit's Baby V1): a floating seed
 * with no limbs. These tests hold the procedural baby to that drawing's own
 * numbers and to its anatomy.
 */
import { describe, expect, it } from 'vitest';
import { EMOTIONS } from './expressions';
import { canonicalGenome, generateGenome } from './genome';
import { motionPose } from './motion';
import { deriveMorphology } from './morphology';
import { BABY_BOX, BABY_PLAN, BABY_UNIT, DIRECTIONS, VIEWS } from './plan';
import { DOCUMENT_TRANSFORM, buildBlobbiGeometry, renderBlobbiSvg } from './renderer';
import { attrOf, problemsIn, seeds } from './test-helpers';

/** A root-unit coordinate, back in the official drawing's 100-unit box. */
const bx = (x: number) => (x - BABY_BOX.x) / BABY_UNIT;
const by = (y: number) => (y - BABY_BOX.y) / BABY_UNIT;
const num = (svg: string, part: string, attr: string) => Number(attrOf(svg, part, attr));
const LIMBS = ['left-leg', 'right-leg', 'near-leg', 'far-leg', 'left-foot', 'left-arm', 'right-arm', 'near-arm', 'far-arm', 'tuft-main', 'tuft-secondary', 'tuft-detail-left'];

describe('the canonical baby is the official baby', () => {
  const svg = renderBlobbiSvg(canonicalGenome(), { stage: 'baby' });

  it('has the official seed silhouette: `M 50 15 Q 72 25 75 55 Q 75 80 50 88 Q 25 80 25 55 Q 28 25 50 15`', () => {
    const geo = buildBlobbiGeometry(deriveMorphology(canonicalGenome(), 'baby'));
    if (geo.view !== 'front') throw new Error('expected the front view');
    // The four on-curve points of the authored path.
    const anchors = geo.body.segments.map((s) => [bx(s.p0.x), by(s.p0.y)]);
    [[50, 15], [75, 55], [50, 88], [25, 55]].forEach(([x, y], i) => {
      expect(anchors[i][0]).toBeCloseTo(x, 6);
      expect(anchors[i][1]).toBeCloseTo(y, 6);
    });
    // And the curves between them: each cubic passes where the authored quadratic does.
    const quad = (p0: number[], c: number[], p1: number[], t: number) => [0, 1].map((k) => (1 - t) ** 2 * p0[k] + 2 * (1 - t) * t * c[k] + t * t * p1[k]);
    const authored = [[[50, 15], [72, 25], [75, 55]], [[75, 55], [75, 80], [50, 88]], [[50, 88], [25, 80], [25, 55]], [[25, 55], [28, 25], [50, 15]]];
    geo.body.segments.forEach((s, i) => {
      for (const t of [0.25, 0.5, 0.75]) {
        const u = 1 - t;
        const x = u ** 3 * s.p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t ** 3 * s.p1.x;
        const y = u ** 3 * s.p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t ** 3 * s.p1.y;
        const [ax, ay] = quad(authored[i][0], authored[i][1], authored[i][2], t);
        expect(bx(x)).toBeCloseTo(ax, 3);
        expect(by(y)).toBeCloseTo(ay, 3);
      }
    });
  });

  it('has the official face, feature for feature', () => {
    // Eye whites `cx="38|62" cy="45" rx="8" ry="10"`, discs `cy="46" r="6"`, highlights `cx="40|64" cy="44" r="2"`.
    for (const [side, cx] of [['left', 38], ['right', 62]] as const) {
      expect(bx(num(svg, `${side}-eye-white`, 'cx'))).toBeCloseTo(cx, 3);
      expect(by(num(svg, `${side}-eye-white`, 'cy'))).toBeCloseTo(45, 3);
      expect(num(svg, `${side}-eye-white`, 'rx') / BABY_UNIT).toBeCloseTo(8, 3);
      expect(num(svg, `${side}-eye-white`, 'ry') / BABY_UNIT).toBeCloseTo(10, 3);
      expect(bx(num(svg, `${side}-pupil`, 'cx'))).toBeCloseTo(cx, 3);
      expect(by(num(svg, `${side}-pupil`, 'cy'))).toBeCloseTo(46, 3);
      expect(num(svg, `${side}-pupil`, 'rx') / BABY_UNIT).toBeCloseTo(6, 3);
      expect(bx(num(svg, `${side}-eye-highlight-primary`, 'cx'))).toBeCloseTo(cx + 2, 3);
      expect(by(num(svg, `${side}-eye-highlight-primary`, 'cy'))).toBeCloseTo(44, 3);
    }
    // Mouth `M 42 62 Q 50 68 58 62`, as the cubic that traces it.
    const mouth = attrOf(svg, 'mouth', 'd')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect([bx(mouth[0]), by(mouth[1]), bx(mouth[6]), by(mouth[7])].map((v) => Math.round(v * 100) / 100)).toEqual([42, 62, 58, 62]);
    expect(by(mouth[3])).toBeCloseTo(66, 2);
    expect(num(svg, 'mouth', 'stroke-width') / BABY_UNIT).toBeCloseTo(2.5, 3);
    // Blush `cx="22|78" cy="55" rx="6" ry="4"` at half opacity; glow `cx="50" cy="45" rx="15" ry="20"`.
    expect(bx(num(svg, 'left-cheek-base', 'cx'))).toBeCloseTo(22, 3);
    expect(bx(num(svg, 'right-cheek-base', 'cx'))).toBeCloseTo(78, 3);
    expect(attrOf(svg, 'left-cheek-base', 'opacity')).toBe('0.5');
    expect([bx(num(svg, 'body-glow', 'cx')), by(num(svg, 'body-glow', 'cy')), num(svg, 'body-glow', 'rx') / BABY_UNIT, num(svg, 'body-glow', 'ry') / BABY_UNIT].map((v) => Math.round(v * 100) / 100)).toEqual([50, 45, 15, 20]);
  });

  it("is painted with the official drawing's own colours", () => {
    for (const color of ['#8b5cf6', '#7c3aed', '#6d28d9', '#374151', '#1e293b', '#ffb6c1', '#f1f5f9']) expect(svg).toContain(color);
    // None of the adult's body tones, shadow or shine.
    for (const color of ['#c792ff', '#8749ef', '#5420c8', '#2d0d68']) expect(svg).not.toContain(color);
  });

  it('has no arms, no feet, no tuft, no brows, no contact shadow and no shine, from any side', () => {
    for (const view of VIEWS) {
      for (const direction of DIRECTIONS) {
        const drawing = renderBlobbiSvg(canonicalGenome(), { stage: 'baby', view, direction });
        for (const part of [...LIMBS, 'left-eyebrow', 'eyebrow', 'body-shadow', 'body-shine', 'left-foot-shadow']) expect(drawing).not.toContain(`data-part="${part}"`);
        expect(drawing).toContain('data-part="body-glow"');
        expect(problemsIn(drawing)).toEqual([]);
      }
    }
  });

  it('is only the body and its glow from behind, as the kit draws it', () => {
    const back = renderBlobbiSvg(canonicalGenome(), { stage: 'baby', view: 'back' });
    expect([...back.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1])).toEqual(['character', 'body-base', 'body-glow']);
  });

  it('can be framed in its own square, as the official artwork is', () => {
    const square = renderBlobbiSvg(canonicalGenome(), { stage: 'baby' }, { frame: 'stage' });
    const [x, y, w, h] = /viewBox="([^"]+)"/.exec(square)![1].split(' ').map(Number);
    expect(w).toBeCloseTo(h, 6);
    expect(w).toBeCloseTo(100 * BABY_UNIT * DOCUMENT_TRANSFORM.scale, 3);
    expect(x + w / 2).toBeCloseTo(211.66666 / 2, 2);
    expect(y).toBeGreaterThan(0);
    // The adult has one frame only, and the default frame is the shared one.
    expect(renderBlobbiSvg(canonicalGenome(), {}, { frame: 'stage' })).toBe(renderBlobbiSvg(canonicalGenome()));
    expect(svg).toContain('viewBox="0 0 211.66666 238.125"');
  });

  it('leaves the adult exactly as it was: the same stage look, limbs and paint', () => {
    const adult = renderBlobbiSvg(canonicalGenome());
    for (const part of ['left-foot', 'right-arm', 'tuft-main', 'left-eyebrow', 'body-shadow', 'body-shine', 'left-iris']) expect(adult).toContain(`data-part="${part}"`);
    expect(adult).not.toContain('data-part="body-glow"');
    for (const color of ['#c792ff', '#8749ef', '#5420c8']) expect(adult).toContain(color);
  });
});

describe('the baby keeps its anatomy whatever its genome says', () => {
  const everything = { antenna: 'double', horns: 'side', ears: 'round', tail: 'curl', spots: true, belly: true, freckles: true } as const;

  it('never grows limbs or a tuft, for any seed, any forced trait, any view', () => {
    for (const seed of seeds(60)) {
      for (const traits of [{}, everything, { ...everything, horns: 'top', ears: 'pointed', tail: 'leaf' } as const]) {
        const genome = generateGenome({ seed, ...traits });
        for (const view of VIEWS) {
          const drawing = renderBlobbiSvg(genome, { stage: 'baby', view, motion: 'walking', phase: 0.3 });
          for (const part of LIMBS) expect(drawing).not.toContain(`data-part="${part}"`);
        }
      }
    }
  });

  it('has no tail and no belly patch yet, and carries the rest small', () => {
    for (const seed of seeds(60)) {
      const genome = generateGenome({ seed, ...everything });
      const baby = deriveMorphology(genome, 'baby');
      const adult = deriveMorphology(genome, 'adult');
      expect(baby.tail).toBeNull();
      expect(baby.bellyPatch).toBeNull();
      expect(adult.tail).not.toBeNull();
      // Horns are buds: a fifth of the adult's length, wider than they are long.
      expect(baby.horns!.length).toBeLessThan(adult.horns!.length * 0.25);
      expect(baby.horns!.length).toBeLessThan(21);
      expect(baby.horns!.width).toBeGreaterThan(baby.horns!.length);
      expect(baby.antennae[0].length).toBeLessThan(adult.antennae[0].length * 0.4);
      expect(baby.ears!.size).toBeLessThan(adult.ears!.size * 0.45);
      // Markings are already there.
      expect(baby.spots.length).toBe(adult.spots.length);
      expect(baby.freckles.length).toBe(adult.freckles.length);
      for (const view of VIEWS) expect(renderBlobbiSvg(genome, { stage: 'baby', view })).not.toContain('data-part="tail"');
    }
  });

  it('keeps every trait on the seed: rooted on its silhouette, inside its own frame', () => {
    const box = { left: BABY_BOX.x, right: BABY_BOX.x + BABY_BOX.size, top: BABY_BOX.y, bottom: BABY_BOX.y + BABY_BOX.size };
    for (const seed of seeds(80)) {
      const genome = generateGenome({ seed, ...everything });
      for (const view of VIEWS) {
        const geo = buildBlobbiGeometry(deriveMorphology(genome, 'baby'), { view });
        for (const a of geo.appendages) {
          expect(a.pivot.x).toBeGreaterThanOrEqual(geo.body.left - 1e-6);
          expect(a.pivot.x).toBeLessThanOrEqual(geo.body.right + 1e-6);
          for (const p of [a.base, a.tip]) {
            expect(p.x).toBeGreaterThan(box.left);
            expect(p.x).toBeLessThan(box.right);
            expect(p.y).toBeGreaterThan(box.top);
            expect(p.y).toBeLessThan(box.bottom);
          }
        }
      }
    }
  });

  it('still varies as an individual: the genes shape the seed, not replace it', () => {
    const a = buildBlobbiGeometry(deriveMorphology(generateGenome('wide-baby'), 'baby'));
    const wide = canonicalGenome();
    wide.morphology.bodyWidth = 1;
    wide.morphology.eyeSpacing = 1;
    const b = buildBlobbiGeometry(deriveMorphology(wide, 'baby'));
    const canon = buildBlobbiGeometry(deriveMorphology(canonicalGenome(), 'baby'));
    if (b.view !== 'front' || canon.view !== 'front' || a.view !== 'front') throw new Error('expected the front view');
    expect(b.body.right - b.body.left).toBeGreaterThan(canon.body.right - canon.body.left);
    expect(b.face!.eyes[1].center.x - b.face!.eyes[0].center.x).toBeGreaterThan(canon.face!.eyes[1].center.x - canon.face!.eyes[0].center.x);
    expect(a.body.d).not.toBe(canon.body.d);
    // Still a seed: three anchors a side, a point at the crown.
    expect(b.body.segments).toHaveLength(BABY_PLAN.front.body.anchors.length * 2 - 2);
  });
});

describe('the baby floats', () => {
  it('hops rather than walks: the whole body bobs, there are no legs to step with', () => {
    const svg = renderBlobbiSvg(canonicalGenome(), { stage: 'baby', view: 'side', motion: 'walking', phase: 0.25 });
    expect(svg).toContain('data-blobbi-gait="hop"');
    expect(svg).toMatch(/data-part="character" data-rig="body" transform="translate\(/);
    expect(renderBlobbiSvg(canonicalGenome(), { view: 'side' })).toContain('data-blobbi-gait="legs"');
    for (let i = 0; i < 16; i++) {
      const pose = motionPose('walking', 'side', 'body', i / 16, BABY_PLAN.scale, 'hop');
      expect(pose.ty).toBeLessThanOrEqual(1e-9);
      expect(motionPose('walking', 'side', 'near-leg', i / 16, BABY_PLAN.scale, 'hop').tx).toBe(0);
    }
    // Up twice a cycle, down between.
    expect(motionPose('walking', 'front', 'body', 0.25, 1, 'hop').ty).toBeLessThan(-15);
    expect(motionPose('walking', 'front', 'body', 0.5, 1, 'hop').ty).toBeCloseTo(0, 9);
  });

  it('hovers when idle, rising and settling with its breath, and never dips below where it rests', () => {
    let highest = 0;
    for (let i = 0; i <= 32; i++) {
      const pose = motionPose('idle', 'front', 'body', i / 32, BABY_PLAN.scale, 'hop');
      expect(pose.ty).toBeLessThanOrEqual(1e-9);
      highest = Math.min(highest, pose.ty);
    }
    expect(highest).toBeLessThan(-4);
    expect(motionPose('idle', 'front', 'body', 1, 1, 'hop')).toEqual(motionPose('idle', 'front', 'body', 0, 1, 'hop'));
  });
});

describe('the baby has a face without brows', () => {
  const genome = canonicalGenome();
  const lid = (state: Parameters<typeof renderBlobbiSvg>[1]) => attrOf(renderBlobbiSvg(genome, { stage: 'baby', ...state }), 'left-eye-lid-edge', 'd')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number);

  it('shows no lid at rest and every expression as sound markup, front and side', () => {
    expect(lid({})).toBeUndefined();
    for (const e of EMOTIONS) {
      for (const view of ['front', 'side'] as const) expect(problemsIn(renderBlobbiSvg(genome, { stage: 'baby', view, expression: { [e]: 1 } }))).toEqual([]);
    }
  });

  it('says with its lids what brows would: worry lifts their inner ends, a scowl lowers them', () => {
    // The left eye's nose side is its right end: [x0, y0, cx, cy, x1, y1].
    const sad = lid({ expression: { sad: 1 } })!;
    expect(sad[5]).toBeLessThan(sad[1] - 10);
    const upset = lid({ expression: { upset: 1 } })!;
    expect(upset[5]).toBeGreaterThan(upset[1] + 10);
    const sleepy = lid({ expression: { sleepy: 1 } })!;
    expect(Math.abs(sleepy[5] - sleepy[1])).toBeLessThan(10);
  });

  it('sleeps as the official sleeping baby does: eyes shut, a dot for a mouth, no blush', () => {
    const asleep = renderBlobbiSvg(genome, { stage: 'baby', sleeping: true });
    expect(asleep).toContain('data-part="left-eye-closed"');
    expect(asleep).not.toContain('data-part="left-pupil"');
    expect(attrOf(asleep, 'left-cheek-base', 'opacity')).toBe('0');
    const mouth = attrOf(asleep, 'mouth', 'd')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    // `circle cx="50" cy="65" r="1.5"`.
    expect(bx((mouth[0] + mouth[6]) / 2)).toBeCloseTo(50, 2);
    expect(by(mouth[1])).toBeCloseTo(65, 2);
    expect((mouth[6] - mouth[0]) / BABY_UNIT).toBeLessThan(1);
  });
});
