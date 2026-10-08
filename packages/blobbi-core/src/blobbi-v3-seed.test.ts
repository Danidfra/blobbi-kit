/**
 * THE V3 SEED IS THE ADDRESS. A kind 31124 event is parameterized
 * replaceable: (author pubkey, `d`) is the Blobbi, and every event at that
 * address is a version of it. These tests pin that a V3 seed is derived from
 * that address and from nothing an event states, so no replacement can
 * reroll it; and they freeze the derivation byte for byte
 * (`blobbi-v3-seed.vectors.json`, made by an independent implementation) so
 * another language can reproduce it.
 */
import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import {
  KIND_BLOBBI_STATE,
  buildEggTags,
  classifyBlobbiEvent,
  deriveBlobbiSeedV1,
  getCanonicalBlobbiD,
  getOrDeriveSeed,
  getTagValue,
  parseBlobbiEvent,
  updateBlobbiTags,
} from './blobbi';
import { validateAndRepairBlobbiTags } from './blobbi-tag-schema';
import {
  BLOBBI_V3_SEED_DOMAIN,
  blobbiV3SeedPreimage,
  deriveBlobbiV3Seed,
  getBlobbiV3Seed,
  parseBlobbiV3Identity,
  type BlobbiV3Identity,
} from './blobbi-v3-identity';
import { getBlobbiVisualIdentity } from './blobbi-visual-identity';
import VECTORS from './blobbi-v3-seed.vectors.json';

const ALICE = 'a'.repeat(64);
const BOB = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const PET_ID = '3196847fb5';
const CREATED_AT = 1_700_000_000;
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** A complete identity for a seed; its colours and traits are fixed, so only the seed varies. */
const identityFor = (seed: string): BlobbiV3Identity => ({
  seed,
  algorithm: 1,
  colors: { base: '#3fb7a5', secondary: '#2a6f8f', eye: '#5a2d12', accent: '#e86a5c' },
  traits: { antenna: 'double', horns: 'none', ears: 'pointed', tail: 'curl', pattern: 'striped', specialMark: 'moon', belly: false, freckles: true },
});
const event = (pubkey: string, tags: string[][], createdAt = CREATED_AT): NostrEvent => ({ id: 'e'.repeat(64), pubkey, created_at: createdAt, kind: KIND_BLOBBI_STATE, tags, content: '', sig: '0'.repeat(128) });
const bornV3 = (pubkey = ALICE, petId = PET_ID, createdAt = CREATED_AT) =>
  buildEggTags(pubkey, petId, createdAt, 'Sprout', { visualGeneration: 'v3', v3: identityFor });
const seedOf = (pubkey: string, tags: string[][], createdAt = CREATED_AT) => parseBlobbiEvent(event(pubkey, tags, createdAt))!.v3Identity!.seed;
const withTag = (tags: string[][], name: string, value: string) => [...tags.filter((t) => t[0] !== name), [name, value]];
const hatch = (tags: string[][]) => validateAndRepairBlobbiTags(updateBlobbiTags(tags, { stage: 'baby', state: 'active' }), tags, { cleanupTaskTags: true }).tags;
const evolve = (tags: string[][]) => validateAndRepairBlobbiTags(updateBlobbiTags(tags, { stage: 'adult', progression_state: 'none' }), tags, { cleanupTaskTags: true }).tags;

describe('the derivation, frozen', () => {
  it('reproduces every reference vector: the preimage byte for byte and the seed', () => {
    expect(VECTORS.scheme).toBe(BLOBBI_V3_SEED_DOMAIN);
    expect(VECTORS.vectors.length).toBeGreaterThanOrEqual(10);
    for (const v of VECTORS.vectors) {
      expect(toHex(new TextEncoder().encode(v.d)), v.name).toBe(v.d_utf8_hex);
      expect(toHex(blobbiV3SeedPreimage(v.pubkey, v.d)), v.name).toBe(v.preimage_hex);
      expect(deriveBlobbiV3Seed(v.pubkey, v.d), v.name).toBe(v.seed);
    }
  });

  it('frames every field: a length-prefixed domain, the 32 key bytes, a big-endian u32 length, then d', () => {
    const pre = blobbiV3SeedPreimage(ALICE, 'ab');
    const domain = new TextEncoder().encode('blobbi:visual-seed:v1');
    expect(pre[0]).toBe(domain.length);
    expect(toHex(pre.slice(1, 1 + domain.length))).toBe(toHex(domain));
    expect(toHex(pre.slice(1 + domain.length, 33 + domain.length))).toBe(ALICE);
    expect(Array.from(pre.slice(33 + domain.length, 37 + domain.length))).toEqual([0, 0, 0, 2]);
    expect(Array.from(pre.slice(37 + domain.length))).toEqual([0x61, 0x62]);
    expect(pre.length).toBe(1 + domain.length + 32 + 4 + 2);
  });

  it('is a canonical V3 seed, and is not the V1/V2 derivation (which also hashes the birth time)', () => {
    const d = getCanonicalBlobbiD(ALICE, PET_ID);
    expect(deriveBlobbiV3Seed(ALICE, d)).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveBlobbiV3Seed(ALICE, d)).not.toBe(deriveBlobbiSeedV1(ALICE, d, CREATED_AT));
  });
});

describe('the address decides the seed', () => {
  it('1. the same author and d: the same seed, whenever and however often it is derived', () => {
    const d = getCanonicalBlobbiD(ALICE, PET_ID);
    const seed = deriveBlobbiV3Seed(ALICE, d);
    expect(deriveBlobbiV3Seed(ALICE, d)).toBe(seed);
    // Born at another time, the same address: the same seed (the V1/V2 seed would differ).
    expect(seedOf(ALICE, bornV3(ALICE, PET_ID, CREATED_AT + 86_400), CREATED_AT + 86_400)).toBe(seed);
    expect(seedOf(ALICE, bornV3())).toBe(seed);
  });

  it('2. the same author, another d: another seed', () => {
    const seeds = new Set(Array.from({ length: 200 }, (_, i) => deriveBlobbiV3Seed(ALICE, getCanonicalBlobbiD(ALICE, i.toString(16).padStart(10, '0')))));
    expect(seeds.size).toBe(200);
  });

  it('3. another author, the same d: another seed (two authors may share a d; their Blobbis are not one)', () => {
    const d = getCanonicalBlobbiD(ALICE, PET_ID);
    expect(deriveBlobbiV3Seed(BOB, d)).not.toBe(deriveBlobbiV3Seed(ALICE, d));
    // Even an event that copies Alice's tags verbatim, published by Bob, is Bob's Blobbi with Bob's seed.
    expect(seedOf(BOB, bornV3())).toBe(deriveBlobbiV3Seed(BOB, d));
    expect(seedOf(BOB, bornV3())).not.toBe(seedOf(ALICE, bornV3()));
  });

  it('4. a replacement event at the same address has the same seed, whatever its mutable state says', () => {
    const egg = bornV3();
    const seed = seedOf(ALICE, egg);
    const states: string[][][] = [
      updateBlobbiTags(egg, { hunger: '3', happiness: '100', energy: '0', last_interaction: String(CREATED_AT + 999) }),
      updateBlobbiTags(egg, { name: 'Renamed', state: 'sleeping', experience: '4242' }),
      withTag(egg, 'base_color', '#000000'),
      withTag(egg, 'antenna', 'none'),
      withTag(egg, 'visual_algorithm', '2'),
      withTag(egg, 'generation', '9'),
      [...egg, ['client', 'someone-else'], ['t', 'blobbi']],
    ];
    for (const tags of states) expect(seedOf(ALICE, tags, CREATED_AT + 5_000)).toBe(seed);
  });

  it('5. a seed tag can neither reroll it nor survive a republish', () => {
    const egg = bornV3();
    const seed = seedOf(ALICE, egg)!;
    const other = 'f'.repeat(64);
    for (const forged of [other, other.toUpperCase(), seed.toUpperCase(), deriveBlobbiSeedV1(ALICE, getTagValue(egg, 'd')!, CREATED_AT), 'not a seed']) {
      const tags = [...egg, ['seed', forged]];
      expect(seedOf(ALICE, tags), forged).toBe(seed);
      expect(classifyBlobbiEvent(event(ALICE, tags)), forged).toBe('modern');
      expect(getOrDeriveSeed(event(ALICE, tags)), forged).toBe(seed);
      expect(getBlobbiVisualIdentity(parseBlobbiEvent(event(ALICE, tags))!).v3?.seed, forged).toBe(seed);
      // Every kit write drops it: a care update, a hatch, an evolution, and an explicit attempt to set it.
      expect(getTagValue(updateBlobbiTags(tags, { hunger: '50' }), 'seed'), forged).toBeUndefined();
      expect(getTagValue(evolve(hatch(tags)), 'seed'), forged).toBeUndefined();
      expect(getTagValue(updateBlobbiTags(egg, { seed: forged }), 'seed'), forged).toBeUndefined();
    }
    // The repair never brings one back from a previous event that had one.
    const previous = [...egg, ['seed', other]];
    expect(getTagValue(validateAndRepairBlobbiTags(egg, previous).tags, 'seed')).toBeUndefined();
    expect(validateAndRepairBlobbiTags(egg, egg).errors).toEqual([]);
  });

  it('6. egg -> baby -> adult: one seed', () => {
    const egg = bornV3();
    const baby = hatch(egg);
    const adult = evolve(baby);
    expect(parseBlobbiEvent(event(ALICE, adult))!.stage).toBe('adult');
    expect(new Set([egg, baby, adult].map((tags) => seedOf(ALICE, tags))).size).toBe(1);
    for (const tags of [egg, baby, adult]) expect(getTagValue(tags, 'seed')).toBeUndefined();
  });

  it('7. twenty-five replacements, each relayed as JSON and read back: one seed, one identity', () => {
    let tags = bornV3();
    const first = parseBlobbiEvent(event(ALICE, tags))!.v3Identity;
    for (let i = 0; i < 25; i++) {
      tags = i === 5 ? hatch(tags) : i === 15 ? evolve(tags) : updateBlobbiTags(tags, { hunger: String(i), last_interaction: String(CREATED_AT + i) });
      const relayed: NostrEvent = JSON.parse(JSON.stringify(event(ALICE, tags, CREATED_AT + i)));
      expect(parseBlobbiEvent(relayed)!.v3Identity, `update ${i}`).toEqual(first);
    }
  });
});

describe('the inputs, exactly', () => {
  const d = getCanonicalBlobbiD(ALICE, PET_ID);

  it('8. the pubkey is read only as Nostr writes it: 64 lower-case hexadecimal digits', () => {
    expect(deriveBlobbiV3Seed(BOB, d)).toMatch(/^[0-9a-f]{64}$/);
    // Upper case is not a NIP-01 pubkey: no address, so no seed; never folded into the lower-case author's.
    for (const bad of [BOB.toUpperCase(), BOB.slice(0, 32) + BOB.slice(32).toUpperCase(), `0x${BOB}`, BOB.slice(1), `${BOB}0`, `npub1${'q'.repeat(58)}`, '']) {
      expect(() => deriveBlobbiV3Seed(bad, d), bad).toThrow(TypeError);
      expect(getBlobbiV3Seed({ pubkey: bad, tags: [['d', d]] }), bad).toBeUndefined();
      const tags = buildEggTags(BOB, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: identityFor });
      expect(classifyBlobbiEvent(event(bad, tags)), bad).toBe('legacy');
    }
    expect(() => buildEggTags(BOB.toUpperCase(), PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: identityFor })).toThrow(TypeError);
  });

  it('9. d is its exact UTF-8: no trimming, case folding or Unicode normalization; malformed Unicode has no seed', () => {
    const nfc = 'blobbi-ü';
    const nfd = 'blobbi-ü';
    expect(nfc.normalize('NFC')).toBe(nfd.normalize('NFC'));
    expect(deriveBlobbiV3Seed(ALICE, nfc)).not.toBe(deriveBlobbiV3Seed(ALICE, nfd));
    expect(deriveBlobbiV3Seed(ALICE, 'Blobbi')).not.toBe(deriveBlobbiV3Seed(ALICE, 'blobbi'));
    expect(deriveBlobbiV3Seed(ALICE, ' blobbi')).not.toBe(deriveBlobbiV3Seed(ALICE, 'blobbi'));
    expect(deriveBlobbiV3Seed(ALICE, '\u{1F423}')).toMatch(/^[0-9a-f]{64}$/);
    // A lone surrogate has no single UTF-8 encoding (an encoder would replace it with U+FFFD and merge two strings).
    for (const lone of ['blobbi-\ud83d', 'blobbi-\udc23', '\udc23\ud83d']) {
      expect(() => deriveBlobbiV3Seed(ALICE, lone)).toThrow(TypeError);
      expect(getBlobbiV3Seed({ pubkey: ALICE, tags: [['d', lone]] })).toBeUndefined();
    }
    expect(() => deriveBlobbiV3Seed(ALICE, 'blobbi-�')).not.toThrow();
  });

  it('10. exactly one non-empty d tag: none, an empty one or two of them is no address, so no seed and no modern V3 Blobbi', () => {
    const egg = bornV3();
    const withoutD = egg.filter((t) => t[0] !== 'd');
    const cases: [string, string[][]][] = [
      ['missing', withoutD],
      ['empty', [['d', ''], ...withoutD]],
      ['valueless', [['d'], ...withoutD]],
      ['two, the same', [...egg, ['d', d]]],
      ['two, different', [...egg, ['d', getCanonicalBlobbiD(ALICE, '0000000001')]]],
    ];
    for (const [name, tags] of cases) {
      expect(getBlobbiV3Seed({ pubkey: ALICE, tags }), name).toBeUndefined();
      expect(parseBlobbiV3Identity({ pubkey: ALICE, tags }).missing, name).toContain('seed');
      expect(classifyBlobbiEvent(event(ALICE, tags)), name).not.toBe('modern');
      expect(() => getOrDeriveSeed(event(ALICE, tags)), name).toThrow(/V3/);
    }
    // A d tag's extra elements are not part of the address.
    expect(getBlobbiV3Seed({ pubkey: ALICE, tags: [['d', d, 'extra']] })).toBe(deriveBlobbiV3Seed(ALICE, d));
    // Without an author there is no address either.
    expect(getBlobbiV3Seed({ tags: [['d', d]] })).toBeUndefined();
  });
});

describe('11. V1 and V2 are untouched', () => {
  it('keep their seed tag, derived once from the birth time too, and read it as before', () => {
    for (const generation of ['v1', 'v2'] as const) {
      const tags = buildEggTags(ALICE, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: generation });
      const d = getTagValue(tags, 'd')!;
      expect(getTagValue(tags, 'seed')).toBe(deriveBlobbiSeedV1(ALICE, d, CREATED_AT));
      const companion = parseBlobbiEvent(event(ALICE, tags))!;
      expect(companion.seed).toBe(getTagValue(tags, 'seed'));
      expect(companion.v3Identity).toBeUndefined();
      // A stated seed is theirs to read, address or not: the same tags under another author are the same V1/V2 Blobbi visually.
      expect(parseBlobbiEvent(event(BOB, tags))!.visualTraits).toEqual(companion.visualTraits);
      expect(getTagValue(evolve(hatch(tags)), 'seed')).toBe(getTagValue(tags, 'seed'));
    }
  });
});
