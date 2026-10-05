/**
 * Horns: curl in both directions, pairs that mirror, and roots that grow
 * out of the body's own surface with no straight cut anywhere.
 */
import { describe, expect, it } from 'vitest';
import { canonicalGenome, generateGenome, type BlobbiGenome, type HornKind } from './genome';
import { deriveMorphology } from './morphology';
import { DIRECTIONS, LIFE_STAGES, VIEWS, type Direction, type LifeStage, type View } from './plan';
import { buildBlobbiGeometry, renderBlobbiSvg } from './renderer';
import { problemsIn } from './test-helpers';
import type { Appendage } from './traits/appendages';

type Kind = Exclude<HornKind, 'none'>;
const KINDS: Kind[] = ['forehead', 'top', 'side'];
const EXTREMES = [-1, 0, 1];

/** The canonical body with one kind of horn; genes not stated are at zero. */
function horned(kind: Kind, genes: Partial<BlobbiGenome['traits']['horns']> = {}): BlobbiGenome {
  const genome = canonicalGenome();
  genome.traits.horns = { ...genome.traits.horns, kind, ...genes };
  return genome;
}
function horns(genome: BlobbiGenome, view: View, stage: LifeStage = 'adult', direction: Direction = 'right') {
  const geo = buildBlobbiGeometry(deriveMorphology(genome, stage), { view, direction });
  return { geo, horns: geo.appendages.filter((a) => a.part === 'horn') };
}
const controlOf = (a: Appendage) => {
  const mark = a.debug.find((m) => m.kind === 'control');
  if (!mark || mark.kind !== 'control') throw new Error('no control point');
  return mark.at;
};
/** How far the tip is turned from the line the horn starts along: signed, in degrees, clockwise on screen. */
function turn(a: Appendage): number {
  const c = controlOf(a);
  const start = Math.atan2(c.y - a.base.y, c.x - a.base.x);
  const end = Math.atan2(a.tip.y - c.y, a.tip.x - c.x);
  let deg = ((end - start) * 180) / Math.PI;
  if (deg > 180) deg -= 360;
  if (deg < -180) deg += 360;
  return deg;
}
const pathOf = (a: Appendage) => a.prims.find((p) => p.part === 'horn-body')!.d!;

describe('horn curvature is signed', () => {
  it('is straight at zero: the centre line does not turn', () => {
    for (const kind of KINDS) {
      for (const view of VIEWS) {
        for (const h of horns(horned(kind, { curvature: 0 }), view).horns) expect(Math.abs(turn(h))).toBeLessThan(1e-6);
      }
    }
  });

  it('turns one way for a positive gene and the opposite way, as far, for a negative one', () => {
    // Every horn that stands on the silhouette's edge (where a bend can be seen).
    const cases: [Kind, View][] = [['top', 'front'], ['top', 'back'], ['side', 'front'], ['side', 'back'], ['forehead', 'side'], ['top', 'side']];
    for (const [kind, view] of cases) {
      const plus = horns(horned(kind, { curvature: 1 }), view).horns;
      const minus = horns(horned(kind, { curvature: -1 }), view).horns;
      expect(plus.length).toBeGreaterThan(0);
      plus.forEach((h, i) => {
        const a = turn(h);
        const b = turn(minus[i]);
        expect(Math.abs(a), `${kind} ${view}`).toBeGreaterThan(10);
        expect(a * b).toBeLessThan(0);
        expect(Math.abs(a)).toBeCloseTo(Math.abs(b), 6);
      });
    }
  });

  it('grows steadily with the gene, from one extreme through straight to the other', () => {
    for (const [kind, view] of [['side', 'front'], ['forehead', 'side'], ['top', 'front']] as [Kind, View][]) {
      const turns = [-1, -0.5, 0, 0.5, 1].map((c) => turn(horns(horned(kind, { curvature: c }), view).horns[0]));
      const rising = turns[4] > turns[0];
      for (let i = 1; i < turns.length; i++) expect(rising ? turns[i] > turns[i - 1] : turns[i] < turns[i - 1]).toBe(true);
    }
  });

  it('means the same thing for every horn: positive curls up and in, negative out and down', () => {
    const tipOf = (kind: Kind, view: View, curvature: number) => horns(horned(kind, { curvature }), view).horns;
    // Side horns: tips rise with a positive curl and droop with a negative one.
    for (const view of ['front', 'back'] as const) {
      const [up, flat, down] = [1, 0, -1].map((c) => tipOf('side', view, c));
      up.forEach((h, i) => {
        expect(h.tip.y).toBeLessThan(flat[i].tip.y);
        expect(down[i].tip.y).toBeGreaterThan(flat[i].tip.y);
      });
    }
    // Top horns: tips come together with a positive curl and part with a negative one.
    for (const view of ['front', 'back'] as const) {
      const gap = (hs: Appendage[]) => Math.abs(hs[0].tip.x - hs[1].tip.x);
      expect(gap(tipOf('top', view, 1))).toBeLessThan(gap(tipOf('top', view, 0)));
      expect(gap(tipOf('top', view, -1))).toBeGreaterThan(gap(tipOf('top', view, 0)));
    }
    // The central horn, in profile (facing right): up and back, or forward and down.
    const [up, flat, down] = [1, 0, -1].map((c) => tipOf('forehead', 'side', c)[0]);
    expect(up.tip.y).toBeLessThan(flat.tip.y);
    expect(up.tip.x).toBeLessThan(flat.tip.x);
    expect(down.tip.y).toBeGreaterThan(flat.tip.y);
    // Seen end on from the front, a curl toward the eye cannot be a sideways bend: it shows as height.
    const front = [1, 0, -1].map((c) => tipOf('forehead', 'front', c)[0]);
    expect(front[0].tip.y).toBeLessThan(front[1].tip.y);
    expect(front[2].tip.y).toBeGreaterThan(front[1].tip.y);
    for (const h of front) expect(Math.abs(h.tip.x - h.base.x)).toBeLessThan(1e-6);
  });
});

describe('paired horns', () => {
  it('mirror each other exactly when there is no asymmetry, at every curl', () => {
    for (const kind of ['top', 'side'] as const) {
      for (const view of ['front', 'back'] as const) {
        for (const curvature of EXTREMES) {
          const { geo, horns: pair } = horns(horned(kind, { curvature, asymmetry: 0 }), view);
          if (geo.view === 'side') throw new Error('unexpected view');
          expect(pair).toHaveLength(2);
          const [l, r] = pair[0].side === -1 ? pair : [pair[1], pair[0]];
          const axis = geo.body.axisX;
          // They grow from mirrored places on the body…
          expect(l.pivot.x - axis).toBeCloseTo(-(r.pivot.x - axis), 5);
          expect(l.pivot.y).toBeCloseTo(r.pivot.y, 5);
          // …and are mirror images when rooted alike. On an adult's crown one of a top pair is rooted
          // on the viewer's side of the head and one beyond it, so their roots sit a little differently.
          const alike = l.layer === r.layer;
          expect(alike).toBe(kind === 'side');
          for (const key of ['base', 'tip'] as const) {
            if (alike) {
              expect(l[key].x - axis).toBeCloseTo(-(r[key].x - axis), 5);
              expect(l[key].y).toBeCloseTo(r[key].y, 5);
            } else {
              expect(Math.abs(l[key].x - axis + (r[key].x - axis))).toBeLessThan(10);
              expect(Math.abs(l[key].y - r[key].y)).toBeLessThan(10);
            }
          }
          // Mirrored curls: the two tips turn opposite ways on screen.
          if (curvature !== 0) expect(turn(l)).toBeCloseTo(-turn(r), alike ? 5 : 0);
        }
      }
    }
  });

  it('keep a small, deterministic difference: one horn a little longer and a little more curled', () => {
    const { horns: pair } = horns(horned('top', { curvature: 0.5, asymmetry: 1 }), 'front');
    const length = (h: Appendage) => Math.hypot(controlOf(h).x - h.base.x, controlOf(h).y - h.base.y) * 2;
    const [a, b] = pair.map(length);
    expect(a).not.toBe(b);
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.08);
    // Six degrees of extra curl, plus what the longer horn's extra length lets it bend.
    expect(Math.abs(Math.abs(turn(pair[0])) - Math.abs(turn(pair[1])))).toBeLessThan(7.5);
    expect(Math.abs(Math.abs(turn(pair[0])) - Math.abs(turn(pair[1])))).toBeGreaterThan(1);
    // The same input, the same pair.
    expect(horns(horned('top', { curvature: 0.5, asymmetry: 1 }), 'front').horns.map(pathOf)).toEqual(pair.map(pathOf));
  });

  it('swap sides when seen from behind: the longer horn is on the other side of the screen', () => {
    const genome = horned('side', { asymmetry: 1 });
    const longer = (view: View) => {
      const pair = horns(genome, view).horns;
      const reach = (h: Appendage) => Math.hypot(h.tip.x - h.base.x, h.tip.y - h.base.y);
      return reach(pair[0]) > reach(pair[1]) ? pair[0].side : pair[1].side;
    };
    expect(longer('front')).toBe(-longer('back'));
  });
});

describe('horn roots', () => {
  it('never close with a straight cut: curves and arcs only', () => {
    for (const stage of LIFE_STAGES) {
      for (const kind of KINDS) {
        for (const view of VIEWS) {
          for (const curvature of EXTREMES) {
            for (const h of horns(horned(kind, { curvature, length: curvature, width: -curvature }), view, stage).horns) {
              const d = pathOf(h);
              expect(d).not.toMatch(/[LlHhVv]/);
              // A dome at the tip always; a rounded base whenever the root is in view.
              expect((d.match(/ A /g) ?? []).length).toBe(h.layer === 'behind' ? 1 : 2);
            }
          }
        }
      }
    }
  });

  it('are rounded and shaded where the root shows, and covered by the body where it does not', () => {
    const over = horns(horned('forehead'), 'front').horns[0];
    expect(over.layer).toBe('over');
    expect(over.prims.map((p) => p.part)).toEqual(['horn-root', 'horn-body', 'horn-highlight']);
    const behind = horns(horned('side'), 'front');
    for (const h of behind.horns) {
      expect(h.layer).toBe('behind');
      expect(h.prims.map((p) => p.part)).toEqual(['horn-body', 'horn-highlight']);
    }
    const svg = renderBlobbiSvg(horned('side'), {});
    expect(svg.indexOf('data-part="horn"')).toBeLessThan(svg.indexOf('data-part="body-base"'));
    const front = renderBlobbiSvg(horned('forehead'), {});
    expect(front.indexOf('data-part="horn"')).toBeGreaterThan(front.indexOf('data-part="body-base"'));
  });

  it('stay attached: every horn is rooted on the silhouette it is drawn with, sunk inside it', () => {
    for (const stage of LIFE_STAGES) {
      for (let i = 0; i < 60; i++) {
        for (const kind of KINDS) {
          const genome = generateGenome({ seed: `root-${i}`, horns: kind });
          genome.traits.horns.curvature = [-1, 0, 1][i % 3];
          for (const view of VIEWS) {
            const { geo, horns: all } = horns(genome, view, stage);
            for (const h of all) {
              const span = geo.body.spanAt(h.pivot.y);
              if (h.layer === 'over') {
                // On the body's face, within the silhouette.
                expect(h.pivot.x).toBeGreaterThan(span!.min);
                expect(h.pivot.x).toBeLessThan(span!.max);
                continue;
              }
              if (view === 'side' && kind === 'top') {
                // In profile a crown horn is out on a flank: below the ridge the silhouette shows, within the body.
                expect(h.pivot.y).toBeGreaterThan(geo.body.topAt(h.pivot.x));
                expect(h.pivot.x).toBeGreaterThan(span!.min);
                expect(h.pivot.x).toBeLessThan(span!.max);
              } else {
                // On the outline: at an edge of the body at that height, or on its crown.
                const onEdge = span ? Math.min(Math.abs(h.pivot.x - span.min), Math.abs(h.pivot.x - span.max)) : Infinity;
                const onCrown = Math.abs(h.pivot.y - geo.body.topAt(h.pivot.x));
                expect(Math.min(onEdge, onCrown)).toBeLessThan(1e-6);
              }
              // The root is inside the body, never floating off it.
              const rootSpan = geo.body.spanAt(h.base.y);
              expect(rootSpan).not.toBeNull();
              expect(h.base.x).toBeGreaterThan(rootSpan!.min);
              expect(h.base.x).toBeLessThan(rootSpan!.max);
            }
          }
        }
      }
    }
  });

  it('follow the surface: on a differently shaped body the root moves and turns with it', () => {
    const narrow = horned('side');
    const wide = horned('side');
    wide.morphology.bodyWidth = 1;
    wide.morphology.topWidth = 1;
    const a = horns(narrow, 'front').horns.find((h) => h.side === 1)!;
    const b = horns(wide, 'front').horns.find((h) => h.side === 1)!;
    expect(b.pivot.x).toBeGreaterThan(a.pivot.x + 10);
    expect(pathOf(b)).not.toBe(pathOf(a));
  });
});

describe('horns in every drawing', () => {
  it('are sound markup at every extreme of curl, length, width, tilt and roundness, in every stage, view and direction', () => {
    const problems: string[] = [];
    for (const stage of LIFE_STAGES) {
      for (const kind of KINDS) {
        for (const curvature of EXTREMES) {
          for (const size of EXTREMES) {
            const genome = horned(kind, { curvature, length: size, width: -size, tilt: size, roundness: -curvature, asymmetry: 1 });
            for (const view of VIEWS) {
              for (const direction of view === 'side' ? DIRECTIONS : (['right'] as const)) {
                const svg = renderBlobbiSvg(genome, { stage, view, direction });
                for (const problem of problemsIn(svg)) problems.push(`${stage} ${kind} ${view} ${direction} ${curvature}: ${problem}`);
                expect(renderBlobbiSvg(genome, { stage, view, direction })).toBe(svg);
              }
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('face the other way as a mirror image: a central horn points left when the Blobbi does', () => {
    for (const stage of LIFE_STAGES) {
      const right = horns(horned('forehead', { curvature: 1 }), 'side', stage, 'right').horns[0];
      const left = horns(horned('forehead', { curvature: 1 }), 'side', stage, 'left').horns[0];
      // Both are built facing right and the left one is drawn reflected.
      expect(pathOf(left)).toBe(pathOf(right));
      expect(renderBlobbiSvg(horned('forehead'), { stage, view: 'side', direction: 'left' })).toContain('matrix(-1,0,0,1');
    }
  });

  it('are buds on a baby: short, wide, and bent less than the adult horn they will become', () => {
    for (const kind of ['top', 'side'] as const) {
      const baby = horns(horned(kind, { curvature: 1 }), 'front', 'baby').horns[0];
      const adult = horns(horned(kind, { curvature: 1 }), 'front', 'adult').horns[0];
      const reach = (h: Appendage) => Math.hypot(h.tip.x - h.base.x, h.tip.y - h.base.y);
      expect(reach(baby)).toBeLessThan(reach(adult) * 0.4);
      expect(Math.abs(turn(baby))).toBeLessThan(Math.abs(turn(adult)));
      expect(Math.abs(turn(baby))).toBeGreaterThan(5);
    }
  });
});
