/**
 * The egg: the official Blobbi Egg at the canonical genome, a bounded shell
 * for everyone else, a few clues about the Blobbi inside, and nothing more.
 */
import { describe, expect, it } from 'vitest';
import { hexToOklch, distance } from './colors';
import { AUTHORED_EGG_PALETTE, EGG_BOX, EGG_CRACKS, EGG_RANGES, EGG_UNIT, MIN_SHELL_CHROMA, buildEggGeometry, deriveEgg, deriveEggPalette } from './egg';
import { EGG_GENES, canonicalGenome, generateGenome, type BlobbiGenome } from './genome';
import { motionPose } from './motion';
import { deriveMorphology } from './morphology';
import { DOCUMENT_TRANSFORM, generateBlobbi, renderBlobbiSvg, renderEggSvg } from './renderer';
import { attrOf, deepFreeze, problemsIn, seeds } from './test-helpers';

/** A root-unit coordinate, back in the official drawing's 100-unit box. */
const ex = (x: number) => (x - EGG_BOX.x) / EGG_UNIT;
const ey = (y: number) => (y - EGG_BOX.y) / EGG_UNIT;
const numbers = (d: string) => d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
const egg = (genome: BlobbiGenome, state = {}) => renderBlobbiSvg(genome, { stage: 'egg', ...state });
const count = (svg: string, part: string) => (svg.match(new RegExp(`data-part="${part}"`, 'g')) ?? []).length;

describe('the canonical egg is the official egg', () => {
  const svg = egg(canonicalGenome());

  it('has the official shell: `M 50 10 C 68 10 82 34 82 57 C 82 78 68 91 50 91 C 32 91 18 78 18 57 C 18 34 32 10 50 10 Z`', () => {
    const n = numbers(attrOf(svg, 'egg-shell', 'd')!);
    const official = [50, 10, 68, 10, 82, 34, 82, 57, 82, 78, 68, 91, 50, 91, 32, 91, 18, 78, 18, 57, 18, 34, 32, 10, 50, 10];
    expect(n).toHaveLength(official.length);
    n.forEach((v, i) => expect(i % 2 === 0 ? ex(v) : ey(v)).toBeCloseTo(official[i], 3));
  });

  it('has the four official spots, the highlight and the shade, where the artwork has them', () => {
    const spots = [...svg.matchAll(/<ellipse cx="([^"]+)" cy="([^"]+)" rx="([^"]+)" ry="([^"]+)"[^>]*data-part="egg-spot"/g)].map((m) => m.slice(1, 5).map(Number));
    expect(spots.map(([cx, cy, rx, ry]) => [ex(cx), ey(cy), rx / EGG_UNIT, ry / EGG_UNIT].map((v) => Math.round(v * 100) / 100))).toEqual([
      [38, 40, 5, 6],
      [62, 54, 4.5, 5.5],
      [45, 72, 4, 4.8],
      [60, 27, 2.6, 3.2],
    ]);
    expect([ex(Number(attrOf(svg, 'egg-highlight', 'cx'))), ey(Number(attrOf(svg, 'egg-highlight', 'cy')))].map((v) => Math.round(v * 100) / 100)).toEqual([38, 30]);
    expect(attrOf(svg, 'egg-highlight', 'opacity')).toBe('0.38');
    const shade = numbers(attrOf(svg, 'egg-shade', 'd')!);
    expect([ex(shade[0]), ey(shade[1])].map((v) => Math.round(v * 100) / 100)).toEqual([66, 24]);
    expect(attrOf(svg, 'egg-shade', 'opacity')).toBe('0.07');
  });

  it("is painted with the official drawing's own colours", () => {
    for (const color of ['#fff8ec', '#f3e1c3', '#d6b487', '#c9a7ea', '#a67cd0']) expect(svg).toContain(color);
    expect(deriveEgg(canonicalGenome()).palette).toEqual(AUTHORED_EGG_PALETTE);
    expect(deriveEggPalette({}, false)).toEqual(AUTHORED_EGG_PALETTE);
  });

  it('cracks as the official egg does: three cumulative groups', () => {
    const strokes = EGG_CRACKS.map((eggCrack) => (egg(canonicalGenome(), { eggCrack }).match(/<path d="M [^"]*" stroke-width/g) ?? []).length);
    expect(strokes).toEqual([0, 1, 3, 8]);
    const light = egg(canonicalGenome(), { eggCrack: 'light' });
    // `M 30 50 L 36 47 L 41 52 L 47 48`, stroke `#1f2937` at 1.6.
    const first = numbers(/<g data-part="egg-cracks"[^>]*><path d="([^"]+)"/.exec(light)![1]);
    expect(first.map((v, i) => Math.round((i % 2 === 0 ? ex(v) : ey(v)) * 100) / 100)).toEqual([30, 50, 36, 47, 41, 52, 47, 48]);
    expect(light).toContain('stroke="#1f2937"');
    expect(egg(canonicalGenome(), { eggCrack: 'shattered' as never })).toBe(svg);
    // A crack level changes the cracks and nothing else.
    const strip = (s: string) => s.replace(/<g data-part="egg-cracks".*?<\/g>/, '').replace(/ data-blobbi-egg-crack="[^"]*"/, '');
    expect(strip(egg(canonicalGenome(), { eggCrack: 'heavy' }))).toBe(strip(svg));
  });

  it('is a shell and nothing else: no face, no limbs, no traits, one drawing for every view', () => {
    expect([...new Set([...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]))]).toEqual(['character', 'egg-shell', 'egg-spots', 'egg-spot', 'egg-highlight', 'egg-shade']);
    for (const state of [{ view: 'side', direction: 'left' }, { view: 'back' }, { expression: { happy: 1 } }, { gaze: { x: 1, y: 1 } }, { sleeping: true }] as const) {
      expect(egg(canonicalGenome(), state)).toBe(svg);
    }
  });

  it('can be framed in its own square, and rests on the shared ground line', () => {
    const square = renderEggSvg(canonicalGenome(), {}, { frame: 'stage' });
    const [, , w, h] = /viewBox="([^"]+)"/.exec(square)![1].split(' ').map(Number);
    expect(w).toBeCloseTo(h, 6);
    expect(w).toBeCloseTo(100 * EGG_UNIT * DOCUMENT_TRANSFORM.scale, 3);
    const geo = buildEggGeometry(deriveEgg(canonicalGenome()));
    const adult = deriveMorphology(canonicalGenome());
    expect(adult.stage).toBe('adult');
    // The shell's base is where the adult's soles are.
    expect(geo.bounds.bottom).toBeCloseTo(801, 6);
    expect(geo.ground.y).toBe(801);
  });
});

describe('every Blobbi has one egg', () => {
  it('is deterministic: the same seed is always the same egg', () => {
    for (const seed of seeds(60)) {
      const first = egg(generateGenome(seed));
      for (const other of seeds(3, `${seed}-x`)) egg(generateGenome(other));
      expect(egg(generateGenome(seed))).toBe(first);
      expect(deriveEgg(generateGenome(seed))).toEqual(deriveEgg(generateGenome(seed)));
      expect(generateBlobbi({ seed, state: { stage: 'egg' } }).svg).toBe(first);
    }
    const one = generateBlobbi({ seed: 'abc123', state: { stage: 'egg' } });
    expect(one.morphology).toBeNull();
    expect(one.egg).toEqual(deriveEgg(one.genome));
  });

  it('differs between individuals', () => {
    const eggs = new Set(seeds(200).map((seed) => egg(generateGenome(seed))));
    expect(eggs.size).toBe(200);
  });

  it('never mutates the genome', () => {
    const genome = deepFreeze(generateGenome({ seed: 'frozen-egg', pattern: 'spotted', freckles: true, belly: true }));
    expect(() => egg(genome, { eggCrack: 'heavy', motion: 'idle', phase: 0.3 })).not.toThrow();
  });

  it('keeps the shell inside its bounds, close to the official one', () => {
    for (const seed of seeds(500)) {
      const e = deriveEgg(generateGenome(seed));
      for (const gene of EGG_GENES) {
        const { base, spread } = EGG_RANGES[gene];
        expect(e[gene]).toBeGreaterThanOrEqual(base - spread - 1e-9);
        expect(e[gene]).toBeLessThanOrEqual(base + spread + 1e-9);
      }
      expect(e.spots.length).toBeGreaterThanOrEqual(3);
      expect(e.spots.length).toBeLessThanOrEqual(6);
      for (const spot of e.spots) {
        expect(spot.rx).toBeGreaterThan(2);
        expect(spot.rx).toBeLessThan(7);
        // Well inside the 100-unit box, on the shell.
        expect(spot.cx).toBeGreaterThan(22);
        expect(spot.cx).toBeLessThan(78);
        expect(spot.cy).toBeGreaterThan(20);
        expect(spot.cy).toBeLessThan(84);
      }
      const geo = buildEggGeometry(e, 'heavy');
      expect(geo.bounds.bottom).toBeCloseTo(801, 6);
      expect(geo.bounds.right - geo.bounds.left).toBeGreaterThan(64 * EGG_UNIT * 0.94);
      expect(geo.bounds.right - geo.bounds.left).toBeLessThan(64 * EGG_UNIT * 1.06);
      expect(geo.bounds.left).toBeGreaterThan(EGG_BOX.x);
      expect(geo.bounds.top).toBeGreaterThan(EGG_BOX.y);
    }
    // No shell dimension strays more than a twentieth from the official egg.
    expect(EGG_RANGES.width.spread).toBeLessThanOrEqual(0.05);
    expect(EGG_RANGES.height.spread).toBeLessThanOrEqual(0.05);
  });

  it('is sound markup for every seed, crack level and motion, and clamps wild genes', () => {
    const problems: string[] = [];
    for (const seed of seeds(300)) {
      const genome = generateGenome({ seed, pattern: seed.endsWith('1') ? 'spotted' : undefined, freckles: seed.endsWith('2') ? true : undefined, belly: seed.endsWith('3') ? true : undefined });
      for (const eggCrack of EGG_CRACKS) {
        for (const motion of [{}, { motion: 'idle', phase: 0.3 }, { motion: 'walking' }] as const) {
          for (const problem of problemsIn(renderBlobbiSvg(genome, { stage: 'egg', eggCrack, ...motion }, { groundShadow: true }))) problems.push(`${seed}: ${problem}`);
        }
      }
    }
    expect(problems).toEqual([]);
    for (const value of [50, -50, Number.NaN, Infinity]) {
      const wild = generateGenome({ seed: 'wild-egg', pattern: 'spotted', freckles: true, belly: true });
      for (const gene of EGG_GENES) wild.egg[gene] = value;
      for (const spot of wild.egg.spots) Object.assign(spot, { dx: value, dy: value, size: value, rotation: value });
      for (const speckle of wild.egg.speckles) Object.assign(speckle, { u: value, v: value, size: value });
      expect(problemsIn(egg(wild, { eggCrack: 'heavy' }))).toEqual([]);
    }
    const big = generateGenome('clamp');
    for (const gene of EGG_GENES) big.egg[gene] = 50;
    const one = generateGenome('clamp');
    for (const gene of EGG_GENES) one.egg[gene] = 1;
    expect(egg(big)).toBe(egg(one));
  });
});

describe('the egg gives clues, not answers', () => {
  const plain = { antenna: 'none', horns: 'none', ears: 'none', tail: 'none', pattern: 'solid', mark: 'none', freckles: false, belly: false } as const;

  it('hides horns, ears, tail, antennae, the tuft and every proportion of the Blobbi inside', () => {
    for (const seed of seeds(40)) {
      const base = generateGenome({ seed, ...plain });
      const hidden = generateGenome({ seed, ...plain, antenna: 'double', horns: 'top', ears: 'round', tail: 'curl' });
      for (const key of Object.keys(hidden.morphology) as (keyof typeof hidden.morphology)[]) hidden.morphology[key] = -hidden.morphology[key];
      for (const key of ['length', 'curvature', 'tilt'] as const) hidden.traits.horns[key] = 1;
      expect(egg(hidden)).toBe(egg(base));
      // The baby and the adult are, of course, different.
      expect(renderBlobbiSvg(hidden)).not.toBe(renderBlobbiSvg(base));
    }
  });

  it('shows a spotted Blobbi as a more spotted egg, in its marking colour', () => {
    for (const seed of seeds(40)) {
      const base = deriveEgg(generateGenome({ seed, ...plain }));
      const spotted = generateGenome({ seed, ...plain, pattern: 'spotted' });
      const e = deriveEgg(spotted);
      expect(base.spots.length).toBeLessThanOrEqual(4);
      expect(e.spots.length).toBe(spotted.traits.pattern.spots.side === 'both' ? 6 : 5);
      expect(e.spots[0].rx).toBeGreaterThan(base.spots[0].rx);
      expect(e.palette.spotDark).not.toBe(base.palette.spotDark);
      // The shell itself does not change.
      expect(e.palette.shellMid).toBe(base.palette.shellMid);
    }
  });

  it('turns freckles into speckles, a belly patch into a pale patch, and an accent into one small spot', () => {
    for (const seed of seeds(40)) {
      const base = egg(generateGenome({ seed, ...plain }));
      expect(count(base, 'egg-speckle')).toBe(0);
      expect(count(base, 'egg-patch')).toBe(0);
      expect(count(egg(generateGenome({ seed, ...plain, freckles: true })), 'egg-speckle')).toBe(14);
      expect(count(egg(generateGenome({ seed, ...plain, belly: true })), 'egg-patch')).toBe(1);
      const genome = generateGenome({ seed, ...plain });
      expect(count(base, 'egg-accent-spot')).toBe(genome.colors.accent ? 1 : 0);
    }
    // The accent is used once, on the smallest of the authored spots.
    const accented = generateGenome({ seed: 'accent', ...plain, colors: { base: '#3fb6a8', secondary: '#1f6f8f', eye: '#3a2412', accent: '#f08a3c' } });
    const e = deriveEgg(accented);
    expect(e.spots.filter((s) => s.accent)).toHaveLength(1);
    expect(e.spots.find((s) => s.accent)!.rx).toBe(Math.min(...e.spots.map((s) => s.rx)));
    expect(hexToOklch(e.palette.accentLight!).h).toBeCloseTo(hexToOklch('#f08a3c').h, -1);
  });

  it('never changes the Blobbi: an egg reads the genome and writes nothing', () => {
    for (const seed of seeds(40)) {
      const genome = generateGenome(seed);
      const before = [renderBlobbiSvg(genome, { stage: 'baby' }), renderBlobbiSvg(genome)];
      const altered = { ...genome, egg: { ...genome.egg, width: -genome.egg.width, height: 1, taper: -1, lean: 1, spotCount: genome.egg.spotCount === 3 ? 4 : 3 } as typeof genome.egg };
      expect(egg(altered)).not.toBe(egg(genome));
      // A different shell around the same Blobbi.
      expect([renderBlobbiSvg(altered, { stage: 'baby' }), renderBlobbiSvg(altered)]).toEqual(before);
    }
  });
});

describe('egg colours', () => {
  const population = seeds(2000, 'egg-palette').map((seed) => {
    const genome = generateGenome(seed);
    return { genome, body: deriveMorphology(genome).palette, shell: deriveEgg(genome).palette };
  });

  it('are valid, and always an eggshell: pale, lightly tinted, never grey and never the body colour', () => {
    for (const { shell, body } of population) {
      for (const hex of [shell.shellLight, shell.shellMid, shell.shellDark, shell.spotLight, shell.spotDark, shell.speckle, shell.crack]) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      const mid = hexToOklch(shell.shellMid);
      expect(mid.l).toBeGreaterThan(0.86);
      expect(mid.c).toBeLessThan(0.075);
      expect(mid.c).toBeGreaterThan(MIN_SHELL_CHROMA - 0.004);
      expect(hexToOklch(shell.shellLight).l).toBeGreaterThan(mid.l);
      expect(hexToOklch(shell.shellDark).l).toBeLessThan(mid.l - 0.05);
      // Paler than the Blobbi that will hatch from it, however light that is.
      expect(mid.l).toBeGreaterThan(hexToOklch(body.bodyMid).l + 0.02);
      expect(distance(shell.shellMid, body.bodyMid)).toBeGreaterThan(0.08);
    }
  });

  it('keep the spots readable on the shell', () => {
    const worst = Math.min(...population.map(({ shell }) => distance(shell.spotDark, shell.shellMid)));
    expect(worst).toBeGreaterThan(0.12);
  });

  it('carry the family resemblance: the spots are a pastel of the body, in its hue', () => {
    const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    for (const { genome, body, shell } of population) {
      const spot = hexToOklch(shell.spotLight);
      const bodyTone = hexToOklch(body.bodyMid);
      // Within the analogous range of the body's hue (markings are neighbours of it).
      expect(hueGap(spot.h, bodyTone.h)).toBeLessThan(genome.traits.pattern.kind === 'spotted' ? 48 : 30);
      // The accent spot, when there is one, is the Blobbi's own accent hue.
      if (shell.accentLight && genome.colors.accent) expect(hueGap(hexToOklch(shell.accentLight).h, hexToOklch(genome.colors.accent).h)).toBeLessThan(12);
      expect(shell.accentLight === null).toBe(!genome.colors.accent);
    }
    // Different bodies, different shells: the tint is there to be seen. (Shells
    // are pale, so many bodies share one of a few hundred eggshell tints.)
    const shells = new Set(population.map((p) => p.shell.shellMid));
    expect(shells.size).toBeGreaterThan(250);
    const hues = new Set(population.map((p) => Math.floor(hexToOklch(p.shell.shellMid).h / 30)));
    expect(hues.size).toBeGreaterThanOrEqual(8);
  });

  it("keep the kit's own egg rule available", () => {
    const kit = deriveEggPalette({ base: '#3fb6a8', secondary: '#1f6f8f', mapping: 'kit' }, false);
    expect([kit.shellLight, kit.shellMid, kit.shellDark]).toEqual(['#b2ffff', '#77eee0', '#3fb6a8']);
    expect([kit.spotLight, kit.spotDark, kit.spotInner]).toEqual(['#3e8eae', '#1f6f8f', 0.95]);
    expect(deriveEggPalette({ base: '#3fb6a8', mapping: 'kit' }, false).spotInner).toBe(0.55);
  });
});

describe('an egg rests', () => {
  it('rocks on its base and never travels, whatever motion it is asked for', () => {
    for (let i = 0; i <= 32; i++) {
      for (const motion of ['idle', 'walking'] as const) {
        const pose = motionPose(motion, 'front', 'body', i / 32, 1, 'rest');
        expect(pose.tx).toBe(0);
        expect(Math.abs(pose.rot)).toBeLessThan(3.5);
        expect(pose.ty).toBeLessThanOrEqual(1e-9);
        expect(motionPose(motion, 'front', 'left-leg', i / 32, 1, 'rest').ty).toBe(0);
      }
    }
    const baked = egg(canonicalGenome(), { motion: 'idle', phase: 0.25 });
    expect(baked).toMatch(/data-part="character" data-rig="body" transform="rotate\(/);
    expect(baked).not.toContain('data-blobbi-rig-motion');
    const live = egg(canonicalGenome(), { motion: 'idle' });
    expect(live).toContain('data-blobbi-rig-motion="idle"');
    expect(live).toContain('data-blobbi-gait="rest"');
    // The drawing itself is untouched by motion.
    const strip = (s: string) => s.replace(/(data-rig="body") transform="rotate[^"]*"/, '$1').replace(/(data-rig="body") style="[^"]*"/, '$1').replace(/ data-blobbi-rig-motion="[^"]*"/, '');
    expect(strip(baked)).toBe(strip(egg(canonicalGenome())));
    expect(strip(live)).toBe(strip(egg(canonicalGenome())));
  });
});
