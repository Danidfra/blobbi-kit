/**
 * MORPHOLOGY: genes resolved to artwork units, for one life stage, inside
 * art-directed limits.
 *
 * This file is where "procedural" is kept from meaning "random". Every gene
 * maps linearly onto `base ± spread`, where `base` is the canonical Blobbi
 * and `spread` is how far an individual may drift from it. The spreads are
 * deliberately small (most are 5 to 10 percent): a hundred Blobbis should be
 * a hundred individuals of one species.
 *
 * It is also where a genome DEVELOPS. The same genes give a baby and an
 * adult: scale-type genes mean the same thing at both stages (a wide-bodied
 * baby grows into a wide-bodied adult), unit-type genes shrink with the
 * body, and each trait is multiplied by how developed it is at that stage,
 * so a baby's horns are buds and its antennae are short.
 *
 * `deriveMorphology` is pure and total: genes are clamped to [-1, 1] and
 * non-finite values read as canonical, so no input can leave the ranges.
 */
import {
  clampGene,
  MORPHOLOGY_GENES,
  type AntennaGeneName,
  type BlobbiGenome,
  type EarGeneName,
  type EarKind,
  type HornGeneName,
  type HornKind,
  type MorphologyGeneName,
  type TailGeneName,
  type TailKind,
} from './genome';
import { derivePalette, type BlobbiPalette } from './colors';
import { lerp } from './geometry';
import { ADULT_PLAN, planFor, type LifeStage } from './plan';
import { buildFrontBody, CANONICAL_PARAMS } from './silhouette';

export interface GeneRange {
  /** The canonical value (gene = 0). */
  base: number;
  /** The most an individual may differ from it (gene = ±1). */
  spread: number;
  /** `scale` multiplies a canonical dimension; `units` and `deg` are offsets. */
  unit: 'scale' | 'units' | 'deg';
  label: string;
}

export type MorphologyGroup = 'Body' | 'Face' | 'Limbs' | 'Tuft';

export const MORPHOLOGY_RANGES: Readonly<Record<MorphologyGeneName, GeneRange & { group: MorphologyGroup }>> = {
  bodyWidth: { base: 1, spread: 0.07, unit: 'scale', label: 'Body width', group: 'Body' },
  bodyHeight: { base: 1, spread: 0.05, unit: 'scale', label: 'Body height', group: 'Body' },
  topWidth: { base: 1, spread: 0.1, unit: 'scale', label: 'Top width', group: 'Body' },
  belly: { base: 1, spread: 0.08, unit: 'scale', label: 'Belly', group: 'Body' },
  roundness: { base: 1, spread: 0.14, unit: 'scale', label: 'Roundness', group: 'Body' },
  lean: { base: 0, spread: 6, unit: 'units', label: 'Crown lean', group: 'Body' },
  eyeSize: { base: 1, spread: 0.09, unit: 'scale', label: 'Eye size', group: 'Face' },
  eyeSpacing: { base: 1, spread: 0.08, unit: 'scale', label: 'Eye spacing', group: 'Face' },
  eyeHeight: { base: 0, spread: 12, unit: 'units', label: 'Eye height', group: 'Face' },
  eyeTilt: { base: 0, spread: 3, unit: 'units', label: 'Eye tilt', group: 'Face' },
  pupilSize: { base: 1, spread: 0.08, unit: 'scale', label: 'Pupil size', group: 'Face' },
  mouthWidth: { base: 1, spread: 0.12, unit: 'scale', label: 'Mouth width', group: 'Face' },
  mouthHeight: { base: 0, spread: 9, unit: 'units', label: 'Mouth height', group: 'Face' },
  mouthCurve: { base: 1, spread: 0.16, unit: 'scale', label: 'Mouth curve', group: 'Face' },
  browHeight: { base: 0, spread: 6, unit: 'units', label: 'Brow height', group: 'Face' },
  cheekSize: { base: 1, spread: 0.1, unit: 'scale', label: 'Cheek size', group: 'Face' },
  armSize: { base: 1, spread: 0.1, unit: 'scale', label: 'Arm size', group: 'Limbs' },
  armHeight: { base: 0, spread: 14, unit: 'units', label: 'Arm height', group: 'Limbs' },
  footSize: { base: 1, spread: 0.08, unit: 'scale', label: 'Foot size', group: 'Limbs' },
  footSpacing: { base: 1, spread: 0.07, unit: 'scale', label: 'Foot spacing', group: 'Limbs' },
  tuftSize: { base: 1, spread: 0.15, unit: 'scale', label: 'Tuft size', group: 'Tuft' },
  tuftTilt: { base: 0, spread: 8, unit: 'deg', label: 'Tuft lean', group: 'Tuft' },
  tuftSpread: { base: 0, spread: 12, unit: 'deg', label: 'Tuft spread', group: 'Tuft' },
  tuftLength: { base: 1, spread: 0.14, unit: 'scale', label: 'Tuft length', group: 'Tuft' },
};

/**
 * Antenna ranges, at adult size. `position` is a fraction of the crown's
 * half-width; `curvature` is the bend as a fraction of length; `tilt` is
 * degrees from vertical, away from the centre line; `sweep` leans it back.
 */
export const ANTENNA_RANGES: Readonly<Record<Exclude<AntennaGeneName, 'asymmetry'>, GeneRange>> = {
  position: { base: 0.56, spread: 0.14, unit: 'scale', label: 'Position' },
  length: { base: 74, spread: 18, unit: 'units', label: 'Length' },
  thickness: { base: 19, spread: 4, unit: 'units', label: 'Thickness' },
  curvature: { base: 0.1, spread: 0.26, unit: 'scale', label: 'Curvature' },
  tilt: { base: 15, spread: 11, unit: 'deg', label: 'Tilt' },
  sweep: { base: 8, spread: 12, unit: 'deg', label: 'Sweep' },
  tipSize: { base: 23, spread: 5, unit: 'units', label: 'Tip' },
  // Where on the crown it is rooted, from back (-) to front (+), as a fraction of the crown's half-depth.
  // With the tuft in the middle, this is what puts an antenna behind it or in front of it.
  fore: { base: -0.05, spread: 0.4, unit: 'scale', label: 'Set (back / forward)' },
};

/**
 * Horn ranges, at adult size. Short and plump on purpose; `roundness` keeps
 * the tip a dome. `curvature` is how far the tip turns from the root's
 * direction, in degrees, either way.
 */
export const HORN_RANGES: Readonly<Record<Exclude<HornGeneName, 'asymmetry'>, GeneRange>> = {
  length: { base: 70, spread: 14, unit: 'units', label: 'Length' },
  width: { base: 58, spread: 7, unit: 'units', label: 'Width' },
  // Signed: positive curls the tip up and in, negative out and down, zero is straight.
  curvature: { base: 0, spread: 50, unit: 'deg', label: 'Curl' },
  tilt: { base: 14, spread: 9, unit: 'deg', label: 'Tilt' },
  roundness: { base: 0.6, spread: 0.12, unit: 'scale', label: 'Roundness' },
  // Along its own anchor region: across the crown (top), down the flank (side), down the brow (forehead).
  position: { base: 0, spread: 1, unit: 'scale', label: 'Position' },
  // Top horns only: where on the crown they are rooted, from back (-) to front (+).
  fore: { base: 0.02, spread: 0.28, unit: 'scale', label: 'Set (back / forward)' },
};

export const EAR_RANGES: Readonly<Record<EarGeneName, GeneRange>> = {
  size: { base: 54, spread: 8, unit: 'units', label: 'Size' },
  tilt: { base: 36, spread: 10, unit: 'deg', label: 'Tilt' },
  flop: { base: 0.4, spread: 0.3, unit: 'scale', label: 'Flop' },
  // How far down the flank they sit, as a fraction of the body's height.
  position: { base: 0.115, spread: 0.03, unit: 'scale', label: 'Position (down the flank)' },
};

/**
 * Where the horns sit, as fractions of the crown and of the body's height,
 * and how far the position gene moves each kind along its own region.
 */
export const HORN_ANCHORS = { topLat: 0.46, topLatSpread: 0.07, sideHeight: 0.19, sideSpread: 0.035, foreheadHeight: 0.2, foreheadSpread: 0.03 } as const;
/** How far across the crown a top horn stands (crown half-widths). */
export const topHornLat = (position: number) => HORN_ANCHORS.topLat + position * HORN_ANCHORS.topLatSpread;
/**
 * Top horns and antennae on one crown: an antenna is rooted at least this
 * far BEHIND the horn beside it (crown half-depths) and this far OUTSIDE it
 * (crown half-widths), never in the same place.
 */
export const ANTENNA_BEHIND_HORN = 0.14;
export const ANTENNA_OUTSIDE_HORN = 0.15;

export const TAIL_RANGES: Readonly<Record<TailGeneName, GeneRange>> = {
  size: { base: 38, spread: 6, unit: 'units', label: 'Size' },
  length: { base: 78, spread: 14, unit: 'units', label: 'Length' },
  curvature: { base: 0.3, spread: 0.14, unit: 'scale', label: 'Curl' },
  lift: { base: 26, spread: 13, unit: 'deg', label: 'Lift' },
};

export interface AntennaMorphology {
  /** -1 grows on the viewer's left of the centre line (from the front), 1 on the right. */
  side: -1 | 1;
  position: number;
  /** Where on the crown it is rooted, from back (-) to front (+). */
  fore: number;
  length: number;
  thickness: number;
  curvature: number;
  tilt: number;
  sweep: number;
  tipRadius: number;
}

export interface HornMorphology {
  kind: Exclude<HornKind, 'none'>;
  length: number;
  width: number;
  /** Degrees the tip turns from the root's direction: positive up and in, negative out and down. */
  curvature: number;
  tilt: number;
  roundness: number;
  /** The horn on this side of a pair is the slightly longer, slightly more curled one. */
  asymmetrySide: -1 | 1;
  asymmetry: number;
  /** -1..1 along the kind's own anchor region. */
  position: number;
  /** Top horns: where on the crown they are rooted, from back (-) to front (+). */
  fore: number;
}

export interface EarMorphology {
  kind: Exclude<EarKind, 'none'>;
  size: number;
  tilt: number;
  flop: number;
  /** How far down the flank they sit, as a fraction of the body's height. */
  position: number;
}

export interface TailMorphology {
  kind: Exclude<TailKind, 'none'>;
  size: number;
  length: number;
  curvature: number;
  lift: number;
}

/** A flat mark on the body: where it is round the body and up it, and its shape. */
export interface MarkMorphology {
  /** Which flank: -1 the viewer's left from the front, 1 the right. */
  side: -1 | 1;
  /** Degrees round the body from the middle of the face (0..180). */
  theta: number;
  /** Height as a fraction of the body, from the crown. */
  yFraction: number;
  /** Small vertical offset in units, on top of the fraction. */
  dy: number;
  rx: number;
  ry: number;
  rotation: number;
}

export interface BellyMorphology {
  yFraction: number;
  rx: number;
  ry: number;
  opacity: number;
}

export interface FreckleMorphology {
  /** Offset from the cheek centre, toward the outside of the face for positive dx. */
  dx: number;
  dy: number;
  r: number;
}

export type BlobbiMorphology = Record<MorphologyGeneName, number> & {
  stage: LifeStage;
  antennae: AntennaMorphology[];
  horns: HornMorphology | null;
  ears: EarMorphology | null;
  tail: TailMorphology | null;
  spots: MarkMorphology[];
  bellyPatch: BellyMorphology | null;
  freckles: FreckleMorphology[];
  palette: BlobbiPalette;
};

const resolve = (range: Pick<GeneRange, 'base' | 'spread'>, gene: unknown) => range.base + clampGene(gene) * range.spread;

/**
 * The flank spots: the authored V2 side-pattern. `dx` is where the authored
 * front would show each mark (its out-of-view translate discounted); the
 * angle round the body is recovered from it on the canonical adult, on the
 * REAR of the flank, which is where the authored profile draws them.
 */
const CANONICAL_ADULT = buildFrontBody(ADULT_PLAN.front.body, CANONICAL_PARAMS);
const CANONICAL_SPOTS = [
  { dx: 180.34, yFraction: 0.32854, rx: 17, ry: 24, rotation: -18 },
  // The authored front and profile disagree about this one; it is set between them.
  { dx: 195, yFraction: 0.40306, rx: 21, ry: 27, rotation: 18 },
  { dx: 187.34, yFraction: 0.47125, rx: 14, ry: 20, rotation: -8 },
].map((spot) => {
  const y = CANONICAL_ADULT.top + spot.yFraction * CANONICAL_ADULT.height;
  const half = CANONICAL_ADULT.edgeAt(1, y) - CANONICAL_ADULT.axisX;
  return { ...spot, theta: 180 - (Math.asin(spot.dx / half) * 180) / Math.PI };
});

/** Three small dots across the cheek. */
const CANONICAL_FRECKLES = [
  { dx: 14, dy: -4, r: 3.6 },
  { dx: -2, dy: -10, r: 3.9 },
  { dx: -15, dy: 2, r: 3.4 },
] as const;

/** Resolve a genome to concrete, bounded artwork numbers for a life stage. Never mutates the genome. */
export function deriveMorphology(genome: BlobbiGenome, stage: LifeStage = 'adult'): BlobbiMorphology {
  const plan = planFor(stage);
  const { scale, development: dev } = plan;
  const out = { stage: plan.stage } as BlobbiMorphology;
  for (const name of MORPHOLOGY_GENES) {
    const range = MORPHOLOGY_RANGES[name];
    const value = resolve(range, genome.morphology?.[name]);
    // An offset in units is an offset on the adult; a smaller body takes less of it.
    out[name] = range.unit === 'units' ? value * scale : value;
  }
  const t = genome.traits;
  /** A length grows with the body and with the trait's development; a width keeps more of itself, so young traits are stubby. */
  const long = (value: number, d: number) => value * scale * d;
  const wide = (value: number, d: number) => value * scale * lerp(1, d, 0.45);

  // Antennae: a pair is one antenna mirrored, then nudged; never two unrelated shapes.
  out.antennae = [];
  if (t.antenna.count === 1 || t.antenna.count === 2) {
    const a = t.antenna;
    const first: AntennaMorphology = {
      side: a.side === -1 ? -1 : 1,
      position: resolve(ANTENNA_RANGES.position, a.position),
      fore: resolve(ANTENNA_RANGES.fore, a.fore),
      length: long(resolve(ANTENNA_RANGES.length, a.length), dev.antenna),
      thickness: wide(resolve(ANTENNA_RANGES.thickness, a.thickness), dev.antenna),
      curvature: resolve(ANTENNA_RANGES.curvature, a.curvature),
      tilt: resolve(ANTENNA_RANGES.tilt, a.tilt),
      sweep: resolve(ANTENNA_RANGES.sweep, a.sweep),
      tipRadius: wide(resolve(ANTENNA_RANGES.tipSize, a.tipSize), dev.antenna),
    };
    out.antennae.push(first);
    if (a.count === 2) {
      const asym = clampGene(a.asymmetry);
      out.antennae.push({
        ...first,
        side: first.side === 1 ? -1 : 1,
        length: first.length * (1 + 0.07 * asym),
        tilt: first.tilt + 3 * asym,
        curvature: first.curvature + 0.05 * asym,
      });
    }
  }

  out.horns = null;
  const hornKind = t.horns.kind;
  if (hornKind === 'forehead' || hornKind === 'top' || hornKind === 'side') {
    const h = t.horns;
    // The forehead horn is the smallest: it sits in the middle of the face.
    const k = hornKind === 'forehead' ? 0.86 : 1;
    out.horns = {
      kind: hornKind,
      length: long(resolve(HORN_RANGES.length, h.length) * k, dev.horn),
      width: wide(resolve(HORN_RANGES.width, h.width) * k, dev.horn),
      curvature: resolve(HORN_RANGES.curvature, h.curvature),
      tilt: resolve(HORN_RANGES.tilt, h.tilt),
      roundness: resolve(HORN_RANGES.roundness, h.roundness),
      asymmetrySide: 1,
      asymmetry: clampGene(h.asymmetry),
      position: resolve(HORN_RANGES.position, h.position),
      fore: resolve(HORN_RANGES.fore, h.fore),
    };
    // Horns take the forward, inner place on a crown: where both grow
    // there, the antennae are rooted behind and outside them. So, by anatomy
    // and not by drawing order, a horn is in front of the antenna beside it
    // from the front and behind it from the back, and in profile the antenna
    // stands on the flank outside the horn.
    if (hornKind === 'top') {
      const behind = out.horns.fore - ANTENNA_BEHIND_HORN;
      const outside = topHornLat(out.horns.position) + ANTENNA_OUTSIDE_HORN;
      out.antennae = out.antennae.map((a) => ({ ...a, fore: Math.min(a.fore, behind), position: Math.max(a.position, outside) }));
    }
  }

  out.ears = null;
  const earKind = t.ears.kind;
  if (earKind === 'round' || earKind === 'pointed') {
    const e = t.ears;
    out.ears = {
      kind: earKind,
      size: wide(resolve(EAR_RANGES.size, e.size), dev.ear) * lerp(1, dev.ear, 0.5),
      tilt: resolve(EAR_RANGES.tilt, e.tilt),
      flop: resolve(EAR_RANGES.flop, e.flop),
      position: resolve(EAR_RANGES.position, e.position),
    };
  }

  out.tail = null;
  const tailKind = t.tail.kind;
  // A stage where the tail has not developed has no tail at all.
  if (dev.tail > 0 && (tailKind === 'nub' || tailKind === 'curl' || tailKind === 'leaf')) {
    const tail = t.tail;
    out.tail = {
      kind: tailKind,
      size: wide(resolve(TAIL_RANGES.size, tail.size), dev.tail),
      length: long(resolve(TAIL_RANGES.length, tail.length), dev.tail),
      curvature: resolve(TAIL_RANGES.curvature, tail.curvature),
      lift: resolve(TAIL_RANGES.lift, tail.lift),
    };
  }

  const markScale = scale * dev.marking;
  out.spots = [];
  if (t.spots.enabled) {
    const sides: (-1 | 1)[] = t.spots.side === 'both' ? [1, -1] : t.spots.side === 'left' ? [-1] : [1];
    const count = t.spots.count === 2 ? 2 : 3;
    for (const side of sides) {
      for (let i = 0; i < count; i++) {
        const canon = CANONICAL_SPOTS[i];
        const gene = t.spots.marks[i] ?? { dx: 0, dy: 0, size: 0, rotation: 0 };
        const size = (1 + 0.12 * clampGene(gene.size)) * markScale;
        out.spots.push({
          side,
          // The sideways gene moves a spot round the flank by a few degrees.
          theta: canon.theta - 3.5 * clampGene(gene.dx),
          yFraction: canon.yFraction,
          dy: 7 * scale * clampGene(gene.dy),
          rx: canon.rx * size,
          ry: canon.ry * size,
          rotation: canon.rotation + 10 * clampGene(gene.rotation),
        });
      }
    }
  }

  out.bellyPatch = null;
  if (t.belly.enabled && dev.belly) {
    const size = 1 + 0.12 * clampGene(t.belly.size);
    out.bellyPatch = {
      yFraction: 0.7 + 0.03 * clampGene(t.belly.height),
      // Fractions of the canonical body at this stage, following the individual's girth.
      rx: plan.front.body.halfWidth * 0.56 * size * out.bodyWidth * out.belly,
      ry: (plan.front.body.baseY - plan.front.body.top) * 0.185 * size * out.bodyHeight,
      opacity: 0.3,
    };
  }

  out.freckles = [];
  if (t.freckles.enabled) {
    out.freckles = CANONICAL_FRECKLES.map((canon, i) => {
      const gene = t.freckles.dots[i] ?? { dx: 0, dy: 0, size: 0 };
      return {
        dx: (canon.dx + 2.5 * clampGene(gene.dx)) * lerp(1, scale, 0.6),
        dy: (canon.dy + 2.5 * clampGene(gene.dy)) * lerp(1, scale, 0.6),
        r: canon.r * (1 + 0.15 * clampGene(gene.size)) * lerp(1, scale, 0.5),
      };
    });
  }

  out.palette = derivePalette(genome.colors);
  return out;
}

/**
 * The same individual seen from BEHIND: everything that has a left and a
 * right swaps them. The back view is the front view drawn from this.
 */
export function mirrorMorphology(m: BlobbiMorphology): BlobbiMorphology {
  const flip = (side: -1 | 1): -1 | 1 => (side === 1 ? -1 : 1);
  return {
    ...m,
    lean: -m.lean,
    eyeTilt: -m.eyeTilt,
    tuftTilt: -m.tuftTilt,
    antennae: m.antennae.map((a) => ({ ...a, side: flip(a.side) })),
    horns: m.horns && { ...m.horns, asymmetrySide: flip(m.horns.asymmetrySide) },
    spots: m.spots.map((s) => ({ ...s, side: flip(s.side) })),
  };
}
