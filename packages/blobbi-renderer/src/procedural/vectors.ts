/**
 * TEST VECTORS for the deterministic core: what a seed must produce, in any
 * implementation of this engine in any language.
 *
 * Nothing here is claimed from how the code looks. The expected values live
 * in `vectors.json` (written once by `npm run vectors`, then committed), and
 * `vectors.test.ts` recomputes them. A Go, Rust or Swift port passes when it
 * reproduces the same file.
 *
 * What is covered, and how exactly it must match:
 *
 *  - `hash`, `draws`: the seed hash (four uint32 words) and the first raw
 *    generator outputs as uint32. Integer math only; must match EXACTLY.
 *  - `genes`, `rolls`: every gene and every trait roll. A gene is
 *    `u1 + u2 - 1` with `u = uint32 / 2^32`: IEEE-754 doubles with no
 *    rounding freedom; must match EXACTLY.
 *  - `genome`: the full genome with the artwork's colours (so it contains
 *    no colour math); must match EXACTLY.
 *  - `egg`: the seed's egg (shell genes resolved, spot layout, palette).
 *    Its shapes must match EXACTLY; its palette is colour math, as below.
 *  - `colors`: the seed-generated trait colours. These go through `cbrt`,
 *    `pow`, `sin`, `cos` and `atan2`, which languages and platforms are NOT
 *    required to round identically. They are stable in JavaScript engines
 *    in practice and are pinned here, but a port should treat a mismatch in
 *    the last hex digit as expected, not as a bug. This is the main reason
 *    colours belong in an event explicitly rather than being re-derived.
 *
 * Porting notes: a seed is hashed over its UTF-16 code units
 * (`charCodeAt`), not its UTF-8 bytes; a gene's stream is seeded with
 * `seed + "\u0000" + key`; the generator is warmed up with 12 draws.
 */
import { generateColors } from './colors';
import { deriveEgg, type EggAppearance } from './egg';
import {
  ANTENNA_GENES,
  EAR_GENES,
  EGG_GENES,
  HORN_GENES,
  MORPHOLOGY_GENES,
  TAIL_GENES,
  generateGenome,
  type BlobbiGenome,
} from './genome';
import { createRng, geneRng, hashSeed } from './rng';

/** Chosen to cover the empty seed, plain ASCII, a kit-style 64-hex seed, and text outside ASCII and the BMP. */
export const VECTOR_SEEDS = [
  '',
  'abc123',
  'blobbi-1',
  'canonical',
  '8f2d6c1e9b7a40f3a5d2c8e1b6f4937d0a1c5e7f2b9d4a6c8e0f1a3b5c7d9e2f',
  'Brötchen ñandú 🌱',
] as const;

const GENE_KEYS = [
  ...MORPHOLOGY_GENES.map((g) => `morphology.${g}`),
  ...ANTENNA_GENES.map((g) => `antenna.${g}`),
  ...HORN_GENES.map((g) => `horns.${g}`),
  ...EAR_GENES.map((g) => `ears.${g}`),
  ...TAIL_GENES.map((g) => `tail.${g}`),
  'spots.0.dx',
  'spots.2.rotation',
  'freckles.1.size',
  'belly.size',
  ...EGG_GENES.map((g) => `egg.${g}`),
  'egg.spots.0.dx',
  'egg.spots.5.rotation',
];

const ROLL_KEYS = ['egg.spotCount', 'egg.speckles.0.u', 'egg.speckles.13.size', 'antenna.kind', 'antenna.side', 'horns.kind', 'ears.kind', 'tail.kind', 'spots.enabled', 'spots.side', 'spots.count', 'belly.enabled', 'freckles.enabled'];

export interface SeedVector {
  seed: string;
  /** The seed as UTF-16 code units, so a port can check it is hashing the same thing. */
  codeUnits: number[];
  hash: number[];
  /** The first eight outputs of the seed's own stream, as uint32. */
  draws: number[];
  genes: Record<string, number>;
  /** The first draw of each roll's stream, as uint32. */
  rolls: Record<string, number>;
  genome: BlobbiGenome;
  colors: ReturnType<typeof generateColors>;
  /**
   * The seed's egg, resolved: shell proportions, where each spot sits, the
   * speckles and patch, and the shell palette. Shapes are exact; the palette
   * goes through the same colour math as `colors` (see above).
   */
  egg: EggAppearance;
}

const U32 = 4294967296;

export function computeVector(seed: string): SeedVector {
  const rng = createRng(seed);
  return {
    seed,
    codeUnits: Array.from({ length: seed.length }, (_, i) => seed.charCodeAt(i)),
    hash: hashSeed(seed),
    draws: Array.from({ length: 8 }, () => rng.next() * U32),
    genes: Object.fromEntries(GENE_KEYS.map((key) => [key, geneRng(seed, key).centered()])),
    rolls: Object.fromEntries(ROLL_KEYS.map((key) => [key, geneRng(seed, key).next() * U32])),
    genome: generateGenome({ seed, colors: 'authored' }),
    colors: generateColors(seed),
    egg: deriveEgg(generateGenome(seed)),
  };
}
