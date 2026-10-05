/**
 * WHAT LIES ON THE SKIN: the body's one pattern and the special mark.
 *
 * Two things are held here. That the kinds are SEMANTIC identity (stated
 * wins, the seed only chooses when nothing is stated, and choosing a kind
 * never moves a gene). And that what is drawn is where a creature would have
 * it: on the same patch of skin from every side, clear of its face through
 * every expression, and inside its body.
 */
import { describe, expect, it } from 'vitest';
import { EMOTIONS } from './expressions';
import { MARK_KINDS, PATTERN_KINDS, generateGenome, type BlobbiGenome, type MarkKind, type PatternKind } from './genome';
import { deriveMorphology, freeMarkRegions } from './morphology';
import { derivePalette, distance } from './colors';
import { ADULT_PLAN, BABY_PLAN, MARK_REGIONS, VIEWS, type LifeStage, type MarkRegionName, type View } from './plan';
import { buildBlobbiGeometry, renderBlobbiSvg } from './renderer';
import type { BlobbiState } from './state';
import { problemsIn, seeds } from './test-helpers';
import type { FrontGeometry } from './views/front';
import type { SideGeometry } from './views/side';

const STAGES: readonly LifeStage[] = ['baby', 'adult'];
const PLAIN = { antenna: 'none', horns: 'none', ears: 'none', tail: 'none', belly: false, freckles: false } as const;
const geometry = (genome: BlobbiGenome, stage: LifeStage, state: Partial<BlobbiState> = {}) => buildBlobbiGeometry(deriveMorphology(genome, stage), state);
const svgOf = (genome: BlobbiGenome, stage: LifeStage, state: Partial<BlobbiState> = {}) => renderBlobbiSvg(genome, { stage, ...state }, { idPrefix: 't' });
const count = (svg: string, part: string) => (svg.match(new RegExp(`data-part="${part}"`, 'g')) ?? []).length;

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
const ellipseBox = (e: { cx: number; cy: number; rx: number; ry: number }, grow = 0): Box => ({ x1: e.cx - e.rx - grow, y1: e.cy - e.ry - grow, x2: e.cx + e.rx + grow, y2: e.cy + e.ry + grow });
/** The box of a path made of M, L, Q and C commands (every number pair is a point on or bounding it). */
function pathBox(d: string, grow = 0): Box {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { x1: Math.min(...xs) - grow, y1: Math.min(...ys) - grow, x2: Math.max(...xs) + grow, y2: Math.max(...ys) + grow };
}
const overlap = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/** Every part of the face a marking must keep off, as boxes, for the face this geometry drew. */
function faceBoxes(geo: FrontGeometry | SideGeometry): { name: string; box: Box }[] {
  if (!geo.face) return [];
  return [
    ...geo.face.eyes.map((eye) => ({ name: eye.part, box: ellipseBox(eye.white) })),
    ...geo.face.brows.map((brow) => ({ name: brow.part, box: pathBox(brow.d, brow.strokeWidth / 2) })),
    ...geo.face.cheeks.map((cheek) => ({ name: cheek.part, box: ellipseBox(cheek.base) })),
    { name: 'mouth', box: pathBox(geo.face.mouth.d, geo.face.mouth.strokeWidth / 2) },
  ];
}
/** A mark's box as drawn: foreshortened across, full height (a turned shape never reaches further than its half-size). */
const markBox = (mark: { cx: number; cy: number; r: number; squash: number }): Box => ({ x1: mark.cx - mark.r * mark.squash, y1: mark.cy - mark.r, x2: mark.cx + mark.r * mark.squash, y2: mark.cy + mark.r });

/** A genome with its mark put in one region, by the roll that picks it on a body where every region is free. */
const REGION_ROLL: Record<MarkRegionName, number> = { forehead: 0.1, chest: 0.5, hip: 0.75, shoulder: 0.95 };
function marked(seed: string, region: MarkRegionName, kind: Exclude<MarkKind, 'none'> = 'star', side: -1 | 1 = 1, more: Parameters<typeof generateGenome>[0] extends infer I ? Partial<Exclude<I, string>> : never = {}): BlobbiGenome {
  const genome = generateGenome({ seed, ...PLAIN, pattern: 'solid', mark: kind, ...more });
  genome.traits.mark = { ...genome.traits.mark, region: REGION_ROLL[region], side };
  return genome;
}

// ─── Identity ────────────────────────────────────────────────────────────────

describe('pattern and special mark are semantic identity', () => {
  it('a seed always chooses the same pattern and the same mark, and a population has every kind without any being the rule', () => {
    const population = seeds(1200, 'surface').map((seed) => generateGenome(seed));
    for (const genome of population.slice(0, 60)) {
      const again = generateGenome(genome.seed);
      expect(again.traits.pattern).toEqual(genome.traits.pattern);
      expect(again.traits.mark).toEqual(genome.traits.mark);
    }
    const share = <T>(pick: (g: BlobbiGenome) => T, value: T) => population.filter((g) => pick(g) === value).length / population.length;
    for (const kind of PATTERN_KINDS) expect(share((g) => g.traits.pattern.kind, kind), kind).toBeGreaterThan(0.1);
    expect(share((g) => g.traits.pattern.kind, 'solid')).toBeGreaterThan(0.33);
    expect(share((g) => g.traits.pattern.kind, 'solid')).toBeLessThan(0.48);
    for (const kind of MARK_KINDS) expect(share((g) => g.traits.mark.kind, kind), kind).toBeGreaterThan(0.05);
    // Most Blobbis have no mark at all: it is what makes one special.
    expect(share((g) => g.traits.mark.kind, 'none')).toBeGreaterThan(0.5);
    expect(share((g) => g.traits.mark.kind, 'none')).toBeLessThan(0.66);
    expect(share((g) => g.traits.mark.side, 1)).toBeGreaterThan(0.42);
    expect(share((g) => g.traits.mark.side, 1)).toBeLessThan(0.58);
  });

  it('a stated kind wins over the seed, whatever the seed would choose, and a malformed one falls back to the seed', () => {
    for (const seed of seeds(40, 'stated')) {
      const own = generateGenome(seed);
      for (const pattern of PATTERN_KINDS) expect(generateGenome({ seed, pattern }).traits.pattern.kind).toBe(pattern);
      for (const mark of MARK_KINDS) expect(generateGenome({ seed, mark }).traits.mark.kind).toBe(mark);
      expect(generateGenome({ seed, pattern: 'plaid' as PatternKind, mark: 'blush' as MarkKind }).traits).toEqual(own.traits);
    }
  });

  it('stating a kind moves no gene: every pattern\'s geometry and the mark\'s place are this seed\'s, whichever kind shows', () => {
    for (const seed of seeds(25, 'micro')) {
      const own = generateGenome(seed);
      for (const pattern of PATTERN_KINDS) {
        for (const mark of MARK_KINDS) {
          const stated = generateGenome({ seed, pattern, mark });
          expect({ ...stated.traits.pattern, kind: own.traits.pattern.kind }).toEqual(own.traits.pattern);
          expect({ ...stated.traits.mark, kind: own.traits.mark.kind }).toEqual(own.traits.mark);
          expect(stated.morphology).toEqual(own.morphology);
          expect({ ...stated.traits, pattern: null, mark: null }).toEqual({ ...own.traits, pattern: null, mark: null });
          expect(stated.egg).toEqual(own.egg);
        }
      }
    }
  });

  it('a Blobbi has exactly one pattern: a morphology never carries two', () => {
    for (const seed of seeds(60, 'one')) {
      for (const stage of STAGES) {
        for (const pattern of PATTERN_KINDS) {
          const m = deriveMorphology(generateGenome({ seed, pattern }), stage);
          expect(m.pattern).toBe(pattern);
          expect([m.spots.length > 0, m.stripes !== null, m.gradient !== null]).toEqual([pattern === 'spotted', pattern === 'striped', pattern === 'gradient']);
        }
      }
    }
  });
});

// ─── Patterns ────────────────────────────────────────────────────────────────

describe('every pattern is drawn, in every view, at both stages', () => {
  const views = [
    { view: 'front', direction: 'right' },
    { view: 'side', direction: 'right' },
    { view: 'side', direction: 'left' },
    { view: 'back', direction: 'right' },
  ] as const;

  it('solid draws no pattern; each of the others draws its own and only its own', () => {
    for (const seed of seeds(12, 'drawn')) {
      for (const stage of STAGES) {
        for (const state of views) {
          const of = (pattern: PatternKind) => svgOf(generateGenome({ seed, ...PLAIN, pattern, mark: 'none' }), stage, state);
          const solid = of('solid');
          expect(solid).not.toMatch(/data-pattern=|side-pattern|pattern-stripe|pattern-gradient/);
          const gradient = of('gradient');
          expect(count(gradient, 'pattern-gradient')).toBe(1);
          expect(gradient).not.toMatch(/side-pattern|pattern-stripe/);
          const striped = of('striped');
          expect(striped).not.toMatch(/side-pattern|pattern-gradient/);
          const spotted = of('spotted');
          expect(spotted).not.toMatch(/pattern-stripe|pattern-gradient/);
          for (const svg of [solid, gradient, striped, spotted]) expect(problemsIn(svg), `${seed} ${stage} ${state.view}`).toEqual([]);
          // A pattern changes nothing but what lies on the skin: take it away and the plain body is left.
          const bare = (svg: string) => svg.replace(/<g data-part="(?:pattern|side-pattern)"[\s\S]*?<\/g>/g, '').replace(/<linearGradient id="t-pattern-gradient"[\s\S]*?<\/linearGradient>/, '').replace(/<clipPath id="t-clip-\d+">[\s\S]*?<\/clipPath>/g, '').replace(/t-clip-\d+/g, 'clip');
          for (const svg of [gradient, striped, spotted]) expect(bare(svg)).toBe(bare(solid));
        }
      }
    }
  });

  it('spotted: flank spots from the front, the marked flank\'s in profile, and the back\'s own from behind', () => {
    for (const seed of seeds(20, 'spotted')) {
      for (const stage of STAGES) {
        const genome = generateGenome({ seed, ...PLAIN, pattern: 'spotted', mark: 'none' });
        const { side, count: flank, backCount } = genome.traits.pattern.spots;
        const flanks = side === 'both' ? 2 : 1;
        const zones = (state: Partial<BlobbiState>) => geometry(genome, stage, state).markings.marks.map((mark) => mark.zone);
        expect(zones({ view: 'front' })).toEqual(Array(flank * flanks).fill('flank'));
        expect(zones({ view: 'back' }).filter((z) => z === 'back')).toHaveLength(backCount);
        expect(zones({ view: 'back' }).filter((z) => z === 'flank')).toHaveLength(flank * flanks);
        // A right-facing profile shows the flank on the viewer's left from the front.
        const shows = (direction: 'left' | 'right') => zones({ view: 'side', direction }).filter((z) => z === 'flank').length;
        expect(shows('right')).toBe(side === 'right' ? 0 : flank);
        expect(shows('left')).toBe(side === 'left' ? 0 : flank);
      }
    }
  });

  it('striped: every band from behind and in both profiles; from the front only the bands that wrap, as a wedge at each edge', () => {
    for (const seed of seeds(30, 'striped')) {
      for (const stage of STAGES) {
        const genome = generateGenome({ seed, ...PLAIN, pattern: 'striped', mark: 'none' });
        const bands = deriveMorphology(genome, stage).stripes!.bands;
        expect(bands).toHaveLength(genome.traits.pattern.stripes.count);
        const wrapping = bands.filter((band) => band.reach > 90).length;
        expect(wrapping).toBe(2);
        const drawn = (state: Partial<BlobbiState>) => geometry(genome, stage, state).markings.stripes;
        expect(drawn({ view: 'back' })).toHaveLength(bands.length);
        expect(drawn({ view: 'side', direction: 'right' })).toHaveLength(bands.length);
        expect(drawn({ view: 'side', direction: 'left' })).toHaveLength(bands.length);
        expect(drawn({ view: 'front' })).toHaveLength(wrapping * 2);
        // A band is a band on both flanks: the two profiles are the same drawing of it.
        const extents = (direction: 'left' | 'right') => drawn({ view: 'side', direction }).map((d) => Object.values(pathBox(d)).map((v) => Math.round(v * 10) / 10));
        expect(extents('left')).toEqual(extents('right'));
        // From the front the wedges come in from the edges and stop short of the middle.
        const front = geometry(genome, stage, { view: 'front' }) as FrontGeometry;
        for (const d of front.markings.stripes) {
          const box = pathBox(d);
          const reachesAxis = box.x1 < front.body.axisX && box.x2 > front.body.axisX;
          expect(reachesAxis, `${seed} ${stage}`).toBe(false);
        }
      }
    }
  });

  it('striped: no band comes near the face, from the front or in profile, through every expression', { timeout: 60_000 }, () => {
    const faces: Partial<BlobbiState>[] = [{}, ...EMOTIONS.map((emotion) => ({ expression: { [emotion]: 1 } })), { gaze: { x: 1, y: -1 } }];
    for (const seed of seeds(60, 'tiger')) {
      for (const stage of STAGES) {
        const genome = generateGenome({ seed, pattern: 'striped' });
        for (const face of faces) {
          for (const state of [{ view: 'front' }, { view: 'side', direction: 'right' }, { view: 'side', direction: 'left' }] as const) {
            const geo = geometry(genome, stage, { ...state, ...face }) as FrontGeometry | SideGeometry;
            for (const d of geo.markings.stripes) {
              for (const part of faceBoxes(geo)) {
                // A profile's cheek floats at the edge of a baby's body, off the skin: only eyes, brows and mouth are held there.
                if (part.name.includes('cheek') && state.view === 'side') continue;
                expect(overlap(pathBox(d), part.box), `${seed} ${stage} ${state.view} ${JSON.stringify(face)} ${part.name}`).toBe(false);
              }
            }
          }
        }
      }
    }
  });

  it('gradient: the same deepening from every side, starting below the crown and never above the middle of the face', () => {
    for (const seed of seeds(30, 'gradient')) {
      for (const stage of STAGES) {
        const genome = generateGenome({ seed, ...PLAIN, pattern: 'gradient', mark: 'none' });
        const fades = VIEWS.map((view) => {
          const geo = geometry(genome, stage, { view });
          const { y0, y1, strength } = geo.markings.gradient!;
          return [(y0 - geo.body.top) / geo.body.height, (y1 - geo.body.top) / geo.body.height, strength].map((v) => Math.round(v * 1e6) / 1e6);
        });
        expect(fades[1]).toEqual(fades[0]);
        expect(fades[2]).toEqual(fades[0]);
        const [start, end, strength] = fades[0];
        expect(start).toBeGreaterThanOrEqual(0.34);
        expect(start).toBeLessThanOrEqual(0.46);
        expect(end).toBe(1);
        expect(strength).toBeGreaterThanOrEqual(0.42);
        expect(strength).toBeLessThanOrEqual(0.58);
      }
    }
  });

  it('different individuals wear the same pattern differently', () => {
    for (const pattern of ['spotted', 'striped', 'gradient'] as const) {
      const drawings = new Set(seeds(30, 'vary').map((seed) => JSON.stringify(deriveMorphology(generateGenome({ seed, pattern }), 'adult')[pattern === 'spotted' ? 'spots' : pattern === 'striped' ? 'stripes' : 'gradient'])));
      expect(drawings.size, pattern).toBe(30);
    }
  });

  it('the pattern is painted in the secondary colour, and stands off the body', () => {
    for (const seed of seeds(80, 'paint')) {
      const genome = generateGenome({ seed, pattern: 'striped' });
      const palette = derivePalette(genome.colors);
      expect(palette.marking).toBe(genome.colors.secondary);
      expect(svgOf(genome, 'adult', { view: 'back' })).toContain(`data-part="pattern-stripe"`);
      expect(svgOf(genome, 'adult', { view: 'back' })).toMatch(new RegExp(`data-part="pattern-stripe" d="[^"]+" fill="${palette.marking}"`));
      expect(distance(palette.marking, palette.bodyMid)).toBeGreaterThan(0.12);
    }
  });
});

// ─── The special mark ────────────────────────────────────────────────────────

describe('every special mark is drawn, where a creature would have it', () => {
  it('each kind has a shape of its own, and `none` draws nothing', () => {
    const shapes = new Set<string>();
    for (const kind of MARK_KINDS) {
      const genome = generateGenome({ seed: 'shape', ...PLAIN, pattern: 'solid', mark: kind });
      genome.traits.mark.region = REGION_ROLL.chest;
      const svg = svgOf(genome, 'adult');
      if (kind === 'none') {
        expect(svg).not.toContain('special-mark');
        continue;
      }
      expect(count(svg, 'special-mark')).toBe(1);
      expect(svg).toContain(`data-mark="${kind}"`);
      shapes.add(/data-part="special-mark-shape" d="([^"]+)"/.exec(svg)![1]);
      expect(problemsIn(svg)).toEqual([]);
    }
    expect(shapes.size).toBe(MARK_KINDS.length - 1);
  });

  it('the plans\' regions are patches of skin clear of the face band, at both stages', () => {
    for (const plan of [ADULT_PLAN, BABY_PLAN]) {
      const { face, marks } = plan.surface;
      expect(face.top).toBeLessThan(face.bottom);
      for (const region of MARK_REGIONS) {
        const { theta, y } = marks[region];
        expect(theta[0]).toBeLessThan(theta[1]);
        expect(y[0]).toBeLessThan(y[1]);
        // The shoulder is on the back; the forehead is the skin between the brows (the test below holds it
        // clear of them); the chest is wholly below the widest mouth.
        if (region === 'shoulder') expect(theta[0]).toBeGreaterThan(110);
        if (region === 'forehead') expect(y[1]).toBeLessThan(face.top);
      }
      expect(marks.forehead.y[0]).toBeLessThan(face.top);
      expect(marks.chest.y[0]).toBeGreaterThan(face.bottom);
    }
  });

  it('never touches an eye, a brow, a cheek or the mouth: every region, both sides, every expression, both stages, at the extremes of its place', { timeout: 60_000 }, () => {
    const faces: Partial<BlobbiState>[] = [{}, ...EMOTIONS.map((emotion) => ({ expression: { [emotion]: 1 } })), { gaze: { x: -1, y: 1 } }, { sleeping: true }];
    let checked = 0;
    for (const seed of seeds(8, 'safe')) {
      for (const stage of STAGES) {
        for (const region of MARK_REGIONS) {
          for (const side of [-1, 1] as const) {
            for (const [u, v, size] of [[-1, -1, 1], [1, 1, 1], [-1, 1, 1], [1, -1, 1], [0, 0, -1]] as const) {
              const genome = marked(seed, region, 'star', side);
              Object.assign(genome.traits.mark, { u, v, size });
              for (const face of faces) {
                for (const state of [{ view: 'front' }, { view: 'side', direction: 'right' }, { view: 'side', direction: 'left' }] as const) {
                  const geo = geometry(genome, stage, { ...state, ...face }) as FrontGeometry | SideGeometry;
                  const mark = geo.markings.mark;
                  if (!mark) continue;
                  checked += 1;
                  for (const part of faceBoxes(geo)) {
                    if (part.name.includes('cheek') && state.view === 'side') continue;
                    expect(overlap(markBox(mark), part.box), `${seed} ${stage} ${region} ${side} ${state.view} ${JSON.stringify(face)} ${part.name}`).toBe(false);
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(3_000);
  });

  it('lies on the body: its middle is inside the silhouette, and seen square on it is whole', { timeout: 60_000 }, () => {
    for (const seed of seeds(40, 'inside')) {
      for (const stage of STAGES) {
        for (const region of MARK_REGIONS) {
          for (const side of [-1, 1] as const) {
            const genome = marked(seed, region, 'heart', side);
            for (const view of ['front', 'back'] as const) {
              const geo = geometry(genome, stage, { view }) as FrontGeometry;
              const mark = geo.markings.mark;
              if (!mark) continue;
              const left = geo.body.edgeAt(-1, mark.cy);
              const right = geo.body.edgeAt(1, mark.cy);
              expect(mark.cx, `${seed} ${stage} ${region} ${view}`).toBeGreaterThan(left);
              expect(mark.cx).toBeLessThan(right);
              expect(mark.cy - mark.r).toBeGreaterThan(geo.body.top);
              expect(mark.cy + mark.r).toBeLessThan(geo.body.top + geo.body.height);
              // The regions that face this view have room for the whole mark.
              if (mark.squash > 0.9) {
                expect(mark.cx - mark.r * mark.squash).toBeGreaterThan(left);
                expect(mark.cx + mark.r * mark.squash).toBeLessThan(right);
              }
            }
            for (const direction of ['left', 'right'] as const) {
              const geo = geometry(genome, stage, { view: 'side', direction }) as SideGeometry;
              const mark = geo.markings.mark;
              if (!mark) continue;
              expect(mark.cx).toBeGreaterThan(geo.body.backAt(mark.cy));
              expect(mark.cx).toBeLessThan(geo.body.frontAt(mark.cy));
            }
          }
        }
      }
    }
  });

  it('is the same mark from every side: one patch of skin, seen where it faces and gone where it does not', { timeout: 60_000 }, () => {
    for (const seed of seeds(30, 'coherent')) {
      for (const stage of STAGES) {
        for (const region of MARK_REGIONS) {
          for (const side of [-1, 1] as const) {
            const genome = marked(seed, region, 'moon', side);
            const place = deriveMorphology(genome, stage).mark!;
            expect(place.region).toBe(region);
            expect(place.side).toBe(side);
            const seen = (state: Partial<BlobbiState>) => geometry(genome, stage, state).markings.mark;
            const front = seen({ view: 'front' });
            const back = seen({ view: 'back' });
            // A right-facing profile shows the flank on the viewer's left from the front (side -1).
            const near = seen({ view: 'side', direction: side === -1 ? 'right' : 'left' });
            const far = seen({ view: 'side', direction: side === -1 ? 'left' : 'right' });
            const label = `${seed} ${stage} ${region} ${side}`;
            if (region === 'shoulder') {
              expect(front, label).toBeNull();
              expect(back, label).not.toBeNull();
            } else {
              expect(front, label).not.toBeNull();
              expect(back, label).toBeNull();
            }
            // Never on the flank that is turned away; on the near one whenever it faces the viewer enough to read.
            expect(far, label).toBeNull();
            if (region === 'hip' || region === 'shoulder') expect(near, label).not.toBeNull();
            // It is on its own side of the body, from the front and (mirrored, as a body is) from behind.
            const head = geometry(genome, stage, { view: 'front' }) as FrontGeometry;
            if (front) expect(Math.sign(front.cx - head.body.axisX)).toBe(side);
            if (back) expect(Math.sign(back.cx - (geometry(genome, stage, { view: 'back' }) as FrontGeometry).body.axisX)).toBe(-side);
            // And at one height, whichever view shows it.
            const heights = [
              ['front', front],
              ['back', back],
              ['side', near],
            ]
              .filter((entry): entry is [View, NonNullable<typeof front>] => entry[1] !== null)
              .map(([view, mark]) => {
                const geo = geometry(genome, stage, { view, direction: side === -1 ? 'right' : 'left' });
                return Math.round(((mark.cy - geo.body.top) / geo.body.height) * 1e4) / 1e4;
              });
            expect(new Set(heights).size, `${label} ${heights}`).toBe(1);
            expect(heights[0]).toBeCloseTo(place.yFraction, 4);
            // Facing the viewer it is whole; turned, it is only narrower, never taller or elsewhere.
            for (const mark of [front, back, near]) {
              if (!mark) continue;
              expect(mark.squash).toBeGreaterThan(0.28);
              expect(mark.squash).toBeLessThanOrEqual(1);
              expect(mark.r).toBe(place.r);
            }
          }
        }
      }
    }
  });

  it('keeps its place as the Blobbi grows: the same region and side on the baby and the adult, smaller on the baby', () => {
    for (const seed of seeds(200, 'grow')) {
      const genome = generateGenome({ seed, mark: 'star' });
      const baby = deriveMorphology(genome, 'baby').mark!;
      const adult = deriveMorphology(genome, 'adult').mark!;
      expect(baby.region).toBe(adult.region);
      expect(baby.side).toBe(adult.side);
      expect(baby.kind).toBe(adult.kind);
      expect(baby.r).toBeLessThan(adult.r);
      expect(baby.rotation).toBe(adult.rotation);
    }
  });

  it('uses a region the body leaves free: a forehead horn keeps the brow, spots and stripes keep the back; every region is used', () => {
    expect(freeMarkRegions('none', 'solid')).toEqual([...MARK_REGIONS]);
    expect(freeMarkRegions('forehead', 'solid')).not.toContain('forehead');
    expect(freeMarkRegions('top', 'gradient')).not.toContain('forehead');
    expect(freeMarkRegions('side', 'gradient')).toEqual([...MARK_REGIONS]);
    expect(freeMarkRegions('none', 'spotted')).not.toContain('shoulder');
    expect(freeMarkRegions('none', 'striped')).not.toContain('shoulder');
    expect(freeMarkRegions('forehead', 'striped')).toEqual(['chest', 'hip']);
    const used = new Set<string>();
    for (const seed of seeds(400, 'free')) {
      const own = generateGenome(seed);
      for (const horns of ['none', 'forehead', 'top', 'side'] as const) {
        for (const pattern of PATTERN_KINDS) {
          const region = deriveMorphology(generateGenome({ seed, horns, pattern, mark: 'sparkle' }), 'adult').mark!.region;
          expect(freeMarkRegions(horns, pattern)).toContain(region);
          if (horns === own.traits.horns.kind && pattern === own.traits.pattern.kind) used.add(region);
        }
      }
    }
    expect([...used].sort()).toEqual([...MARK_REGIONS].sort());
  });

  it('is painted in the accent colour where there is one, a pale tint of the body where there is not, and always reads on the skin', () => {
    let withAccent = 0;
    for (const seed of seeds(300, 'ink')) {
      const genome = generateGenome({ seed, mark: 'heart' });
      const palette = derivePalette(genome.colors);
      const apart = Math.min(distance(palette.mark, palette.bodyMid), distance(palette.mark, palette.babyMid));
      expect(apart, seed).toBeGreaterThan(0.12);
      if (genome.colors.accent && palette.mark === genome.colors.accent) withAccent += 1;
      if (!genome.colors.accent) {
        // Never the pattern's colour unless nothing else reads: a mark and a pattern are told apart.
        if (palette.mark !== palette.marking) expect(distance(palette.mark, palette.marking)).toBeGreaterThan(0.1);
      }
      for (const stage of STAGES) {
        const svg = svgOf(marked(seed, 'chest', 'heart', 1, { colors: genome.colors }), stage);
        expect(svg).toMatch(new RegExp(`data-part="special-mark-shape" d="[^"]+" fill="${palette.mark}"`));
      }
    }
    expect(withAccent).toBeGreaterThan(60);
    // Stated colours decide it, not the seed: the same seed with another accent has another mark colour.
    const stated = derivePalette({ base: '#3fb7a5', secondary: '#2a6f8f', eye: '#5a2d12', accent: '#e86a5c' });
    expect(stated.mark).toBe('#e86a5c');
    const plain = derivePalette({ base: '#3fb7a5', secondary: '#2a6f8f', eye: '#5a2d12' });
    expect(plain.mark).not.toBe('#e86a5c');
    expect(distance(plain.mark, plain.bodyMid)).toBeGreaterThan(0.14);
  });
});
