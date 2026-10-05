/**
 * THE GENOME: what a Blobbi physically is. Permanent, serializable, unitless.
 *
 * ```
 *   seed ──► genome ──► morphology ──► geometry ──► SVG
 *            (genes)    (artwork units,   (paths, per
 *                        per life stage)   view)
 *               └─────► egg appearance ──► egg
 * ```
 *
 * A gene is a number in [-1, 1] where 0 IS THE CANONICAL BLOBBI. The genome
 * knows nothing about pixels, paths, ranges, life stages or views:
 * `morphology.ts` owns how a gene shows at each stage, and the view builders
 * own how it shows from each side. One genome, every drawing.
 *
 * Two layers of identity, kept apart on purpose (see README, "Identity"):
 *
 *  - SEMANTIC identity is what an event would state explicitly: the colours,
 *    which kind of horns, whether there is a tail. It can be passed in
 *    (`GenerateGenomeInput`); the seed only supplies it when nothing is passed.
 *  - MICRO-GEOMETRY is always derived from the seed: exact horn curvature,
 *    eye spacing, spot positions. Trait genes are generated even when the
 *    trait is off, so switching a trait on reveals THIS individual's horns.
 *
 * Everything here is a pure function of its input. No clock, no
 * `Math.random()`, no call-order dependence: each gene has its own keyed
 * stream, so the genes added in this phase (horns, ears, tail, …) left every
 * earlier gene of every seed exactly as it was. `vectors.test.ts` pins that.
 */
import { geneRng } from './rng';
import { generateColors, sanitizeHex, type BlobbiColors, type ColorScheme } from './colors';
import { PROCEDURAL_ALGORITHM_VERSION } from './version';

/** The algorithm version a genome was derived under (see `version.ts`). */
export const GENOME_VERSION = PROCEDURAL_ALGORITHM_VERSION;

/** The continuous shape genes. Order is presentation order, not derivation order. */
export const MORPHOLOGY_GENES = [
  'bodyWidth',
  'bodyHeight',
  'topWidth',
  'belly',
  'roundness',
  'lean',
  'eyeSize',
  'eyeSpacing',
  'eyeHeight',
  'eyeTilt',
  'pupilSize',
  'mouthWidth',
  'mouthHeight',
  'mouthCurve',
  'browHeight',
  'cheekSize',
  'armSize',
  'armHeight',
  'footSize',
  'footSpacing',
  'tuftSize',
  'tuftTilt',
  'tuftSpread',
  'tuftLength',
] as const;

export type MorphologyGeneName = (typeof MORPHOLOGY_GENES)[number];
export type MorphologyGenes = Record<MorphologyGeneName, number>;

export type AntennaCount = 0 | 1 | 2;

export interface AntennaGenes {
  /** Semantic: how many antennae. */
  count: AntennaCount;
  /** Which side a single antenna grows on (-1 viewer's left from the front, 1 right). */
  side: -1 | 1;
  // Micro-geometry, each in [-1, 1].
  position: number;
  length: number;
  thickness: number;
  curvature: number;
  tilt: number;
  /** Backward lean, which only the profile shows. */
  sweep: number;
  tipSize: number;
  /** How much the second antenna of a pair differs from the first. */
  asymmetry: number;
  /** Where on the crown it is rooted, from back to front: behind the tuft or in front of it. */
  fore: number;
}

export const ANTENNA_GENES = ['position', 'length', 'thickness', 'curvature', 'tilt', 'sweep', 'tipSize', 'asymmetry', 'fore'] as const;
export type AntennaGeneName = (typeof ANTENNA_GENES)[number];

export const HORN_KINDS = ['none', 'forehead', 'top', 'side'] as const;
export type HornKind = (typeof HORN_KINDS)[number];
export const HORN_GENES = ['length', 'width', 'curvature', 'tilt', 'roundness', 'asymmetry', 'position', 'fore'] as const;
export type HornGeneName = (typeof HORN_GENES)[number];
export type HornGenes = { kind: HornKind } & Record<HornGeneName, number>;

export const EAR_KINDS = ['none', 'round', 'pointed'] as const;
export type EarKind = (typeof EAR_KINDS)[number];
export const EAR_GENES = ['size', 'tilt', 'flop', 'position'] as const;
export type EarGeneName = (typeof EAR_GENES)[number];
export type EarGenes = { kind: EarKind } & Record<EarGeneName, number>;

export const TAIL_KINDS = ['none', 'nub', 'curl', 'leaf'] as const;
export type TailKind = (typeof TAIL_KINDS)[number];
export const TAIL_GENES = ['size', 'length', 'curvature', 'lift'] as const;
export type TailGeneName = (typeof TAIL_GENES)[number];
export type TailGenes = { kind: TailKind } & Record<TailGeneName, number>;

export interface SpotGene {
  dx: number;
  dy: number;
  size: number;
  rotation: number;
}

export type MarkingSide = 'left' | 'right' | 'both';

export interface SpotsGenes {
  /** Semantic: whether the flank spots are present. */
  enabled: boolean;
  side: MarkingSide;
  count: 2 | 3;
  marks: SpotGene[];
}

export interface BellyGenes {
  /** Semantic: whether there is a lighter belly patch. */
  enabled: boolean;
  size: number;
  height: number;
}

export interface FreckleGene {
  dx: number;
  dy: number;
  size: number;
}

export interface FrecklesGenes {
  /** Semantic: whether the cheek freckles are present. */
  enabled: boolean;
  dots: FreckleGene[];
}

/** The continuous shell genes. */
export const EGG_GENES = ['width', 'height', 'taper', 'lean', 'highlight'] as const;
export type EggGeneName = (typeof EGG_GENES)[number];

/**
 * The egg's own genes: the shell this individual incubates in. They are
 * drawn from streams of their own (`egg.*`), so the shell varies without
 * touching a single gene of the Blobbi inside it.
 */
export type EggGenes = Record<EggGeneName, number> & {
  /** How many of the shell's large spots a plain egg carries. */
  spotCount: 3 | 4;
  /** Per-spot nudges, each in [-1, 1]; six slots, of which an egg uses three to six. */
  spots: { dx: number; dy: number; size: number; rotation: number }[];
  /** Where fine speckles fall when the egg has them: uniform draws in [0, 1). */
  speckles: { u: number; v: number; size: number }[];
};

export interface BlobbiTraits {
  antenna: AntennaGenes;
  horns: HornGenes;
  ears: EarGenes;
  tail: TailGenes;
  spots: SpotsGenes;
  belly: BellyGenes;
  freckles: FrecklesGenes;
}

export interface BlobbiGenome {
  version: typeof GENOME_VERSION;
  seed: string;
  /** Absent colours mean the artwork's own (the canonical purple). */
  colors: BlobbiColors;
  /** The relationship the seed's colours were chosen with; informational. */
  scheme?: ColorScheme;
  morphology: MorphologyGenes;
  traits: BlobbiTraits;
  egg: EggGenes;
}

/** The explicit, semantic part of an identity: what an event would carry next to the seed. */
export interface BlobbiSemanticIdentity {
  /** `'authored'` keeps the artwork's own colours; an object states them. */
  colors?: BlobbiColors | 'authored';
  antenna?: 'none' | 'single' | 'double';
  horns?: HornKind;
  ears?: EarKind;
  tail?: TailKind;
  spots?: boolean;
  belly?: boolean;
  freckles?: boolean;
}

export interface GenerateGenomeInput extends BlobbiSemanticIdentity {
  seed: string;
}

const SPOT_SLOTS = 3;
const FRECKLE_SLOTS = 3;
const EGG_SPOT_SLOTS = 6;
const EGG_SPECKLE_SLOTS = 14;

const ANTENNA_COUNT: Record<NonNullable<BlobbiSemanticIdentity['antenna']>, AntennaCount> = {
  none: 0,
  single: 1,
  double: 2,
};

function resolveColors(seed: string, colors: BlobbiSemanticIdentity['colors']): { colors: BlobbiColors; scheme?: ColorScheme } {
  if (colors === 'authored') return { colors: {} };
  if (colors && typeof colors === 'object') {
    const out: BlobbiColors = {};
    for (const role of ['base', 'secondary', 'eye', 'accent'] as const) {
      const hex = sanitizeHex(colors[role]);
      if (hex) out[role] = hex;
    }
    if (colors.mapping === 'kit') out.mapping = 'kit';
    return { colors: out };
  }
  const { scheme, ...generated } = generateColors(seed);
  return { colors: generated, scheme };
}

const pickKind = <T extends string>(kinds: readonly T[], value: unknown, fallback: T): T =>
  kinds.includes(value as T) ? (value as T) : fallback;

/**
 * Derive a complete genome from a seed (and, optionally, explicit semantic
 * identity). The same input always returns a deeply equal genome.
 */
export function generateGenome(input: string | GenerateGenomeInput): BlobbiGenome {
  const { seed, ...semantic }: GenerateGenomeInput = typeof input === 'string' ? { seed: input } : input;
  const gene = (key: string) => geneRng(seed, key).centered();
  const roll = (key: string) => geneRng(seed, key).next();
  const genesFor = <N extends string>(group: string, names: readonly N[]) =>
    Object.fromEntries(names.map((name) => [name, gene(`${group}.${name}`)])) as Record<N, number>;

  const morphology = genesFor('morphology', MORPHOLOGY_GENES);

  const antennaKind = roll('antenna.kind');
  const antenna: AntennaGenes = {
    count: semantic.antenna ? ANTENNA_COUNT[semantic.antenna] ?? 0 : antennaKind < 0.55 ? 0 : antennaKind < 0.85 ? 1 : 2,
    side: geneRng(seed, 'antenna.side').chance(0.5) ? 1 : -1,
    ...genesFor('antenna', ANTENNA_GENES),
  };

  // The seed's own choice of each trait, before the head is checked for crowding.
  const hornRoll = roll('horns.kind');
  const earRoll = roll('ears.kind');
  const tailRoll = roll('tail.kind');
  let hornKind: HornKind = hornRoll < 0.8 ? 'none' : hornRoll < 0.88 ? 'forehead' : hornRoll < 0.94 ? 'top' : 'side';
  let earKind: EarKind = earRoll < 0.86 ? 'none' : earRoll < 0.95 ? 'round' : 'pointed';
  const tailKind: TailKind = tailRoll < 0.5 ? 'none' : tailRoll < 0.72 ? 'nub' : tailRoll < 0.88 ? 'curl' : 'leaf';
  // A Blobbi's head is small. What the seed alone would give is thinned so the
  // crown never carries everything at once: horns take the place of ears, and
  // crown horns move to the flanks when an antenna already stands there.
  // Explicitly stated traits are never overridden.
  if (hornKind !== 'none') earKind = 'none';
  if (hornKind === 'top' && antenna.count > 0) hornKind = 'side';

  const horns: HornGenes = { kind: pickKind(HORN_KINDS, semantic.horns, hornKind), ...genesFor('horns', HORN_GENES) };
  const ears: EarGenes = { kind: pickKind(EAR_KINDS, semantic.ears, earKind), ...genesFor('ears', EAR_GENES) };
  const tail: TailGenes = { kind: pickKind(TAIL_KINDS, semantic.tail, tailKind), ...genesFor('tail', TAIL_GENES) };

  const spotSide = roll('spots.side');
  const spots: SpotsGenes = {
    enabled: semantic.spots ?? geneRng(seed, 'spots.enabled').chance(0.3),
    side: spotSide < 0.45 ? 'right' : spotSide < 0.8 ? 'left' : 'both',
    count: geneRng(seed, 'spots.count').chance(0.7) ? 3 : 2,
    marks: Array.from({ length: SPOT_SLOTS }, (_, i) => ({
      dx: gene(`spots.${i}.dx`),
      dy: gene(`spots.${i}.dy`),
      size: gene(`spots.${i}.size`),
      rotation: gene(`spots.${i}.rotation`),
    })),
  };

  const belly: BellyGenes = {
    enabled: semantic.belly ?? geneRng(seed, 'belly.enabled').chance(0.25),
    size: gene('belly.size'),
    height: gene('belly.height'),
  };

  const freckles: FrecklesGenes = {
    enabled: semantic.freckles ?? geneRng(seed, 'freckles.enabled').chance(0.22),
    dots: Array.from({ length: FRECKLE_SLOTS }, (_, i) => ({
      dx: gene(`freckles.${i}.dx`),
      dy: gene(`freckles.${i}.dy`),
      size: gene(`freckles.${i}.size`),
    })),
  };

  const egg: EggGenes = {
    ...genesFor('egg', EGG_GENES),
    spotCount: geneRng(seed, 'egg.spotCount').chance(0.6) ? 4 : 3,
    spots: Array.from({ length: EGG_SPOT_SLOTS }, (_, i) => ({
      dx: gene(`egg.spots.${i}.dx`),
      dy: gene(`egg.spots.${i}.dy`),
      size: gene(`egg.spots.${i}.size`),
      rotation: gene(`egg.spots.${i}.rotation`),
    })),
    speckles: Array.from({ length: EGG_SPECKLE_SLOTS }, (_, i) => ({
      u: roll(`egg.speckles.${i}.u`),
      v: roll(`egg.speckles.${i}.v`),
      size: roll(`egg.speckles.${i}.size`),
    })),
  };

  const { colors, scheme } = resolveColors(seed, semantic.colors);
  const genome: BlobbiGenome = {
    version: GENOME_VERSION,
    seed,
    colors,
    morphology,
    traits: { antenna, horns, ears, tail, spots, belly, freckles },
    egg,
  };
  if (scheme) genome.scheme = scheme;
  return genome;
}

const zeros = <N extends string>(names: readonly N[]) => Object.fromEntries(names.map((name) => [name, 0])) as Record<N, number>;

/**
 * The canonical Blobbi as a genome: every gene 0, no optional trait, the
 * artwork's own colours. This is the individual the procedural renderer is
 * tuned against the current Adult V2 drawing with.
 */
export function canonicalGenome(): BlobbiGenome {
  return {
    version: GENOME_VERSION,
    seed: 'canonical',
    colors: {},
    morphology: zeros(MORPHOLOGY_GENES),
    traits: {
      antenna: { count: 0, side: 1, ...zeros(ANTENNA_GENES) },
      horns: { kind: 'none', ...zeros(HORN_GENES) },
      ears: { kind: 'none', ...zeros(EAR_GENES) },
      tail: { kind: 'none', ...zeros(TAIL_GENES) },
      spots: {
        enabled: false,
        side: 'right',
        count: 3,
        marks: Array.from({ length: SPOT_SLOTS }, () => ({ dx: 0, dy: 0, size: 0, rotation: 0 })),
      },
      belly: { enabled: false, size: 0, height: 0 },
      freckles: { enabled: false, dots: Array.from({ length: FRECKLE_SLOTS }, () => ({ dx: 0, dy: 0, size: 0 })) },
    },
    // The official egg: four spots, exactly where the artwork has them.
    egg: {
      ...zeros(EGG_GENES),
      spotCount: 4,
      spots: Array.from({ length: EGG_SPOT_SLOTS }, () => ({ dx: 0, dy: 0, size: 0, rotation: 0 })),
      speckles: Array.from({ length: EGG_SPECKLE_SLOTS }, () => ({ u: 0, v: 0, size: 0 })),
    },
  };
}

/** Clamp a gene to [-1, 1]; anything that is not a finite number is canonical (0). */
export function clampGene(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value < -1 ? -1 : value > 1 ? 1 : value;
}
