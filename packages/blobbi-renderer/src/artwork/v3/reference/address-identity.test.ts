/**
 * THE SEED IS THE WHOLE INTRINSIC BLOBBI, under `visual_algorithm = 1`.
 *
 * A V3 event states no colour and no trait: `@blobbi-kit/core` derives the
 * seed from the Blobbi's address and hands this package `{ seed, algorithm }`
 * and nothing else. These tests pin the second half of
 *
 *   (pubkey, d) ─► seed ─► Algorithm 1 ─► colours, anatomy, pattern, mark, belly, freckles
 *
 * against `blobbi-v3-identity.vectors.json` (core pins the first half), and
 * show that the seed alone resolves to, and draws exactly as, the identity
 * a Blobbi used to state in full. The colour generator is therefore part of
 * what version 1 freezes (`procedural/version.ts`).
 */
import { describe, expect, it } from 'vitest';
import { createBlobbiV3Identity, normalizeBlobbiV3Visual, resolveBlobbiV3Visual } from '../identity';
import { renderBlobbiSvg } from '../../load-blobbi-svg';
import { generateColors } from '../../../procedural';
import { REFERENCE_CASES } from './cases';
import VECTORS from '../../../../../blobbi-core/src/blobbi-v3-identity.vectors.json';

describe('address -> seed -> intrinsic identity, frozen', () => {
  it('every vector\'s seed is the identity it pins, colours included', () => {
    expect(VECTORS.vectors.length).toBeGreaterThanOrEqual(10);
    for (const v of VECTORS.vectors) {
      const identity = createBlobbiV3Identity(v.seed);
      expect({ algorithm: identity.algorithm, colors: identity.colors, traits: identity.traits }, v.d).toEqual(v.identity);
      expect(generateColors(v.seed).scheme, v.d).toBe(v.colorScheme);
    }
  });

  it('the vectors show every trait kind and every colour scheme at least once', () => {
    const kinds = (key: string) => new Set(VECTORS.vectors.map((v) => (v.identity.traits as Record<string, unknown>)[key]));
    expect(kinds('antenna').size).toBe(3);
    expect(kinds('horns').size).toBe(4);
    expect(kinds('ears').size).toBe(3);
    expect(kinds('tail').size).toBe(4);
    expect(kinds('pattern').size).toBe(4);
    expect(kinds('specialMark').size).toBe(5);
    expect(kinds('belly').size).toBe(2);
    expect(kinds('freckles').size).toBe(2);
    expect(new Set(VECTORS.vectors.map((v) => v.colorScheme)).size).toBe(3);
  });
});

describe('the seed alone is the individual', () => {
  const seeds = [...VECTORS.vectors.map((v) => v.seed), ...REFERENCE_CASES.filter((c) => c.name.startsWith('as-created')).map((c) => c.identity.seed)];

  it('{ seed, algorithm: 1 } resolves to exactly what creation would have stated', () => {
    for (const seed of seeds) {
      const resolved = resolveBlobbiV3Visual({ seed, algorithm: 1 });
      expect(resolved.status, seed).toBe('individual');
      expect(normalizeBlobbiV3Visual({ seed, algorithm: 1 }), seed).toEqual(createBlobbiV3Identity(seed));
    }
  });

  it('and is drawn exactly as the fully stated identity is, at every stage and from every side', () => {
    for (const seed of seeds.slice(0, 8)) {
      const stated = createBlobbiV3Identity(seed);
      for (const stage of ['egg', 'baby', 'adult'] as const) {
        for (const facing of ['front', 'left', 'right', 'back'] as const) {
          const fromSeed = renderBlobbiSvg({ stage, visualGeneration: 'v3', v3: { seed, algorithm: 1 }, facing, instanceId: 'x' });
          const fromStated = renderBlobbiSvg({ stage, visualGeneration: 'v3', v3: stated, facing, instanceId: 'x' });
          expect(fromSeed.svg, `${seed} ${stage} ${facing}`).toBe(fromStated.svg);
          expect(fromSeed.artwork.anchors, `${seed} ${stage} ${facing}`).toEqual(fromStated.artwork.anchors);
        }
      }
    }
  });
});
