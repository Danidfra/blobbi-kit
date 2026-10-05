/**
 * The whole space, at volume: seed × stage × view × direction × state ×
 * traits. Every drawing must be sound markup, and drawing it again must give
 * the same string.
 */
import { describe, expect, it } from 'vitest';
import { EGG_CRACKS } from './egg';
import { EMOTIONS } from './expressions';
import { generateGenome, type BlobbiSemanticIdentity } from './genome';
import { DIRECTIONS, LIFE_STAGES, VIEWS } from './plan';
import { renderBlobbiSvg } from './renderer';
import type { BlobbiState } from './state';
import { problemsIn, seeds } from './test-helpers';

const TRAITS: BlobbiSemanticIdentity[] = [
  {},
  { antenna: 'double', horns: 'side', ears: 'none', tail: 'curl', spots: true, belly: true, freckles: true },
  { antenna: 'single', horns: 'forehead', ears: 'none', tail: 'leaf', spots: true },
  { antenna: 'none', horns: 'top', ears: 'none', tail: 'nub', belly: true },
  { antenna: 'double', horns: 'none', ears: 'pointed', tail: 'none', freckles: true },
  // Everything at once, which the seed alone never gives.
  { antenna: 'double', horns: 'top', ears: 'round', tail: 'curl', spots: true, belly: true, freckles: true },
  { colors: 'authored', ears: 'round', horns: 'none' },
];

const STATES: Partial<BlobbiState>[] = [
  {},
  { sleeping: true },
  { expression: { surprised: 1 }, gaze: { x: -1, y: 1 } },
  { expression: { sad: 0.5, sleepy: 0.8, excited: 0.9 }, gaze: { x: 1, y: -1 } },
  { motion: 'walking', phase: 0.3, expression: { happy: 0.6 } },
  { motion: 'walking', phase: 0.8 },
  { motion: 'idle', phase: 0.5 },
  { motion: 'walking' },
  ...EMOTIONS.map((e) => ({ expression: { [e]: 0.37 } })),
];

const POSES: Partial<BlobbiState>[] = [
  ...LIFE_STAGES.flatMap((stage) => VIEWS.flatMap((view) => (view === 'side' ? DIRECTIONS : (['right'] as const)).map((direction) => ({ stage, view, direction })))),
  // The egg, at each crack level.
  ...EGG_CRACKS.map((eggCrack) => ({ stage: 'egg' as const, eggCrack })),
];

describe('stress', () => {
  it('draws sound markup for every combination of seed, stage (egg, baby, adult), view, direction, state and traits', () => {
    const problems: string[] = [];
    let drawn = 0;
    for (const seed of seeds(40, 'stress')) {
      for (const traits of TRAITS) {
        const genome = generateGenome({ seed, ...traits });
        for (const pose of POSES) {
          for (const state of STATES) {
            const svg = renderBlobbiSvg(genome, { ...pose, ...state }, { idPrefix: 's', debug: drawn % 7 === 0, groundShadow: drawn % 5 === 0 });
            drawn++;
            for (const problem of problemsIn(svg)) problems.push(`${seed} ${JSON.stringify(traits)} ${JSON.stringify({ ...pose, ...state })}: ${problem}`);
          }
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
    expect(drawn).toBe(40 * TRAITS.length * POSES.length * STATES.length);
    expect(drawn).toBeGreaterThan(45000);
  }, 120_000);

  it('survives every gene at each extreme, in every stage and view', () => {
    const problems: string[] = [];
    for (const value of [1, -1, 50, -50, Number.NaN, Infinity]) {
      const genome = generateGenome({ seed: 'extreme', antenna: 'double', horns: 'side', ears: 'pointed', tail: 'curl', spots: true, belly: true, freckles: true });
      const fill = (genes: Record<string, unknown>) => {
        for (const key of Object.keys(genes)) if (typeof genes[key] === 'number' && key !== 'count' && key !== 'side') genes[key] = value;
      };
      fill(genome.morphology);
      for (const trait of [genome.traits.antenna, genome.traits.horns, genome.traits.ears, genome.traits.tail, genome.traits.belly]) fill(trait as unknown as Record<string, unknown>);
      for (const mark of [...genome.traits.spots.marks, ...genome.traits.freckles.dots]) fill(mark as unknown as Record<string, unknown>);
      for (const pose of POSES) {
        for (const state of STATES.slice(0, 6)) {
          for (const problem of problemsIn(renderBlobbiSvg(genome, { ...pose, ...state }))) problems.push(`${value} ${JSON.stringify(pose)}: ${problem}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('is stable: every drawing of a sample is byte-identical when drawn again later', () => {
    const sample = seeds(12, 'stable').flatMap((seed) =>
      TRAITS.slice(0, 4).flatMap((traits) => POSES.flatMap((pose) => STATES.slice(0, 7).map((state) => ({ seed, traits, state: { ...pose, ...state } })))),
    );
    const first = sample.map(({ seed, traits, state }) => renderBlobbiSvg(generateGenome({ seed, ...traits }), state));
    // In reverse order, from freshly generated genomes.
    const again = [...sample].reverse().map(({ seed, traits, state }) => renderBlobbiSvg(generateGenome({ seed, ...traits }), state));
    expect(again.reverse()).toEqual(first);
    // Not all distinct: a face's expression cannot be seen from behind, and an egg has no face at all.
    expect(new Set(first).size).toBeGreaterThan(first.length * 0.6);
  });
});
