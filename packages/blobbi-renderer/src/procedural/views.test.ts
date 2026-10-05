import { describe, expect, it } from 'vitest';
import { canonicalGenome, generateGenome, type BlobbiGenome, type BlobbiSemanticIdentity } from './genome';
import { deriveMorphology } from './morphology';
import { ADULT_PLAN, BABY_PLAN, DIRECTIONS, LIFE_STAGES, VIEWS, type Direction, type LifeStage, type View } from './plan';
import { buildBlobbiGeometry, renderBlobbiSvg, type BlobbiGeometry } from './renderer';
import { ROOT_BOUNDS, attrOf, problemsIn, seeds } from './test-helpers';
import type { Appendage } from './traits/appendages';

const geometry = (genome: BlobbiGenome, view: View, stage: LifeStage = 'adult', direction: Direction = 'right'): BlobbiGeometry =>
  buildBlobbiGeometry(deriveMorphology(genome, stage), { view, direction });
const parts = (geo: BlobbiGeometry, part: string): Appendage[] => geo.appendages.filter((a) => a.part === part);
/** A plain individual with exactly the stated traits. */
const withTraits = (traits: BlobbiSemanticIdentity, seed = 'projection'): BlobbiGenome =>
  generateGenome({ seed, antenna: 'none', horns: 'none', ears: 'none', tail: 'none', spots: false, belly: false, freckles: false, ...traits });
const everyPose = LIFE_STAGES.flatMap((stage) =>
  VIEWS.flatMap((view) => (view === 'side' ? DIRECTIONS : (['right'] as const)).map((direction) => ({ stage, view, direction }))),
);

describe('stages and views are deterministic', () => {
  it('draws the same string for the same genome, stage, view and direction, every time', () => {
    for (const seed of seeds(25)) {
      const genome = generateGenome(seed);
      for (const pose of everyPose) {
        const first = renderBlobbiSvg(genome, pose, { idPrefix: 'a' });
        renderBlobbiSvg(generateGenome(`${seed}-other`), { ...pose, expression: { sad: 1 } });
        expect(renderBlobbiSvg(generateGenome(seed), { ...pose }, { idPrefix: 'a' })).toBe(first);
        expect(problemsIn(first)).toEqual([]);
      }
    }
  });

  it('gives each stage, view and direction its own drawing, labelled as such', () => {
    const genome = generateGenome('labels');
    const drawings = new Set<string>();
    for (const pose of everyPose) {
      const svg = renderBlobbiSvg(genome, pose);
      drawings.add(svg);
      expect(svg).toContain(`data-blobbi-stage="${pose.stage}"`);
      expect(svg).toContain(`data-blobbi-view="${pose.view}"`);
      if (pose.view === 'side') expect(svg).toContain(`data-blobbi-direction="${pose.direction}"`);
    }
    expect(drawings.size).toBe(everyPose.length);
    // Direction means nothing from the front or from behind.
    expect(renderBlobbiSvg(genome, { view: 'front', direction: 'left' })).toBe(renderBlobbiSvg(genome, { view: 'front', direction: 'right' }));
    expect(renderBlobbiSvg(genome, { view: 'back', direction: 'left' })).toBe(renderBlobbiSvg(genome, { view: 'back', direction: 'right' }));
  });

  it('falls back to the adult front for a stage or view it does not know', () => {
    const genome = generateGenome('unknown');
    expect(renderBlobbiSvg(genome, { stage: 'elder' as LifeStage, view: 'top' as View })).toBe(renderBlobbiSvg(genome));
  });
});

describe('one genome, every view', () => {
  it('uses one palette and one set of traits whichever way the Blobbi is turned', () => {
    for (const seed of seeds(60)) {
      const genome = generateGenome(seed);
      const adult = deriveMorphology(genome, 'adult');
      for (const view of VIEWS) expect(buildBlobbiGeometry(adult, { view }).palette).toEqual(adult.palette);
      // The body gradient's three colours are in every drawing of this individual at a stage.
      for (const pose of everyPose) {
        const svg = renderBlobbiSvg(genome, pose);
        const p = adult.palette;
        const body = pose.stage === 'baby' ? [p.babyLight, p.babyMid, p.babyDark] : [p.bodyLight, p.bodyMid, p.bodyDark];
        for (const color of body) expect(svg).toContain(color);
      }
    }
  });

  it('carries the body genes into the profile: taller is taller, a fuller belly reaches further forward', () => {
    const base = canonicalGenome();
    const profile = (genes: Partial<BlobbiGenome['morphology']>) => {
      const geo = geometry({ ...base, morphology: { ...base.morphology, ...genes } }, 'side');
      if (geo.view !== 'side') throw new Error('expected a profile');
      return geo.body;
    };
    const canon = profile({});
    expect(profile({ bodyHeight: 1 }).top).toBeLessThan(canon.top);
    expect(profile({ bodyHeight: 1 }).bottom).toBeCloseTo(canon.bottom, 6);
    expect(profile({ belly: 1 }).right).toBeGreaterThan(canon.right);
    expect(profile({ bodyWidth: 1 }).right - profile({ bodyWidth: 1 }).left).toBeGreaterThan(canon.right - canon.left);
    // A sideways lean of the crown cannot be seen from the side.
    expect(profile({ lean: 1 }).d).toBe(canon.d);
  });

  it('keeps the face on the face: the profile eye, cheek and mouth stay inside the silhouette near its front edge', () => {
    for (const stage of LIFE_STAGES) {
      for (const seed of seeds(80)) {
        const geo = geometry(generateGenome(seed), 'side', stage);
        if (geo.view !== 'side') throw new Error('expected a profile');
        const [eye] = geo.face.eyes;
        const front = geo.body.frontAt(eye.center.y);
        const back = geo.body.backAt(eye.center.y);
        expect(eye.center.x + eye.white.rx).toBeLessThan(front + 2);
        expect(eye.center.x).toBeGreaterThan((front + back) / 2);
        expect(geo.face.mouth.right.x).toBeLessThan(geo.body.frontAt(geo.face.mouth.right.y) + 12);
        expect(geo.face.eyes).toHaveLength(1);
        expect(geo.face.cheeks).toHaveLength(1);
      }
    }
  });

  it('has no face from behind, and the same silhouette as the front', () => {
    const genome = generateGenome({ seed: 'behind', antenna: 'none', horns: 'none', ears: 'none' });
    const back = renderBlobbiSvg(genome, { view: 'back', expression: { happy: 1 } });
    for (const part of ['left-eye', 'right-eye', 'mouth', 'left-eyebrow', 'left-cheek']) expect(back).not.toContain(`data-part="${part}"`);
    const front = geometry({ ...genome, morphology: { ...genome.morphology, lean: 0 } }, 'front');
    const behind = geometry({ ...genome, morphology: { ...genome.morphology, lean: 0 } }, 'back');
    expect(behind.body.d).toBe(front.body.d);
  });
});

describe('trait projection', () => {
  it('puts a single antenna on its own side from the front, the other side from behind, and near or far in profile', () => {
    for (const side of ['left', 'right'] as const) {
      const genome = withTraits({ antenna: 'single' });
      genome.traits.antenna.side = side === 'right' ? 1 : -1;
      const sign = genome.traits.antenna.side;
      const front = geometry(genome, 'front');
      const back = geometry(genome, 'back');
      if (front.view !== 'front' || back.view !== 'back') throw new Error('unexpected view');
      const [a] = parts(front, 'antenna');
      const [b] = parts(back, 'antenna');
      expect((a.base.x - front.body.axisX) * sign).toBeGreaterThan(0);
      expect((b.base.x - back.body.axisX) * sign).toBeLessThan(0);
      // Mirror images of each other about the body's axis (with no lean, the bodies are identical),
      // but for the root: on the head on the viewer's side of the crown, behind it on the other.
      expect(a.layer).not.toBe(b.layer);
      expect(Math.abs(a.base.x - front.body.axisX + (b.base.x - back.body.axisX))).toBeLessThan(10);
      expect(Math.abs(a.base.y - b.base.y)).toBeLessThan(12);
      // Facing right shows the flank that is on the viewer's left from the front.
      const facingRight = parts(geometry(genome, 'side', 'adult', 'right'), 'antenna')[0];
      const facingLeft = parts(geometry(genome, 'side', 'adult', 'left'), 'antenna')[0];
      expect(facingRight.far).toBe(sign === 1);
      expect(facingLeft.far).toBe(sign === -1);
    }
  });

  it('roots every crown trait on the crown it is drawn with, in every view', () => {
    for (const stage of LIFE_STAGES) {
      for (const seed of seeds(40)) {
        const genome = generateGenome({ seed, antenna: 'double', horns: 'top', ears: 'none' });
        for (const view of VIEWS) {
          const geo = geometry(genome, view, stage);
          for (const a of [...parts(geo, 'antenna'), ...parts(geo, 'horn')]) {
            expect(a.base.y).toBeGreaterThanOrEqual(geo.body.topAt(a.base.x) - 1e-6);
            expect(a.base.x).toBeGreaterThan(geo.body.left);
            expect(a.base.x).toBeLessThan(geo.body.right);
            // It stands clear of the head, unless it is a short one on the profile's near flank, drawn against the head.
            if (a.layer === 'crown' && view === 'side') expect(a.tip.y).toBeLessThan(a.base.y);
            else expect(a.tip.y).toBeLessThan(geo.body.topAt(a.base.x));
            // On the head in view (an adult's nearer one) or behind it; never floating over the face.
            expect(a.layer).not.toBe('over');
          }
        }
      }
    }
  });

  it('shows a forehead horn over the brow from the front, off the face in profile, and not at all from behind', () => {
    const genome = withTraits({ horns: 'forehead' });
    const front = geometry(genome, 'front');
    const side = geometry(genome, 'side');
    if (front.view !== 'front' || side.view !== 'side') throw new Error('unexpected view');
    const [f] = parts(front, 'horn');
    expect(parts(front, 'horn')).toHaveLength(1);
    expect(f.layer).toBe('over');
    expect(f.side).toBe(0);
    expect(Math.abs(f.base.x - front.body.axisX)).toBeLessThan(1);
    expect(f.base.y).toBeLessThan(front.face!.eyes[0].center.y - front.face!.eyes[0].white.ry);
    const [s] = parts(side, 'horn');
    expect(s.layer).toBe('behind');
    expect(s.tip.x).toBeGreaterThan(side.body.frontAt(s.tip.y));
    expect(s.tip.y).toBeLessThan(s.base.y);
    expect(parts(geometry(genome, 'back'), 'horn')).toHaveLength(0);
  });

  it('shows side horns off both flanks from the front and back, and one, end on, in profile', () => {
    const genome = withTraits({ horns: 'side' });
    for (const view of ['front', 'back'] as const) {
      const geo = geometry(genome, view);
      if (geo.view === 'side') throw new Error('unexpected view');
      const horns = parts(geo, 'horn');
      expect(horns).toHaveLength(2);
      for (const h of horns) {
        expect(h.layer).toBe('behind');
        expect((h.tip.x - geo.body.edgeAt(h.side as -1 | 1, h.tip.y)) * h.side).toBeGreaterThan(0);
      }
    }
    const side = geometry(genome, 'side');
    const [near] = parts(side, 'horn');
    expect(parts(side, 'horn')).toHaveLength(1);
    expect(near.layer).toBe('over');
    if (side.view !== 'side') throw new Error('unexpected view');
    expect(near.base.x).toBeGreaterThan(side.body.backAt(near.base.y));
    expect(near.base.x).toBeLessThan(side.body.frontAt(near.base.y));
  });

  it('hides the tail from the front, grows it out of the back in profile, and shows it end on from behind', () => {
    for (const kind of ['nub', 'curl', 'leaf'] as const) {
      const genome = withTraits({ tail: kind });
      expect(parts(geometry(genome, 'front'), 'tail')).toHaveLength(0);
      const side = geometry(genome, 'side');
      if (side.view !== 'side') throw new Error('unexpected view');
      const [s] = parts(side, 'tail');
      expect(s.layer).toBe('behind');
      expect(s.tip.x).toBeLessThan(side.body.backAt(s.pivot.y));
      expect(s.pivot.x).toBeCloseTo(side.body.backAt(s.pivot.y), 6);
      const back = geometry(genome, 'back');
      const [b] = parts(back, 'tail');
      expect(b.layer).toBe('over');
      if (back.view === 'side') throw new Error('unexpected view');
      expect(Math.abs(b.pivot.x - back.body.axisX)).toBeLessThan(1);
      // The same height on the body in both views.
      expect((b.pivot.y - back.body.top) / back.body.height).toBeCloseTo((s.pivot.y - side.body.top) / side.body.height, 6);
    }
  });

  it('keeps flank spots on their flank: seen from one side only, and mirrored from behind', () => {
    for (const flank of ['left', 'right'] as const) {
      const genome = withTraits({ spots: true });
      genome.traits.spots.side = flank;
      const sign = flank === 'right' ? 1 : -1;
      const front = geometry(genome, 'front');
      const back = geometry(genome, 'back');
      if (front.view === 'side' || back.view === 'side') throw new Error('unexpected view');
      expect(front.markings.marks.length).toBeGreaterThan(0);
      for (const mark of front.markings.marks) expect((mark.cx - front.body.axisX) * sign).toBeGreaterThan(0);
      for (const mark of back.markings.marks) expect((mark.cx - back.body.axisX) * sign).toBeLessThan(0);
      // A right-facing Blobbi shows the flank that is on the viewer's left from the front.
      expect(geometry(genome, 'side', 'adult', 'right').markings.marks.length > 0).toBe(flank === 'left');
      expect(geometry(genome, 'side', 'adult', 'left').markings.marks.length > 0).toBe(flank === 'right');
    }
  });

  it('draws ears on both sides from the front and back, and one behind the other in profile', () => {
    for (const kind of ['round', 'pointed'] as const) {
      const genome = withTraits({ ears: kind });
      for (const view of VIEWS) {
        const ears = parts(geometry(genome, view), 'ear');
        expect(ears).toHaveLength(2);
        expect(ears.map((e) => e.side).sort()).toEqual([-1, 1]);
        if (view === 'side') expect(ears.filter((e) => e.far)).toHaveLength(1);
      }
      // Only the front shows the inside of an ear.
      expect(renderBlobbiSvg(genome, { view: 'front' })).toContain('data-part="ear-inner"');
      expect(renderBlobbiSvg(genome, { view: 'back' })).not.toContain('data-part="ear-inner"');
    }
  });

  it('keeps every trait inside the picture, at both stages, from every side', () => {
    const problems: string[] = [];
    for (const stage of LIFE_STAGES) {
      for (const seed of seeds(150)) {
        for (const traits of [
          { antenna: 'double', horns: 'side', tail: 'curl' },
          { antenna: 'single', horns: 'forehead', tail: 'leaf' },
          { horns: 'top', ears: 'none', tail: 'nub' },
          { ears: 'pointed', horns: 'none', antenna: 'double' },
        ] as BlobbiSemanticIdentity[]) {
          const genome = generateGenome({ seed, ...traits });
          for (const view of VIEWS) {
            for (const a of geometry(genome, view, stage).appendages) {
              for (const p of [a.base, a.tip]) {
                if (p.x < ROOT_BOUNDS.left + 8 || p.x > ROOT_BOUNDS.right - 8 || p.y < ROOT_BOUNDS.top + 8 || p.y > ROOT_BOUNDS.bottom) {
                  problems.push(`${seed} ${stage} ${view} ${a.part}`);
                }
              }
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('left and right', () => {
  it('draws a symmetric individual facing left as its right-facing drawing, mirrored', () => {
    // The canonical genome has nothing that exists on one side only.
    const right = renderBlobbiSvg(canonicalGenome(), { view: 'side', direction: 'right' });
    const left = renderBlobbiSvg(canonicalGenome(), { view: 'side', direction: 'left' });
    const inner = (svg: string) => svg.slice(svg.indexOf('<g transform="matrix(0.26458333'), svg.lastIndexOf('</g>') + 4);
    expect(left).toContain('<g transform="matrix(-1,0,0,1,211.66666,0)">');
    expect(right).not.toContain('matrix(-1,0,0,1');
    expect(inner(left).replace(/<\/g>$/, '')).toBe(inner(right));
  });

  it('does not mirror anatomy that is on one side: the two profiles of an asymmetric individual differ', () => {
    const genome = withTraits({ antenna: 'single', spots: true });
    genome.traits.spots.side = 'left';
    const right = geometry(genome, 'side', 'adult', 'right');
    const left = geometry(genome, 'side', 'adult', 'left');
    expect(right.markings.marks.length).not.toBe(left.markings.marks.length);
    expect(parts(right, 'antenna')[0].far).not.toBe(parts(left, 'antenna')[0].far);
  });

  it('keeps gaze screen-relative: "look right" moves the pupil to the viewer\'s right whichever way the profile faces', () => {
    const genome = canonicalGenome();
    const pupilX = (direction: Direction, x: number) => Number(attrOf(renderBlobbiSvg(genome, { view: 'side', direction, gaze: { x, y: 0 } }), 'pupil', 'cx'));
    // In the right-facing drawing the pupil's own x grows; in the mirrored one it shrinks, which the mirror turns back into "right".
    expect(pupilX('right', 1)).toBeGreaterThan(pupilX('right', 0));
    expect(pupilX('left', 1)).toBeLessThan(pupilX('left', 0));
  });
});

describe('baby and adult are one individual', () => {
  it('gives both stages the same colours and the same traits', () => {
    for (const seed of seeds(120)) {
      const genome = generateGenome(seed);
      const baby = deriveMorphology(genome, 'baby');
      const adult = deriveMorphology(genome, 'adult');
      expect(baby.palette).toEqual(adult.palette);
      expect(baby.antennae.map((a) => a.side)).toEqual(adult.antennae.map((a) => a.side));
      expect(baby.horns?.kind).toBe(adult.horns?.kind);
      expect(baby.ears?.kind).toBe(adult.ears?.kind);
      expect(baby.spots.length).toBe(adult.spots.length);
      expect(baby.freckles.length).toBe(adult.freckles.length);
      // The tail and the belly patch have not appeared yet on a baby; they are in its genome, waiting.
      expect(baby.tail).toBeNull();
      expect(baby.bellyPatch).toBeNull();
      expect(adult.tail?.kind ?? 'none').toBe(genome.traits.tail.kind);
    }
  });

  it('means the same thing by a proportion gene at both stages, and shrinks offsets with the body', () => {
    for (const seed of seeds(60)) {
      const genome = generateGenome(seed);
      const baby = deriveMorphology(genome, 'baby');
      const adult = deriveMorphology(genome, 'adult');
      for (const gene of ['bodyWidth', 'bodyHeight', 'topWidth', 'belly', 'eyeSize', 'eyeSpacing', 'mouthWidth', 'tuftSize'] as const) {
        expect(baby[gene]).toBe(adult[gene]);
      }
      for (const gene of ['lean', 'eyeHeight', 'mouthHeight', 'armHeight'] as const) {
        expect(baby[gene]).toBeCloseTo(adult[gene] * BABY_PLAN.scale, 9);
      }
    }
  });

  it('develops traits: a baby has them, smaller and stubbier', () => {
    for (const seed of seeds(60)) {
      const genome = generateGenome({ seed, antenna: 'double', horns: 'top', tail: 'curl', ears: 'none' });
      const baby = deriveMorphology(genome, 'baby');
      const adult = deriveMorphology(genome, 'adult');
      expect(baby.horns!.length).toBeLessThan(adult.horns!.length * 0.25);
      expect(baby.antennae[0].length).toBeLessThan(adult.antennae[0].length * 0.4);
      // Stubbier: a baby's horn is wider for its length than the adult's.
      expect(baby.horns!.width / baby.horns!.length).toBeGreaterThan(adult.horns!.width / adult.horns!.length);
      // Angles and positions are the individual's own at every age.
      expect(baby.antennae[0].tilt).toBe(adult.antennae[0].tilt);
      expect(baby.antennae[0].position).toBe(adult.antennae[0].position);
    }
  });

  it('is not the adult scaled down: a smaller, limbless body over the same ground, with a larger face for its size', () => {
    for (const seed of seeds(40)) {
      const genome = generateGenome(seed);
      const baby = geometry(genome, 'front', 'baby');
      const adult = geometry(genome, 'front', 'adult');
      if (baby.view !== 'front' || adult.view !== 'front') throw new Error('unexpected view');
      expect(baby.body.height).toBeLessThan(adult.body.height * 0.75);
      // Both are placed over the same ground line.
      expect(baby.ground.y).toBeCloseTo(adult.ground.y, 6);
      const eyeShare = (g: typeof baby) => (g.face!.eyes[0].white.rx * 2) / (g.body.halfWidth * 2);
      expect(eyeShare(baby)).toBeGreaterThan(eyeShare(adult) * 1.35);
      // Narrower at the crown for its width: a droplet, not an egg.
      expect(baby.body.crownHalfWidth / baby.body.halfWidth).toBeLessThan(adult.body.crownHalfWidth / adult.body.halfWidth);
      // The baby has no limbs and no tuft at all; the adult has grown them.
      expect([baby.limbs.feet.length, baby.limbs.arms.length, baby.limbs.tuft]).toEqual([0, 0, null]);
      expect([adult.limbs.feet.length, adult.limbs.arms.length]).toEqual([2, 2]);
      // It floats: its base is well clear of the ground the adult stands on.
      expect(baby.body.baseY).toBeLessThan(baby.ground.y - 20);
    }
    expect(BABY_PLAN.front.body.anchors.length).not.toBe(ADULT_PLAN.front.body.anchors.length);
  });

  it('orders individuals the same way at both stages: the wider baby is the wider adult', () => {
    const population = seeds(40).map((seed) => generateGenome(seed));
    const widths = (stage: LifeStage) =>
      population.map((g) => {
        const geo = geometry({ ...g, morphology: { ...g.morphology, belly: 0, topWidth: 0 } }, 'front', stage);
        return geo.body.right - geo.body.left;
      });
    const rank = (values: number[]) => values.map((v) => values.filter((o) => o < v).length);
    expect(rank(widths('baby'))).toEqual(rank(widths('adult')));
  });
});
