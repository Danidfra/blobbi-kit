/**
 * Adult form is SEED IDENTITY: `deriveAdultFormFromSeed(seed)` reads seed
 * bytes [40..48] and maps them onto {@link ADULT_FORMS}. These tests pin the
 * derivation with fixed vectors, prove a stored `adult_type` tag never
 * overrides the seed on read, and record that the temporary adult-type
 * compatibility window (which rewrote seeds to match a stored tag until
 * 2026-05-01) is gone rather than merely expired.
 */
import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import * as core from './index';
import {
  KIND_BLOBBI_STATE,
  adjustSeedForAdultType,
  buildEggTags,
  deriveBlobbiSeedV1,
  parseBlobbiEvent,
  updateBlobbiTags,
  getTagValue,
} from './blobbi';
import { ADULT_FORMS, deriveAdultFormFromSeed, isValidAdultForm } from './types/adult';
import { getBlobbiVisualIdentity } from './blobbi-visual-identity';

const PUBKEY = 'a'.repeat(64);
const PET_ID = '3196847fb5';
const D = `blobbi-${'a'.repeat(12)}-${PET_ID}`;

function makeEvent(tags: string[][], createdAt = 1_700_000_000): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: createdAt,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
}

/** Canonical adult tags for a given creation time; the seed decides the form. */
function adultTags(createdAt: number, extra: string[][] = []): string[][] {
  return buildEggTags(PUBKEY, PET_ID, createdAt, 'Sparky')
    .map((t) => (t[0] === 'stage' ? ['stage', 'adult'] : t))
    .concat(extra);
}

describe('deriveAdultFormFromSeed is a fixed function of the seed', () => {
  // Vectors computed independently (sha256 of the seed input, bytes 40..48
  // mod 16). If any of these change, every existing adult changes form.
  it.each([
    [deriveBlobbiSeedV1(PUBKEY, D, 1_700_000_000), 'droppi'],
    [deriveBlobbiSeedV1(PUBKEY, D, 1_700_000_001), 'rosey'],
    [deriveBlobbiSeedV1(PUBKEY, D, 1_650_000_000), 'droppi'],
    ['a'.repeat(64), 'mushie'],
    ['0'.repeat(64), 'bloomi'],
    ['f'.repeat(64), 'starri'],
  ])('%s -> %s', (seed, form) => {
    expect(deriveAdultFormFromSeed(seed)).toBe(form);
    expect(deriveAdultFormFromSeed(seed)).toBe(deriveAdultFormFromSeed(seed));
  });

  it('pins the seed inputs of the vectors above', () => {
    expect(deriveBlobbiSeedV1(PUBKEY, D, 1_700_000_000)).toBe(
      '9e4776ea1a48dbfc0cef1d88b8ee6fde55a4a0f30e402046342da3475a37e5e5',
    );
  });

  it('always lands in the canonical vocabulary, for any 64-hex seed', () => {
    for (let i = 0; i < 64; i++) {
      const seed = deriveBlobbiSeedV1(PUBKEY, D, 1_700_000_000 + i);
      expect(ADULT_FORMS).toContain(deriveAdultFormFromSeed(seed));
    }
  });

  it('the vocabulary is the sixteen V1 forms, and isValidAdultForm is exact', () => {
    expect(ADULT_FORMS).toHaveLength(16);
    for (const form of ADULT_FORMS) expect(isValidAdultForm(form)).toBe(true);
    for (const raw of ['Catti', 'catti ', '', 'dragon']) expect(isValidAdultForm(raw)).toBe(false);
  });
});

describe('a stored adult_type tag is a mirror, never an override', () => {
  it('an adult with a seed derives its form from the seed even when the tag disagrees', () => {
    const createdAt = 1_700_000_000;
    const seedForm = deriveAdultFormFromSeed(deriveBlobbiSeedV1(PUBKEY, D, createdAt));
    const otherForm = ADULT_FORMS.find((f) => f !== seedForm)!;

    const companion = parseBlobbiEvent(makeEvent(adultTags(createdAt, [['adult_type', otherForm]]), createdAt));
    expect(companion).toBeDefined();
    expect(companion!.adultType).toBe(seedForm);
    // The seed itself is untouched: nothing rewrites it on read.
    expect(companion!.seed).toBe(getTagValue(companion!.allTags, 'seed'));
    expect(getBlobbiVisualIdentity(companion!).adultType).toBe(seedForm);
  });

  it('a republish rewrites the mirror tag from the seed', () => {
    const createdAt = 1_700_000_000;
    const seedForm = deriveAdultFormFromSeed(deriveBlobbiSeedV1(PUBKEY, D, createdAt));
    const otherForm = ADULT_FORMS.find((f) => f !== seedForm)!;
    const tags = updateBlobbiTags(adultTags(createdAt, [['adult_type', otherForm]]), { happiness: '50' });
    expect(getTagValue(tags, 'adult_type')).toBe(seedForm);
  });

  it('a seedless adult keeps its raw tag on the companion; only a canonical form reaches the identity', () => {
    // Legacy shape: no seed, non-canonical d. Parses (flagged legacy), never migrated.
    const legacy = (form: string) =>
      makeEvent([
        ['d', 'blobbi-old-timer'],
        ['b', 'blobbi:ecosystem:v1'],
        ['name', 'Old Timer'],
        ['stage', 'adult'],
        ['state', 'active'],
        ['last_interaction', '1700000000'],
        ['adult_type', form],
      ]);

    const valid = parseBlobbiEvent(legacy('catti'))!;
    expect(valid.isLegacy).toBe(true);
    expect(valid.adultType).toBe('catti');
    expect(getBlobbiVisualIdentity(valid).adultType).toBe('catti');

    const raw = parseBlobbiEvent(legacy('dragon'))!;
    expect(raw.adultType).toBe('dragon');
    expect('adultType' in getBlobbiVisualIdentity(raw)).toBe(false);
  });
});

describe('the adult-type compatibility window is gone', () => {
  it('core exports no compatibility predicate', () => {
    expect('isAdultTypeCompatActive' in core).toBe(false);
  });

  it('adjustSeedForAdultType remains as a seed authoring utility', () => {
    const seed = deriveBlobbiSeedV1(PUBKEY, D, 1_700_000_000);
    for (const form of ADULT_FORMS) {
      const adjusted = adjustSeedForAdultType(seed, form);
      expect(deriveAdultFormFromSeed(adjusted)).toBe(form);
      // Only the adult-form region moves; colours and other traits stay put.
      expect(adjusted.slice(0, 40)).toBe(seed.slice(0, 40));
      expect(adjusted.slice(48)).toBe(seed.slice(48));
    }
    expect(adjustSeedForAdultType(seed, deriveAdultFormFromSeed(seed))).toBe(seed);
  });
});
