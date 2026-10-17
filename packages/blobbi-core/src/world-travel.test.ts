import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORLD,
  DEPARTURE_WINDOW_S,
  KIND_ACTIVE_PRESENCE,
  KIND_WORLD_LOCATION,
  MAX_CLOCK_SKEW_S,
  MAX_LOCATION_SKEW_S,
  MAX_PRESENCE_TTL_S,
  MAX_TRANSITION_S,
  MIN_STAY_MS,
  PRESENCE_TTL_S,
  WORLD_HOME,
  WORLD_PIXEL,
  activePresenceFilter,
  arrivalDelayMs,
  buildPresenceTemplate,
  buildWorldLocationTemplate,
  compareLocations,
  currentWorld,
  freshPresence,
  isFutureLocation,
  isPresenceFresh,
  isTravelBlobbiD,
  isWorldId,
  knownWorld,
  parseActivePresence,
  parseWorldLocation,
  planTransfer,
  presenceSupports,
  registerWorld,
  replacesLocation,
  resolveWorldLocation,
  transitionKind,
  worldLocationAddress,
  worldLocationFilter,
  type WorldLocation,
} from './world-travel';
import { A, B, dOf, eventId, signAs, verify, type Template } from './world-travel.test-helpers';

const T0 = 1_800_000_000; // seconds
const D = dOf(A);

function location(o: { world: string; at: number; owner?: string; d?: string; latest?: WorldLocation | null; window?: number }): WorldLocation {
  const owner = o.owner ?? A;
  const t = buildWorldLocationTemplate({ owner, d: o.d ?? dOf(owner), world: o.world, latest: o.latest ?? null, now: o.at * 1000, departureWindowS: o.window });
  return parseWorldLocation(signAs(owner, t), { verify })!;
}

/** A location template with one tag changed (or removed with `null`), signed by `by`. */
function tampered(change: Record<string, string | null | string[]>, by = A, kind = KIND_WORLD_LOCATION): ReturnType<typeof signAs> {
  const base = buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: T0 * 1000 });
  let tags = base.tags.map((t) => [...t]);
  for (const [name, value] of Object.entries(change)) {
    tags = tags.filter((t) => t[0] !== name);
    if (Array.isArray(value)) tags.push(...value.map((v) => [name, v]));
    else if (value !== null) tags.push([name, value]);
  }
  return signAs(by, { ...base, kind, tags });
}

describe('World identifiers', () => {
  it('accepts short dash-separated lowercase names, and nothing that could be a URL or a host', () => {
    for (const ok of ['blobbi-home', 'blobbi-pixel', 'nostr-farm', 'blobbi-island', 'rumble', 'w42']) expect(isWorldId(ok), ok).toBe(true);
    for (const bad of ['', 'ab', 'Blobbi-Home', 'blobbi_home', '-home', 'home-', 'a--b', 'https://blobbi.pet', 'blobbi.pet', 'javascript:alert(1)', '9lives', 'x'.repeat(33), ' blobbi-home', 42, null, undefined])
      expect(isWorldId(bad), String(bad)).toBe(false);
  });

  it('knows the two first Worlds; another World registers for its name only, and core rules ignore the registry', () => {
    expect(knownWorld(WORLD_HOME)?.name).toBe('Blobbi Home');
    expect(knownWorld(WORLD_PIXEL)?.name).toBe('Blobbi Pixel');
    expect(knownWorld('blobbi-island')).toBeNull();
    expect(registerWorld({ id: 'Bad Id', name: 'x' })).toBe(false);
    expect(registerWorld({ id: 'blobbi-island', name: '  Blobbi Island  ' })).toBe(true);
    expect(knownWorld('blobbi-island')?.name).toBe('Blobbi Island');
    // An unregistered but valid World is still a place a Blobbi can be
    expect(location({ world: 'nostr-farm', at: T0 }).world).toBe('nostr-farm');
  });
});

describe('Blobbi identity', () => {
  it('a canonical d must carry its owner prefix; a legacy d must be plainly printable', () => {
    expect(isTravelBlobbiD(dOf(A), A)).toBe(true);
    expect(isTravelBlobbiD(dOf(B), A)).toBe(false); // another account's Blobbi
    expect(isTravelBlobbiD('blobbi-a1a1a1a1a1a1-XYZ', A)).toBe(false); // canonical prefix, broken pet id
    expect(isTravelBlobbiD('bambu', A)).toBe(true);
    for (const bad of ['', 'has space', 'a:b', '31124:x:y', 'x'.repeat(101), 5]) expect(isTravelBlobbiD(bad, A), String(bad)).toBe(false);
  });
});

describe('World Location: schema and validation', () => {
  it('a template signed by the owner parses back to what it says', () => {
    const t = buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: T0 * 1000 + 999, departureWindowS: 3 });
    expect(t.kind).toBe(31126);
    expect(t.created_at).toBe(T0);
    expect(t.content).toBe('');
    expect(t.tags).toEqual([
      ['d', D],
      ['a', `31124:${A}:${D}`],
      ['v', '1'],
      ['world', 'blobbi-pixel'],
      ['from', 'blobbi-home'],
      ['arrival_after', String(T0 + 3)],
      ['b', 'blobbi:ecosystem:v1'],
      ['alt', 'Blobbi world location: this Blobbi is now in Blobbi Pixel'],
    ]);
    const loc = parseWorldLocation(signAs(A, t), { verify })!;
    expect(loc).toMatchObject({ owner: A, d: D, world: WORLD_PIXEL, from: WORLD_HOME, createdAt: T0, arrivalAfter: T0 + 3, prev: null });
    expect(worldLocationAddress(A, D)).toBe(`31126:${A}:${D}`);
    expect(worldLocationFilter(A, D)).toEqual({ kinds: [31126], authors: [A], '#d': [D], limit: 5 });
  });

  it('names the location it replaces, and leaves `from` out when moving to the same World', () => {
    const first = location({ world: WORLD_PIXEL, at: T0 });
    const back = buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_HOME, latest: first, now: (T0 + 10) * 1000 });
    expect(back.tags).toContainEqual(['prev', first.id]);
    expect(back.tags).toContainEqual(['from', WORLD_PIXEL]);
    const same = buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: first, now: (T0 + 10) * 1000 });
    expect(same.tags.find((t) => t[0] === 'from')).toBeUndefined();
  });

  it('rejects the wrong kind, version, Blobbi, account, World, and malformed hints', () => {
    const cases: Array<[string, ReturnType<typeof signAs>]> = [
      ['kind 31124', tampered({}, A, 31124)],
      ['kind 31634 (item placement)', tampered({}, A, 31634)],
      ['no version', tampered({ v: null })],
      ['version 2', tampered({ v: '2' })],
      ['no d', tampered({ d: null })],
      ['two d', tampered({ d: [D, dOf(A, '9999999999')] })],
      ['another account’s Blobbi d', tampered({ d: dOf(B), a: `31124:${A}:${dOf(B)}` })],
      ['a for another Blobbi', tampered({ a: `31124:${A}:${dOf(A, '9999999999')}` })],
      ['a for another account', tampered({ a: `31124:${B}:${D}` })],
      ['a of another kind', tampered({ a: `31125:${A}:${D}` })],
      ['no a', tampered({ a: null })],
      ['no world', tampered({ world: null })],
      ['world is a URL', tampered({ world: 'https://evil.example' })],
      ['two worlds', tampered({ world: [WORLD_PIXEL, WORLD_HOME] })],
      ['from equals world', tampered({ from: WORLD_PIXEL })],
      ['from invalid', tampered({ from: 'Not A World' })],
      ['arrival_after not a number', tampered({ arrival_after: 'soon' })],
      ['prev not an id', tampered({ prev: 'abc' })],
    ];
    for (const [name, e] of cases) expect(parseWorldLocation(e, { verify }), name).toBeNull();
    // Signed by someone else: the author owns the event, and B's event cannot speak for A's Blobbi
    expect(parseWorldLocation(tampered({}, B), { verify })).toBeNull();
  });

  it('rejects a bad signature or a forged id, and anything not shaped like an event', () => {
    const good = tampered({});
    expect(parseWorldLocation(good, { verify })).not.toBeNull();
    expect(parseWorldLocation({ ...good, sig: 'sig:00' }, { verify })).toBeNull();
    expect(parseWorldLocation({ ...good, tags: [...good.tags, ['x', 'y']] }, { verify })).toBeNull(); // id no longer matches
    expect(parseWorldLocation({ ...good, id: 'XYZ' })).toBeNull();
    expect(parseWorldLocation({ ...good, pubkey: A.toUpperCase() })).toBeNull();
    expect(parseWorldLocation({ ...good, tags: [['d', 5]] })).toBeNull();
    for (const junk of [null, undefined, 'event', 42, {}, []]) expect(parseWorldLocation(junk)).toBeNull();
    expect(parseWorldLocation(good, { verify: () => { throw new Error('boom'); } })).toBeNull();
  });

  it('ignores unknown tags (a host adds client, published_at), and clamps an over-long arrival hint', () => {
    expect(parseWorldLocation(tampered({ client: 'Blobbi', published_at: String(T0) }), { verify })).not.toBeNull();
    const far = parseWorldLocation(tampered({ arrival_after: String(T0 + 3600) }), { verify })!;
    expect(far.arrivalAfter).toBe(T0 + MAX_TRANSITION_S);
    const past = parseWorldLocation(tampered({ arrival_after: String(T0 - 100) }), { verify })!;
    expect(past.arrivalAfter).toBe(T0);
    const none = parseWorldLocation(tampered({ arrival_after: null }), { verify })!;
    expect(none.arrivalAfter).toBe(T0);
  });
});

describe('World Location: NIP-01 order and resolution', () => {
  it('the newer replaces the older; at the same second the lower id wins; the order is total', () => {
    const a = location({ world: WORLD_PIXEL, at: T0 });
    const b = location({ world: WORLD_HOME, at: T0 + 1 });
    expect(replacesLocation(b, a)).toBe(true);
    expect(replacesLocation(a, b)).toBe(false);
    const c = location({ world: WORLD_HOME, at: T0 });
    const [lo, hi] = a.id < c.id ? [a, c] : [c, a];
    expect(replacesLocation(lo, hi)).toBe(true);
    expect(replacesLocation(hi, lo)).toBe(false);
    expect([b, lo, hi].sort(compareLocations).map((l) => l.id)).toEqual([b.id, lo.id, hi.id]);
  });

  it('every order of the same events from several relays resolves to the same location', () => {
    const evs = [location({ world: WORLD_PIXEL, at: T0 }), location({ world: WORLD_HOME, at: T0 + 5 }), location({ world: WORLD_PIXEL, at: T0 + 5 }), location({ world: WORLD_HOME, at: T0 + 2 })].map((l) => l.event);
    const expected = resolveWorldLocation(evs, { owner: A, d: D, verify })!.id;
    const perms = (xs: typeof evs): (typeof evs)[] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    for (const p of perms(evs)) expect(resolveWorldLocation(p, { owner: A, d: D, verify })!.id).toBe(expected);
    // Duplicates (the same event from two relays) change nothing
    expect(resolveWorldLocation([...evs, ...evs], { owner: A, d: D, verify })!.id).toBe(expected);
  });

  it('keeps each Blobbi and each account apart, and drops what does not verify', () => {
    const mine = location({ world: WORLD_PIXEL, at: T0 });
    const otherBlobbi = location({ world: WORLD_HOME, at: T0 + 9, d: dOf(A, '9999999999') });
    const otherAccount = location({ world: WORLD_HOME, at: T0 + 9, owner: B });
    const forged = { ...location({ world: WORLD_HOME, at: T0 + 9 }).event, sig: 'sig:bad' };
    const got = resolveWorldLocation([mine.event, otherBlobbi.event, otherAccount.event, forged, 'junk', null], { owner: A, d: D, verify });
    expect(got?.id).toBe(mine.id);
    expect(resolveWorldLocation([otherAccount.event], { owner: A, d: D, verify })).toBeNull();
    expect(resolveWorldLocation([otherBlobbi.event], { owner: A, d: dOf(A, '9999999999'), verify })?.world).toBe(WORLD_HOME);
  });

  it('no location at all is the default World (home), and a historical location is just the newest', () => {
    expect(currentWorld(null)).toBe(DEFAULT_WORLD);
    expect(DEFAULT_WORLD).toBe(WORLD_HOME);
    const old = location({ world: WORLD_PIXEL, at: T0 - 86_400 * 365 });
    expect(currentWorld(resolveWorldLocation([old.event], { owner: A, d: D, verify }))).toBe(WORLD_PIXEL);
  });

  it('a writer whose clock is behind still replaces the location it read (created_at after it)', () => {
    const ahead = location({ world: WORLD_PIXEL, at: T0 + 3600 }); // a device an hour ahead
    const t = buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_HOME, latest: ahead, now: T0 * 1000 });
    expect(t.created_at).toBe(T0 + 3601);
    const back = parseWorldLocation(signAs(A, t), { verify })!;
    expect(resolveWorldLocation([ahead.event, back.event], { owner: A, d: D, verify })!.world).toBe(WORLD_HOME);
  });
});

describe('transfer rules (planTransfer)', () => {
  const base = { owner: A, d: D, explicit: false, previousRecentlyActive: false };

  it('already here: nothing to publish (none at all is home)', () => {
    expect(planTransfer({ ...base, world: WORLD_HOME, latest: null, now: T0 * 1000 }).kind).toBe('already-here');
    const px = location({ world: WORLD_PIXEL, at: T0 });
    expect(planTransfer({ ...base, world: WORLD_PIXEL, latest: px, now: (T0 + 99) * 1000 }).kind).toBe('already-here');
  });

  it('elsewhere: one location naming this World, after the one it read', () => {
    const px = location({ world: WORLD_PIXEL, at: T0 });
    const plan = planTransfer({ ...base, world: WORLD_HOME, latest: px, now: (T0 + 60) * 1000 });
    expect(plan.kind).toBe('transfer');
    if (plan.kind !== 'transfer') return;
    expect(plan.from).toBe(WORLD_PIXEL);
    expect(plan.template.created_at).toBe(T0 + 60);
    expect(plan.template.tags).toContainEqual(['arrival_after', String(T0 + 60)]);
  });

  it('a move moments ago is not undone by a casual input, only by an explicit request (no ping-pong)', () => {
    const px = location({ world: WORLD_PIXEL, at: T0 });
    const soon = T0 * 1000 + MIN_STAY_MS - 1;
    expect(planTransfer({ ...base, world: WORLD_HOME, latest: px, now: soon }).kind).toBe('contended');
    expect(planTransfer({ ...base, world: WORLD_HOME, latest: px, now: soon, explicit: true }).kind).toBe('transfer');
    expect(planTransfer({ ...base, world: WORLD_HOME, latest: px, now: T0 * 1000 + MIN_STAY_MS }).kind).toBe('transfer');
  });

  it('asks for a departure window only when the previous World was recently active', () => {
    const px = location({ world: WORLD_PIXEL, at: T0 });
    const now = (T0 + 60) * 1000;
    const active = planTransfer({ ...base, world: WORLD_HOME, latest: px, now, previousRecentlyActive: true });
    const quiet = planTransfer({ ...base, world: WORLD_HOME, latest: px, now });
    if (active.kind !== 'transfer' || quiet.kind !== 'transfer') throw new Error('expected transfers');
    const a = parseWorldLocation(signAs(A, active.template), { verify })!;
    const q = parseWorldLocation(signAs(A, quiet.template), { verify })!;
    expect(arrivalDelayMs(a)).toBe(DEPARTURE_WINDOW_S * 1000);
    expect(arrivalDelayMs(q)).toBe(0);
  });
});

describe('transition timing', () => {
  it('the first look is always historical; later changes are live unless ancient', () => {
    const now = T0 * 1000;
    expect(transitionKind({ initial: true, createdAt: T0, now })).toBe('historical');
    expect(transitionKind({ initial: false, createdAt: T0 - 5, now })).toBe('live');
    // A writer's clock ahead (a future created_at) is still live: arrival order decides, not the stamp
    expect(transitionKind({ initial: false, createdAt: T0 + 300, now })).toBe('live');
    expect(transitionKind({ initial: false, createdAt: T0 - 601, now })).toBe('historical');
  });

  it('the arrival wait never exceeds the bound, whatever the hint', () => {
    expect(arrivalDelayMs({ createdAt: T0, arrivalAfter: T0 + 3 })).toBe(3000);
    expect(arrivalDelayMs({ createdAt: T0, arrivalAfter: T0 + 999 })).toBe(MAX_TRANSITION_S * 1000);
    expect(arrivalDelayMs({ createdAt: T0, arrivalAfter: T0 - 5 })).toBe(0);
  });
});

describe('Active Presence', () => {
  const presence = (o: { at: number; world?: string; owner?: string; d?: string; ttl?: number }) => signAs(o.owner ?? A, buildPresenceTemplate({ owner: o.owner ?? A, d: o.d ?? D, world: o.world ?? WORLD_PIXEL, now: o.at * 1000, ttlS: o.ttl }));

  it('is ephemeral, short-lived (NIP-40), and names the Blobbi and the World', () => {
    const e = presence({ at: T0 });
    expect(e.kind).toBe(KIND_ACTIVE_PRESENCE);
    expect(e.kind).toBeGreaterThanOrEqual(20000);
    expect(e.kind).toBeLessThan(30000);
    expect(e.tags).toContainEqual(['expiration', String(T0 + PRESENCE_TTL_S)]);
    expect(e.tags.find((t) => t[0] === 'd')).toBeUndefined();
    expect(parseActivePresence(e, { verify })).toMatchObject({ owner: A, d: D, world: WORLD_PIXEL, createdAt: T0, expiresAt: T0 + PRESENCE_TTL_S });
    expect(activePresenceFilter(A, D, T0)).toEqual({ kinds: [21124], authors: [A], '#a': [`31124:${A}:${D}`], since: T0 });
  });

  it('rejects the wrong account, a Blobbi of another account, a bad World, a missing or over-long expiry, a bad signature', () => {
    const base = buildPresenceTemplate({ owner: A, d: D, world: WORLD_PIXEL, now: T0 * 1000 });
    const withTags = (f: (tags: string[][]) => string[][], by = A): ReturnType<typeof signAs> => signAs(by, { ...base, tags: f(base.tags.map((t) => [...t])) } as Template);
    const set = (name: string, v: string | null) => (tags: string[][]) => [...tags.filter((t) => t[0] !== name), ...(v === null ? [] : [[name, v]])];
    expect(parseActivePresence(withTags((t) => t, B), { verify })).toBeNull(); // B signing about A's Blobbi
    expect(parseActivePresence(withTags(set('a', `31124:${A}:${dOf(B)}`)), { verify })).toBeNull();
    expect(parseActivePresence(withTags(set('a', `31126:${A}:${D}`)), { verify })).toBeNull();
    expect(parseActivePresence(withTags(set('world', 'WWW')), { verify })).toBeNull();
    expect(parseActivePresence(withTags(set('expiration', null)), { verify })).toBeNull();
    expect(parseActivePresence(withTags(set('expiration', String(T0 + 3600))), { verify })).toBeNull();
    expect(parseActivePresence(withTags(set('expiration', String(T0))), { verify })).toBeNull();
    expect(parseActivePresence(withTags(set('v', '9')), { verify })).toBeNull();
    expect(parseActivePresence({ ...presence({ at: T0 }), sig: 'sig:x' }, { verify })).toBeNull();
    expect(parseActivePresence(location({ world: WORLD_PIXEL, at: T0 }).event, { verify })).toBeNull();
  });

  it('is fresh until it expires, and not believed when dated far ahead of the reader', () => {
    const p = parseActivePresence(presence({ at: T0 }), { verify })!;
    expect(isPresenceFresh(p, T0 * 1000)).toBe(true);
    expect(isPresenceFresh(p, (T0 + PRESENCE_TTL_S - 1) * 1000)).toBe(true);
    expect(isPresenceFresh(p, (T0 + PRESENCE_TTL_S) * 1000)).toBe(false);
    const future = parseActivePresence(presence({ at: T0 + 200 }), { verify })!;
    expect(isPresenceFresh(future, T0 * 1000)).toBe(false);
    expect(isPresenceFresh(parseActivePresence(presence({ at: T0 + 30 }), { verify })!, T0 * 1000)).toBe(true); // small skew
  });

  it('the freshest presence per Blobbi and World; none is "unknown" (missing events are normal)', () => {
    const now = (T0 + 50) * 1000;
    const q = { owner: A, d: D, world: WORLD_PIXEL, now, verify };
    expect(freshPresence([], q)).toBeNull();
    const older = presence({ at: T0 });
    const newer = presence({ at: T0 + 40 });
    const otherWorld = presence({ at: T0 + 45, world: WORLD_HOME });
    const otherBlobbi = presence({ at: T0 + 45, d: dOf(A, '9999999999') });
    const expired = presence({ at: T0 - 500 });
    expect(freshPresence([older, otherWorld, newer, otherBlobbi, expired, 'junk'], q)?.id).toBe(newer.id);
    expect(freshPresence([expired], q)).toBeNull();
  });

  it('only a presence for the World holding the Blobbi supports it; an old World’s presence never revives it', () => {
    const home = location({ world: WORLD_HOME, at: T0 + 10 });
    const pixelPresence = parseActivePresence(presence({ at: T0 + 20 }), { verify })!; // an old Pixel device, still renewing
    expect(presenceSupports(pixelPresence, home)).toBe(false);
    expect(currentWorld(home)).toBe(WORLD_HOME); // the location is untouched by any presence
    expect(presenceSupports(pixelPresence, location({ world: WORLD_PIXEL, at: T0 }))).toBe(true);
    expect(presenceSupports(null, home)).toBe(false);
  });
});

describe('timestamps (M16.1)', () => {
  const T = Date.UTC(2027, 0, 1, 12);
  const at = (world: string, ms: number, latest: WorldLocation | null = null) => parseWorldLocation(signAs(A, buildWorldLocationTemplate({ owner: A, d: dOf(A), world, latest, now: ms })), { verify })!;

  it('a location dated beyond MAX_LOCATION_SKEW_S ahead is ignored with a clock, and counts once the clock reaches it', () => {
    const now = at(WORLD_PIXEL, T);
    const future = at(WORLD_HOME, T + (MAX_LOCATION_SKEW_S + 60) * 1000);
    const events = [now.event, future.event];
    expect(resolveWorldLocation(events, { owner: A, d: dOf(A), verify, now: T })?.id).toBe(now.id);
    expect(isFutureLocation(future, T)).toBe(true);
    // Pure NIP-01 without a clock (as before 0.11), and with the clock once it is there
    expect(resolveWorldLocation(events, { owner: A, d: dOf(A), verify })?.id).toBe(future.id);
    expect(resolveWorldLocation(events, { owner: A, d: dOf(A), verify, now: T + (MAX_LOCATION_SKEW_S + 60) * 1000 })?.id).toBe(future.id);
  });

  it('within the skew allowed, a location ahead still wins (a clock a few minutes fast is normal), and moves stay bounded', () => {
    const ahead = at(WORLD_PIXEL, T + 600_000);
    const latest = resolveWorldLocation([ahead.event], { owner: A, d: dOf(A), verify, now: T })!;
    expect(latest.id).toBe(ahead.id);
    const t = buildWorldLocationTemplate({ owner: A, d: dOf(A), world: WORLD_HOME, latest, now: T });
    expect(t.created_at).toBe(ahead.createdAt + 1);
    expect(t.created_at - T / 1000).toBeLessThanOrEqual(MAX_LOCATION_SKEW_S + 1);
  });

  it('a far-future event can never block travel: the next move is dated by the reader’s clock, not after it', () => {
    const year2100 = at(WORLD_PIXEL, Date.UTC(2100, 0, 1));
    const latest = resolveWorldLocation([year2100.event], { owner: A, d: dOf(A), verify, now: T });
    expect(latest).toBeNull();
    const plan = planTransfer({ owner: A, d: dOf(A), world: WORLD_PIXEL, latest, now: T, explicit: false, previousRecentlyActive: false });
    expect(plan.kind).toBe('transfer');
    if (plan.kind === 'transfer') expect(plan.template.created_at).toBe(T / 1000);
  });

  it('the stay is measured from when the reader saw a location ahead of its clock, not from its date', () => {
    const ahead = at(WORLD_HOME, T + 600_000);
    const casual = (now: number, observedAt?: number) => planTransfer({ owner: A, d: dOf(A), world: WORLD_PIXEL, latest: ahead, now, explicit: false, previousRecentlyActive: false, observedAt }).kind;
    expect(casual(T + 1_000)).toBe('contended'); // without observedAt: its date, 10 min of contention
    expect(casual(T + 1_000, T)).toBe('contended');
    expect(casual(T + MIN_STAY_MS, T)).toBe('transfer');
    // An old event seen just now (a fresh device) is not "just moved"
    const old = at(WORLD_HOME, T - 3_600_000);
    expect(planTransfer({ owner: A, d: dOf(A), world: WORLD_PIXEL, latest: old, now: T, explicit: false, previousRecentlyActive: false, observedAt: T }).kind).toBe('transfer');
  });

  it('a replayed old location never replaces a newer one, from any relay', () => {
    const first = at(WORLD_PIXEL, T);
    const second = at(WORLD_HOME, T + 60_000, first);
    expect(resolveWorldLocation([second.event, first.event, structuredClone(first.event)], { owner: A, d: dOf(A), verify, now: T + 60_000 })?.id).toBe(second.id);
  });

  it('malformed timestamps are rejected: negative, fractional, beyond safe integers', () => {
    const base = signAs(A, buildWorldLocationTemplate({ owner: A, d: dOf(A), world: WORLD_HOME, latest: null, now: T }));
    for (const created_at of [-1, 1.5, Number.MAX_SAFE_INTEGER + 2, Number.NaN]) {
      const e = { ...base, created_at };
      expect(parseWorldLocation({ ...e, id: eventId(A, e), sig: `sig:${eventId(A, e)}` }, { verify })).toBeNull();
    }
  });

  it('presence: expired, dated too far ahead, or claiming too long a life is never fresh', () => {
    const p = parseActivePresence(signAs(A, buildPresenceTemplate({ owner: A, d: dOf(A), world: WORLD_PIXEL, now: T })), { verify })!;
    expect(isPresenceFresh(p, T)).toBe(true);
    expect(isPresenceFresh(p, T + PRESENCE_TTL_S * 1000)).toBe(false);
    const ahead = parseActivePresence(signAs(A, buildPresenceTemplate({ owner: A, d: dOf(A), world: WORLD_PIXEL, now: T + (MAX_CLOCK_SKEW_S + 5) * 1000 })), { verify })!;
    expect(isPresenceFresh(ahead, T)).toBe(false);
    const long = signAs(A, { ...buildPresenceTemplate({ owner: A, d: dOf(A), world: WORLD_PIXEL, now: T }), tags: [['a', `31124:${A}:${dOf(A)}`], ['v', '1'], ['world', WORLD_PIXEL], ['expiration', String(T / 1000 + MAX_PRESENCE_TTL_S + 1)]] });
    expect(parseActivePresence(long, { verify })).toBeNull();
  });
});
