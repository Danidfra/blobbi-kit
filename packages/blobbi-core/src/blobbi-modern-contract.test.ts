/**
 * The modern kind 31124 contract, pinned against fixtures modeled on the events
 * Blobbi Island and Ditto publish today.
 *
 * Policy under test:
 *   modern event  -> classify 'modern', parse, use;
 *   legacy event  -> classify 'legacy', ignore; no migration, no compat layer;
 *   malformed     -> classify 'invalid', reject.
 *
 * Requiredness follows evidence, not preference: a field is required only when
 * every current producer writes it and the domain cannot function without it
 * (d, b, stage, state, last_interaction). Everything else is optional and is
 * defaulted by the parser.
 */
import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import {
  BLOBBI_ACTIVITY_STATES,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  classifyBlobbiEvent,
  deriveBlobbiSeedV1,
  deriveSeedIdentity,
  getCanonicalBlobbiD,
  isLegacyBlobbiEvent,
  isModernBlobbiEvent,
  isUnsupportedLegacyBlobbiEvent,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  parseModernBlobbiEvent,
} from './blobbi';
import { serializeEvolutionContent, type Mission } from './missions';

const PUBKEY = 'c'.repeat(64);
const PET_ID = '3196847fb5';
const CREATED_AT = 1_757_000_000; // 2025-09-04
const D = getCanonicalBlobbiD(PUBKEY, PET_ID);
const SEED = deriveBlobbiSeedV1(PUBKEY, D, CREATED_AT);
/** Producers store the seed-derived traits as tags; the tags mirror the seed. */
const TRAITS = deriveSeedIdentity(SEED);

function event(tags: string[][], overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '0'.repeat(128),
    ...overrides,
  };
}

/** Replace the value of one tag, or drop it when `value` is undefined. */
function withTag(tags: string[][], name: string, value: string | undefined): string[][] {
  const rest = tags.filter(([n]) => n !== name);
  return value === undefined ? rest : [...rest, [name, value]];
}

/**
 * A freshly adopted egg exactly as Blobbi Island's create flow publishes it
 * today: canonical d and seed, ecosystem marker, activity state + incubating
 * progression, streak bookkeeping, the five stats, both timestamps, the
 * seed-mirrored visual traits, size, branding and published_at.
 */
function islandEggTags(): string[][] {
  const now = String(CREATED_AT);
  return [
    ['d', D],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['name', 'Brook'],
    ['stage', 'egg'],
    ['state', 'active'],
    ['progression_state', 'incubating'],
    ['seed', SEED],
    ['generation', '1'],
    ['breeding_ready', 'false'],
    ['experience', '0'],
    ['care_streak', '1'],
    ['care_streak_last_at', now],
    ['care_streak_last_day', '2025-09-04'],
    ['hunger', '80'],
    ['happiness', '90'],
    ['health', '100'],
    ['hygiene', '70'],
    ['energy', '60'],
    ['last_interaction', now],
    ['last_decay_at', now],
    ['progression_started_at', now],
    ['base_color', TRAITS.baseColor],
    ['secondary_color', TRAITS.secondaryColor],
    ['eye_color', TRAITS.eyeColor],
    ['pattern', TRAITS.pattern],
    ['special_mark', TRAITS.specialMark],
    ['size', TRAITS.size],
    ['client', 'blobbi'],
    ['published_at', now],
  ];
}

/** The same d after hatching: stage baby, evolving, evolution data in content. */
function hatchedBabyEvent(): NostrEvent {
  const tags = withTag(withTag(islandEggTags(), 'stage', 'baby'), 'progression_state', 'evolving');
  const missions: Mission[] = [{ id: 'feed', target: 5, count: 2 }];
  return event(tags, { created_at: CREATED_AT + 86_400, content: serializeEvolutionContent('', missions) });
}

/** A Ditto-shaped adult: adult_type from the seed, V2 artwork, no branding. */
function dittoAdultEvent(): NostrEvent {
  let tags = withTag(islandEggTags(), 'stage', 'adult');
  tags = withTag(tags, 'progression_state', 'none');
  tags = withTag(tags, 'client', undefined);
  tags = withTag(tags, 'published_at', undefined);
  tags = [...tags, ['adult_type', 'catti'], ['visual_generation', 'v2'], ['social', 'open']];
  return event(tags, { created_at: CREATED_AT + 30 * 86_400 });
}

// ─── Realistic modern events ─────────────────────────────────────────────────

describe('a current Blobbi Island egg', () => {
  const egg = event(islandEggTags());

  it('is modern: valid, not legacy, classified and parsed', () => {
    expect(isValidBlobbiEvent(egg)).toBe(true);
    expect(isUnsupportedLegacyBlobbiEvent(egg)).toBe(false);
    expect(isLegacyBlobbiEvent(egg)).toBe(false);
    expect(classifyBlobbiEvent(egg)).toBe('modern');
    expect(isModernBlobbiEvent(egg)).toBe(true);
    expect(parseModernBlobbiEvent(egg)).toBeDefined();
  });

  it('preserves every protocol-level field a consumer needs, without reparsing tags', () => {
    const c = parseModernBlobbiEvent(egg)!;
    expect(c.d).toBe(D);
    expect(c.name).toBe('Brook');
    expect(c.stage).toBe('egg');
    expect(c.state).toBe('active');
    expect(c.progressionState).toBe('incubating');
    expect(c.progressionStartedAt).toBe(CREATED_AT);
    expect(c.seed).toBe(SEED);
    expect(c.generation).toBe(1);
    expect(c.breedingReady).toBe(false);
    expect(c.experience).toBe(0);
    expect(c.careStreak).toBe(1);
    expect(c.careStreakLastAt).toBe(CREATED_AT);
    expect(c.careStreakLastDay).toBe('2025-09-04');
    expect(c.stats).toEqual({ hunger: 80, happiness: 90, health: 100, hygiene: 70, energy: 60 });
    expect(c.lastInteraction).toBe(CREATED_AT);
    expect(c.lastDecayAt).toBe(CREATED_AT);
    // The seed is the visual source of truth; the tags mirror it.
    expect(c.visualTraits).toEqual(TRAITS);
    expect(c.visualGeneration).toBe('v1');
    expect(c.publishedAt).toBe(CREATED_AT);
    expect(c.evolution).toEqual([]);
    expect(c.isLegacy).toBe(false);
    expect(c.allTags).toBe(egg.tags);
    expect(c.event).toBe(egg);
  });

  it('the profile `has` reference is kind 11125 business and never leaks into 31124 parsing', () => {
    const withHas = event([...islandEggTags(), ['has', D]]);
    expect(classifyBlobbiEvent(withHas)).toBe('modern');
    expect(parseModernBlobbiEvent(withHas)!.d).toBe(D);
    expect(KIND_BLOBBONAUT_PROFILE).toBe(11125);
  });
});

describe('the same d after hatch, and a Ditto adult', () => {
  it('a hatched baby keeps its identity, moves to evolving and carries evolution content', () => {
    const baby = hatchedBabyEvent();
    expect(classifyBlobbiEvent(baby)).toBe('modern');
    const c = parseModernBlobbiEvent(baby)!;
    expect(c.d).toBe(D);
    expect(c.stage).toBe('baby');
    expect(c.state).toBe('active');
    expect(c.progressionState).toBe('evolving');
    expect(c.seed).toBe(SEED);
    expect(c.evolution).toEqual([{ id: 'feed', target: 5, count: 2 }]);
    expect(c.visualGeneration).toBe('v1');
  });

  it('an adult with visual_generation v2 parses as V2 and keeps its adult form', () => {
    const adult = dittoAdultEvent();
    expect(classifyBlobbiEvent(adult)).toBe('modern');
    const c = parseModernBlobbiEvent(adult)!;
    expect(c.stage).toBe('adult');
    expect(c.progressionState).toBe('none');
    expect(c.visualGeneration).toBe('v2');
    expect(c.adultType).toBeDefined();
    expect(c.socialOpen).toBe(true);
    expect(c.publishedAt).toBeUndefined();
  });

  it('a Blobbi without branding or published_at is just as modern (they are not protocol-level)', () => {
    let tags = withTag(islandEggTags(), 'client', undefined);
    tags = withTag(tags, 'published_at', undefined);
    expect(classifyBlobbiEvent(event(tags))).toBe('modern');
  });
});

// ─── Optional fields default, they never reject ──────────────────────────────

describe('optional fields are defaulted, not required', () => {
  const OPTIONAL = [
    'name', // absence makes the event LEGACY, not invalid: see the legacy block
    'progression_state', 'progression_started_at', 'generation', 'breeding_ready',
    'experience', 'care_streak', 'care_streak_last_at', 'care_streak_last_day',
    'hunger', 'happiness', 'health', 'hygiene', 'energy', 'last_decay_at',
    'base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark', 'size',
    'visual_generation', 'published_at', 'client',
  ];

  it.each(OPTIONAL.filter((n) => n !== 'name'))('an event without %s is still valid and modern', (name) => {
    const e = event(withTag(islandEggTags(), name, undefined));
    expect(isValidBlobbiEvent(e)).toBe(true);
    expect(classifyBlobbiEvent(e)).toBe('modern');
    expect(parseModernBlobbiEvent(e)).toBeDefined();
  });

  it('a minimal modern event (d, b, name, seed, stage, state, last_interaction) parses with defaults', () => {
    const e = event([
      ['d', D],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
      ['name', 'Min'],
      ['seed', SEED],
      ['stage', 'baby'],
      ['state', 'sleeping'],
      ['last_interaction', String(CREATED_AT)],
    ]);
    const c = parseModernBlobbiEvent(e)!;
    expect(c.state).toBe('sleeping');
    expect(c.progressionState).toBe('none');
    expect(c.stats).toEqual({
      hunger: undefined, happiness: undefined, health: undefined, hygiene: undefined, energy: undefined,
    });
    expect(c.breedingReady).toBe(false);
    expect(c.visualGeneration).toBe('v1');
    expect(c.publishedAt).toBeUndefined();
    // Traits come from the seed when the tags are absent.
    expect(c.visualTraits.baseColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

// ─── visual_generation ───────────────────────────────────────────────────────

describe('visual_generation on the parsed companion', () => {
  it.each([
    ['absent', undefined, 'v1'],
    ['v1', 'v1', 'v1'],
    ['v2', 'v2', 'v2'],
    ['unknown (v3)', 'v3', 'v1'],
    ['wrong case (V2)', 'V2', 'v1'],
    ['empty', '', 'v1'],
  ])('%s -> %s', (_label, value, expected) => {
    const e = event(withTag(islandEggTags(), 'visual_generation', value));
    expect(classifyBlobbiEvent(e)).toBe('modern');
    expect(parseModernBlobbiEvent(e)!.visualGeneration).toBe(expected);
  });

  it('never makes an event legacy or invalid, whatever its value', () => {
    for (const value of ['v1', 'v2', 'v9', '']) {
      const e = event([...islandEggTags(), ['visual_generation', value]]);
      expect(isUnsupportedLegacyBlobbiEvent(e)).toBe(false);
      expect(isLegacyBlobbiEvent(e)).toBe(false);
      expect(isValidBlobbiEvent(e)).toBe(true);
    }
  });
});

// ─── Malformed modern events ─────────────────────────────────────────────────

describe('malformed modern events are invalid, not legacy', () => {
  it.each([
    ['missing d', (t: string[][]) => withTag(t, 'd', undefined)],
    ['missing b', (t: string[][]) => withTag(t, 'b', undefined)],
    ['foreign ecosystem b', (t: string[][]) => withTag(t, 'b', 'other:ecosystem:v1')],
    ['old ecosystem version b', (t: string[][]) => withTag(t, 'b', 'blobbi:ecosystem:v0')],
    ['missing stage', (t: string[][]) => withTag(t, 'stage', undefined)],
    ['unknown stage', (t: string[][]) => withTag(t, 'stage', 'elder')],
    ['missing state', (t: string[][]) => withTag(t, 'state', undefined)],
    ['unknown state', (t: string[][]) => withTag(t, 'state', 'dancing')],
    ['missing last_interaction', (t: string[][]) => withTag(t, 'last_interaction', undefined)],
  ])('%s', (_label, mutate) => {
    const e = event(mutate(islandEggTags()));
    expect(isValidBlobbiEvent(e)).toBe(false);
    expect(classifyBlobbiEvent(e)).toBe('invalid');
    expect(isModernBlobbiEvent(e)).toBe(false);
    expect(parseBlobbiEvent(e)).toBeUndefined();
    expect(parseModernBlobbiEvent(e)).toBeUndefined();
  });

  it('the wrong kind is invalid even with perfect tags', () => {
    expect(classifyBlobbiEvent(event(islandEggTags(), { kind: 1 }))).toBe('invalid');
    expect(classifyBlobbiEvent(event(islandEggTags(), { kind: KIND_BLOBBONAUT_PROFILE }))).toBe('invalid');
  });

  it('b must be exactly the current ecosystem namespace', () => {
    expect(BLOBBI_ECOSYSTEM_NAMESPACE).toBe('blobbi:ecosystem:v1');
    expect(isValidBlobbiEvent(event(withTag(islandEggTags(), 'b', 'blobbi:ecosystem:v1')))).toBe(true);
  });

  it('accepts exactly the three activity states', () => {
    expect([...BLOBBI_ACTIVITY_STATES]).toEqual(['active', 'sleeping', 'hibernating']);
    for (const state of BLOBBI_ACTIVITY_STATES) {
      expect(isValidBlobbiEvent(event(withTag(islandEggTags(), 'state', state)))).toBe(true);
    }
  });
});

// ─── Legacy policy ───────────────────────────────────────────────────────────

describe('legacy policy: identify, ignore, never migrate', () => {
  const LEGACY_MARKERS = [
    'incubation_time', 'incubation_progress', 'egg_temperature', 'egg_status',
    'shell_integrity', 'fees', 'start_incubation', 'interact_6_progress',
  ];

  it.each(LEGACY_MARKERS)('a canonical-looking event carrying %s is unsupported legacy', (marker) => {
    const e = event([...islandEggTags(), [marker, '1']]);
    expect(isUnsupportedLegacyBlobbiEvent(e)).toBe(true);
    expect(isLegacyBlobbiEvent(e)).toBe(true);
    expect(classifyBlobbiEvent(e)).toBe('legacy');
    expect(isModernBlobbiEvent(e)).toBe(false);
    expect(parseModernBlobbiEvent(e)).toBeUndefined();
    // parseBlobbiEvent still parses it, flagged, for callers that check isLegacy.
    expect(parseBlobbiEvent(e)?.isLegacy).toBe(true);
  });

  it.each(['incubating', 'evolving'])('progression stored in state (%s) is the historical schema: legacy, not reinterpreted', (value) => {
    const e = event(withTag(withTag(islandEggTags(), 'state', value), 'progression_state', undefined));
    expect(isUnsupportedLegacyBlobbiEvent(e)).toBe(true);
    expect(classifyBlobbiEvent(e)).toBe('legacy');
    expect(parseBlobbiEvent(e)).toBeUndefined();
    expect(parseModernBlobbiEvent(e)).toBeUndefined();
  });

  it('non-canonical d, missing seed, short seed or missing name are legacy (structure, not markers)', () => {
    const cases: string[][][] = [
      withTag(islandEggTags(), 'd', 'blobbi-puck'),
      withTag(islandEggTags(), 'seed', undefined),
      withTag(islandEggTags(), 'seed', 'b'.repeat(63)),
      withTag(islandEggTags(), 'name', undefined),
    ];
    for (const tags of cases) {
      const e = event(tags);
      expect(isValidBlobbiEvent(e)).toBe(true);
      expect(isUnsupportedLegacyBlobbiEvent(e)).toBe(false);
      expect(isLegacyBlobbiEvent(e)).toBe(true);
      expect(classifyBlobbiEvent(e)).toBe('legacy');
      expect(parseModernBlobbiEvent(e)).toBeUndefined();
    }
  });

  it('every current modern tag name is a non-marker', () => {
    for (const [name] of islandEggTags()) {
      expect(isUnsupportedLegacyBlobbiEvent(event([[name, 'x']])), name).toBe(false);
    }
    for (const name of ['adult_type', 'visual_generation', 'social', 'task', 'task_completed', 'theme', 'crossover_app']) {
      expect(isUnsupportedLegacyBlobbiEvent(event([[name, 'x']])), name).toBe(false);
    }
  });

  it('client and t branding never make an event legacy', () => {
    for (const branding of [['client', 'blobbi'], ['t', 'blobbi'], ['client', 'Ditto', '31990:abc:def', 'wss://relay']]) {
      const e = event([...withTag(islandEggTags(), 'client', undefined), branding]);
      expect(isUnsupportedLegacyBlobbiEvent(e)).toBe(false);
      expect(classifyBlobbiEvent(e)).toBe('modern');
    }
  });

  it('branding next to a marker does not rescue the event', () => {
    const e = event([...islandEggTags(), ['egg_temperature', '37']]);
    expect(classifyBlobbiEvent(e)).toBe('legacy');
  });

  it('a legacy event is never turned into a modern companion by any exported parser', () => {
    const legacy = event([...islandEggTags(), ['incubation_time', '3600']]);
    expect(parseModernBlobbiEvent(legacy)).toBeUndefined();
    const flagged = parseBlobbiEvent(legacy)!;
    expect(flagged.isLegacy).toBe(true);
    // No field was "migrated": the parser reports the tags as they are.
    expect(flagged.allTags).toBe(legacy.tags);
  });
});
