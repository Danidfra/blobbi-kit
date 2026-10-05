/**
 * V3 IDENTITY ON THE EVENT. A procedural Blobbi states who it is in tags of
 * its own; these tests pin that it is written completely at creation, read
 * back exactly, never invented, and carried through every republish path the
 * kit owns, including the one that rewrites the seed's mirror tags.
 */
import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import {
  KIND_BLOBBI_STATE,
  MANAGED_BLOBBI_STATE_TAG_NAMES,
  NEW_BLOBBI_VISUAL_GENERATION,
  VISUAL_GENERATION_TAG,
  buildEggTags,
  deriveBlobbiSeedV1,
  deriveSeedIdentity,
  getCanonicalBlobbiD,
  getTagValue,
  parseBlobbiEvent,
  updateBlobbiTags,
} from './blobbi';
import { getPersistentTagNames, getTagSchema, validateAndRepairBlobbiTags } from './blobbi-tag-schema';
import {
  BLOBBI_V3_TAGS,
  BLOBBI_V3_TAG_NAMES,
  blobbiV3IdentityTags,
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

/** A complete identity, as a renderer's creation rule would return it for a seed. */
const identityFor = (seed: string): BlobbiV3Identity => ({
  seed,
  algorithm: 1,
  colors: { base: '#3fb7a5', secondary: '#2a6f8f', eye: '#5a2d12', accent: '#e86a5c' },
  traits: { antenna: 'double', horns: 'none', ears: 'pointed', tail: 'curl', spots: true, belly: false, freckles: true },
});

const makeEvent = (tags: string[][]): NostrEvent => ({
  id: 'e'.repeat(64),
  pubkey: PUBKEY,
  created_at: CREATED_AT,
  kind: KIND_BLOBBI_STATE,
  tags,
  content: '',
  sig: '0'.repeat(128),
});

const bornV3 = () => buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: identityFor });

describe('creating a V3 Blobbi', () => {
  it('is opt-in: the ecosystem creation rule is still V2, and a V2 or V1 egg carries no V3 tag', () => {
    expect(NEW_BLOBBI_VISUAL_GENERATION).toBe('v2');
    for (const tags of [buildEggTags(PUBKEY, PET_ID, CREATED_AT), buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Egg', { visualGeneration: 'v1' })]) {
      expect(tags.some((t) => t[0].startsWith('v3_'))).toBe(false);
    }
    // A V3 identity handed to another generation is ignored, not half-written.
    const v2 = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Egg', { visualGeneration: 'v2', v3: identityFor });
    expect(v2).toEqual(buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Egg', { visualGeneration: 'v2' }).map((t) => (t[0] === 'care_streak_last_day' ? v2.find((x) => x[0] === t[0])! : t)));
  });

  it('writes the generation, the whole explicit identity, and leaves every other tag as a V2 egg has it', () => {
    const v3 = bornV3();
    const v2 = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout');
    expect(getTagValue(v3, VISUAL_GENERATION_TAG)).toBe('v3');
    expect(getTagValue(v3, 'seed')).toBe(SEED);
    // The identity tags, in order, after the generation.
    expect(v3.slice(v3.findIndex((t) => t[0] === VISUAL_GENERATION_TAG) + 1)).toEqual([
      ['v3_algorithm', '1'],
      ['v3_base_color', '#3fb7a5'],
      ['v3_secondary_color', '#2a6f8f'],
      ['v3_eye_color', '#5a2d12'],
      ['v3_accent_color', '#e86a5c'],
      ['v3_antenna', 'double'],
      ['v3_horns', 'none'],
      ['v3_ears', 'pointed'],
      ['v3_tail', 'curl'],
      ['v3_spots', 'true'],
      ['v3_belly', 'false'],
      ['v3_freckles', 'true'],
    ]);
    // Everything before it is the V2 egg, tag for tag: the mirror tags are still the seed's.
    const head = (tags: string[][]) => tags.slice(0, tags.findIndex((t) => t[0] === VISUAL_GENERATION_TAG));
    expect(head(v3)).toEqual(head(v2));
    const mirrors = deriveSeedIdentity(SEED);
    expect(getTagValue(v3, 'base_color')).toBe(mirrors.baseColor);
    expect(getTagValue(v3, 'base_color')).not.toBe('#3fb7a5');
  });

  it('takes the identity as a value or as a function of the new seed, and both give the same event', () => {
    const asValue = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: identityFor(SEED) });
    expect(asValue).toEqual(bornV3());
    let seen = '';
    buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: (seed) => ((seen = seed), identityFor(seed)) });
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

  it('omits the accent tag for a Blobbi with no accent colour, and reads that back as none', () => {
    const { accent: _accent, ...colors } = identityFor(SEED).colors;
    const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sprout', { visualGeneration: 'v3', v3: { ...identityFor(SEED), colors } });
    expect(getTagValue(tags, BLOBBI_V3_TAGS.accentColor)).toBeUndefined();
    const parsed = parseBlobbiV3Identity(tags);
    expect(parsed.colors.accent).toBeUndefined();
    expect(parsed.missing).toEqual([]);
  });
});

describe('reading a V3 identity', () => {
  it('round-trips: what creation wrote is what an event reads back, with nothing missing', () => {
    const companion = parseBlobbiEvent(makeEvent(bornV3()))!;
    expect(companion.visualGeneration).toBe('v3');
    expect(companion.v3Identity).toEqual({ ...identityFor(SEED), missing: [] });
    // And through JSON, as a relay would carry it.
    const again = parseBlobbiEvent(JSON.parse(JSON.stringify(makeEvent(bornV3()))))!;
    expect(again.v3Identity).toEqual(companion.v3Identity);
    // Round trip of the tags themselves.
    const { missing: _missing, ...identity } = companion.v3Identity!;
    expect(blobbiV3IdentityTags(identity as BlobbiV3Identity)).toEqual(bornV3().filter((t) => BLOBBI_V3_TAG_NAMES.includes(t[0])));
  });

  it('is read for V3 only: a V1 or V2 companion has none, whatever tags it carries', () => {
    for (const generation of ['v1', 'v2'] as const) {
      const tags = [...buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Egg', { visualGeneration: generation }), ...blobbiV3IdentityTags(identityFor(SEED))];
      const companion = parseBlobbiEvent(makeEvent(tags))!;
      expect(companion.visualGeneration).toBe(generation);
      expect(companion.v3Identity).toBeUndefined();
      expect(getBlobbiVisualIdentity(companion).v3).toBeUndefined();
      // Its colours are the seed's, as they always were.
      expect(getBlobbiVisualIdentity(companion).baseColor).toBe(deriveSeedIdentity(SEED).baseColor);
    }
  });

  it('never invents: a missing or malformed field is absent and named, the rest is kept', () => {
    const tags = bornV3()
      .filter((t) => t[0] !== 'v3_tail' && t[0] !== 'v3_algorithm')
      .map((t) => (t[0] === 'v3_eye_color' ? ['v3_eye_color', 'javascript:alert(1)'] : t[0] === 'v3_spots' ? ['v3_spots', 'yes'] : t[0] === 'v3_accent_color' ? ['v3_accent_color', '#12'] : t));
    const parsed = parseBlobbiV3Identity(tags);
    expect(parsed.missing.sort()).toEqual(['v3_accent_color', 'v3_algorithm', 'v3_eye_color', 'v3_spots', 'v3_tail']);
    expect(parsed.algorithm).toBe(1);
    expect(parsed.colors).toEqual({ base: '#3fb7a5', secondary: '#2a6f8f' });
    expect(parsed.traits).toEqual({ antenna: 'double', horns: 'none', ears: 'pointed', belly: false, freckles: true });
    // Total: nothing at all still parses.
    expect(parseBlobbiV3Identity([])).toEqual({ algorithm: 1, colors: {}, traits: {}, missing: [...new Set(['seed', ...BLOBBI_V3_TAG_NAMES.filter((n) => n !== 'v3_accent_color')])] });
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
  it('carries the V3 identity to a renderer, and reports the creature\'s own colours', () => {
    const identity = getBlobbiVisualIdentity(parseBlobbiEvent(makeEvent(bornV3()))!);
    expect(identity.visualGeneration).toBe('v3');
    expect(identity.v3).toEqual({ seed: SEED, algorithm: 1, colors: identityFor(SEED).colors, traits: identityFor(SEED).traits });
    expect(identity.baseColor).toBe('#3fb7a5');
    expect(identity.secondaryColor).toBe('#2a6f8f');
    expect(identity.eyeColor).toBe('#5a2d12');
    // Plain data: it survives serialization whole.
    expect(JSON.parse(JSON.stringify(identity))).toEqual(identity);
  });

  it('reads it from tags when the source is not a parsed companion', () => {
    const companion = parseBlobbiEvent(makeEvent(bornV3()))!;
    const minimal = getBlobbiVisualIdentity({ stage: 'baby', visualTraits: companion.visualTraits, allTags: bornV3() });
    expect(minimal.v3).toEqual(getBlobbiVisualIdentity(companion).v3);
  });
});

describe('a V3 identity survives everything the kit does to an event', () => {
  const identityOf = (tags: string[][]) => parseBlobbiEvent(makeEvent(tags))!.v3Identity;

  it('is owned by core: managed, persistent, never regenerated, valid at every stage', () => {
    for (const name of BLOBBI_V3_TAG_NAMES) {
      expect(MANAGED_BLOBBI_STATE_TAG_NAMES.has(name), name).toBe(true);
      expect(getPersistentTagNames().has(name), name).toBe(true);
      const schema = getTagSchema(name)!;
      expect(schema.stages).toEqual(['egg', 'baby', 'adult']);
      expect(schema.regenerable).toBe(false);
      expect(schema.required).toBe(false);
    }
  });

  it('a care update keeps it, and still rewrites only the seed mirrors', () => {
    const born = bornV3();
    // Stale mirrors, as an older client might have left them.
    const stale = born.map((t) => (t[0] === 'base_color' ? ['base_color', '#000000'] : t));
    const cared = updateBlobbiTags(stale, { hunger: '77', last_interaction: String(CREATED_AT + 60) });
    expect(identityOf(cared)).toEqual(identityOf(born));
    expect(getTagValue(cared, 'base_color')).toBe(deriveSeedIdentity(SEED).baseColor);
    expect(getTagValue(cared, 'v3_base_color')).toBe('#3fb7a5');
    expect(getTagValue(cared, VISUAL_GENERATION_TAG)).toBe('v3');
  });

  it('hatching and evolving keep it: an egg, its baby and its adult are one identity', () => {
    const egg = bornV3();
    const baby = validateAndRepairBlobbiTags(updateBlobbiTags(egg, { stage: 'baby', state: 'active' }), egg, { cleanupTaskTags: true }).tags;
    const adult = validateAndRepairBlobbiTags(updateBlobbiTags(baby, { stage: 'adult', progression_state: 'none' }), baby, { cleanupTaskTags: true }).tags;
    for (const tags of [baby, adult]) {
      expect(getTagValue(tags, VISUAL_GENERATION_TAG)).toBe('v3');
      expect(identityOf(tags)).toEqual(identityOf(egg));
    }
    expect(parseBlobbiEvent(makeEvent(adult))!.stage).toBe('adult');
  });

  it('is recovered from the previous event if a republish dropped it, and never invented if it was never there', () => {
    const born = bornV3();
    const dropped = born.filter((t) => !t[0].startsWith('v3_'));
    const repaired = validateAndRepairBlobbiTags(dropped, born).tags;
    expect(identityOf(repaired)).toEqual(identityOf(born));
    // Nothing to recover from: nothing is made up.
    const bare = validateAndRepairBlobbiTags(dropped, dropped).tags;
    expect(bare.some((t) => t[0].startsWith('v3_'))).toBe(false);
    expect(identityOf(bare)!.missing.length).toBeGreaterThan(0);
  });

  it('a client that predates V3 leaves it alone: unknown tags pass through a republish untouched', () => {
    // What such a client does: it manages the tags it knows and carries the rest. Simulated by
    // treating the V3 tags as unknown (not managed), which is exactly what they are to it.
    const born = bornV3();
    const known = born.filter((t) => !t[0].startsWith('v3_'));
    const unknown = born.filter((t) => t[0].startsWith('v3_'));
    const republished = [...updateBlobbiTags(known, { hunger: '50' }).filter((t) => !t[0].startsWith('v3_')), ...unknown];
    expect(identityOf(republished)).toEqual(identityOf(born));
  });

  it('never appears on, and never changes, a V1 or V2 Blobbi', () => {
    for (const generation of ['v1', 'v2'] as const) {
      const born = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Egg', { visualGeneration: generation });
      const grown = validateAndRepairBlobbiTags(updateBlobbiTags(updateBlobbiTags(born, { stage: 'baby' }), { stage: 'adult' }), born, { cleanupTaskTags: true }).tags;
      expect(grown.some((t) => t[0].startsWith('v3_'))).toBe(false);
      expect(parseBlobbiEvent(makeEvent(grown))!.visualGeneration).toBe(generation);
    }
  });
});
