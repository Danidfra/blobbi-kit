/**
 * V3 IDENTITY ON THE EVENT: the address, the algorithm version, and nothing
 * else.
 *
 * A procedural Blobbi's whole intrinsic identity (colours, anatomy, pattern,
 * mark, belly, freckles, every proportion) is Algorithm 1's function of the
 * seed its address derives, so its event states none of it: no seed, no
 * colour, no trait. These tests pin that contract through every path the kit
 * writes an event by, pin that a replacement event at the same address can
 * restate nothing about who the Blobbi is, and pin that V1 and V2 keep their
 * seed and its mirrors exactly as before.
 */
import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import {
  KIND_BLOBBI_STATE,
  MANAGED_BLOBBI_STATE_TAG_NAMES,
  NEW_BLOBBI_VISUAL_GENERATION,
  VISUAL_GENERATION_TAG,
  buildEggTags,
  classifyBlobbiEvent,
  deriveBlobbiSeedV1,
  deriveSeedIdentity,
  deriveVisualTraits,
  getCanonicalBlobbiD,
  getTagValue,
  parseBlobbiEvent,
  updateBlobbiTags,
} from './blobbi';
import { getPersistentTagNames, getTagSchema, validateAndRepairBlobbiTags } from './blobbi-tag-schema';
import {
  BLOBBI_MIRRORED_COLOR_TAG_NAMES,
  BLOBBI_MIRRORED_IDENTITY_TAG_NAMES,
  BLOBBI_V3_ABSENT_TAG_NAMES,
  BLOBBI_V3_RETIRED_TAG_NAMES,
  BLOBBI_V3_TAGS,
  BLOBBI_V3_TAG_NAMES,
  NEW_BLOBBI_V3_ALGORITHM,
  VISUAL_ALGORITHM_TAG,
  deriveBlobbiV3Seed,
  parseBlobbiV3Identity,
} from './blobbi-v3-identity';
import { getBlobbiVisualIdentity } from './blobbi-visual-identity';

const PUBKEY = 'a'.repeat(64);
const PET_ID = '3196847fb5';
const CREATED_AT = 1_700_000_000;
const D = getCanonicalBlobbiD(PUBKEY, PET_ID);
/** The V1/V2 seed: stated in the `seed` tag, derived once from the birth time too. */
const SEED = deriveBlobbiSeedV1(PUBKEY, D, CREATED_AT);
/** The V3 seed: the address, hashed. No tag states it. */
const V3_SEED = deriveBlobbiV3Seed(PUBKEY, D);
const MIRRORS = deriveSeedIdentity(SEED);

const makeEvent = (tags: string[][], pubkey = PUBKEY): NostrEvent => ({ id: 'e'.repeat(64), pubkey, created_at: CREATED_AT, kind: KIND_BLOBBI_STATE, tags, content: '', sig: '0'.repeat(128) });
const born = (generation: 'v1' | 'v2') => buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: generation });
const bornV3 = () => buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3' });
const companionOf = (tags: string[][]) => parseBlobbiEvent(makeEvent(tags))!;
/** Everything a host and a renderer are handed about who a V3 Blobbi is. */
const resolvedOf = (tags: string[][]) => {
  const companion = companionOf(tags);
  return { seed: companion.seed, v3Identity: companion.v3Identity, projection: getBlobbiVisualIdentity(companion), visualTraits: companion.visualTraits, adultType: companion.adultType };
};
const colourTags = (tags: string[][]) => Object.fromEntries(BLOBBI_MIRRORED_COLOR_TAG_NAMES.map((name) => [name, getTagValue(tags, name)]));
const withTag = (tags: string[][], name: string, value: string) => [...tags.filter((t) => t[0] !== name), [name, value]];
/** The three lifecycle republishes, through the kit's own pipeline. */
const hatch = (tags: string[][]) => validateAndRepairBlobbiTags(updateBlobbiTags(tags, { stage: 'baby', state: 'active' }), tags, { cleanupTaskTags: true }).tags;
const evolve = (tags: string[][]) => validateAndRepairBlobbiTags(updateBlobbiTags(tags, { stage: 'adult', progression_state: 'none' }), tags, { cleanupTaskTags: true }).tags;
const care = (tags: string[][]) => updateBlobbiTags(tags, { hunger: '77', last_interaction: String(CREATED_AT + 60) });

/** Every intrinsic tag an attacker might write into a replacement, with values a V3 Blobbi could plausibly have. */
const FORGERIES: [string, string][] = [
  ['seed', 'f'.repeat(64)],
  ['seed', SEED],
  ['base_color', '#000000'],
  ['secondary_color', '#ffffff'],
  ['eye_color', '#ff0000'],
  ['accent_color', '#00ff00'],
  ['antenna', 'double'],
  ['antenna', 'none'],
  ['horns', 'side'],
  ['horns', 'none'],
  ['ears', 'pointed'],
  ['tail', 'leaf'],
  ['pattern', 'striped'],
  ['pattern', 'solid'],
  ['special_mark', 'moon'],
  ['special_mark', 'none'],
  ['belly', 'true'],
  ['belly', 'false'],
  ['freckles', 'true'],
  ['freckles', 'false'],
  ['size', 'large'],
  ['adult_type', 'catti'],
];

describe('the vocabulary', () => {
  it('a V3 event states one identity tag (the algorithm version); everything else it does not carry is named', () => {
    expect(BLOBBI_V3_TAGS).toEqual({ algorithm: 'visual_algorithm' });
    expect(BLOBBI_V3_TAG_NAMES).toEqual(['visual_algorithm']);
    expect(VISUAL_ALGORITHM_TAG).toBe('visual_algorithm');
    expect(NEW_BLOBBI_V3_ALGORITHM).toBe(1);
    expect(BLOBBI_MIRRORED_COLOR_TAG_NAMES).toEqual(['base_color', 'secondary_color', 'eye_color']);
    expect(BLOBBI_MIRRORED_IDENTITY_TAG_NAMES).toEqual(['base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark']);
    expect(BLOBBI_V3_RETIRED_TAG_NAMES).toEqual(['accent_color', 'antenna', 'horns', 'ears', 'tail', 'belly', 'freckles']);
    expect(BLOBBI_V3_ABSENT_TAG_NAMES).toEqual(['seed', 'base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark', 'accent_color', 'antenna', 'horns', 'ears', 'tail', 'belly', 'freckles', 'size', 'adult_type']);
    for (const [name] of FORGERIES) expect(BLOBBI_V3_ABSENT_TAG_NAMES, name).toContain(name);
  });

  it('every tag stays managed exactly as before, so a V1 or V2 event is merged exactly as before', () => {
    for (const name of [VISUAL_ALGORITHM_TAG, ...BLOBBI_V3_RETIRED_TAG_NAMES, ...BLOBBI_MIRRORED_IDENTITY_TAG_NAMES, 'seed', 'size', 'adult_type']) {
      expect(MANAGED_BLOBBI_STATE_TAG_NAMES.has(name), name).toBe(true);
    }
    for (const name of BLOBBI_V3_RETIRED_TAG_NAMES) expect(getTagSchema(name)!.notes, name).toMatch(/RETIRED/);
    expect(getTagSchema(VISUAL_ALGORITHM_TAG)!.required).toBe(false);
    expect(getPersistentTagNames().has(VISUAL_ALGORITHM_TAG)).toBe(true);
  });
});

describe('creating a V3 Blobbi', () => {
  it('is opt-in: the ecosystem creation rule is still V2', () => {
    expect(NEW_BLOBBI_VISUAL_GENERATION).toBe('v2');
  });

  it('writes no intrinsic identity: the V2 egg without its seed and mirrors, plus the generation and the algorithm', () => {
    const v3 = bornV3();
    const v2 = born('v2');
    for (const name of BLOBBI_V3_ABSENT_TAG_NAMES) expect(getTagValue(v3, name), name).toBeUndefined();
    expect(v3.slice(-2)).toEqual([[VISUAL_GENERATION_TAG, 'v3'], [VISUAL_ALGORITHM_TAG, '1']]);
    const common = (tags: string[][]) => tags.filter((t) => !BLOBBI_V3_ABSENT_TAG_NAMES.includes(t[0]) && t[0] !== VISUAL_GENERATION_TAG && t[0] !== VISUAL_ALGORITHM_TAG);
    expect(common(v3)).toEqual(common(v2));
    expect(v3).toHaveLength(common(v2).length + 2);
  });

  it('needs nothing from the host, and refuses an address Nostr would not write', () => {
    expect(() => bornV3()).not.toThrow();
    expect(() => buildEggTags(PUBKEY.toUpperCase(), PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3' })).toThrow(TypeError);
  });

  it('a V1 and a V2 egg are exactly what they always were: the seed, then its six mirrors', () => {
    for (const generation of ['v1', 'v2'] as const) {
      const tags = born(generation);
      expect(getTagValue(tags, 'seed')).toBe(SEED);
      const mirrors = tags.filter((t) => ['base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark', 'size'].includes(t[0]));
      expect(mirrors).toEqual([
        ['base_color', MIRRORS.baseColor],
        ['secondary_color', MIRRORS.secondaryColor],
        ['eye_color', MIRRORS.eyeColor],
        ['pattern', MIRRORS.pattern],
        ['special_mark', MIRRORS.specialMark],
        ['size', MIRRORS.size],
      ]);
      for (const name of [VISUAL_ALGORITHM_TAG, ...BLOBBI_V3_RETIRED_TAG_NAMES]) expect(getTagValue(tags, name), name).toBeUndefined();
    }
    expect(getTagValue(born('v1'), VISUAL_GENERATION_TAG)).toBeUndefined();
    expect(getTagValue(born('v2'), VISUAL_GENERATION_TAG)).toBe('v2');
  });
});

describe('reading a V3 Blobbi', () => {
  it('is its address-derived seed and its algorithm version, with nothing missing', () => {
    const companion = companionOf(bornV3());
    expect(companion.visualGeneration).toBe('v3');
    expect(companion.seed).toBe(V3_SEED);
    expect(companion.v3Identity).toEqual({ seed: V3_SEED, algorithm: 1, missing: [] });
    expect(classifyBlobbiEvent(makeEvent(bornV3()))).toBe('modern');
    expect(companion.adultType).toBeUndefined();
    expect(parseBlobbiEvent(JSON.parse(JSON.stringify(makeEvent(bornV3()))))!.v3Identity).toEqual(companion.v3Identity);
  });

  it('hands a renderer exactly the seed and the algorithm: Algorithm 1 decides everything else', () => {
    const identity = getBlobbiVisualIdentity(companionOf(bornV3()));
    expect(identity.visualGeneration).toBe('v3');
    expect(identity.v3).toEqual({ seed: V3_SEED, algorithm: 1 });
    expect(JSON.parse(JSON.stringify(identity))).toEqual(identity);
    // The plain fields are the seed's in the older generations' mapping (documented as not a V3 Blobbi's colours).
    const mapped = deriveSeedIdentity(V3_SEED);
    expect([identity.baseColor, identity.pattern, identity.size]).toEqual([mapped.baseColor, mapped.pattern, mapped.size]);
  });

  it('reads it from tags and the author when the source is not a parsed companion; without an author there is no seed', () => {
    const companion = companionOf(bornV3());
    const minimal = getBlobbiVisualIdentity({ stage: 'baby', visualTraits: companion.visualTraits, allTags: bornV3(), event: { pubkey: PUBKEY } });
    expect(minimal.v3).toEqual({ seed: V3_SEED, algorithm: 1 });
    expect(getBlobbiVisualIdentity({ stage: 'baby', visualTraits: companion.visualTraits, allTags: bornV3() }).v3).toEqual({ algorithm: 1 });
  });

  it('reports the algorithm version as stated, whatever it is: whether it can be drawn is not core\'s to say', () => {
    const at = (value: string) => parseBlobbiV3Identity(makeEvent(withTag(bornV3(), VISUAL_ALGORITHM_TAG, value)));
    expect(at('2')).toEqual({ seed: V3_SEED, algorithm: 2, missing: [] });
    for (const bad of ['0', '-1', '1.5', 'one', '', '99999']) expect(at(bad), bad).toEqual({ seed: V3_SEED, missing: ['visual_algorithm'] });
    expect(parseBlobbiV3Identity(makeEvent(bornV3().filter((t) => t[0] !== VISUAL_ALGORITHM_TAG)))).toEqual({ seed: V3_SEED, missing: ['visual_algorithm'] });
    expect(parseBlobbiV3Identity({ tags: [] })).toEqual({ missing: ['seed', 'visual_algorithm'] });
    const future = withTag(bornV3(), VISUAL_ALGORITHM_TAG, '2');
    expect(getBlobbiVisualIdentity(companionOf(future)).v3).toEqual({ seed: V3_SEED, algorithm: 2 });
    expect(getTagValue(care(future), VISUAL_ALGORITHM_TAG)).toBe('2');
    expect(getTagValue(evolve(hatch(future)), VISUAL_ALGORITHM_TAG)).toBe('2');
  });

  it('a V1 or V2 companion has no V3 identity, whatever tags it carries', () => {
    for (const generation of ['v1', 'v2'] as const) {
      const tags = [...born(generation), [VISUAL_ALGORITHM_TAG, '1'], ['antenna', 'double'], ['horns', 'side']];
      const companion = companionOf(tags);
      expect(companion.visualGeneration).toBe(generation);
      expect(companion.v3Identity).toBeUndefined();
      expect(getBlobbiVisualIdentity(companion).v3).toBeUndefined();
      expect(getBlobbiVisualIdentity(companion).baseColor).toBe(MIRRORS.baseColor);
    }
  });
});

describe('a replacement event cannot restate who a V3 Blobbi is', () => {
  const canonical = resolvedOf(bornV3());

  it.each(FORGERIES)('inserting %s = %s changes nothing that is read', (name, value) => {
    for (const stage of [bornV3(), hatch(bornV3()), evolve(hatch(bornV3()))]) {
      const forged = withTag(stage, name, value);
      const resolved = resolvedOf(forged);
      const honest = resolvedOf(stage);
      expect(resolved.seed).toBe(canonical.seed);
      expect(resolved.v3Identity).toEqual(canonical.v3Identity);
      expect(resolved.projection).toEqual(honest.projection);
      expect(resolved.visualTraits).toEqual(honest.visualTraits);
      expect(resolved.adultType).toBeUndefined();
      expect(classifyBlobbiEvent(makeEvent(forged))).toBe('modern');
    }
  });

  it('every forged tag at once, in any letter case and repeated, still changes nothing', () => {
    const everything = [...bornV3(), ...FORGERIES, ...FORGERIES.map(([n, v]) => [n, v.toUpperCase()])];
    expect(resolvedOf(everything).v3Identity).toEqual(canonical.v3Identity);
    expect(resolvedOf(everything).projection).toEqual(canonical.projection);
    expect(resolvedOf(everything).visualTraits).toEqual(canonical.visualTraits);
  });

  it('and every kit write drops what was forged, through egg, baby and adult, and no repair brings it back', () => {
    const forged = [...bornV3(), ...FORGERIES];
    for (const republished of [care(forged), hatch(forged), evolve(hatch(forged)), care(care(evolve(hatch(care(forged)))))]) {
      for (const name of BLOBBI_V3_ABSENT_TAG_NAMES) expect(getTagValue(republished, name), name).toBeUndefined();
      expect(resolvedOf(republished).v3Identity).toEqual(canonical.v3Identity);
    }
    for (const [name, value] of FORGERIES) expect(getTagValue(updateBlobbiTags(bornV3(), { [name]: value }), name), name).toBeUndefined();
    const repaired = validateAndRepairBlobbiTags(bornV3(), forged);
    for (const name of BLOBBI_V3_ABSENT_TAG_NAMES) expect(getTagValue(repaired.tags, name), name).toBeUndefined();
    expect(repaired.errors).toEqual([]);
  });

  it('a V3 republish keeps the generation, the algorithm and every non-identity tag; nothing is invented', () => {
    const tags = bornV3();
    for (const republished of [care(tags), hatch(tags), evolve(hatch(tags))]) {
      expect(getTagValue(republished, VISUAL_GENERATION_TAG)).toBe('v3');
      expect(getTagValue(republished, VISUAL_ALGORITHM_TAG)).toBe('1');
      expect(republished.filter((t) => t[0] === VISUAL_ALGORITHM_TAG)).toHaveLength(1);
    }
    const dropped = tags.filter((t) => t[0] !== VISUAL_ALGORITHM_TAG);
    expect(getTagValue(validateAndRepairBlobbiTags(dropped, tags).tags, VISUAL_ALGORITHM_TAG)).toBe('1');
    expect(getTagValue(validateAndRepairBlobbiTags(dropped, dropped).tags, VISUAL_ALGORITHM_TAG)).toBeUndefined();
  });
});

describe('V1 and V2 keep their seed and its mirrors exactly as before', () => {
  const STALE = { base_color: '#000000', secondary_color: '#111111', eye_color: '#222222' };
  const stale = (tags: string[][]) => Object.entries(STALE).reduce((acc, [name, value]) => withTag(acc, name, value), tags);

  it.each(['v1', 'v2'] as const)('%s: the colour tags are rewritten from the seed on every republish', (generation) => {
    const tags = born(generation);
    for (const republish of [care, hatch, evolve]) {
      expect(colourTags(republish(stale(tags))), republish.name).toEqual({ base_color: MIRRORS.baseColor, secondary_color: MIRRORS.secondaryColor, eye_color: MIRRORS.eyeColor });
    }
    expect(getTagValue(care(tags.filter((t) => t[0] !== 'base_color')), 'base_color')).toBe(MIRRORS.baseColor);
  });

  it.each(['v1', 'v2'] as const)('%s: nothing reads them: the parsed traits are the seed\'s whatever the tags say', (generation) => {
    const companion = companionOf(stale(born(generation)));
    expect(companion.visualTraits).toEqual(MIRRORS);
    expect(deriveVisualTraits(stale(born(generation)), SEED)).toEqual(MIRRORS);
    expect(companion.v3Identity).toBeUndefined();
  });

  it.each(['v1', 'v2'] as const)('%s: the republished event is byte for byte what it was before V3 existed', (generation) => {
    const republished = care(born(generation));
    const tail = republished.filter((t) => ['base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark', 'size'].includes(t[0]));
    expect(tail).toEqual([
      ['base_color', MIRRORS.baseColor],
      ['secondary_color', MIRRORS.secondaryColor],
      ['eye_color', MIRRORS.eyeColor],
      ['pattern', MIRRORS.pattern],
      ['special_mark', MIRRORS.specialMark],
      ['size', MIRRORS.size],
    ]);
    expect(republished.slice(-6)).toEqual(tail);
  });

  it.each(['v1', 'v2'] as const)('%s: an adult carries the seed\'s size and adult form', (generation) => {
    const adult = evolve(hatch(born(generation)));
    expect(getTagValue(adult, 'size')).toBe(MIRRORS.size);
    expect(getTagValue(adult, 'adult_type')).toBeDefined();
    expect(companionOf(adult).adultType).toBe(getTagValue(adult, 'adult_type'));
  });

  it('turning the generation marker of a V3 event to V2 leaves an event with no seed: legacy, and a stated seed makes it V2 again', () => {
    const asV2 = withTag(bornV3(), VISUAL_GENERATION_TAG, 'v2');
    expect(classifyBlobbiEvent(makeEvent(asV2))).toBe('legacy');
    const seeded = [...asV2, ['seed', SEED]];
    expect(companionOf(seeded).visualTraits.baseColor).toBe(MIRRORS.baseColor);
    expect(getTagValue(care(seeded), 'base_color')).toBe(MIRRORS.baseColor);
  });
});
