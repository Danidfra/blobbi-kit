import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateGenome } from './genome';
import { MORPHOLOGY_RANGES, deriveMorphology } from './morphology';
import { geneRng } from './rng';
import { VECTOR_SEEDS, computeVector, type SeedVector } from './vectors';
import { PROCEDURAL_ALGORITHM_VERSION } from './version';
import expected from './vectors.json';
import preCrown from './vectors.pre-crown.json';
import preEgg from './vectors.pre-egg.json';

const vectors = expected.vectors as unknown as SeedVector[];

/**
 * THE FROZEN VECTORS OF ALGORITHM VERSION 1.
 *
 * `vectors.json` is the contract: what every vector seed produces under
 * `PROCEDURAL_ALGORITHM_VERSION` 1. A diff in it means existing V3 Blobbis
 * would be drawn as different individuals, so it is rewritten only on
 * purpose, and never for version 1 once a version 1 Blobbi exists:
 *
 *   UPDATE_VECTORS=1 npx vitest run packages/blobbi-renderer/src/procedural/vectors.test.ts
 *
 * The two `vectors.pre-*.json` files are the prototype's own history, kept
 * byte for byte (they still carry its working label, `v3-proto`): the vectors
 * as they stood before the egg genes and before the crown placement genes.
 * They prove what keyed streams promise, by evidence: adding genes moved no
 * earlier gene of any seed.
 */
const PROTOTYPE_LABEL = 'v3-proto';
/** A historical genome, relabelled: the prototype's working label is this algorithm version. */
const relabelled = <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll(`"version":"${PROTOTYPE_LABEL}"`, `"version":${PROCEDURAL_ALGORITHM_VERSION}`));

if (process.env.UPDATE_VECTORS === '1') {
  // jsdom gives `import.meta.url` an http scheme; the test's own path does not depend on it.
  const file = join(dirname(expect.getState().testPath ?? fileURLToPath(import.meta.url)), 'vectors.json');
  writeFileSync(file, `${JSON.stringify({ version: PROCEDURAL_ALGORITHM_VERSION, vectors: VECTOR_SEEDS.map(computeVector) }, null, 2)}\n`);
}

describe('the port is the prototype', () => {
  it('names its file for the algorithm version it freezes', () => {
    expect(expected.version).toBe(PROCEDURAL_ALGORITHM_VERSION);
    expect(PROCEDURAL_ALGORITHM_VERSION).toBe(1);
  });

  it('produces, byte for byte, the vectors file of the reference prototype (but for its working label)', () => {
    // sha256 of `src/procedural/vectors.json` in the blobbi-procedural snapshot
    // (commit 0cc5be5, "feat: complete procedural Blobbi V3 prototype").
    const PROTOTYPE_VECTORS_SHA256 = 'b3bbe525f7550dc592d23b9d9ea672b3bb0db77c0b2af3e36cd05e39811b09f2';
    const asPrototype = `${JSON.stringify({ version: PROTOTYPE_LABEL, vectors: VECTOR_SEEDS.map(computeVector) }, null, 2)}\n`.replaceAll(
      `"version": ${PROCEDURAL_ALGORITHM_VERSION},`,
      `"version": "${PROTOTYPE_LABEL}",`,
    );
    expect(createHash('sha256').update(asPrototype).digest('hex')).toBe(PROTOTYPE_VECTORS_SHA256);
  });
});

describe('deterministic test vectors', () => {
  it('covers every vector seed', () => {
    expect(vectors.map((v) => v.seed)).toEqual([...VECTOR_SEEDS]);
  });

  for (const vector of vectors) {
    describe(`seed ${JSON.stringify(vector.seed)}`, () => {
      const actual = computeVector(vector.seed);

      it('hashes to the same four words and draws the same uint32s', () => {
        expect(actual.codeUnits).toEqual(vector.codeUnits);
        expect(actual.hash).toEqual(vector.hash);
        expect(actual.draws).toEqual(vector.draws);
        for (const draw of actual.draws) expect(Number.isInteger(draw)).toBe(true);
      });

      it('gives every gene and roll exactly the same value', () => {
        expect(actual.genes).toEqual(vector.genes);
        expect(actual.rolls).toEqual(vector.rolls);
      });

      it('builds exactly the same genome', () => {
        expect(JSON.parse(JSON.stringify(actual.genome))).toEqual(vector.genome);
      });

      it('generates the same colours (pinned for JavaScript; see vectors.ts on other languages)', () => {
        expect(actual.colors).toEqual(vector.colors);
      });

      it('derives exactly the same egg', () => {
        expect(JSON.parse(JSON.stringify(actual.egg))).toEqual(vector.egg);
      });
    });
  }
});

describe('the egg was added without touching the Blobbi', () => {
  // `vectors.pre-egg.json` is the vectors file as it stood before the egg
  // existed, kept frozen. Every gene, roll and genome in it must still come out
  // the same; only new keys may have appeared.
  const before = preEgg.vectors as unknown as SeedVector[];

  it('kept every earlier gene and roll of every vector seed exactly', () => {
    expect(before.map((v) => v.seed)).toEqual(vectors.map((v) => v.seed));
    for (const old of before) {
      const now = computeVector(old.seed);
      expect(now.hash).toEqual(old.hash);
      expect(now.draws).toEqual(old.draws);
      for (const [key, value] of Object.entries(old.genes)) expect(now.genes[key], `${old.seed} ${key}`).toBe(value);
      for (const [key, value] of Object.entries(old.rolls)) expect(now.rolls[key], `${old.seed} ${key}`).toBe(value);
    }
  });

  it('kept every earlier genome exactly: the egg genes are an addition beside it', () => {
    for (const old of before) {
      const { egg, ...rest } = JSON.parse(JSON.stringify(computeVector(old.seed).genome));
      // The crown placement genes came later still; they too are additions (see below).
      for (const [trait, keys] of Object.entries(CROWN_GENES)) for (const key of keys) delete rest.traits[trait][key];
      expect(rest).toEqual(relabelled(old.genome));
      expect(egg).toBeDefined();
    }
  });
});

/** The genes that place traits on the crown, added after everything else. */
const CROWN_GENES = { antenna: ['fore'], horns: ['position', 'fore'], ears: ['position'] } as const;

describe('the crown placement genes were added without touching anything else', () => {
  // `vectors.pre-crown.json` is the vectors file as it stood before an antenna
  // could be set back or forward on the crown, kept frozen.
  const before = preCrown.vectors as unknown as SeedVector[];

  it('kept every earlier gene, roll and colour of every vector seed exactly', () => {
    expect(before.map((v) => v.seed)).toEqual(vectors.map((v) => v.seed));
    for (const old of before) {
      const now = computeVector(old.seed);
      expect(now.hash).toEqual(old.hash);
      expect(now.draws).toEqual(old.draws);
      for (const [key, value] of Object.entries(old.genes)) expect(now.genes[key], `${old.seed} ${key}`).toBe(value);
      for (const [key, value] of Object.entries(old.rolls)) expect(now.rolls[key], `${old.seed} ${key}`).toBe(value);
      const added = Object.keys(now.genes).filter((key) => !(key in old.genes));
      expect(added.sort()).toEqual(['antenna.fore', 'ears.position', 'horns.fore', 'horns.position']);
    }
  });

  it('kept every earlier genome exactly: the new genes are additions inside their traits', () => {
    for (const old of before) {
      const genome = JSON.parse(JSON.stringify(computeVector(old.seed).genome));
      for (const [trait, keys] of Object.entries(CROWN_GENES)) {
        for (const key of keys) {
          expect(Math.abs(genome.traits[trait][key])).toBeLessThanOrEqual(1);
          delete genome.traits[trait][key];
        }
      }
      expect(genome).toEqual(relabelled(old.genome));
    }
  });
});

describe('gene stability as the genome grows', () => {
  it('kept every phase-one gene of seed "abc123" where it was when horns, ears and tails were added', () => {
    // These are the values the phase-one playground showed for this seed,
    // before any of the new traits existed. They are recorded here by hand.
    const m = deriveMorphology(generateGenome('abc123'));
    const shown: Record<string, string> = {
      bodyWidth: '1.05',
      bodyHeight: '1.00',
      topWidth: '1.02',
      belly: '0.98',
      roundness: '1.12',
      eyeSize: '0.93',
      eyeSpacing: '0.99',
      pupilSize: '1.01',
      mouthWidth: '1.02',
      mouthCurve: '0.96',
      cheekSize: '1.05',
      armSize: '1.09',
      footSize: '0.97',
      footSpacing: '0.98',
      lean: '2.7',
      eyeHeight: '4.7',
      eyeTilt: '-1.8',
      mouthHeight: '3.3',
      browHeight: '-1.5',
      armHeight: '-1.3',
    };
    for (const [gene, value] of Object.entries(shown)) {
      const digits = MORPHOLOGY_RANGES[gene as keyof typeof MORPHOLOGY_RANGES].unit === 'scale' ? 2 : 1;
      expect(m[gene as keyof typeof MORPHOLOGY_RANGES].toFixed(digits), gene).toBe(value);
    }
    const genome = generateGenome('abc123');
    expect(genome.traits.antenna.count).toBe(1);
    expect(genome.traits.spots.enabled).toBe(true);
    expect(genome.traits.spots.side).toBe('both');
    expect(genome.traits.freckles.enabled).toBe(false);
  });

  it('draws a gene from its own key alone: no other gene, and no order of asking, can move it', () => {
    const alone = geneRng('abc123', 'morphology.eyeSize').centered();
    // Ask for a pile of unrelated genes first, including ones that do not exist yet.
    for (const key of ['horns.length', 'tail.curl', 'wings.span', 'morphology.bodyWidth']) geneRng('abc123', key).centered();
    expect(geneRng('abc123', 'morphology.eyeSize').centered()).toBe(alone);
    expect(generateGenome('abc123').morphology.eyeSize).toBe(alone);
    // Stating a trait explicitly changes that trait and nothing else.
    const horned = generateGenome({ seed: 'abc123', horns: 'top', tail: 'curl', ears: 'round' });
    expect(horned.morphology).toEqual(generateGenome('abc123').morphology);
    expect(horned.traits.antenna).toEqual(generateGenome('abc123').traits.antenna);
    expect(horned.traits.spots).toEqual(generateGenome('abc123').traits.spots);
  });
});
