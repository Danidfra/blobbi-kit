/**
 * THE CROWN: a few objects on a small head, each at one depth.
 *
 *   head surface · tuft leaf (main) · tuft leaf (secondary) · antennae · horns · ears
 *
 * Every object has ONE depth, from where it is rooted on the crown and how
 * the view sees that place; all of its pieces are painted together at it.
 * These tests judge what is finally drawn: the order the objects are emitted
 * in, and RENDERED PIXELS. Nothing here says which member of a pair must be
 * in front: that follows from where the pair is set, and all three
 * arrangements (both behind the tuft, one each, both in front) are valid.
 */
import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { ANTENNA_GENES, EAR_GENES, HORN_GENES, canonicalGenome, generateGenome, type BlobbiGenome, type BlobbiSemanticIdentity } from './genome';
import { ANTENNA_BEHIND_HORN, ANTENNA_OUTSIDE_HORN, ANTENNA_RANGES, deriveMorphology, topHornLat } from './morphology';
import { planFor, type Direction, type LifeStage, type View } from './plan';
import { DOCUMENT_TRANSFORM, VIEWBOX, buildBlobbiGeometry, renderBlobbiSvg } from './renderer';
import { problemsIn, seeds } from './test-helpers';
import type { Appendage } from './traits/appendages';

const VIEWS = ['front', 'side', 'back'] as const;
type Genes = Record<string, number>;

/** The canonical adult (authored colours) with the stated traits, every trait gene at rest, then the stated genes. */
function crowned(traits: BlobbiSemanticIdentity, genes: { antenna?: Genes; horns?: Genes; ears?: Genes } = {}): BlobbiGenome {
  const genome = { ...generateGenome({ seed: 'crown', colors: 'authored', antenna: 'none', horns: 'none', ears: 'none', tail: 'none', spots: false, belly: false, freckles: false, ...traits }), morphology: canonicalGenome().morphology };
  for (const key of ANTENNA_GENES) genome.traits.antenna[key] = 0;
  for (const key of HORN_GENES) genome.traits.horns[key] = 0;
  for (const key of EAR_GENES) genome.traits.ears[key] = 0;
  Object.assign(genome.traits.antenna, { side: 1 }, genes.antenna);
  Object.assign(genome.traits.horns, genes.horns);
  Object.assign(genome.traits.ears, genes.ears);
  return genome;
}
const geometry = (genome: BlobbiGenome, view: View, stage: LifeStage = 'adult', direction: Direction = 'right') => buildBlobbiGeometry(deriveMorphology(genome, stage), { view, direction });
const partsOf = (genome: BlobbiGenome, view: View, part: string, stage: LifeStage = 'adult') => geometry(genome, view, stage).appendages.filter((a) => a.part === part);

/** The crown's pieces in the order they are painted: later is in front. */
function paintOrder(svg: string): string[] {
  return [...svg.matchAll(/data-part="(body-base|tuft-main|tuft-secondary|tuft-detail-left|tuft-detail-right)"|data-part="(antenna|horn|ear)" data-side="(left|right)"/g)].map((m) => m[1] ?? `${m[2]}:${m[3]}`);
}
const nameOf = (a: Appendage) => `${a.part}:${a.side === 1 ? 'right' : 'left'}`;

const SCALE = 4;
/** The colour actually rendered at a point given in root units. */
function pixels(svg: string) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(VIEWBOX.width * SCALE) }, background: '#ffffff', font: { loadSystemFonts: false } }).render();
  const data = image.pixels;
  return (x: number, y: number): [number, number, number] => {
    const px = Math.round((x * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx) * SCALE);
    const py = Math.round((y * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.ty) * SCALE);
    const i = (py * image.width + px) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
}
/** Horns are honey: much more red than blue. The body, the tuft and antennae are purple: more blue than red. */
const isHorn = ([r, , b]: number[]) => r > 190 && r - b > 40;
const isPurple = ([r, , b]: number[]) => b > r + 30;
/** Whether a colour test holds at a point and all round it: inside a shape, not on its antialiased edge. */
const solid = (colour: (x: number, y: number) => number[], test: (c: number[]) => boolean, x: number, y: number, r = 1.6) =>
  [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => test(colour(x + dx, y + dy)));

/** A leaf (its fill AND its line: one group), and a trait's group, for taking them out of a drawing. */
const LEAVES = /<g data-part="tuft-leaf"[^>]*>.*?<\/g>/g;
const groupOf = (part: string, layer = '') => new RegExp(`<g data-part="${part}"[^>]*${layer && `data-layer="${layer}"`}[^>]*>.*?</g>`, 'g');
/** Sample points of the head and the air above it. */
function* crownPoints(geo: ReturnType<typeof geometry>, step = 2): Generator<{ x: number; y: number; above: boolean }> {
  for (let x = 250; x <= 600; x += step) for (let y = geo.body.top - 120; y < geo.body.top + 90; y += step) yield { x, y, above: y < geo.body.topAt(x) - 1 };
}

// ─── A leaf is one object ────────────────────────────────────────────────────

describe('a tuft leaf is one object: its fill and its line share its depth', () => {
  const mixtures: BlobbiSemanticIdentity[] = [{ antenna: 'double' }, { horns: 'top' }, { antenna: 'double', horns: 'top' }, { antenna: 'single', ears: 'round' }, { horns: 'top', ears: 'pointed' }];

  it('draws each leaf as one group, fill then line, and no line anywhere else', () => {
    for (const view of VIEWS) {
      const svg = renderBlobbiSvg(canonicalGenome(), { view });
      expect(svg).toMatch(/<g data-part="tuft-leaf" data-leaf="main"[^>]*><ellipse[^>]*data-part="tuft-main"[^>]*\/><path[^>]*data-part="tuft-detail-left"[^>]*\/><\/g>/);
      expect(svg).toMatch(/<g data-part="tuft-leaf" data-leaf="secondary"[^>]*><ellipse[^>]*data-part="tuft-secondary"[^>]*\/><path[^>]*data-part="tuft-detail-right"[^>]*\/><\/g>/);
      expect((svg.match(/data-part="tuft-detail-/g) ?? []).length).toBe(2);
      expect(svg.replace(LEAVES, '')).not.toMatch(/tuft-(main|secondary|detail)/);
    }
  });

  it('never paints a trait between a leaf and its own line, whatever is on the head', () => {
    let between = 0;
    for (const seed of seeds(50)) {
      for (const traits of mixtures) {
        const genome = generateGenome({ seed, ...traits });
        for (const view of VIEWS) {
          for (const direction of ['left', 'right'] as const) {
            const order = paintOrder(renderBlobbiSvg(genome, { view, direction, motion: 'walking', phase: 0.4 }));
            for (const [fill, line] of [['tuft-main', 'tuft-detail-left'], ['tuft-secondary', 'tuft-detail-right']]) {
              // Nothing at all comes between them: the line is the very next piece.
              expect(order.indexOf(line)).toBe(order.indexOf(fill) + 1);
            }
            // A trait can still stand between the two LEAVES: they are two objects.
            const [a, b] = [order.indexOf('tuft-detail-left'), order.indexOf('tuft-secondary')].sort((p, q) => p - q);
            if (b - a > 1 && !order.slice(a, b).includes('body-base')) between++;
          }
        }
      }
    }
    expect(between).toBeGreaterThan(0);
  });

  it('REGRESSION: where a horn passes in front of a leaf, it covers the leaf AND its line (rendered pixels)', () => {
    // In profile the near horn stands across the tuft; from behind and from the front, a horn set forward does.
    let covered = 0;
    for (const [view, horns] of [['side', {}], ['back', { fore: -1 }], ['front', { fore: 1 }]] as [View, Genes][]) {
      const genome = crowned({ horns: 'top' }, { horns: { width: 1, length: 1, ...horns } });
      const geo = geometry(genome, view);
      const svg = renderBlobbiSvg(genome, { view });
      const drawn = pixels(svg);
      // The horns that are painted after the leaves, alone; and the leaves' LINES alone (dark on white).
      const order = paintOrder(svg);
      const front = geo.appendages.filter((a) => a.part === 'horn' && order.indexOf(nameOf(a)) > order.indexOf('tuft-detail-right') && order.indexOf(nameOf(a)) > order.indexOf('tuft-detail-left'));
      expect(front.length).toBeGreaterThan(0);
      let hornsOnly = svg.replace(LEAVES, '');
      for (const a of geo.appendages.filter((h) => h.part === 'horn' && !front.includes(h))) hornsOnly = hornsOnly.replace(new RegExp(`<g data-part="horn" data-side="${a.side === 1 ? 'right' : 'left'}"[^>]*>.*?</g>`), '');
      const horn = pixels(hornsOnly);
      const lines = pixels(renderBlobbiSvg(crowned({}), { view }).replace(/<ellipse[^>]*data-part="tuft-(main|secondary)"[^>]*\/>/g, '').replace(/<path data-part="body-base"[^>]*\/>/, ''));
      for (const p of crownPoints(geo, 1.5)) {
        const [r, g, b] = lines(p.x, p.y);
        const onLine = p.above && r < 200 && g < 200 && b > 80 && r + g + b < 560;
        if (!onLine || !solid(horn, isHorn, p.x, p.y)) continue;
        covered++;
        // The horn is in front of this leaf: its line must not show through.
        expect(isHorn(drawn(p.x, p.y)), `${view} at ${p.x},${p.y}`).toBe(true);
      }
    }
    expect(covered).toBeGreaterThan(20);
  });
});

// ─── Where a pair is set decides where it is seen ────────────────────────────

describe('a pair on the crown: behind the tuft, one each, or in front of it', () => {
  const arrangement = (genome: BlobbiGenome, view: View, part: string, stage: LifeStage = 'adult') =>
    partsOf(genome, view, part, stage)
      .map((a) => a.layer)
      .sort()
      .join('+');
  const SET: [BlobbiSemanticIdentity, string, (fore: number) => { antenna?: Genes; horns?: Genes }][] = [
    [{ antenna: 'double' }, 'antenna', (fore) => ({ antenna: { fore, position: -1 } })],
    [{ horns: 'top' }, 'horn', (fore) => ({ horns: { fore } })],
  ];

  it('is both behind when set back, one each in the middle, both in front when set forward', () => {
    for (const [traits, part, set] of SET) {
      expect(arrangement(crowned(traits, set(-1)), 'front', part)).toBe('behind+behind');
      expect(arrangement(crowned(traits, set(0)), 'front', part)).toBe('behind+crown');
      expect(arrangement(crowned(traits, set(1)), 'front', part)).toBe('crown+crown');
    }
  });

  it('turns over from behind: what is set back is on the viewer\'s side of the head', () => {
    for (const [traits, part, set] of SET) {
      expect(arrangement(crowned(traits, set(-1)), 'back', part)).toBe('crown+crown');
      expect(arrangement(crowned(traits, set(1)), 'back', part)).toBe('behind+behind');
      // In the middle it is one each either way, and it is the OTHER one that is in front from behind.
      const genome = crowned(traits, set(0));
      const front = partsOf(genome, 'front', part).find((a) => a.layer === 'crown')!;
      const back = partsOf(genome, 'back', part).find((a) => a.layer === 'crown')!;
      // Both are on the viewer's left of their drawing: opposite sides of the Blobbi.
      expect(front.side).toBe(-1);
      expect(back.side).toBe(-1);
    }
  });

  it('paints every object once, at its depth: hidden roots before the head, roots in view after it, leaves among them', () => {
    for (const [traits, part, set] of SET) {
      for (const fore of [-1, -0.5, 0, 0.5, 1]) {
        for (const view of ['front', 'back'] as const) {
          const genome = crowned(traits, set(fore));
          const geo = geometry(genome, view);
          if (geo.view === 'side' || !geo.limbs.tuft) throw new Error('expected a tufted front or back view');
          const order = paintOrder(renderBlobbiSvg(genome, { view }));
          const body = order.indexOf('body-base');
          const leaves = { 'tuft-main': geo.limbs.tuft.depths.main, 'tuft-secondary': geo.limbs.tuft.depths.secondary };
          for (const a of geo.appendages.filter((x) => x.part === part)) {
            const at = order.indexOf(nameOf(a));
            expect(order.filter((p) => p === nameOf(a))).toHaveLength(1);
            // The classification is the sign of its depth, and nothing else.
            expect(a.layer).toBe(a.depth > 0 ? 'crown' : 'behind');
            expect(at < body).toBe(a.layer === 'behind');
            // Against each leaf on the same side of the head: nearer is later.
            for (const [leaf, depth] of Object.entries(leaves)) {
              const leafAt = order.indexOf(leaf);
              if (leafAt < body === at < body) expect(at > leafAt, `${part} fore ${fore} ${view} vs ${leaf}`).toBe(a.depth > depth);
            }
          }
        }
      }
    }
  });

  it('REGRESSION: a root in view is drawn on the head, a hidden one is not (rendered pixels)', () => {
    for (const fore of [-1, 0, 1]) {
      const genome = crowned({ horns: 'top' }, { horns: { fore } });
      const geo = geometry(genome, 'front');
      const svg = renderBlobbiSvg(genome);
      const drawn = pixels(svg);
      const without = pixels(svg.replace(groupOf('horn'), ''));
      for (const horn of geo.appendages.filter((a) => a.part === 'horn')) {
        // Just inside the silhouette, where this horn is rooted.
        const at = { x: horn.pivot.x, y: geo.body.topAt(horn.pivot.x) + 6 };
        expect(isPurple(without(at.x, at.y))).toBe(true);
        expect(isHorn(drawn(at.x, at.y)), `fore ${fore}, ${nameOf(horn)}`).toBe(horn.layer === 'crown');
        // Above the head it is there either way.
        expect(isHorn(drawn(horn.tip.x, horn.tip.y + 8))).toBe(true);
      }
    }
  });

  it('keeps a pair level: the view\'s turn decides which side of the ridge a root is on, not how high it stands', () => {
    for (const [traits, part, set] of SET) {
      for (const fore of [-1, 1]) {
        const [a, b] = partsOf(crowned(traits, set(fore)), 'front', part);
        expect(a.layer).toBe(b.layer);
        expect(a.tip.y).toBeCloseTo(b.tip.y, 3);
        expect(a.base.y).toBeCloseTo(b.base.y, 3);
      }
    }
  });

  it('gives a population all three arrangements, by where each individual\'s pair is set', () => {
    const count: Record<string, number> = {};
    const all = seeds(400);
    for (const seed of all) {
      const genome = generateGenome({ seed, antenna: 'double', horns: 'none' });
      const key = arrangement(genome, 'front', 'antenna');
      count[key] = (count[key] ?? 0) + 1;
      // Deterministic: the same individual, the same classification and the same drawing.
      expect(arrangement(generateGenome({ seed, antenna: 'double', horns: 'none' }), 'front', 'antenna')).toBe(key);
      // And it is the genes that decide: set fully back, any individual's pair is behind.
      genome.traits.antenna.fore = -1;
      expect(arrangement(genome, 'front', 'antenna')).toBe('behind+behind');
    }
    expect(Object.keys(count).sort()).toEqual(['behind+behind', 'behind+crown', 'crown+crown']);
    for (const n of Object.values(count)) {
      expect(n).toBeGreaterThan(all.length * 0.05);
      expect(n).toBeLessThan(all.length * 0.7);
    }
  });

  it('puts a single antenna behind the tuft or in front of it by where it is set, on either side', () => {
    for (const side of [-1, 1]) {
      const back = crowned({ antenna: 'single' }, { antenna: { side, fore: -1 } });
      const forward = crowned({ antenna: 'single' }, { antenna: { side, fore: 1, position: -1 } });
      expect(partsOf(back, 'front', 'antenna')[0].layer).toBe('behind');
      expect(partsOf(forward, 'front', 'antenna')[0].layer).toBe('crown');
      const name = `antenna:${side === 1 ? 'right' : 'left'}`;
      expect(paintOrder(renderBlobbiSvg(back))[0]).toBe(name);
      expect(paintOrder(renderBlobbiSvg(forward)).at(-1)).toBe(name);
    }
  });

  it('leaves the canonical Blobbi and the traits that are not on the crown as they were', () => {
    expect(paintOrder(renderBlobbiSvg(canonicalGenome()))).toEqual(['body-base', 'tuft-main', 'tuft-detail-left', 'tuft-secondary', 'tuft-detail-right']);
    // The forehead horn is on the face, in front of everything on the crown.
    const forehead = renderBlobbiSvg(crowned({ horns: 'forehead' }));
    expect(forehead.indexOf('data-part="horn"')).toBeGreaterThan(forehead.indexOf('data-part="tuft-detail-right"'));
    // Side horns and ears grow from the flanks, behind the silhouette, clear of the tuft.
    for (const traits of [{ horns: 'side' }, { ears: 'round' }, { ears: 'pointed' }] as BlobbiSemanticIdentity[]) {
      const order = paintOrder(renderBlobbiSvg(crowned(traits)));
      expect(order.slice(2)).toEqual(['body-base', 'tuft-main', 'tuft-detail-left', 'tuft-secondary', 'tuft-detail-right']);
    }
  });
});

// ─── Antennae and top horns on one crown ─────────────────────────────────────

describe('antennae and top horns on one crown (forced: the generator never gives both)', () => {
  const both = (seed: string) => generateGenome({ seed, antenna: 'double', horns: 'top', ears: 'none' });
  const sameSide = (items: Appendage[]) =>
    ([-1, 1] as const).map((side) => ({ antenna: items.find((a) => a.part === 'antenna' && a.side === side)!, horn: items.find((a) => a.part === 'horn' && a.side === side)! }));

  it('roots each antenna behind and outside the horn beside it, whatever the genes ask for', () => {
    const cases = [...seeds(60).map(both), crowned({ antenna: 'double', horns: 'top' }, { antenna: { fore: 1, position: -1 }, horns: { fore: -1, position: 1 } })];
    for (const genome of cases) {
      for (const stage of ['adult', 'baby'] as const) {
        const m = deriveMorphology(genome, stage);
        for (const a of m.antennae) {
          expect(a.fore).toBeLessThanOrEqual(m.horns!.fore - ANTENNA_BEHIND_HORN + 1e-9);
          expect(a.position).toBeGreaterThanOrEqual(topHornLat(m.horns!.position) + ANTENNA_OUTSIDE_HORN - 1e-9);
        }
      }
    }
    // With no top horns an antenna is wherever its own genes put it.
    const alone = deriveMorphology(crowned({ antenna: 'double', horns: 'side' }, { antenna: { fore: 1, position: -1 } })).antennae[0];
    expect(alone.fore).toBeCloseTo(ANTENNA_RANGES.fore.base + ANTENNA_RANGES.fore.spread, 9);
    expect(alone.position).toBeCloseTo(ANTENNA_RANGES.position.base - ANTENNA_RANGES.position.spread, 9);
  });

  it('so the horn is in front of its antenna from the front, behind it from the back, and inside it in profile', () => {
    for (const genome of seeds(60).map(both)) {
      for (const view of VIEWS) {
        const geo = geometry(genome, view);
        const order = paintOrder(renderBlobbiSvg(genome, { view }));
        for (const { antenna, horn } of sameSide(geo.appendages)) {
          const antennaLater = order.indexOf(nameOf(antenna)) > order.indexOf(nameOf(horn));
          // By depth, not by which was emitted last: the order follows the two roots.
          expect(antennaLater).toBe(antenna.depth > horn.depth || (antenna.layer === 'crown' && horn.layer === 'behind'));
          if (view === 'front') expect(antennaLater, 'front').toBe(false);
          if (view === 'back') expect(antennaLater, 'back').toBe(true);
          // In profile the antenna is on the flank outside the horn: nearer on the near flank, further on the far one.
          if (view === 'side') expect(antennaLater, 'side').toBe(!antenna.far);
        }
      }
    }
  });

  it('REGRESSION: where they overlap from the front the horn covers the antenna; from behind the antenna covers the horn (rendered pixels)', () => {
    const genome = crowned({ antenna: 'double', horns: 'top' }, { antenna: { tilt: -1, length: 1, thickness: 1, fore: 1 }, horns: { width: 1, length: 1, position: 1, fore: 0 } });
    const seen = { front: 0, back: 0 };
    for (const view of ['front', 'back'] as const) {
      const geo = geometry(genome, view);
      const svg = renderBlobbiSvg(genome, { view });
      const drawn = pixels(svg);
      const antennae = pixels(svg.replace(LEAVES, '').replace(groupOf('horn'), ''));
      const horns = pixels(svg.replace(LEAVES, '').replace(groupOf('antenna'), ''));
      const leaves = pixels(renderBlobbiSvg(crowned({}), { view }));
      for (const p of crownPoints(geo, 1.5)) {
        // Clear of the head and of the tuft: only an antenna and a horn are here.
        if (!p.above || isPurple(leaves(p.x, p.y)) || !solid(antennae, isPurple, p.x, p.y) || !solid(horns, isHorn, p.x, p.y)) continue;
        seen[view]++;
        expect(isHorn(drawn(p.x, p.y)), `${view} at ${p.x},${p.y}`).toBe(view === 'front');
      }
    }
    expect(seen.front).toBeGreaterThan(10);
    expect(seen.back).toBeGreaterThan(10);
  });
});

// ─── Roots stay on the head ──────────────────────────────────────────────────

describe('every crown trait stays rooted on this Blobbi\'s head', () => {
  it('is rooted inside the silhouette it is drawn with, in view or hidden, for any individual and any mixture', () => {
    const mixtures: BlobbiSemanticIdentity[] = [{ antenna: 'single' }, { antenna: 'double' }, { horns: 'top' }, { antenna: 'double', horns: 'top' }, { antenna: 'double', ears: 'round' }, { horns: 'top', ears: 'pointed' }];
    for (const stage of ['adult', 'baby'] as const) {
      const scale = planFor(stage).scale;
      for (const seed of seeds(40)) {
        for (const traits of mixtures) {
          const genome = generateGenome({ seed, antenna: 'none', horns: 'none', ears: 'none', ...traits });
          for (const view of VIEWS) {
            const geo = geometry(genome, view, stage);
            for (const a of geo.appendages.filter((x) => x.part === 'antenna' || x.part === 'horn')) {
              const span = geo.body.spanAt(a.base.y)!;
              expect(span, `${seed} ${stage} ${view} ${nameOf(a)}`).not.toBeNull();
              expect(a.base.x).toBeGreaterThan(span.min);
              expect(a.base.x).toBeLessThan(span.max);
              const under = a.base.y - geo.body.topAt(a.base.x);
              expect(under).toBeGreaterThan(0);
              // It grows upward, away from its root.
              expect(a.tip.y).toBeLessThan(a.base.y);
              const rooted = a.prims.some((p) => p.part === 'antenna-root' || p.part === 'horn-root');
              // A root in view has a foot and is near the top of the head; a hidden one has none and still shows above it.
              expect(rooted).toBe(a.layer === 'crown');
              if (a.layer === 'crown' && view !== 'side') expect(under).toBeLessThan(70 * scale);
              if (a.layer === 'behind') expect(a.tip.y).toBeLessThan(geo.body.topAt(a.base.x));
            }
            expect(problemsIn(renderBlobbiSvg(genome, { stage, view }))).toEqual([]);
          }
        }
      }
    }
  });
});

// ─── The profile's anchor ────────────────────────────────────────────────────

describe('in profile a crown trait grows from the flank, not from the skyline', () => {
  /** Where the head's surface is at a place across the crown: read off the FRONT silhouette. */
  const acrossDrop = (genome: BlobbiGenome, stage: LifeStage, lat: number) => {
    const front = geometry(genome, 'front', stage);
    if (front.view !== 'front') throw new Error('expected the front view');
    return front.body.topAt(front.body.apex.x + lat * front.body.crownHalfWidth) - front.body.top;
  };
  const ROOT_DROP = 13;
  const antennaeOf = (genome: BlobbiGenome, stage: LifeStage, direction: Direction) => {
    const geo = geometry(genome, 'side', stage, direction);
    if (geo.view !== 'side') throw new Error('expected the profile');
    const all = geo.appendages.filter((a) => a.part === 'antenna');
    return { geo, near: all.find((a) => !a.far), far: all.find((a) => a.far) };
  };

  it('roots the near antenna as far below the ridge as the head has curved down across itself, and a root\'s depth more', () => {
    for (const stage of ['adult', 'baby'] as const) {
      const scale = planFor(stage).scale;
      let last = 0;
      for (const position of [-1, 0, 1]) {
        const genome = crowned({ antenna: 'double' }, { antenna: { position } });
        const lat = deriveMorphology(genome, stage).antennae[0].position;
        for (const direction of ['right', 'left'] as const) {
          const { geo, near, far } = antennaeOf(genome, stage, direction);
          // Facing right shows the flank on the viewer's left from the front, and the other way round.
          expect(near!.side).toBe(direction === 'right' ? -1 : 1);
          expect(far!.side).toBe(direction === 'right' ? 1 : -1);
          const underRidge = near!.base.y - geo.body.topAt(near!.base.x);
          const foot = underRidge - acrossDrop(genome, stage, lat) - (geo.view === 'side' ? 0 : 0);
          // The front and the profile do not share a top (the profile's crown is a little taller): allow for it.
          const taller = geometry(genome, 'front', stage).body.top - geo.body.top;
          expect(foot - taller).toBeGreaterThan(ROOT_DROP * scale * 0.6);
          expect(foot - taller).toBeLessThan(ROOT_DROP * scale * 1.15);
          expect(underRidge).toBeGreaterThan(stage === 'adult' ? 36 : 12);
          const span = geo.body.spanAt(near!.base.y)!;
          expect(near!.base.x).toBeGreaterThan(span.min);
          expect(near!.base.x).toBeLessThan(span.max);
          // The far one is rooted at the same height, behind the head, and still shows above it.
          expect(far!.layer).toBe('behind');
          expect(near!.layer).toBe('crown');
          expect(far!.base.y).toBeGreaterThan(geo.body.topAt(far!.base.x) + 10 * scale);
          expect(far!.tip.y).toBeLessThan(geo.body.topAt(far!.tip.x));
          if (direction === 'right') {
            // Further out across the crown is further down the head.
            expect(underRidge).toBeGreaterThan(last);
            last = underRidge;
          }
        }
      }
    }
    // The canonical adult: about a quarter of a head lower than the skyline it used to stand on.
    const { geo, near } = antennaeOf(crowned({ antenna: 'double' }), 'adult', 'right');
    expect(near!.base.y - geo.body.topAt(near!.base.x)).toBeGreaterThan(45);
  });

  it('keeps one on each flank for any individual, wherever the pair is set: near in view, far behind the head', () => {
    for (const seed of seeds(60)) {
      const genome = generateGenome({ seed, antenna: 'double', horns: 'none' });
      for (const stage of ['adult', 'baby'] as const) {
        for (const direction of ['right', 'left'] as const) {
          const { geo, near, far } = antennaeOf(genome, stage, direction);
          expect(near!.layer).toBe('crown');
          expect(far!.layer).toBe('behind');
          const order = paintOrder(renderBlobbiSvg(genome, { stage, view: 'side', direction }));
          expect(order.indexOf(nameOf(far!))).toBeLessThan(order.indexOf('body-base'));
          expect(order.indexOf(nameOf(near!))).toBeGreaterThan(order.indexOf('body-base'));
          // Below the ridge, on the flank.
          expect(near!.base.y - geo.body.topAt(near!.base.x)).toBeGreaterThan(ROOT_DROP * planFor(stage).scale);
        }
      }
    }
  });

  it('sets it back or forward along the head too: behind the tuft, among it, or ahead of it', () => {
    const at = (fore: number) => antennaeOf(crowned({ antenna: 'double' }, { antenna: { fore } }), 'adult', 'right').near!.base.x;
    expect(at(-1)).toBeLessThan(at(0) - 30);
    expect(at(1)).toBeGreaterThan(at(0) + 30);
  });

  it('is an anchor, not a shift: length, tilt and sweep move the tip and leave the root where it grows', () => {
    const rest = antennaeOf(crowned({ antenna: 'double' }), 'adult', 'right').near!;
    const tips = new Set<string>();
    for (const gene of ['length', 'tilt', 'sweep', 'curvature'] as const) {
      for (const value of [-1, 1]) {
        const genome = crowned({ antenna: 'double' }, { antenna: { [gene]: value } });
        const { geo, near, far } = antennaeOf(genome, 'adult', 'right');
        expect(near!.base.x).toBeCloseTo(rest.base.x, 6);
        expect(near!.base.y).toBeCloseTo(rest.base.y, 6);
        tips.add(`${near!.tip.x.toFixed(2)},${near!.tip.y.toFixed(2)}`);
        // Even the shortest still stands clear of the head, near and far.
        expect(near!.tip.y).toBeLessThan(geo.body.topAt(near!.tip.x) - 4);
        expect(far!.tip.y).toBeLessThan(geo.body.topAt(far!.tip.x) - 4);
        expect(problemsIn(renderBlobbiSvg(genome, { view: 'side' }))).toEqual([]);
      }
    }
    // Length, tilt and sweep each change where the tip is (curvature bows the stalk between the same ends).
    expect(tips.size).toBeGreaterThanOrEqual(6);
  });

  it('REGRESSION: the near horn is drawn on the flank below the ridge, the far one only above it (rendered pixels)', () => {
    const genome = crowned({ horns: 'top' });
    for (const direction of ['right', 'left'] as const) {
      const geo = geometry(genome, 'side', 'adult', direction);
      if (geo.view !== 'side') throw new Error('expected the profile');
      const near = geo.appendages.find((a) => a.part === 'horn' && !a.far)!;
      const far = geo.appendages.find((a) => a.part === 'horn' && a.far)!;
      const svg = renderBlobbiSvg(genome, { view: 'side', direction });
      // The geometry is built facing right; a left-facing drawing is that, mirrored.
      const mirror = (x: number) => (direction === 'left' ? (VIEWBOX.width - DOCUMENT_TRANSFORM.tx - (x * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx)) / DOCUMENT_TRANSFORM.scale : x);
      const colour = pixels(svg);
      const nearGone = pixels(svg.replace(groupOf('horn', 'crown'), ''));
      // 30 units under the silhouette's top line: honey, and it is the near horn that puts it there.
      const ridge = geo.body.topAt(near.pivot.x);
      expect(near.pivot.y - ridge).toBeGreaterThan(24);
      expect(isHorn(colour(mirror(near.pivot.x), ridge + 30))).toBe(true);
      expect(isPurple(nearGone(mirror(near.pivot.x), ridge + 30))).toBe(true);
      // The far horn's root is behind the head: nothing of it below the ridge, its tip above.
      expect(isHorn(nearGone(mirror(far.pivot.x), geo.body.topAt(far.pivot.x) + 12))).toBe(false);
      expect(far.tip.y).toBeLessThan(geo.body.topAt(far.tip.x));
    }
  });
});
