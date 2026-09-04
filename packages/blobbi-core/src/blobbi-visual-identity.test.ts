import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import {
  KIND_BLOBBI_STATE,
  buildEggTags,
  deriveVisualTraits,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from './blobbi';
import { deriveAdultFormFromSeed } from './types/adult';
import {
  getBlobbiVisualIdentity,
  type BlobbiVisualIdentity,
  type BlobbiVisualIdentitySource,
} from './blobbi-visual-identity';

// ─── Fixtures: real parsed companions, built the way the kit builds events ────

const PUBKEY = 'a'.repeat(64);
const PET_ID = '3196847fb5';
const CREATED_AT = 1_700_000_000;

/** Reuse the canonical egg builder, then override stage / extra tags. */
function makeCompanion(
  stage: 'egg' | 'baby' | 'adult',
  extraTags: string[][] = [],
  name = 'Sparky',
): BlobbiCompanion {
  const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, name)
    .map((t) => (t[0] === 'stage' ? ['stage', stage] : t))
    .concat(extraTags);
  const event: NostrEvent = {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
  const parsed = parseBlobbiEvent(event);
  if (!parsed) throw new Error('fixture did not parse');
  return parsed;
}

const IDENTITY_KEYS = [
  'stage',
  'adultType',
  'baseColor',
  'secondaryColor',
  'eyeColor',
  'pattern',
  'specialMark',
  'theme',
  'name',
] as const;

const snapshot = (value: unknown) => JSON.stringify(value);

describe('getBlobbiVisualIdentity', () => {
  it('projects a baby companion field-for-field from its parsed visual traits', () => {
    const baby = makeCompanion('baby');
    const identity = getBlobbiVisualIdentity(baby);

    expect(identity).toEqual({
      stage: 'baby',
      baseColor: baby.visualTraits.baseColor,
      secondaryColor: baby.visualTraits.secondaryColor,
      eyeColor: baby.visualTraits.eyeColor,
      pattern: baby.visualTraits.pattern,
      specialMark: baby.visualTraits.specialMark,
      name: 'Sparky',
    });
    // No adult form on a baby: the domain resolved none, so none is emitted.
    expect('adultType' in identity).toBe(false);
    expect('theme' in identity).toBe(false);
  });

  it('projects an adult companion including the seed-derived adult form', () => {
    const adult = makeCompanion('adult');
    const identity = getBlobbiVisualIdentity(adult);

    expect(identity.stage).toBe('adult');
    expect(identity.adultType).toBe(adult.adultType);
    expect(identity.adultType).toBe(deriveAdultFormFromSeed(adult.seed!));
    expect(identity.baseColor).toBe(adult.visualTraits.baseColor);
    expect(identity.eyeColor).toBe(adult.visualTraits.eyeColor);
  });

  it('carries the egg stage through unchanged', () => {
    expect(getBlobbiVisualIdentity(makeCompanion('egg')).stage).toBe('egg');
  });

  it('emits every visual trait as a canonical hex color or vocabulary value', () => {
    const identity = getBlobbiVisualIdentity(makeCompanion('adult'));
    for (const color of [identity.baseColor, identity.secondaryColor, identity.eyeColor]) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(['solid', 'spotted', 'striped', 'gradient']).toContain(identity.pattern);
    expect(['none', 'star', 'heart', 'sparkle', 'blush']).toContain(identity.specialMark);
  });

  it('reads the theme extension tag when present, and omits it otherwise', () => {
    const themed = makeCompanion('baby', [['theme', 'divine']]);
    expect(getBlobbiVisualIdentity(themed).theme).toBe('divine');

    const plain = makeCompanion('baby');
    expect('theme' in getBlobbiVisualIdentity(plain)).toBe(false);

    const blank = makeCompanion('baby', [['theme', '']]);
    expect('theme' in getBlobbiVisualIdentity(blank)).toBe(false);
  });

  it('omits an empty name and an empty adult form rather than emitting empty strings', () => {
    const source: BlobbiVisualIdentitySource = {
      stage: 'baby',
      visualTraits: deriveVisualTraits([], 'b'.repeat(64)),
      adultType: '',
      name: '',
    };
    const identity = getBlobbiVisualIdentity(source);
    expect('name' in identity).toBe(false);
    expect('adultType' in identity).toBe(false);
  });

  it('accepts a minimal source with no tags and no name (an adoption preview)', () => {
    const traits = deriveVisualTraits([], 'c'.repeat(64));
    const identity = getBlobbiVisualIdentity({ stage: 'egg', visualTraits: traits });
    expect(identity).toEqual({
      stage: 'egg',
      baseColor: traits.baseColor,
      secondaryColor: traits.secondaryColor,
      eyeColor: traits.eyeColor,
      pattern: traits.pattern,
      specialMark: traits.specialMark,
    });
  });

  it('emits only the visual identity fields: no stats, transport, size or render state', () => {
    const companion = makeCompanion('adult', [['theme', 'divine']]);
    const identity = getBlobbiVisualIdentity(companion);
    const keys = Object.keys(identity).sort();
    expect(keys.every((k) => (IDENTITY_KEYS as readonly string[]).includes(k))).toBe(true);
    for (const forbidden of [
      'event', 'd', 'seed', 'stats', 'state', 'allTags', 'size',
      'isSleeping', 'facing', 'eyeOffset', 'accessories', 'effects', 'isLegacy',
    ]) {
      expect(identity, `${forbidden} leaked into the identity`).not.toHaveProperty(forbidden);
    }
    // visualTraits.size is a domain trait, not part of the renderer identity.
    expect(identity).not.toHaveProperty('size');
  });

  it('is deterministic and never mutates its input', () => {
    const companion = makeCompanion('adult', [['theme', 'divine']]);
    const before = snapshot(companion);

    const a = getBlobbiVisualIdentity(companion);
    const b = getBlobbiVisualIdentity(companion);

    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(snapshot(companion)).toBe(before);
    // Frozen input is fine: nothing is written to it.
    const frozen = Object.freeze({ ...companion, visualTraits: Object.freeze({ ...companion.visualTraits }) });
    expect(() => getBlobbiVisualIdentity(frozen)).not.toThrow();
  });

  it('is plain serializable data', () => {
    const identity = getBlobbiVisualIdentity(makeCompanion('adult'));
    const roundTripped: BlobbiVisualIdentity = JSON.parse(JSON.stringify(identity));
    expect(roundTripped).toEqual(identity);
  });
});
