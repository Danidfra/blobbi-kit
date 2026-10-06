/**
 * V3 IDENTITY ON THE EVENT, in the generation-independent vocabulary.
 *
 * A procedural Blobbi states its semantic identity in plain tags: its
 * colours (`base_color`, `secondary_color`, `eye_color`, `accent_color`), its
 * anatomy (`antenna`, `horns`, `ears`, `tail`) and its surface (`pattern`,
 * `special_mark`, `belly`, `freckles`), plus `visual_algorithm`. Five of
 * those names are the ones V1 and V2 Blobbis carry as MIRRORS OF THE SEED
 * (the three colours, `pattern`, `special_mark`). These tests pin both
 * readings of them, side by side: mirrors on V1 and V2, exactly as before;
 * explicit, authoritative identity on V3, through every path the kit
 * republishes an event by. A V3 event has no `size` and no `adult_type`.
 */
import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import {
  KIND_BLOBBI_STATE,
  MANAGED_BLOBBI_STATE_TAG_NAMES,
  BLOBBI_PATTERNS,
  BLOBBI_SPECIAL_MARKS,
  NEW_BLOBBI_VISUAL_GENERATION,
  VISUAL_GENERATION_TAG,
  buildEggTags,
  classifyBlobbiEvent,
  deriveBlobbiSeedV1,
  deriveSeedIdentity,
  deriveVisualTraits,
  getCanonicalBlobbiD,
  getOrDeriveSeed,
  getTagValue,
  isLegacyBlobbiEvent,
  parseBlobbiEvent,
  updateBlobbiTags,
} from './blobbi';
import { getPersistentTagNames, getTagSchema, validateAndRepairBlobbiTags } from './blobbi-tag-schema';
import {
  BLOBBI_MIRRORED_COLOR_TAG_NAMES,
  BLOBBI_MIRRORED_IDENTITY_TAG_NAMES,
  BLOBBI_V3_ABSENT_TAG_NAMES,
  BLOBBI_V3_ONLY_TAG_NAMES,
  BLOBBI_V3_PATTERN_KINDS,
  BLOBBI_V3_SPECIAL_MARK_KINDS,
  BLOBBI_V3_TAGS,
  BLOBBI_V3_TAG_NAMES,
  VISUAL_ALGORITHM_TAG,
  BLOBBI_V3_SEED_LENGTH,
  blobbiV3IdentityTags,
  canonicalBlobbiV3Seed,
  normalizeBlobbiV3Color,
  parseBlobbiV3Identity,
  validateBlobbiV3Identity,
  type BlobbiV3Identity,
} from './blobbi-v3-identity';
import { getBlobbiVisualIdentity } from './blobbi-visual-identity';

const PUBKEY = 'a'.repeat(64);
const PET_ID = '3196847fb5';
const CREATED_AT = 1_700_000_000;
const SEED = deriveBlobbiSeedV1(PUBKEY, getCanonicalBlobbiD(PUBKEY, PET_ID), CREATED_AT);
const MIRRORS = deriveSeedIdentity(SEED);
/** A pattern this seed's mirror is NOT, so a rewrite from the seed would show. (`moon` is no mirror's mark at all.) */
const STATED_PATTERN = MIRRORS.pattern === 'striped' ? 'gradient' : 'striped';

/** A complete identity, as a renderer's creation rule would return it for a seed. Its colours are NOT the seed mirrors. */
const identityFor = (seed: string): BlobbiV3Identity => ({
  seed,
  algorithm: 1,
  colors: { base: '#3fb7a5', secondary: '#2a6f8f', eye: '#5a2d12', accent: '#e86a5c' },
  traits: { antenna: 'double', horns: 'none', ears: 'pointed', tail: 'curl', pattern: STATED_PATTERN, specialMark: 'moon', belly: false, freckles: true },
});

const makeEvent = (tags: string[][]): NostrEvent => ({ id: 'e'.repeat(64), pubkey: PUBKEY, created_at: CREATED_AT, kind: KIND_BLOBBI_STATE, tags, content: '', sig: '0'.repeat(128) });
const born = (generation: 'v1' | 'v2') => buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: generation });
const bornV3 = () => buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: identityFor });
const identityOf = (tags: string[][]) => parseBlobbiEvent(makeEvent(tags))!.v3Identity;
const colourTags = (tags: string[][]) => Object.fromEntries(BLOBBI_MIRRORED_COLOR_TAG_NAMES.map((name) => [name, getTagValue(tags, name)]));
const withTag = (tags: string[][], name: string, value: string) => tags.map((t) => (t[0] === name ? [name, value] : t));
/** The three lifecycle republishes, through the kit's own pipeline. */
const hatch = (tags: string[][]) => validateAndRepairBlobbiTags(updateBlobbiTags(tags, { stage: 'baby', state: 'active' }), tags, { cleanupTaskTags: true }).tags;
const evolve = (tags: string[][]) => validateAndRepairBlobbiTags(updateBlobbiTags(tags, { stage: 'adult', progression_state: 'none' }), tags, { cleanupTaskTags: true }).tags;
const care = (tags: string[][]) => updateBlobbiTags(tags, { hunger: '77', last_interaction: String(CREATED_AT + 60) });

describe('the vocabulary', () => {
  it('is generation-independent: plain names, the three existing colour tags among them, no v3_ prefix anywhere', () => {
    expect(BLOBBI_V3_TAGS).toEqual({
      algorithm: 'visual_algorithm',
      baseColor: 'base_color',
      secondaryColor: 'secondary_color',
      eyeColor: 'eye_color',
      accentColor: 'accent_color',
      antenna: 'antenna',
      horns: 'horns',
      ears: 'ears',
      tail: 'tail',
      pattern: 'pattern',
      specialMark: 'special_mark',
      belly: 'belly',
      freckles: 'freckles',
    });
    expect(VISUAL_ALGORITHM_TAG).toBe('visual_algorithm');
    expect(BLOBBI_MIRRORED_COLOR_TAG_NAMES).toEqual(['base_color', 'secondary_color', 'eye_color']);
    expect(BLOBBI_MIRRORED_IDENTITY_TAG_NAMES).toEqual(['base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark']);
    expect(BLOBBI_V3_ONLY_TAG_NAMES).toEqual(['visual_algorithm', 'accent_color', 'antenna', 'horns', 'ears', 'tail', 'belly', 'freckles']);
    expect(BLOBBI_V3_ABSENT_TAG_NAMES).toEqual(['size', 'adult_type']);
    for (const tags of [bornV3(), born('v1'), born('v2')]) expect(tags.some((t) => t[0].startsWith('v3_'))).toBe(false);
  });

  it('has one vocabulary per tag: the pattern words are every generation\'s, and a V3 mark is a marking (no blush; a moon instead)', () => {
    expect(BLOBBI_V3_PATTERN_KINDS).toEqual(['solid', 'spotted', 'striped', 'gradient']);
    expect([...BLOBBI_V3_PATTERN_KINDS]).toEqual([...BLOBBI_PATTERNS]);
    expect(BLOBBI_V3_SPECIAL_MARK_KINDS).toEqual(['none', 'star', 'heart', 'sparkle', 'moon']);
    // The older generations' list is untouched (a seed indexes into it), blush and all.
    expect([...BLOBBI_SPECIAL_MARKS]).toEqual(['none', 'star', 'heart', 'sparkle', 'blush']);
  });

  it('has no `spots` tag: a V3 Blobbi has one pattern, not independent markings', () => {
    const v3 = bornV3();
    expect(getTagValue(v3, 'spots')).toBeUndefined();
    expect(getTagSchema('spots')).toBeUndefined();
    expect(BLOBBI_V3_TAG_NAMES).not.toContain('spots');
    expect(v3.filter((t) => t[0] === 'pattern')).toEqual([['pattern', STATED_PATTERN]]);
    expect(v3.filter((t) => t[0] === 'special_mark')).toEqual([['special_mark', 'moon']]);
  });

  it('a V3 event carries no `size` and no `adult_type`, at birth or ever after; V1 and V2 carry both as before', () => {
    const v3 = bornV3();
    for (const tags of [v3, care(v3), hatch(v3), evolve(hatch(v3))]) {
      expect(getTagValue(tags, 'size')).toBeUndefined();
      expect(getTagValue(tags, 'adult_type')).toBeUndefined();
    }
    expect(parseBlobbiEvent(makeEvent(evolve(hatch(v3))))!.adultType).toBeUndefined();
    for (const generation of ['v1', 'v2'] as const) {
      expect(getTagValue(born(generation), 'size')).toBe(MIRRORS.size);
      const adult = evolve(hatch(born(generation)));
      expect(getTagValue(adult, 'size')).toBe(MIRRORS.size);
      expect(getTagValue(adult, 'adult_type')).toBeDefined();
      expect(parseBlobbiEvent(makeEvent(adult))!.adultType).toBe(getTagValue(adult, 'adult_type'));
    }
  });
});

describe('creating a V3 Blobbi', () => {
  it('is opt-in: the ecosystem creation rule is still V2, and a V1 or V2 egg carries none of the V3-only tags', () => {
    expect(NEW_BLOBBI_VISUAL_GENERATION).toBe('v2');
    for (const tags of [buildEggTags(PUBKEY, PET_ID, CREATED_AT), born('v1'), born('v2')]) {
      for (const name of BLOBBI_V3_ONLY_TAG_NAMES) expect(getTagValue(tags, name), name).toBeUndefined();
    }
    // A V3 identity handed to another generation is ignored entirely: the egg is byte for byte the plain one.
    expect(buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v2', v3: identityFor })).toEqual(born('v2'));
  });

  it('writes exactly this tag set: the colours in the tags every Blobbi has, the rest after the generation', () => {
    const v3 = bornV3();
    const v2 = born('v2');
    expect(getTagValue(v3, VISUAL_GENERATION_TAG)).toBe('v3');
    expect(getTagValue(v3, 'seed')).toBe(SEED);
    // The whole identity, as an example a reader can check against the documentation.
    expect(v3.filter((t) => BLOBBI_V3_TAG_NAMES.includes(t[0]) || t[0] === VISUAL_GENERATION_TAG || t[0] === 'seed')).toEqual([
      ['seed', SEED],
      ['base_color', '#3fb7a5'],
      ['secondary_color', '#2a6f8f'],
      ['eye_color', '#5a2d12'],
      ['pattern', STATED_PATTERN],
      ['special_mark', 'moon'],
      ['visual_generation', 'v3'],
      ['visual_algorithm', '1'],
      ['accent_color', '#e86a5c'],
      ['antenna', 'double'],
      ['horns', 'none'],
      ['ears', 'pointed'],
      ['tail', 'curl'],
      ['belly', 'false'],
      ['freckles', 'true'],
    ]);
    // Each identity tag exactly once.
    for (const name of BLOBBI_V3_TAG_NAMES) expect(v3.filter((t) => t[0] === name), name).toHaveLength(1);
    // Up to the generation tag a V3 egg is a V2 egg without its `size`, in every tag but the five it states for itself.
    const head = (tags: string[][]) => tags.slice(0, tags.findIndex((t) => t[0] === VISUAL_GENERATION_TAG));
    expect(head(v3).map((t) => t[0])).toEqual(head(v2).map((t) => t[0]).filter((name) => name !== 'size'));
    const unstated = (tags: string[][]) => head(tags).filter((t) => !BLOBBI_MIRRORED_IDENTITY_TAG_NAMES.includes(t[0]) && t[0] !== 'size');
    expect(unstated(v3)).toEqual(unstated(v2));
    // And those three are the identity's, not the seed's.
    expect(colourTags(v3)).toEqual({ base_color: '#3fb7a5', secondary_color: '#2a6f8f', eye_color: '#5a2d12' });
    expect(colourTags(v2)).toEqual({ base_color: MIRRORS.baseColor, secondary_color: MIRRORS.secondaryColor, eye_color: MIRRORS.eyeColor });
    expect(colourTags(v3)).not.toEqual(colourTags(v2));
  });

  it('takes the identity as a value or as a function of the new seed (the one moment the seed decides it)', () => {
    expect(buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: identityFor(SEED) })).toEqual(bornV3());
    let seen = '';
    buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: (seed) => ((seen = seed), identityFor(seed)) });
    // The Blobbi's one seed: the existing seed tag, nothing derived from it for V3.
    expect(seen).toBe(SEED);
  });

  it('is never born with a missing, partial, malformed or foreign identity', () => {
    const build = (v3: unknown) => () => buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: v3 as never });
    expect(build(undefined)).toThrow(/needs its identity/);
    expect(build({ ...identityFor(SEED), colors: { base: '#3fb7a5' } })).toThrow(/colors\.secondary/);
    expect(build({ ...identityFor(SEED), colors: { ...identityFor(SEED).colors, base: 'red' } })).toThrow(/colors\.base/);
    expect(build({ ...identityFor(SEED), traits: { ...identityFor(SEED).traits, horns: 'antlers' } })).toThrow(/traits\.horns/);
    expect(build({ ...identityFor(SEED), algorithm: 0 })).toThrow(/algorithm/);
    expect(build(identityFor('f'.repeat(64)))).toThrow(/another seed/);
  });

  it('omits accent_color for a Blobbi with no accent colour, and reads that back as none, with nothing missing', () => {
    const { accent: _accent, ...colors } = identityFor(SEED).colors;
    const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: { ...identityFor(SEED), colors } });
    expect(getTagValue(tags, 'accent_color')).toBeUndefined();
    const parsed = parseBlobbiV3Identity(tags);
    expect(parsed.colors.accent).toBeUndefined();
    expect(parsed.missing).toEqual([]);
  });
});

describe('the three colour tags: mirrors on V1 and V2, explicit identity on V3', () => {
  const STALE = { base_color: '#000000', secondary_color: '#111111', eye_color: '#222222' };
  const stale = (tags: string[][]) => Object.entries(STALE).reduce((acc, [name, value]) => withTag(acc, name, value), tags);

  it.each(['v1', 'v2'] as const)('%s: they are rewritten from the seed on every republish, exactly as before', (generation) => {
    const tags = born(generation);
    expect(colourTags(tags)).toEqual({ base_color: MIRRORS.baseColor, secondary_color: MIRRORS.secondaryColor, eye_color: MIRRORS.eyeColor });
    // Whatever they are changed to, a care update, a hatch and an evolution each put the seed's back.
    for (const republish of [care, hatch, evolve]) {
      expect(colourTags(republish(stale(tags))), republish.name).toEqual({ base_color: MIRRORS.baseColor, secondary_color: MIRRORS.secondaryColor, eye_color: MIRRORS.eyeColor });
    }
    // A missing one is put back too.
    expect(getTagValue(care(tags.filter((t) => t[0] !== 'base_color')), 'base_color')).toBe(MIRRORS.baseColor);
  });

  it.each(['v1', 'v2'] as const)('%s: nothing reads them: the parsed traits are the seed\'s whatever the tags say', (generation) => {
    const companion = parseBlobbiEvent(makeEvent(stale(born(generation))))!;
    expect(companion.visualTraits).toEqual(MIRRORS);
    expect(deriveVisualTraits(stale(born(generation)), SEED)).toEqual(MIRRORS);
    const identity = getBlobbiVisualIdentity(companion);
    expect([identity.baseColor, identity.secondaryColor, identity.eyeColor]).toEqual([MIRRORS.baseColor, MIRRORS.secondaryColor, MIRRORS.eyeColor]);
    expect(identity.v3).toBeUndefined();
    expect(companion.v3Identity).toBeUndefined();
  });

  it.each(['v1', 'v2'] as const)('%s: the republished event is byte for byte what it was before V3 existed', (generation) => {
    // The mirror order and values are part of the established behaviour: colours, then pattern, mark, size.
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

  it('v3: they are never recalculated: a care update, a hatch and an evolution all keep them exactly', () => {
    const tags = bornV3();
    for (const republish of [care, hatch, evolve]) {
      expect(colourTags(republish(tags)), republish.name).toEqual({ base_color: '#3fb7a5', secondary_color: '#2a6f8f', eye_color: '#5a2d12' });
      expect(getTagValue(republish(tags), 'accent_color')).toBe('#e86a5c');
    }
    // Any colour the event states is the Blobbi's: a changed one stays changed.
    const repainted = withTag(tags, 'base_color', '#d9534f');
    expect(getTagValue(care(repainted), 'base_color')).toBe('#d9534f');
    expect(getTagValue(evolve(hatch(repainted)), 'base_color')).toBe('#d9534f');
  });

  it('v3: they are what is read: the parsed traits and the projection carry the stated colours', () => {
    const companion = parseBlobbiEvent(makeEvent(bornV3()))!;
    // (The record keeps the older generations' shape: `moon` is a mark it has no word for, and `size` is not on the event.)
    expect(companion.visualTraits).toEqual({ ...MIRRORS, baseColor: '#3fb7a5', secondaryColor: '#2a6f8f', eyeColor: '#5a2d12', pattern: STATED_PATTERN, specialMark: 'none' });
    expect(companion.v3Identity!.traits).toMatchObject({ pattern: STATED_PATTERN, specialMark: 'moon' });
    const identity = getBlobbiVisualIdentity(companion);
    expect([identity.baseColor, identity.secondaryColor, identity.eyeColor]).toEqual(['#3fb7a5', '#2a6f8f', '#5a2d12']);
  });

  it('v3: its pattern and special mark are never recalculated either: a care update, a hatch and an evolution keep them exactly', () => {
    const tags = bornV3();
    // What it states is not what its seed mirrors, so a rewrite from the seed would show.
    expect(STATED_PATTERN).not.toBe(MIRRORS.pattern);
    expect(MIRRORS.specialMark).not.toBe('moon');
    for (const republish of [care, hatch, (t: string[][]) => evolve(hatch(t)), (t: string[][]) => care(care(evolve(hatch(care(t)))))]) {
      const after = republish(tags);
      expect(after.filter((t) => t[0] === 'pattern')).toEqual([['pattern', STATED_PATTERN]]);
      expect(after.filter((t) => t[0] === 'special_mark')).toEqual([['special_mark', 'moon']]);
      expect(identityOf(after)).toEqual(identityOf(tags));
    }
    // Whatever the event states is the Blobbi's: a changed one stays changed, and a value no V3 has is left as it is, reported, never "repaired" from the seed.
    for (const pattern of BLOBBI_V3_PATTERN_KINDS) expect(getTagValue(evolve(hatch(care(withTag(tags, 'pattern', pattern)))), 'pattern')).toBe(pattern);
    for (const mark of BLOBBI_V3_SPECIAL_MARK_KINDS) expect(getTagValue(evolve(hatch(care(withTag(tags, 'special_mark', mark)))), 'special_mark')).toBe(mark);
    const odd = care(withTag(tags, 'pattern', 'plaid'));
    expect(getTagValue(odd, 'pattern')).toBe('plaid');
    expect(identityOf(odd)!.missing).toEqual(['pattern']);
    expect(identityOf(odd)!.traits.pattern).toBeUndefined();
  });

  it('v3: the mirror sync adds nothing: no colour, pattern or mark the event does not state, and it drops the size and adult form an older event carried', () => {
    const tags = bornV3();
    // An event from before the contract settled: it carried the older generations' mirrors.
    const old = [...tags, ['size', 'large'], ['adult_type', 'catti'], ['spots', 'true']];
    const cleaned = care(old);
    expect(getTagValue(cleaned, 'size')).toBeUndefined();
    expect(getTagValue(cleaned, 'adult_type')).toBeUndefined();
    expect(getTagValue(evolve(hatch(old)), 'adult_type')).toBeUndefined();
    // (`spots` means nothing any more: it rides along as any unknown tag does, and nothing reads it.)
    expect(identityOf(cleaned)).toEqual(identityOf(tags));
    for (const name of ['pattern', 'special_mark'] as const) {
      const never = tags.filter((t) => t[0] !== name);
      expect(getTagValue(care(never), name)).toBeUndefined();
      expect(getTagValue(evolve(hatch(never)), name)).toBeUndefined();
      expect(identityOf(care(never))!.missing).toEqual([name]);
    }
    // An event that never stated a colour does not get the seed's written into it by a republish.
    const never = tags.filter((t) => t[0] !== 'eye_color');
    expect(getTagValue(updateBlobbiTags(never, { hunger: '50' }), 'eye_color')).toBeUndefined();
    expect(identityOf(updateBlobbiTags(never, { hunger: '50' }))!.missing).toEqual(['eye_color']);
  });

  it('turning the generation marker is what switches the reading, in both directions', () => {
    // The same tags read as V2: mirrors again, and the next republish rewrites them.
    const asV2 = withTag(bornV3(), VISUAL_GENERATION_TAG, 'v2');
    expect(parseBlobbiEvent(makeEvent(asV2))!.visualTraits.baseColor).toBe(MIRRORS.baseColor);
    expect(getTagValue(care(asV2), 'base_color')).toBe(MIRRORS.baseColor);
    // An unknown generation is V1, so the same.
    expect(getTagValue(care(withTag(bornV3(), VISUAL_GENERATION_TAG, 'v4')), 'base_color')).toBe(MIRRORS.baseColor);
  });
});

describe('reading a V3 identity', () => {
  it('round-trips: what creation wrote is what an event reads back, with nothing missing', () => {
    const companion = parseBlobbiEvent(makeEvent(bornV3()))!;
    expect(companion.visualGeneration).toBe('v3');
    expect(companion.v3Identity).toEqual({ ...identityFor(SEED), missing: [] });
    // Through JSON, as a relay would carry it.
    expect(parseBlobbiEvent(JSON.parse(JSON.stringify(makeEvent(bornV3()))))!.v3Identity).toEqual(companion.v3Identity);
    // parse -> serialize -> parse: the tag builder writes back exactly the identity tags the event has.
    const { missing: _missing, ...identity } = companion.v3Identity!;
    const rebuilt = blobbiV3IdentityTags(identity as BlobbiV3Identity);
    expect(rebuilt.map((t) => t[0])).toEqual(BLOBBI_V3_TAG_NAMES);
    for (const [name, value] of rebuilt) expect(getTagValue(bornV3(), name), name).toBe(value);
    expect(parseBlobbiV3Identity([['seed', SEED], ...rebuilt])).toEqual(companion.v3Identity);
  });

  it('is read for V3 only: a V1 or V2 companion has none, whatever tags it carries', () => {
    for (const generation of ['v1', 'v2'] as const) {
      const tags = [...born(generation), ...blobbiV3IdentityTags(identityFor(SEED)).filter((t) => BLOBBI_V3_ONLY_TAG_NAMES.includes(t[0]))];
      const companion = parseBlobbiEvent(makeEvent(tags))!;
      expect(companion.visualGeneration).toBe(generation);
      expect(companion.v3Identity).toBeUndefined();
      expect(getBlobbiVisualIdentity(companion).v3).toBeUndefined();
      expect(getBlobbiVisualIdentity(companion).baseColor).toBe(MIRRORS.baseColor);
    }
  });

  it('exposes what was stated and what was not: a missing or malformed field is absent and named, never filled in', () => {
    const tags = bornV3()
      .filter((t) => t[0] !== 'tail' && t[0] !== 'visual_algorithm')
      .map((t) => (t[0] === 'eye_color' ? ['eye_color', 'javascript:alert(1)'] : t[0] === 'belly' ? ['belly', 'yes'] : t[0] === 'special_mark' ? ['special_mark', 'blush'] : t[0] === 'accent_color' ? ['accent_color', '#12'] : t));
    const parsed = parseBlobbiV3Identity(tags);
    expect(parsed.missing.sort()).toEqual(['accent_color', 'belly', 'eye_color', 'special_mark', 'tail', 'visual_algorithm']);
    // The algorithm is not assumed: a missing one is missing.
    expect(parsed.algorithm).toBeUndefined();
    expect(parsed.colors).toEqual({ base: '#3fb7a5', secondary: '#2a6f8f' });
    expect(parsed.traits).toEqual({ antenna: 'double', horns: 'none', ears: 'pointed', pattern: STATED_PATTERN, freckles: true });
    // Total: nothing at all still parses, and says so.
    expect(parseBlobbiV3Identity([])).toEqual({ colors: {}, traits: {}, missing: ['seed', ...BLOBBI_V3_TAG_NAMES.filter((n) => n !== 'accent_color')] });
    // Parsing mutates nothing.
    const frozen = tags.map((t) => Object.freeze([...t])) as string[][];
    expect(() => parseBlobbiV3Identity(Object.freeze(frozen) as string[][])).not.toThrow();
  });

  it('reports the algorithm version as stated, whatever it is: whether it can be drawn is not core\'s to say', () => {
    expect(parseBlobbiV3Identity(withTag(bornV3(), 'visual_algorithm', '2')).algorithm).toBe(2);
    expect(parseBlobbiV3Identity(withTag(bornV3(), 'visual_algorithm', '2')).missing).toEqual([]);
    for (const bad of ['0', '-1', '1.5', 'one', '', '99999']) {
      const parsed = parseBlobbiV3Identity(withTag(bornV3(), 'visual_algorithm', bad));
      expect(parsed.algorithm, bad).toBeUndefined();
      expect(parsed.missing).toEqual(['visual_algorithm']);
    }
    // It reaches a renderer unchanged, and survives a republish unchanged.
    const future = withTag(bornV3(), 'visual_algorithm', '2');
    expect(getBlobbiVisualIdentity(parseBlobbiEvent(makeEvent(future))!).v3?.algorithm).toBe(2);
    expect(getTagValue(care(future), 'visual_algorithm')).toBe('2');
    expect(getTagValue(evolve(hatch(future)), 'visual_algorithm')).toBe('2');
  });

  it('canonicalizes colours and accepts only plain hex', () => {
    expect(normalizeBlobbiV3Color('#ABCDEF')).toBe('#abcdef');
    expect(normalizeBlobbiV3Color('#Fa0')).toBe('#ffaa00');
    for (const bad of ['abcdef', '#abcd', 'rgb(1,2,3)', '#12345g', '', undefined, 7, '#fff" onload="x']) expect(normalizeBlobbiV3Color(bad)).toBeUndefined();
    const result = validateBlobbiV3Identity({ ...identityFor(SEED), colors: { base: '#3FB7A5', secondary: '#2A6F8F', eye: '#5A2D12' } });
    expect(result.valid && result.identity.colors).toEqual({ base: '#3fb7a5', secondary: '#2a6f8f', eye: '#5a2d12' });
  });
});

describe('the visual identity projection', () => {
  it('carries the V3 identity to a renderer exactly as stated', () => {
    const identity = getBlobbiVisualIdentity(parseBlobbiEvent(makeEvent(bornV3()))!);
    expect(identity.visualGeneration).toBe('v3');
    expect(identity.v3).toEqual({ seed: SEED, algorithm: 1, colors: identityFor(SEED).colors, traits: identityFor(SEED).traits });
    expect(JSON.parse(JSON.stringify(identity))).toEqual(identity);
  });

  it('does not fill what the event does not state', () => {
    const partial = bornV3().filter((t) => t[0] !== 'horns' && t[0] !== 'visual_algorithm' && t[0] !== 'secondary_color');
    const identity = getBlobbiVisualIdentity(parseBlobbiEvent(makeEvent(partial))!);
    expect(identity.v3?.algorithm).toBeUndefined();
    expect(identity.v3?.traits.horns).toBeUndefined();
    expect(identity.v3?.colors.secondary).toBeUndefined();
    // The plain colour field is typed as always present: there, a colour the event does not state reads as the seed's.
    expect(identity.secondaryColor).toBe(MIRRORS.secondaryColor);
    expect(identity.baseColor).toBe('#3fb7a5');
  });

  it('reads it from tags when the source is not a parsed companion', () => {
    const companion = parseBlobbiEvent(makeEvent(bornV3()))!;
    const minimal = getBlobbiVisualIdentity({ stage: 'baby', visualTraits: companion.visualTraits, allTags: bornV3() });
    expect(minimal.v3).toEqual(getBlobbiVisualIdentity(companion).v3);
  });
});

describe('a V3 identity survives everything the kit does to an event', () => {
  it('is owned by core: managed, persistent, valid at every stage, and the V3-only tags never regenerated', () => {
    for (const name of BLOBBI_V3_TAG_NAMES) {
      expect(MANAGED_BLOBBI_STATE_TAG_NAMES.has(name), name).toBe(true);
      expect(getPersistentTagNames().has(name), name).toBe(true);
      const schema = getTagSchema(name)!;
      expect(schema.stages).toEqual(['egg', 'baby', 'adult']);
      expect(schema.required).toBe(false);
    }
    for (const name of BLOBBI_V3_ONLY_TAG_NAMES) expect(getTagSchema(name)!.regenerable, name).toBe(false);
  });

  it('parse -> republish -> parse: a care update changes the stats and nothing of the identity', () => {
    const tags = bornV3();
    const cared = care(tags);
    expect(identityOf(cared)).toEqual(identityOf(tags));
    expect(identityOf(JSON.parse(JSON.stringify(cared)))).toEqual(identityOf(tags));
    expect(getTagValue(cared, 'hunger')).toBe('77');
    expect(getTagValue(cared, VISUAL_GENERATION_TAG)).toBe('v3');
    for (const name of BLOBBI_V3_TAG_NAMES) expect(cared.filter((t) => t[0] === name), name).toHaveLength(1);
  });

  it('egg -> baby -> adult: one identity, every colour and every trait exactly as it was born', () => {
    const egg = bornV3();
    const baby = hatch(egg);
    const adult = evolve(baby);
    for (const tags of [baby, adult]) {
      expect(getTagValue(tags, VISUAL_GENERATION_TAG)).toBe('v3');
      expect(identityOf(tags)).toEqual(identityOf(egg));
      for (const name of BLOBBI_V3_TAG_NAMES) expect(getTagValue(tags, name), name).toBe(getTagValue(egg, name));
    }
    expect(parseBlobbiEvent(makeEvent(adult))!.stage).toBe('adult');
    // Many republishes later it is still the same.
    let tags = adult;
    for (let i = 0; i < 10; i++) tags = care(tags);
    expect(identityOf(tags)).toEqual(identityOf(egg));
  });

  it('is recovered from the previous event if a republish dropped it, and never invented if it was never there', () => {
    const tags = bornV3();
    const dropped = tags.filter((t) => !BLOBBI_V3_TAG_NAMES.includes(t[0]));
    expect(identityOf(validateAndRepairBlobbiTags(dropped, tags).tags)).toEqual(identityOf(tags));
    // Nothing to recover from: nothing is made up, by the repair or by a republish.
    const bare = validateAndRepairBlobbiTags(dropped, dropped).tags;
    expect(bare.some((t) => BLOBBI_V3_TAG_NAMES.includes(t[0]))).toBe(false);
    const republished = updateBlobbiTags(dropped, { hunger: '50' });
    expect(republished.some((t) => BLOBBI_V3_TAG_NAMES.includes(t[0]))).toBe(false);
    expect(identityOf(republished)!.missing).toEqual(BLOBBI_V3_TAG_NAMES.filter((n) => n !== 'accent_color'));
  });

  it('never appears on, and never changes, a V1 or V2 Blobbi', () => {
    for (const generation of ['v1', 'v2'] as const) {
      const grown = evolve(hatch(care(born(generation))));
      for (const name of BLOBBI_V3_ONLY_TAG_NAMES) expect(getTagValue(grown, name), name).toBeUndefined();
      expect(parseBlobbiEvent(makeEvent(grown))!.visualGeneration).toBe(generation);
    }
  });
});

describe('the V3 seed has one spelling', () => {
  const UPPER = SEED.toUpperCase();
  const MIXED = SEED.replace(/[a-f]/g, (c, i: number) => (i % 2 ? c.toUpperCase() : c));
  /** Things that look like the seed and are not one. Each would need a guess to become it. */
  const NOT_SEEDS: unknown[] = [
    '',
    ` ${SEED}`,
    `${SEED} `,
    `${SEED}\n`,
    `0x${SEED}`,
    `0x${SEED.slice(2)}`,
    SEED.slice(1),
    `${SEED}0`,
    `${SEED.slice(0, 63)}g`,
    `${SEED.slice(0, 63)}\u0661`, // an Arabic-Indic digit one
    `${SEED.slice(0, 63)}\uff11`, // a full-width digit one
    'x'.repeat(64),
    'abc123',
    undefined,
    null,
    7,
    [SEED],
    { seed: SEED },
  ];

  it('is what the kit has always derived: 64 lower-case hexadecimal digits', () => {
    expect(BLOBBI_V3_SEED_LENGTH).toBe(64);
    expect(SEED).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalBlobbiV3Seed(SEED)).toBe(SEED);
    for (let i = 0; i < 50; i++) {
      const seed = deriveBlobbiSeedV1(PUBKEY, getCanonicalBlobbiD(PUBKEY, PET_ID), CREATED_AT + i);
      expect(canonicalBlobbiV3Seed(seed)).toBe(seed);
    }
  });

  it('reads hexadecimal digits in any case as the same seed, and nothing else as a seed at all', () => {
    expect(UPPER).not.toBe(SEED);
    expect(MIXED).not.toBe(SEED);
    expect(canonicalBlobbiV3Seed(UPPER)).toBe(SEED);
    expect(canonicalBlobbiV3Seed(MIXED)).toBe(SEED);
    for (const value of NOT_SEEDS) expect(canonicalBlobbiV3Seed(value), JSON.stringify(value)).toBeUndefined();
  });

  it('creation states the canonical seed, and refuses an identity whose seed is not one', () => {
    const fromUpper = validateBlobbiV3Identity({ ...identityFor(SEED), seed: UPPER });
    expect(fromUpper).toEqual({ valid: true, identity: identityFor(SEED) });
    // The same bytes in another case are the same seed, so the same Blobbi may be born from it...
    const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: { ...identityFor(SEED), seed: MIXED } });
    expect(tags).toEqual(bornV3());
    expect(getTagValue(tags, 'seed')).toBe(SEED);
    // ...and nothing that is not a seed is.
    for (const value of NOT_SEEDS) {
      const result = validateBlobbiV3Identity({ ...identityFor(SEED), seed: value });
      expect(result.valid, JSON.stringify(value)).toBe(false);
      expect(() => buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: { ...identityFor(SEED), seed: value as string } })).toThrow(/Invalid V3 identity/);
    }
    expect(validateBlobbiV3Identity({ ...identityFor(SEED), seed: 'abc123' })).toEqual({ valid: false, errors: ['seed is not 64 hexadecimal digits'] });
    expect(validateBlobbiV3Identity({ ...identityFor(SEED), seed: '' })).toEqual({ valid: false, errors: ['seed is missing'] });
  });

  it('an event read in any accepted spelling is the same identity; one that is not a seed has none', () => {
    const canonical = identityOf(bornV3())!;
    expect(canonical.seed).toBe(SEED);
    for (const spelling of [UPPER, MIXED]) {
      const parsed = identityOf(withTag(bornV3(), 'seed', spelling))!;
      expect(parsed).toEqual(canonical);
      expect(getBlobbiVisualIdentity(parseBlobbiEvent(makeEvent(withTag(bornV3(), 'seed', spelling)))!).v3).toEqual(getBlobbiVisualIdentity(parseBlobbiEvent(makeEvent(bornV3()))!).v3);
    }
    // 64 characters that are not hexadecimal pass the older generations' length check, and are still no V3 seed.
    const parsed = parseBlobbiV3Identity(withTag(bornV3(), 'seed', 'x'.repeat(64)));
    expect(parsed.seed).toBeUndefined();
    expect(parsed.missing).toEqual(['seed']);
    for (const value of NOT_SEEDS.filter((v): v is string => typeof v === 'string' && v !== '')) {
      const read = parseBlobbiV3Identity(withTag(bornV3(), 'seed', value));
      expect(read.seed, JSON.stringify(value)).toBeUndefined();
      expect(read.missing).toEqual(['seed']);
      // What the event states explicitly is still read.
      expect(read.colors).toEqual(canonical.colors);
      expect(read.traits).toEqual(canonical.traits);
    }
  });

  it('decides whether a V3 event is modern: a lower- or upper-case seed is, anything else is not (V1 and V2 keep the length check)', () => {
    const classify = (tags: string[][]) => classifyBlobbiEvent(makeEvent(tags));
    // A valid seed, in its canonical spelling and in upper case: modern, the same individual.
    expect(classify(bornV3())).toBe('modern');
    expect(classify(withTag(bornV3(), 'seed', UPPER))).toBe('modern');
    expect(parseBlobbiEvent(makeEvent(withTag(bornV3(), 'seed', UPPER)))!.isLegacy).toBe(false);
    expect(identityOf(withTag(bornV3(), 'seed', UPPER))).toEqual(identityOf(bornV3()));
    expect(getOrDeriveSeed(makeEvent(withTag(bornV3(), 'seed', UPPER)))).toBe(SEED);
    // 64 characters that are not hexadecimal, a wrong length, arbitrary text: no V3 seed, so not a modern V3 Blobbi.
    for (const bad of ['x'.repeat(64), `${SEED.slice(0, 63)}g`, SEED.slice(1), `${SEED}0`, 'a text seed']) {
      const tags = withTag(bornV3(), 'seed', bad);
      expect(classify(tags), bad).toBe('legacy');
      expect(isLegacyBlobbiEvent(makeEvent(tags)), bad).toBe(true);
      // Never another individual: no V3 seed is read, none is derived, and nothing is hashed from the text.
      expect(identityOf(tags)!.seed, bad).toBeUndefined();
      expect(() => getOrDeriveSeed(makeEvent(tags)), bad).toThrow(/V3/);
      expect(deriveVisualTraits(tags, bad), bad).toEqual(deriveVisualTraits(tags.filter((t) => t[0] !== 'seed'), undefined));
    }
    // V1 and V2: exactly as before. Any 64 characters pass, a wrong length does not, and a missing seed is still derived.
    for (const generation of ['v1', 'v2'] as const) {
      expect(classify(born(generation))).toBe('modern');
      expect(classify(withTag(born(generation), 'seed', UPPER))).toBe('modern');
      expect(classify(withTag(born(generation), 'seed', 'x'.repeat(64)))).toBe('modern');
      expect(getOrDeriveSeed(makeEvent(withTag(born(generation), 'seed', 'x'.repeat(64))))).toBe('x'.repeat(64));
      expect(getOrDeriveSeed(makeEvent(withTag(born(generation), 'seed', UPPER)))).toBe(UPPER);
      expect(deriveVisualTraits(born(generation), 'x'.repeat(64))).toEqual(deriveSeedIdentity('x'.repeat(64)));
      for (const bad of [SEED.slice(1), 'a text seed']) expect(classify(withTag(born(generation), 'seed', bad)), bad).toBe('legacy');
      const unseeded = born(generation).filter((t) => t[0] !== 'seed');
      expect(getOrDeriveSeed(makeEvent(unseeded))).toBe(SEED);
    }
  });

  it('never rewrites the seed tag, and leaves V1 and V2 reading it exactly as before', () => {
    // A republish of a V3 event keeps the tag as it is written, whatever its case.
    const upper = withTag(bornV3(), 'seed', UPPER);
    expect(getTagValue(care(upper), 'seed')).toBe(UPPER);
    expect(getTagValue(evolve(hatch(upper)), 'seed')).toBe(UPPER);
    for (const generation of ['v1', 'v2'] as const) {
      const lower = parseBlobbiEvent(makeEvent(born(generation)))!;
      const shouted = parseBlobbiEvent(makeEvent(withTag(born(generation), 'seed', UPPER)))!;
      // The older generations read the digits by value, as they always have: the same traits, the tag untouched.
      expect(shouted.seed).toBe(UPPER);
      expect(shouted.visualTraits).toEqual(lower.visualTraits);
      expect(shouted.v3Identity).toBeUndefined();
      // And a 64-character seed that is not hexadecimal is still theirs to read, as before.
      const odd = parseBlobbiEvent(makeEvent(withTag(born(generation), 'seed', 'x'.repeat(64))))!;
      expect(odd.seed).toBe('x'.repeat(64));
    }
  });
});
