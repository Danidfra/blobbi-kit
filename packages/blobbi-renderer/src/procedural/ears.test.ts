/**
 * EARS ARE ATTACHED, from every side.
 *
 * An ear grows from one place on the body: high on a flank, toward the back
 * of the head. From the front and from behind that place is on the
 * silhouette's edge; in profile it is a point ON the flank, so the near
 * ear's foot is on the skin and the far ear's behind the head. These tests
 * hold the root to the body at the extremes of every gene that could move
 * it off, which is where an ear once hung out over the back of the head.
 */
import { describe, expect, it } from 'vitest';
import { EAR_GENES, generateGenome, type BlobbiGenome, type EarKind } from './genome';
import { deriveMorphology, EAR_RANGES } from './morphology';
import type { LifeStage } from './plan';
import { buildBlobbiGeometry } from './renderer';
import { problemsIn, seeds } from './test-helpers';
import { renderBlobbiSvg } from './renderer';
import type { FrontGeometry } from './views/front';
import type { SideGeometry } from './views/side';

const STAGES: readonly LifeStage[] = ['baby', 'adult'];
const KINDS: readonly Exclude<EarKind, 'none'>[] = ['round', 'pointed'];
const eared = (seed: string, kind: Exclude<EarKind, 'none'>, more: Partial<Exclude<Parameters<typeof generateGenome>[0], string>> = {}): BlobbiGenome =>
  generateGenome({ seed, antenna: 'none', horns: 'none', tail: 'none', pattern: 'solid', mark: 'none', belly: false, freckles: false, ...more, ears: kind });
const ears = (geo: FrontGeometry | SideGeometry) => geo.appendages.filter((a) => a.part === 'ear');
const side = (genome: BlobbiGenome, stage: LifeStage, direction: 'left' | 'right') => buildBlobbiGeometry(deriveMorphology(genome, stage), { view: 'side', direction }) as SideGeometry;
const front = (genome: BlobbiGenome, stage: LifeStage, view: 'front' | 'back') => buildBlobbiGeometry(deriveMorphology(genome, stage), { view }) as FrontGeometry;

/** Every ear gene and every body gene that shapes the head, each at both ends: the bodies an ear is hardest to keep on. */
function extremes(kind: Exclude<EarKind, 'none'>): BlobbiGenome[] {
  const out: BlobbiGenome[] = [];
  const bodies = [{}, { topWidth: -1, roundness: -1 }, { topWidth: 1, roundness: 1 }, { topWidth: -1, roundness: 1, bodyWidth: -1 }, { lean: 1, bodyWidth: -1, bodyHeight: 1 }, { lean: -1, bodyWidth: 1, bodyHeight: -1 }, { topWidth: -1, lean: -1, bodyHeight: -1 }];
  const shapes = [
    { size: 1, tilt: 1, flop: 1, position: 1 },
    { size: 1, tilt: -1, flop: -1, position: -1 },
    { size: 1, tilt: 1, flop: -1, position: -1 },
    { size: -1, tilt: -1, flop: 1, position: 1 },
    { size: 0, tilt: 0, flop: 0, position: 0 },
  ];
  for (const body of bodies) {
    for (const shape of shapes) {
      const genome = eared(`ears-${out.length}`, kind);
      Object.assign(genome.morphology, body);
      Object.assign(genome.traits.ears, shape);
      out.push(genome);
    }
  }
  return out;
}

describe('ears in profile', () => {
  it('the near ear is rooted ON the flank, inside the silhouette, at every extreme, at both stages, facing either way', () => {
    let checked = 0;
    for (const kind of KINDS) {
      for (const genome of [...extremes(kind), ...seeds(40, `ear-${kind}`).map((seed) => eared(seed, kind))]) {
        for (const stage of STAGES) {
          for (const direction of ['left', 'right'] as const) {
            const geo = side(genome, stage, direction);
            const [near, ...rest] = ears(geo).filter((ear) => !ear.far);
            expect(rest).toEqual([]);
            expect(near.layer).toBe('crown');
            const label = `${genome.seed} ${stage} ${direction}`;
            // Its foot is on the skin: between the back and the front of the head at its own height, below the crown.
            const back = geo.body.backAt(near.pivot.y);
            const frontEdge = geo.body.frontAt(near.pivot.y);
            const depth = frontEdge - back;
            expect(near.pivot.x, label).toBeGreaterThan(back + 0.12 * depth);
            expect(near.pivot.x, label).toBeLessThan(frontEdge - 0.4 * depth);
            expect(near.pivot.y, label).toBeGreaterThan(geo.body.top);
            // And the ear starts there: its base is inside the body too, never out over the slope of the head.
            expect(near.base.x, label).toBeGreaterThan(geo.body.backAt(near.base.y));
            expect(near.base.x, label).toBeLessThan(geo.body.frontAt(near.base.y));
            expect(Math.hypot(near.base.x - near.pivot.x, near.base.y - near.pivot.y), label).toBeLessThan(12);
            // It grows up from its foot, behind the tuft, and stays an ear's length from where it is rooted.
            expect(near.tip.y, label).toBeLessThan(near.pivot.y);
            expect(near.pivot.x, label).toBeLessThan(geo.body.apex.x);
            const e = deriveMorphology(genome, stage).ears!;
            expect(Math.hypot(near.tip.x - near.pivot.x, near.tip.y - near.pivot.y), label).toBeLessThan(e.size * 1.6 + 16);
            // A visible foot is drawn with its shade, so the join reads as a join.
            expect(near.prims.map((prim) => prim.part)).toContain('ear-root-shade');
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(400);
  });

  it('the far ear is the same ear on the other flank: behind the body, dimmed, a little ahead', () => {
    for (const kind of KINDS) {
      for (const genome of extremes(kind)) {
        for (const stage of STAGES) {
          const geo = side(genome, stage, 'right');
          const all = ears(geo);
          expect(all).toHaveLength(2);
          const near = all.find((ear) => !ear.far)!;
          const far = all.find((ear) => ear.far)!;
          expect(far.layer).toBe('behind');
          expect(far.side).toBe(near.side === 1 ? -1 : 1);
          expect(far.pivot.y).toBeCloseTo(near.pivot.y, 6);
          expect(far.pivot.x).toBeGreaterThan(near.pivot.x);
          expect(far.pivot.x - near.pivot.x).toBeLessThan(20);
          expect(far.prims.map((prim) => prim.part)).not.toContain('ear-root-shade');
          expect(far.prims.map((prim) => prim.part)).not.toContain('ear-inner');
        }
      }
    }
  });

  it('is the place the front and the back put it: the same height on the body from every side', () => {
    for (const kind of KINDS) {
      for (const genome of extremes(kind)) {
        for (const stage of STAGES) {
          const e = deriveMorphology(genome, stage).ears!;
          const profile = side(genome, stage, 'right');
          const height = (geo: FrontGeometry | SideGeometry, y: number) => (y - geo.body.top) / geo.body.height;
          for (const ear of ears(profile)) expect(height(profile, ear.pivot.y)).toBeCloseTo(e.position, 6);
          for (const view of ['front', 'back'] as const) {
            const geo = front(genome, stage, view);
            const pair = ears(geo);
            expect(pair.map((ear) => ear.side).sort()).toEqual([-1, 1]);
            for (const ear of pair) {
              expect(height(geo, ear.pivot.y)).toBeCloseTo(e.position, 6);
              // On the silhouette's edge, on its own side, leaning out.
              expect(ear.pivot.x).toBeCloseTo(geo.body.edgeAt(ear.side as -1 | 1, ear.pivot.y), 6);
              expect(Math.sign(ear.tip.x - ear.pivot.x)).toBe(ear.side);
              expect(ear.layer).toBe('behind');
            }
          }
        }
      }
    }
  });

  it('still varies: each ear gene moves the profile ear, inside its range', () => {
    for (const kind of KINDS) {
      const at = (gene: (typeof EAR_GENES)[number], value: number) => {
        const genome = eared('ear-vary', kind);
        Object.assign(genome.traits.ears, { size: 0, tilt: 0, flop: 0, position: 0, [gene]: value });
        const geo = side(genome, 'adult', 'right');
        const ear = ears(geo).find((a) => !a.far)!;
        return JSON.stringify([ear.pivot, ear.tip, ear.prims]);
      };
      for (const gene of EAR_GENES) {
        // Flop only shapes the pointed ear.
        if (gene === 'flop' && kind === 'round') continue;
        expect(at(gene, -1), `${kind} ${gene}`).not.toBe(at(gene, 1));
      }
      expect(EAR_RANGES.position.spread).toBeGreaterThan(0);
    }
  });

  it('draws sound markup with every other crown trait beside it', () => {
    for (const kind of KINDS) {
      for (const more of [{ horns: 'top' }, { horns: 'side' }, { horns: 'forehead' }, { antenna: 'single' }, { antenna: 'double' }, { antenna: 'double', horns: 'top' }] as const) {
        for (const seed of seeds(6, 'ear-mix')) {
          const genome = eared(seed, kind, more);
          for (const stage of STAGES) {
            for (const state of [{ view: 'front' }, { view: 'back' }, { view: 'side', direction: 'left' }, { view: 'side', direction: 'right' }] as const) {
              const svg = renderBlobbiSvg(genome, { stage, ...state });
              expect(problemsIn(svg)).toEqual([]);
              expect((svg.match(/data-part="ear"/g) ?? []).length).toBe(2);
            }
          }
        }
      }
    }
  });
});
