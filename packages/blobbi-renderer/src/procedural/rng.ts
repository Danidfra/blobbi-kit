/**
 * Deterministic, seeded randomness. The ONLY source of variation in the
 * procedural engine: nothing here or downstream calls `Math.random()`, reads a
 * clock or depends on call order.
 *
 * Two properties matter for a future wire format:
 *
 *  - PURE INTEGER MATH. `Math.imul` and 32-bit shifts only, so every JS engine
 *    (and any port to another language) produces the same stream.
 *  - KEYED STREAMS. A gene is drawn from `geneRng(seed, 'body.width')`, a
 *    stream of its own, not from "the next value of one shared generator".
 *    Adding, removing or reordering genes therefore never changes the value
 *    of any other gene: an individual keeps its body when a later version of
 *    the genome grows an antenna.
 */

/** cyrb128: four well-mixed 32-bit words from a string. */
export function hashSeed(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /**
   * A value in [-1, 1] concentrated around 0 (triangular: the mean of two
   * uniforms). This is what a gene is: most individuals sit near the
   * canonical Blobbi, few reach the edge of the allowed range.
   */
  centered(): number;
  pick<T>(items: readonly T[]): T;
}

/** sfc32 over a hashed seed: small, fast, passes PractRand, 32-bit only. */
export function createRng(seed: string): Rng {
  let [a, b, c, d] = hashSeed(seed);
  const next = (): number => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // Warm up: the first outputs of sfc32 correlate with the seed words.
  for (let i = 0; i < 12; i++) next();
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    centered: () => next() + next() - 1,
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

/** The stream that belongs to one named gene of one seed. */
export function geneRng(seed: string, key: string): Rng {
  return createRng(`${seed}\u0000${key}`);
}
