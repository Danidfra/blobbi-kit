import { describe, it, expect } from 'vitest';
import {
  BLOBBI_RELAY_URL,
  SyncConsent,
  SyncLedger,
  classifyRejection,
  decideRead,
  dedupeRelayUrls,
  isSyncableEvent,
  mergeRelayEvents,
  normalizeRelayUrl,
  planSync,
  summarizeDelivery,
  withSyncConsent,
  withPrimaryRelay,
  type RelayEvent,
  type RelayReadState,
  type SyncPolicy,
} from './relay-routing';

const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const DITTO = 'wss://relay.ditto.pub';
const PRIMAL = 'wss://relay.primal.net';

let n = 0;
function ev(o: Partial<RelayEvent> & { kind: number }): RelayEvent {
  n += 1;
  return { id: o.id ?? `id${String(n).padStart(4, '0')}`, pubkey: o.pubkey ?? ME, created_at: o.created_at ?? 100, tags: o.tags ?? [], kind: o.kind };
}
const pet = (d: string, at: number, id?: string) => ev({ kind: 31124, created_at: at, tags: [['d', d]], id });
const state = (relay: string, status: RelayReadState['status'], events: RelayEvent[] = [], suspect = false): RelayReadState => ({ relay, status, events, suspect });
const own: SyncPolicy = { allows: (e) => e.pubkey === ME, destinations: () => [BLOBBI_RELAY_URL, DITTO, PRIMAL] };
const PETS = [{ kinds: [31124], authors: [ME] }];

describe('relay URLs', () => {
  it('normalizes, drops what is not a websocket URL, and puts the primary first', () => {
    expect(normalizeRelayUrl(' wss://Relay.Blobbi.pet/ ')).toBe(BLOBBI_RELAY_URL);
    expect(normalizeRelayUrl('https://relay.blobbi.pet')).toBeNull();
    expect(dedupeRelayUrls([DITTO, `${DITTO}/`, null, 'nope', PRIMAL])).toEqual([DITTO, PRIMAL]);
    expect(withPrimaryRelay([DITTO, BLOBBI_RELAY_URL, PRIMAL])).toEqual([BLOBBI_RELAY_URL, DITTO, PRIMAL]);
  });
});

describe('merging answers from several relays', () => {
  it('removes duplicates by id', () => {
    const a = ev({ kind: 1124 });
    expect(mergeRelayEvents([a, { ...a }, a])).toHaveLength(1);
  });

  it('keeps the newest revision of an address, also when it came from a secondary', () => {
    const old = pet('blobbi-x', 100);
    const fresh = pet('blobbi-x', 200);
    expect(mergeRelayEvents([old, fresh])).toEqual([fresh]);
    expect(mergeRelayEvents([fresh, old])).toEqual([fresh]);
  });

  it('on equal created_at the lower id wins (NIP-01)', () => {
    const low = pet('blobbi-x', 100, '0001');
    const high = pet('blobbi-x', 100, '0002');
    expect(mergeRelayEvents([high, low])).toEqual([low]);
  });

  it('keeps distinct addresses and every regular event (history)', () => {
    const events = [pet('a', 1), pet('b', 2), ev({ kind: 1124, created_at: 3 }), ev({ kind: 1124, created_at: 4 }), ev({ kind: 11125, created_at: 5 }), ev({ kind: 11125, created_at: 6 })];
    const merged = mergeRelayEvents(events);
    expect(merged.map((e) => e.kind)).toEqual([11125, 1124, 1124, 31124, 31124]);
  });
});

describe('deciding whether a read is usable', () => {
  const one = pet('a', 100);
  const decide = (states: RelayReadState[], deadlinePassed = false, knownHeads = [] as { address: string; created_at: number; id: string }[]) =>
    decideRead({ states, filters: PETS, deadlinePassed, knownHeads });

  it('every relay at EOSE: answered and complete, empty included', () => {
    expect(decide([state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'eose')])).toEqual({ status: 'answered', complete: true, events: [] });
    expect(decide([state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'eose', [one])])).toMatchObject({ status: 'answered', complete: true, events: [one] });
  });

  it('an empty primary never decides while a secondary is still silent', () => {
    expect(decide([state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'pending')])).toEqual({ status: 'wait' });
    expect(decide([state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'pending')], true)).toEqual({ status: 'wait' });
  });

  it('an empty answer with a failed relay is unknown, not empty', () => {
    expect(decide([state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'failed')])).toEqual({ status: 'unknown', reason: 'empty-with-failures' });
    expect(decide([state(BLOBBI_RELAY_URL, 'failed'), state(DITTO, 'failed')])).toEqual({ status: 'unknown', reason: 'no-relay-answered' });
  });

  it('the primary failing leaves the secondaries answer usable, marked incomplete', () => {
    expect(decide([state(BLOBBI_RELAY_URL, 'failed'), state(DITTO, 'eose', [one])])).toEqual({ status: 'answered', complete: false, events: [one] });
  });

  it('waits for a slow relay until the deadline, but not for a suspect one', () => {
    const slow = [state(BLOBBI_RELAY_URL, 'pending'), state(DITTO, 'eose', [one])];
    expect(decide(slow)).toEqual({ status: 'wait' });
    expect(decide(slow, true)).toMatchObject({ status: 'answered', complete: false });
    expect(decide([state(BLOBBI_RELAY_URL, 'pending', [], true), state(DITTO, 'eose', [one])])).toMatchObject({ status: 'answered', complete: false });
  });

  it('a degraded answer older than a head this device knows is unknown (stale)', () => {
    const head = { address: `31124:${ME}:a`, created_at: 200, id: 'ffff' };
    expect(decide([state(BLOBBI_RELAY_URL, 'failed'), state(DITTO, 'eose', [one])], false, [head])).toEqual({ status: 'unknown', reason: 'stale' });
    // a known address the secondary lacks entirely is stale as well
    const missing = { address: `31124:${ME}:zzz`, created_at: 50, id: 'eeee' };
    expect(decide([state(BLOBBI_RELAY_URL, 'failed'), state(DITTO, 'eose', [one])], false, [missing])).toEqual({ status: 'unknown', reason: 'stale' });
    // a complete answer is trusted as it is
    expect(decide([state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'eose', [one])], false, [head])).toMatchObject({ status: 'answered', complete: true });
    // and a head of somebody else's is not this filter's business
    const theirs = { address: `31124:${OTHER}:a`, created_at: 900, id: 'dddd' };
    expect(decide([state(BLOBBI_RELAY_URL, 'failed'), state(DITTO, 'eose', [one])], false, [theirs])).toMatchObject({ status: 'answered' });
  });
});

describe('planning what to carry between relays', () => {
  it('an event only a secondary has goes to the primary and the other secondary', () => {
    const e = pet('a', 100);
    const tasks = planSync({ states: [state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'eose', [e]), state(PRIMAL, 'eose')], filters: PETS, policy: own });
    expect(tasks.map((t) => [t.relay, t.reason, t.event.id])).toEqual([[BLOBBI_RELAY_URL, 'missing', e.id], [PRIMAL, 'missing', e.id]]);
  });

  it('an event only the primary has goes to the secondaries', () => {
    const e = pet('a', 100);
    const tasks = planSync({ states: [state(BLOBBI_RELAY_URL, 'eose', [e]), state(DITTO, 'eose')], filters: PETS, policy: own });
    expect(tasks).toEqual([{ event: e, relay: DITTO, reason: 'missing' }]);
  });

  it('carries only the winning revision, to the relay holding the older one', () => {
    const old = pet('a', 100);
    const fresh = pet('a', 200);
    const tasks = planSync({ states: [state(BLOBBI_RELAY_URL, 'eose', [old]), state(DITTO, 'eose', [fresh])], filters: [{ ...PETS[0], limit: 1 }], policy: own });
    expect(tasks).toEqual([{ event: fresh, relay: BLOBBI_RELAY_URL, reason: 'older-version' }]);
  });

  it('a relay that failed, is pending, or was not asked is left alone', () => {
    const e = pet('a', 100);
    expect(planSync({ states: [state(BLOBBI_RELAY_URL, 'failed'), state(DITTO, 'eose', [e]), state(PRIMAL, 'pending')], filters: PETS, policy: own })).toEqual([]);
    const narrow: SyncPolicy = { allows: () => true, destinations: () => [DITTO] };
    expect(planSync({ states: [state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'eose', [e])], filters: PETS, policy: narrow })).toEqual([]);
  });

  it('a filled limit leaves presence unknown', () => {
    const mine = [ev({ kind: 1124, created_at: 5 }), ev({ kind: 1124, created_at: 4 })];
    const theirs = [ev({ kind: 1124, created_at: 3 }), ev({ kind: 1124, created_at: 2 })];
    const filters = [{ kinds: [1124], authors: [ME], limit: 2 }];
    expect(planSync({ states: [state(BLOBBI_RELAY_URL, 'eose', mine), state(DITTO, 'eose', theirs)], filters, policy: own })).toEqual([]);
    const roomy = [{ kinds: [1124], authors: [ME], limit: 10 }];
    expect(planSync({ states: [state(BLOBBI_RELAY_URL, 'eose', mine), state(DITTO, 'eose', theirs)], filters: roomy, policy: own })).toHaveLength(4);
  });

  it('never carries third-party, private, ephemeral, expiring, relay-bound or deleted events', () => {
    const cases: RelayEvent[] = [
      ev({ kind: 31124, pubkey: OTHER, tags: [['d', 'a']] }),
      ev({ kind: 1059 }),
      ev({ kind: 21201 }),
      ev({ kind: 31950, tags: [['d', 'session:x'], ['expiration', '1']] }),
      ev({ kind: 31124, tags: [['d', 'p'], ['-']] }),
      ev({ kind: 31125, tags: [['d', 'legacy']] }),
      ev({ kind: 5, tags: [['e', 'x']] }),
    ];
    const filters = [{ authors: [ME, OTHER] }];
    expect(planSync({ states: [state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'eose', cases)], filters, policy: own })).toEqual([]);
    expect(isSyncableEvent(ev({ kind: 31124, tags: [['d', 'a']] }))).toBe(true);

    const gone = ev({ kind: 1124 });
    const deletion = ev({ kind: 5, tags: [['e', gone.id]] });
    expect(planSync({ states: [state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'eose', [gone, deletion])], filters, policy: own })).toEqual([]);
  });
});

describe('verdicts and the delivery ledger', () => {
  it('classifies relay messages', () => {
    expect(classifyRejection('duplicate: already have this event')).toBe('accepted');
    expect(classifyRejection('replaced: have newer event')).toBe('superseded');
    expect(classifyRejection('blocked: this relay is in pilot mode; author is not on the write list')).toBe('rejected');
    expect(classifyRejection('invalid: event too large')).toBe('rejected');
    expect(classifyRejection('rate-limited: slow down')).toBe('retry');
    expect(classifyRejection('Timed out')).toBe('retry');
    expect(classifyRejection(undefined)).toBe('retry');
  });

  it('summarizes a publication: delivered elsewhere, primary pending or refused', () => {
    expect(summarizeDelivery([{ relay: BLOBBI_RELAY_URL, verdict: 'retry', message: 'Timed out' }, { relay: DITTO, verdict: 'accepted' }], BLOBBI_RELAY_URL)).toEqual({
      delivered: true, primaryDelivered: false, primaryPending: true, primaryRejected: false, primaryMessage: 'Timed out',
    });
    expect(summarizeDelivery([{ relay: BLOBBI_RELAY_URL, verdict: 'rejected', message: 'blocked: x' }, { relay: DITTO, verdict: 'accepted' }], BLOBBI_RELAY_URL)).toMatchObject({ delivered: true, primaryRejected: true, primaryPending: false });
    expect(summarizeDelivery([{ relay: BLOBBI_RELAY_URL, verdict: 'rejected' }, { relay: DITTO, verdict: 'retry' }], BLOBBI_RELAY_URL)).toMatchObject({ delivered: false, primaryRejected: false });
  });

  it('accepted is never offered again; a refusal waits out its TTL; a silence is retried with growing waits, then dropped', () => {
    let now = 1_000_000;
    const saved: unknown[] = [];
    const ledger = new SyncLedger({ now: () => now, onChange: (e) => saved.push(e) });
    expect(ledger.canAttempt('e1', DITTO)).toBe(true);
    ledger.record('e1', DITTO, 'accepted');
    expect(ledger.canAttempt('e1', DITTO)).toBe(false);
    expect(ledger.canAttempt('e1', PRIMAL)).toBe(true);

    ledger.record('e2', BLOBBI_RELAY_URL, 'rejected', 'blocked: pilot');
    expect(ledger.canAttempt('e2', BLOBBI_RELAY_URL)).toBe(false);
    now += 6 * 60 * 60 * 1000 + 1;
    expect(ledger.canAttempt('e2', BLOBBI_RELAY_URL)).toBe(true);

    ledger.record('e3', BLOBBI_RELAY_URL, 'retry', 'Timed out');
    expect(ledger.canAttempt('e3', BLOBBI_RELAY_URL)).toBe(false);
    expect(ledger.pending(BLOBBI_RELAY_URL).map((p) => p.eventId)).toEqual(['e3']);
    now += 30_000;
    expect(ledger.canAttempt('e3', BLOBBI_RELAY_URL)).toBe(true);
    ledger.record('e3', BLOBBI_RELAY_URL, 'retry');
    now += 30_000;
    expect(ledger.canAttempt('e3', BLOBBI_RELAY_URL)).toBe(false);
    now += 30_000;
    ledger.record('e3', BLOBBI_RELAY_URL, 'retry');
    now += 10 * 60_000;
    expect(ledger.canAttempt('e3', BLOBBI_RELAY_URL)).toBe(false);
    expect(ledger.pending()).toEqual([]);
    expect(saved.length).toBeGreaterThan(0);

    const restored = new SyncLedger({ now: () => now, initial: ledger.snapshot() });
    expect(restored.canAttempt('e1', DITTO)).toBe(false);
  });
});

describe('consent to carry existing events', () => {
  it('is off until the account says so, and off when signed out', () => {
    const consent = new SyncConsent();
    expect(consent.isEnabled(ME)).toBe(false);
    expect(consent.isEnabled(null)).toBe(false);
    expect(consent.allows(ME, DITTO)).toBe(false);
    expect(consent.uncovered(ME, [BLOBBI_RELAY_URL, DITTO])).toEqual([BLOBBI_RELAY_URL, DITTO]);
  });

  it('covers exactly the relays the account was shown, for that account only, and persists', () => {
    const saved: unknown[] = [];
    const consent = new SyncConsent({ now: () => 5, onChange: (r) => saved.push(r) });
    consent.enable(ME, [BLOBBI_RELAY_URL, `${DITTO}/`]);
    expect(consent.allows(ME, DITTO)).toBe(true);
    expect(consent.allows(ME, PRIMAL)).toBe(false);
    expect(consent.allows(OTHER, DITTO)).toBe(false);
    expect(consent.uncovered(ME, [BLOBBI_RELAY_URL, DITTO, PRIMAL])).toEqual([PRIMAL]);

    const restored = new SyncConsent({ initial: consent.snapshot() });
    expect(restored.allows(ME, BLOBBI_RELAY_URL)).toBe(true);
    restored.disable(ME);
    expect(restored.isEnabled(ME)).toBe(false);
    expect(saved).toHaveLength(1);
  });

  it('a policy under consent plans nothing while off, and only consented destinations once on', () => {
    const e = pet('a', 100);
    const states = [state(BLOBBI_RELAY_URL, 'eose'), state(DITTO, 'eose', [e]), state(PRIMAL, 'eose')];
    const consent = new SyncConsent();
    expect(planSync({ states, filters: PETS, policy: withSyncConsent(own, consent, ME) })).toEqual([]);
    consent.enable(ME, [BLOBBI_RELAY_URL]);
    expect(planSync({ states, filters: PETS, policy: withSyncConsent(own, consent, ME) }).map((t) => t.relay)).toEqual([BLOBBI_RELAY_URL]);
    expect(planSync({ states, filters: PETS, policy: withSyncConsent(own, consent, OTHER) })).toEqual([]);
  });
});
