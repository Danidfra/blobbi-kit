/**
 * WHAT ALGORITHM 1 GIVES THE REFERENCE BLOBBIS: computed here, pinned in
 * the three JSON files beside this one, and held to them by
 * `reference.test.ts`.
 *
 * ```
 *   morphology.json   genes resolved to artwork numbers: the egg's shell, the
 *                     baby and the adult of every reference Blobbi, and of
 *                     two bodies with every gene at an end of its range
 *   palette.json      every colour role derived from the four identity colours
 *   paint.json        what each drawing paints (see `paint-list.ts`): egg,
 *                     baby and adult; front, side and back
 * ```
 *
 * How exactly each must match:
 *
 *  - MORPHOLOGY: exactly. It is sums and products of doubles, which leave
 *    no rounding freedom. Two fields go through a library function and
 *    could differ in their last bits in another language: a flank spot's
 *    `theta` (`asin`) and an egg speckle's `cx`, `cy` (`cos`, `sin`).
 *  - PALETTE: exactly, in JavaScript. Colour math goes through `cbrt`,
 *    `pow` and trigonometry, so a port may land one step away in a channel;
 *    that is the tolerance a port should allow, and no more.
 *  - PAINT: positions and sizes within `TOLERANCE`, paint exactly.
 *
 * These files are the contract for Algorithm 1 (V3), in the sense
 * `procedural/version.ts` states. They are regenerated
 * (`UPDATE_REFERENCE=1`) only for an ADDITION (a new reference case), or
 * for a change shown not to alter any picture. A difference in an existing
 * entry means version 1 Blobbis would look different: that is a new
 * algorithm version, not an update.
 */
import {
  ANTENNA_GENES,
  EAR_GENES,
  EGG_GENES,
  HORN_GENES,
  MORPHOLOGY_GENES,
  PROCEDURAL_ALGORITHM_VERSION,
  TAIL_GENES,
  canonicalGenome,
  deriveEgg,
  deriveEggPalette,
  deriveMorphology,
  derivePalette,
  type BlobbiGenome,
  type BlobbiMorphology,
  type BlobbiPalette,
  type EggAppearance,
  type EggPalette,
} from '../../../procedural';
import { renderBlobbiSvg } from '../../load-blobbi-svg';
import { blobbiV3Genome, type BlobbiV3Identity } from '../identity';
import { PALETTE_CASES, REFERENCE_CASES } from './cases';
import { paintLines, paintList, type PaintLayer } from './paint-list';

export const REFERENCE_STAGES = ['baby', 'adult'] as const;
/** The profile is pinned facing right; the left one is the same individual turned round (see the engine's view tests). */
export const REFERENCE_VIEWS = { front: 'front', side: 'right', back: 'back' } as const;
export type ReferenceStage = (typeof REFERENCE_STAGES)[number];
export type ReferenceView = keyof typeof REFERENCE_VIEWS;

// ─── Morphology ──────────────────────────────────────────────────────────────

export type MorphologyRecord = Omit<BlobbiMorphology, 'palette'>;
export type EggRecord = Omit<EggAppearance, 'palette'>;
export interface MorphologyReference {
  egg: EggRecord;
  baby: MorphologyRecord;
  adult: MorphologyRecord;
}

function morphologyOf(genome: BlobbiGenome): MorphologyReference {
  const strip = <T extends { palette: unknown }>({ palette: _palette, ...rest }: T) => rest;
  return { egg: strip(deriveEgg(genome)), baby: strip(deriveMorphology(genome, 'baby')), adult: strip(deriveMorphology(genome, 'adult')) };
}

/**
 * A body with EVERY gene at one end of its range, and every trait present:
 * what no seed gives (genes cluster near the middle), and exactly where a
 * range, a clamp or a stage's development would show a change first.
 * Between the two, each kind-dependent rule is reached: the forehead horn's
 * smaller size and the crown horn that moves the antennae, both ear and tail
 * shapes, spots on both flanks and four stripes.
 */
export function extremeGenome(end: -1 | 1): BlobbiGenome {
  const all = <N extends string>(names: readonly N[]) => Object.fromEntries(names.map((name) => [name, end])) as Record<N, number>;
  const genome = canonicalGenome();
  const spot = () => ({ dx: end, dy: end, size: end, rotation: end });
  return {
    ...genome,
    seed: end === 1 ? 'every gene at +1' : 'every gene at -1',
    morphology: all(MORPHOLOGY_GENES),
    traits: {
      antenna: { count: 2, side: end, ...all(ANTENNA_GENES) },
      horns: { kind: end === 1 ? 'top' : 'forehead', ...all(HORN_GENES) },
      ears: { kind: end === 1 ? 'pointed' : 'round', ...all(EAR_GENES) },
      tail: { kind: end === 1 ? 'curl' : 'leaf', ...all(TAIL_GENES) },
      pattern: {
        kind: end === 1 ? 'striped' : 'spotted',
        spots: { side: 'both', count: 3, marks: [spot(), spot(), spot()], backCount: 3, back: [spot(), spot(), spot()] },
        stripes: { count: 4, sag: end, bands: Array.from({ length: 4 }, () => ({ dy: end, width: end, reach: end })) },
        gradient: { start: end, strength: end },
      },
      mark: { kind: end === 1 ? 'star' : 'moon', side: end, region: end === 1 ? 0.999 : 0, u: end, v: end, size: end, rotation: end },
      belly: { enabled: true, size: end, height: end },
      freckles: { enabled: true, dots: Array.from({ length: 3 }, () => ({ dx: end, dy: end, size: end })) },
    },
    egg: {
      ...all(EGG_GENES),
      spotCount: end === 1 ? 4 : 3,
      spots: Array.from({ length: 6 }, spot),
      speckles: Array.from({ length: 14 }, (_, i) => ({ u: (i + (end === 1 ? 0.5 : 0)) / 14, v: end === 1 ? 0.999 : (i + 1) / 15, size: end === 1 ? 0.999 : 0 })),
    },
  };
}

export const EXTREME_CASES = { 'every-gene-low': -1, 'every-gene-high': 1 } as const;

export function computeMorphology(): Record<string, MorphologyReference> {
  return {
    ...Object.fromEntries(REFERENCE_CASES.map(({ name, identity }) => [name, morphologyOf(blobbiV3Genome(identity))])),
    ...Object.fromEntries(Object.entries(EXTREME_CASES).map(([name, end]) => [name, morphologyOf(extremeGenome(end))])),
  };
}

// ─── Palette ─────────────────────────────────────────────────────────────────

export interface PaletteReference {
  colors: BlobbiV3Identity['colors'];
  /** Every colour role of the baby and the adult. */
  palette: BlobbiPalette;
  /** The shell's colours: of a plain egg, and of the egg of a spotted Blobbi (whose shell spots take the pattern colour). */
  egg: { plain: EggPalette; spotted: EggPalette };
}

const paletteOf = (colors: BlobbiV3Identity['colors']): PaletteReference => ({
  colors,
  palette: derivePalette({ ...colors }),
  egg: { plain: deriveEggPalette({ ...colors }, false), spotted: deriveEggPalette({ ...colors }, true) },
});

export function computePalettes(): Record<string, PaletteReference> {
  return {
    ...Object.fromEntries(REFERENCE_CASES.map(({ name, identity }) => [name, paletteOf(identity.colors)])),
    ...Object.fromEntries(PALETTE_CASES.map(({ name, colors }) => [name, paletteOf(colors)])),
  };
}

// ─── Paint ───────────────────────────────────────────────────────────────────

/** A reference drawing, through the package's public door: still, awake, neutral, looking ahead. */
export function drawReference(identity: BlobbiV3Identity, stage: 'egg' | ReferenceStage, view: ReferenceView = 'front'): string {
  return renderBlobbiSvg({ visualGeneration: 'v3', v3: identity, stage, facing: REFERENCE_VIEWS[view], instanceId: 'ref' }).svg;
}

export const paintOf = (identity: BlobbiV3Identity, stage: 'egg' | ReferenceStage, view: ReferenceView = 'front'): PaintLayer[] => paintList(drawReference(identity, stage, view));

export interface PaintReference {
  egg: string[];
  baby: Record<ReferenceView, string[]>;
  adult: Record<ReferenceView, string[]>;
}

export function computePaint(): Record<string, PaintReference> {
  const views = (identity: BlobbiV3Identity, stage: ReferenceStage) =>
    Object.fromEntries((Object.keys(REFERENCE_VIEWS) as ReferenceView[]).map((view) => [view, paintLines(paintOf(identity, stage, view))])) as Record<ReferenceView, string[]>;
  return Object.fromEntries(
    REFERENCE_CASES.map(({ name, identity }) => [name, { egg: paintLines(paintOf(identity, 'egg')), baby: views(identity, 'baby'), adult: views(identity, 'adult') }]),
  );
}

// ─── Files ───────────────────────────────────────────────────────────────────

export const REFERENCE_FILES = {
  'morphology.json': computeMorphology,
  'palette.json': computePalettes,
  'paint.json': computePaint,
} as const;

/**
 * JSON for a reference file: indented, but with every value that fits on a
 * line kept on one, so a record reads as a record and a diff shows the
 * field that moved.
 */
export function formatReference(cases: unknown): string {
  const format = (value: unknown, indent: string): string => {
    const flat = JSON.stringify(value);
    if (value === null || typeof value !== 'object' || flat.length + indent.length <= 150) return flat;
    const inner = `${indent}  `;
    if (Array.isArray(value)) return `[\n${value.map((item) => `${inner}${format(item, inner)}`).join(',\n')}\n${indent}]`;
    return `{\n${Object.entries(value)
      .map(([key, item]) => `${inner}${JSON.stringify(key)}: ${format(item, inner)}`)
      .join(',\n')}\n${indent}}`;
  };
  return `${format({ algorithm: PROCEDURAL_ALGORITHM_VERSION, cases }, '')}\n`;
}
