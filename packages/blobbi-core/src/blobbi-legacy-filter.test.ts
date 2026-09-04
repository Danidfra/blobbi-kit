import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';

import {
  BLOBBI_ECOSYSTEM_NAMESPACE,
  KIND_BLOBBI_STATE,
  deriveBlobbiSeedV1,
  getCanonicalBlobbiD,
  isValidBlobbiEvent,
  isLegacyBlobbiEvent,
  isUnsupportedLegacyBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from './blobbi';

// ─── Fixtures ──────────────────────────────────────────────────────────────────
//
// These tests verify that old-format / unsupported Blobbi events are filtered out
// at the parsed-companion layer (the same logic useBlobbisCollection applies before
// any UI selection happens). isValidBlobbiEvent stays schema-level; isLegacy is the
// gate that hides events from the page, widget, floating companion, and selection.

const PUBKEY = 'a'.repeat(64);
const SEED = 'b'.repeat(64); // 64-char seed → not legacy on the seed check
const CANONICAL_D = 'blobbi-aaaaaaaaaaaa-1234567890'; // blobbi-{12hex}-{10hex}
const LEGACY_D = 'blobbi-puck'; // valid schema, non-canonical → legacy

/** Build a schema-valid kind 31124 event with the given tag overrides. */
function makeBlobbiEvent(overrides: { d: string; seed?: string; name?: string }): NostrEvent {
  const tags: string[][] = [
    ['d', overrides.d],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['stage', 'baby'],
    ['state', 'active'],
    ['last_interaction', '1700000000'],
  ];
  if (overrides.seed !== undefined) tags.push(['seed', overrides.seed]);
  if (overrides.name !== undefined) tags.push(['name', overrides.name]);

  return {
    id: 'id-' + overrides.d,
    pubkey: PUBKEY,
    created_at: 1700000000,
    kind: 31124,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
}

/** Canonical (current-format) Blobbi: canonical d + 64-char seed + name. */
function makeCanonicalEvent(): NostrEvent {
  return makeBlobbiEvent({ d: CANONICAL_D, seed: SEED, name: 'Puck' });
}

/** Old-format Blobbi: schema-valid but non-canonical d, missing seed/name. */
function makeLegacyEvent(): NostrEvent {
  return makeBlobbiEvent({ d: LEGACY_D });
}

/**
 * Replicates the useBlobbisCollection parse pipeline: schema-validate, parse,
 * then drop legacy companions. Returns companions exactly as the UI sees them.
 */
function collectVisibleCompanions(events: NostrEvent[]): BlobbiCompanion[] {
  const companions: BlobbiCompanion[] = [];
  for (const event of events.filter(isValidBlobbiEvent)) {
    const parsed = parseBlobbiEvent(event);
    if (parsed && !parsed.isLegacy) {
      companions.push(parsed);
    }
  }
  return companions;
}

// ─── Sanity: fixtures classify as expected ──────────────────────────────────────

describe('blobbi legacy fixtures', () => {
  it('canonical event is schema-valid and not legacy', () => {
    const event = makeCanonicalEvent();
    expect(isValidBlobbiEvent(event)).toBe(true);
    expect(isLegacyBlobbiEvent(event)).toBe(false);
  });

  it('legacy event is schema-valid but flagged legacy', () => {
    const event = makeLegacyEvent();
    expect(isValidBlobbiEvent(event)).toBe(true);
    expect(isLegacyBlobbiEvent(event)).toBe(true);
  });
});

// ─── Filtering before UI selection ──────────────────────────────────────────────

describe('old-format events filtered before UI selection', () => {
  it('legacy-only: collection returns no companions', () => {
    const companions = collectVisibleCompanions([makeLegacyEvent()]);
    expect(companions).toHaveLength(0);
  });

  it('mixed old + current: only the canonical Blobbi is returned', () => {
    const companions = collectVisibleCompanions([makeLegacyEvent(), makeCanonicalEvent()]);
    expect(companions).toHaveLength(1);
    expect(companions[0].d).toBe(CANONICAL_D);
    expect(companions[0].isLegacy).toBe(false);
  });

  it('current-only: canonical Blobbi still appears normally', () => {
    const companions = collectVisibleCompanions([makeCanonicalEvent()]);
    expect(companions).toHaveLength(1);
    expect(companions[0].d).toBe(CANONICAL_D);
  });

  it('a stored or profile legacy d-tag cannot resolve to a companion', () => {
    // Selection logic (page + widget) only ever looks up d-tags in the
    // collection. A legacy d is absent, so it can never be selected.
    const companions = collectVisibleCompanions([makeLegacyEvent(), makeCanonicalEvent()]);
    const byD: Record<string, BlobbiCompanion> = {};
    for (const c of companions) byD[c.d] = c;

    expect(byD[LEGACY_D]).toBeUndefined();
    expect(byD[CANONICAL_D]).toBeDefined();
  });
});

// ─── Branding tags are not schema evidence ──────────────────────────────────────
//
// Legacy detection is schema/structure based. `client` and `t` name the client
// that wrote an event, not the schema it follows, so they must never decide
// whether a Blobbi is supported. Blobbi Island brands every event
// `["client", "blobbi"]`, which is also the value the old app used; before this
// rule, every Island-created Blobbi was dropped by the collection filter.

describe('branding tags do not imply legacy', () => {
  /** A canonical event plus one extra tag. */
  function withTag(tag: string[]): NostrEvent {
    const event = makeCanonicalEvent();
    return { ...event, tags: [...event.tags, tag] };
  }

  it('a fully canonical event carrying ["client", "blobbi"] is not legacy', () => {
    const event = withTag(['client', 'blobbi']);
    expect(isValidBlobbiEvent(event)).toBe(true);
    expect(isUnsupportedLegacyBlobbiEvent(event)).toBe(false);
    expect(isLegacyBlobbiEvent(event)).toBe(false);
    expect(parseBlobbiEvent(event)!.isLegacy).toBe(false);
  });

  it('a fully canonical event carrying ["t", "blobbi"] is not legacy', () => {
    const event = withTag(['t', 'blobbi']);
    expect(isValidBlobbiEvent(event)).toBe(true);
    expect(isUnsupportedLegacyBlobbiEvent(event)).toBe(false);
    expect(isLegacyBlobbiEvent(event)).toBe(false);
    expect(parseBlobbiEvent(event)!.isLegacy).toBe(false);
  });

  it('a canonical-looking event with an old incubation schema tag is still legacy', () => {
    for (const marker of [['incubation_time', '3600'], ['start_incubation', '1700000000']]) {
      const event = withTag(marker);
      expect(isUnsupportedLegacyBlobbiEvent(event)).toBe(true);
      expect(isLegacyBlobbiEvent(event)).toBe(true);
      expect(collectVisibleCompanions([event])).toHaveLength(0);
    }
  });

  it('branding next to an old schema tag does not rescue the event', () => {
    const event = withTag(['client', 'blobbi']);
    event.tags.push(['egg_temperature', '37']);
    expect(isLegacyBlobbiEvent(event)).toBe(true);
    expect(collectVisibleCompanions([event])).toHaveLength(0);
  });

  it('structural checks are unchanged: a bad d-tag stays legacy with or without branding', () => {
    const plain = makeLegacyEvent();
    const branded: NostrEvent = { ...plain, tags: [...plain.tags, ['client', 'blobbi']] };
    expect(isLegacyBlobbiEvent(plain)).toBe(true);
    expect(isLegacyBlobbiEvent(branded)).toBe(true);
    expect(collectVisibleCompanions([plain, branded])).toHaveLength(0);
  });

  it('structural checks are unchanged: a missing or short seed stays legacy', () => {
    const noSeed = makeBlobbiEvent({ d: CANONICAL_D, name: 'Puck' });
    const shortSeed = makeBlobbiEvent({ d: CANONICAL_D, seed: 'b'.repeat(63), name: 'Puck' });
    const noName = makeBlobbiEvent({ d: CANONICAL_D, seed: SEED });
    for (const event of [noSeed, shortSeed, noName]) {
      const branded: NostrEvent = { ...event, tags: [...event.tags, ['client', 'blobbi']] };
      expect(isLegacyBlobbiEvent(event)).toBe(true);
      expect(isLegacyBlobbiEvent(branded)).toBe(true);
    }
    expect(collectVisibleCompanions([noSeed, shortSeed, noName])).toHaveLength(0);
  });
});

// ─── Island-shaped fixture ──────────────────────────────────────────────────────

describe('Blobbi Island-created events pass the visibility path', () => {
  const ISLAND_PUBKEY = 'c'.repeat(64);
  const ISLAND_PET_ID = '3196847fb5';
  const ISLAND_CREATED_AT = 1_750_000_000;

  /**
   * Modeled on a current Blobbi Island kind 31124 publish: Island writes the
   * canonical d-tag and seed from @blobbi-kit/core, a final `stage: baby`
   * (never an egg event), the standard stat tags, an empty content body, and
   * its own `["client", "blobbi"]` branding on every event. It carries none of
   * Ditto's mission/evolution JSON.
   */
  function makeIslandEvent(extraTags: string[][] = []): NostrEvent {
    const d = getCanonicalBlobbiD(ISLAND_PUBKEY, ISLAND_PET_ID);
    const seed = deriveBlobbiSeedV1(ISLAND_PUBKEY, d, ISLAND_CREATED_AT);
    return {
      id: 'e'.repeat(64),
      pubkey: ISLAND_PUBKEY,
      created_at: ISLAND_CREATED_AT,
      kind: KIND_BLOBBI_STATE,
      tags: [
        ['d', d],
        ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
        ['name', 'Brook'],
        ['stage', 'baby'],
        ['state', 'active'],
        ['seed', seed],
        ['generation', '1'],
        ['hunger', '80'],
        ['happiness', '90'],
        ['health', '100'],
        ['hygiene', '70'],
        ['energy', '60'],
        ['experience', '0'],
        ['care_streak', '0'],
        ['last_interaction', String(ISLAND_CREATED_AT)],
        ['client', 'blobbi'],
        ...extraTags,
      ],
      content: '',
      sig: '0'.repeat(128),
    };
  }

  it('is schema-valid and not legacy', () => {
    const event = makeIslandEvent();
    expect(isValidBlobbiEvent(event)).toBe(true);
    expect(isUnsupportedLegacyBlobbiEvent(event)).toBe(false);
    expect(isLegacyBlobbiEvent(event)).toBe(false);
  });

  it('survives the collection/visibility path with its identity intact', () => {
    const event = makeIslandEvent();
    const companions = collectVisibleCompanions([event]);
    expect(companions).toHaveLength(1);
    expect(companions[0].d).toBe(getCanonicalBlobbiD(ISLAND_PUBKEY, ISLAND_PET_ID));
    expect(companions[0].name).toBe('Brook');
    expect(companions[0].stage).toBe('baby');
    expect(companions[0].isLegacy).toBe(false);
  });

  it('is retained alongside a Ditto-created canonical Blobbi', () => {
    const companions = collectVisibleCompanions([makeIslandEvent(), makeCanonicalEvent()]);
    expect(companions.map((c) => c.d).sort()).toEqual(
      [getCanonicalBlobbiD(ISLAND_PUBKEY, ISLAND_PET_ID), CANONICAL_D].sort(),
    );
  });

  it('an Island-branded event that also carries old schema tags is still dropped', () => {
    expect(collectVisibleCompanions([makeIslandEvent([['incubation_time', '3600']])])).toHaveLength(0);
  });
});
