/**
 * Visual generation is IDENTITY. It lives in the kind 31124 event as
 * `["visual_generation", "v2"]`, it is `'v1'` whenever that tag is absent, and
 * it survives every republish path the kit owns. These tests pin all three.
 */
import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import {
  KIND_BLOBBI_STATE,
  VISUAL_GENERATION_TAG,
  DEFAULT_VISUAL_GENERATION,
  buildEggTags,
  parseBlobbiEvent,
  parseVisualGeneration,
  updateBlobbiTags,
  MANAGED_BLOBBI_STATE_TAG_NAMES,
  getTagValue,
} from './blobbi';
import { getPersistentTagNames, getTagSchema, validateAndRepairBlobbiTags } from './blobbi-tag-schema';
import { getBlobbiVisualIdentity } from './blobbi-visual-identity';

const PUBKEY = 'a'.repeat(64);
const PET_ID = '3196847fb5';
const CREATED_AT = 1_700_000_000;

function makeEvent(tags: string[][]): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
}

const canonicalTags = () => buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky');

describe('the visual_generation tag', () => {
  it('is named visual_generation and defaults to v1', () => {
    expect(VISUAL_GENERATION_TAG).toBe('visual_generation');
    expect(DEFAULT_VISUAL_GENERATION).toBe('v1');
  });

  it('is absent from a freshly built Blobbi: creation stays v1 unless a host asks otherwise', () => {
    expect(getTagValue(canonicalTags(), VISUAL_GENERATION_TAG)).toBeUndefined();
  });

  it('parses: absent -> v1, v1 -> v1, v2 -> v2, anything unknown -> v1', () => {
    expect(parseVisualGeneration([])).toBe('v1');
    expect(parseVisualGeneration([[VISUAL_GENERATION_TAG, 'v1']])).toBe('v1');
    expect(parseVisualGeneration([[VISUAL_GENERATION_TAG, 'v2']])).toBe('v2');
    expect(parseVisualGeneration([[VISUAL_GENERATION_TAG, 'v3']])).toBe('v1');
    expect(parseVisualGeneration([[VISUAL_GENERATION_TAG, '']])).toBe('v1');
    expect(parseVisualGeneration([[VISUAL_GENERATION_TAG, 'V2']])).toBe('v1');
  });

  it('is owned by core: managed on republish and described by the schema for every stage', () => {
    expect(MANAGED_BLOBBI_STATE_TAG_NAMES.has(VISUAL_GENERATION_TAG)).toBe(true);
    const schema = getTagSchema(VISUAL_GENERATION_TAG)!;
    expect(schema).toBeDefined();
    expect(schema.stages).toEqual(['egg', 'baby', 'adult']);
    expect(schema.persistent).toBe(true);
    expect(schema.regenerable).toBe(false);
    expect(getPersistentTagNames().has(VISUAL_GENERATION_TAG)).toBe(true);
  });
});

describe('parsed companions carry their generation', () => {
  it('an existing event without the tag is v1, with no migration', () => {
    const companion = parseBlobbiEvent(makeEvent(canonicalTags()))!;
    expect(companion.visualGeneration).toBe('v1');
    expect(getBlobbiVisualIdentity(companion).visualGeneration).toBe('v1');
  });

  it('a new v2 event is v2', () => {
    const companion = parseBlobbiEvent(makeEvent([...canonicalTags(), [VISUAL_GENERATION_TAG, 'v2']]))!;
    expect(companion.visualGeneration).toBe('v2');
    expect(getBlobbiVisualIdentity(companion).visualGeneration).toBe('v2');
  });

  it('the generation does not alter any other identity field', () => {
    const v1 = getBlobbiVisualIdentity(parseBlobbiEvent(makeEvent(canonicalTags()))!);
    const v2 = getBlobbiVisualIdentity(
      parseBlobbiEvent(makeEvent([...canonicalTags(), [VISUAL_GENERATION_TAG, 'v2']]))!,
    );
    expect({ ...v2, visualGeneration: 'v1' }).toEqual(v1);
  });

  it('a minimal identity source falls back to its tags, then to v1', () => {
    const traits = parseBlobbiEvent(makeEvent(canonicalTags()))!.visualTraits;
    expect(getBlobbiVisualIdentity({ stage: 'baby', visualTraits: traits }).visualGeneration).toBe('v1');
    expect(
      getBlobbiVisualIdentity({ stage: 'baby', visualTraits: traits, allTags: [[VISUAL_GENERATION_TAG, 'v2']] })
        .visualGeneration,
    ).toBe('v2');
    expect(
      getBlobbiVisualIdentity({ stage: 'baby', visualTraits: traits, visualGeneration: 'v2' }).visualGeneration,
    ).toBe('v2');
  });
});

describe('the generation survives republish', () => {
  it('a care update on a v2 Blobbi keeps the tag', () => {
    const tags = [...canonicalTags(), [VISUAL_GENERATION_TAG, 'v2']];
    const republished = updateBlobbiTags(tags, { hunger: '77', last_interaction: String(CREATED_AT + 60) });
    expect(getTagValue(republished, VISUAL_GENERATION_TAG)).toBe('v2');
    expect(parseBlobbiEvent(makeEvent(republished))!.visualGeneration).toBe('v2');
  });

  it('a stage transition keeps the tag', () => {
    const tags = [...canonicalTags(), [VISUAL_GENERATION_TAG, 'v2']];
    const { tags: repaired } = validateAndRepairBlobbiTags(
      tags.map((t) => (t[0] === 'stage' ? ['stage', 'baby'] : t)),
      tags,
      { cleanupTaskTags: true },
    );
    expect(getTagValue(repaired, VISUAL_GENERATION_TAG)).toBe('v2');
  });

  it('a republish never invents the tag on a v1 Blobbi', () => {
    const republished = updateBlobbiTags(canonicalTags(), { hunger: '77' });
    expect(getTagValue(republished, VISUAL_GENERATION_TAG)).toBeUndefined();
    expect(parseBlobbiEvent(makeEvent(republished))!.visualGeneration).toBe('v1');
  });

  it('round-trips through JSON', () => {
    const companion = parseBlobbiEvent(makeEvent([...canonicalTags(), [VISUAL_GENERATION_TAG, 'v2']]))!;
    const identity = getBlobbiVisualIdentity(companion);
    expect(JSON.parse(JSON.stringify(identity)).visualGeneration).toBe('v2');
    const reparsed = parseBlobbiEvent(JSON.parse(JSON.stringify(companion.event)))!;
    expect(reparsed.visualGeneration).toBe('v2');
  });
});
