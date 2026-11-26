/**
 * Security hardening of the house protocol (kind 31127): hostile input that a
 * relay or another author can hand any reader. Every case here must end in a
 * result, never an exception.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import {
  BLOBBI_ECOSYSTEM_NAMESPACE,
  HOUSE_LIMITS,
  HouseValidationError,
  KIND_BLOBBI_HOUSE,
  MAIN_HOUSE_ID,
  MAX_HOUSE_SKEW_S,
  MAX_LOCATION_SKEW_S,
  buildHouseTemplate,
  houseFromDittoProfile,
  isFutureHouse,
  parseHouseEvent,
  resolveHouse,
  rotateItem,
  serializeHouse,
  validateHouse,
  type HouseDocument,
  type NostrEvent,
} from './index';

const OWNER = 'a'.repeat(64);

function tiny(): HouseDocument {
  return {
    v: 1,
    name: 'Tiny',
    rooms: [{ id: 'room', size: { w: 4, d: 3, h: 3 }, walls: ['west', 'north'], items: [{ id: 'bed', type: 'official:bed-single', surface: 'floor', x: 2, z: 1.5 }] }],
  };
}

/** The NIP-01 event id. */
function eventId(e: Omit<NostrEvent, 'id' | 'sig'>): string {
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))));
}

/** A house event with its true id (the signature is a placeholder of the right shape; a verifier is injected where it matters). */
function event(content: string, over: Partial<NostrEvent> = {}): NostrEvent {
  const e = {
    pubkey: OWNER,
    created_at: 1_800_000_000,
    kind: KIND_BLOBBI_HOUSE,
    tags: [['d', MAIN_HOUSE_ID], ['v', '1'], ['b', BLOBBI_ECOSYSTEM_NAMESPACE]],
    content,
    sig: 'f'.repeat(128),
    ...over,
  };
  // An explicit `id` in `over` (a forged one) wins over the true one
  return { id: eventId(e), ...e };
}

/** `depth` nested arrays: `[[[…]]]`. */
const nestedArrays = (depth: number) => '['.repeat(depth) + ']'.repeat(depth);
/** `depth` nested objects: `{"a":{"a":…}}`. */
const nestedObjects = (depth: number) => '{"a":'.repeat(depth) + '{}' + '}'.repeat(depth);

describe('K1: deeply nested JSON never throws', () => {
  it('refuses a house with ~20 KB of nesting in an unknown field as malformed (it threw RangeError before)', () => {
    const content = `{"v":1,"name":"x","rooms":[],"x":${nestedArrays(10_000)}}`;
    expect(content.length).toBeLessThan(HOUSE_LIMITS.maxContentBytes);
    const result = parseHouseEvent(event(content));
    expect(result).toMatchObject({ status: 'malformed', doc: null, writable: false });
    expect(result.issues[0].code).toBe('too-deep');
    // The identity is kept, so a client can say whose house could not be read
    expect(result.event?.address).toBe(`31127:${OWNER}:main`);
  });

  it('refuses nesting inside a room, an item, an ext and a material, objects or arrays, up to the content limit', () => {
    const deep = nestedObjects(40_000);
    expect(deep.length).toBeLessThan(HOUSE_LIMITS.maxContentBytes);
    const places = [
      (d: string) => `{"v":1,"name":"x","rooms":[{"id":"r","size":{"w":1,"d":1,"h":1},"walls":[],"items":[],"ext":{"game":${d}}}]}`,
      (d: string) => `{"v":1,"name":"x","rooms":[{"id":"r","size":{"w":1,"d":1,"h":1},"walls":[],"items":[{"id":"i","type":"a:b","surface":"floor","x":0,"z":0,"content":${d}}]}]}`,
      (d: string) => `{"v":1,"name":"x","rooms":[{"id":"r","size":{"w":1,"d":1,"h":1},"walls":[],"items":[],"floor":{"style":"wood","palette":["#fff"],"x":${d}}}]}`,
      (_d: string) => `{"v":1,"name":"x","rooms":${nestedArrays(30_000)}}`,
      (d: string) => `{"v":1,"name":${d},"rooms":[]}`,
    ];
    for (const place of places) {
      expect(() => parseHouseEvent(event(place(deep)))).not.toThrow();
      expect(parseHouseEvent(event(place(deep))).status).toBe('malformed');
    }
  });

  it('keeps accepting nesting up to the limit (applications may nest their own data)', () => {
    // The document is depth 1, `ext` depth 2, so the innermost object here is at exactly maxDepth
    const ext = nestedObjects(HOUSE_LIMITS.maxDepth - 3);
    const ok = JSON.parse(`{"v":1,"name":"x","rooms":[],"ext":{"game":${ext}}}`) as HouseDocument;
    expect(validateHouse(ok).status).toBe('valid');
    const over = JSON.parse(`{"v":1,"name":"x","rooms":[],"ext":{"game":${nestedObjects(HOUSE_LIMITS.maxDepth - 2)}}}`) as HouseDocument;
    expect(validateHouse(over).issues[0].code).toBe('too-deep');
  });

  it('never throws on what plain JSON cannot hold: a cycle, a BigInt, a throwing getter, a hostile event object', () => {
    const cyclic = tiny() as HouseDocument & { self?: unknown };
    cyclic.self = cyclic;
    expect(validateHouse(cyclic).status).toBe('malformed');
    expect(validateHouse({ ...tiny(), big: 1n }).status).toBe('malformed');
    const getter = { ...tiny() };
    Object.defineProperty(getter, 'boom', { enumerable: true, get: () => { throw new Error('boom'); } });
    expect(validateHouse(getter).status).toBe('malformed');
    const hostile = new Proxy({}, { get: () => { throw new Error('boom'); }, has: () => { throw new Error('boom'); } });
    expect(parseHouseEvent(hostile).status).toBe('malformed');
  });

  it('bounds the work on a huge in-memory document (a wide cycle cannot make the walk exponential)', () => {
    const wide: unknown[] = [];
    for (let i = 0; i < 8; i++) wide.push(wide);
    const result = validateHouse({ ...tiny(), wide });
    expect(result.status).toBe('malformed');
  });

  it('turns a deep Ditto profile into a failed import, not an exception', () => {
    const content = `{"room_furniture_v2":{"v":2,"by_room":{"bedroom":[{"id":"official:bed-single","at":"floor","x":1,"y":1,"extra":${nestedArrays(10_000)}}]}}}`;
    expect(() => houseFromDittoProfile(content)).not.toThrow();
    expect(houseFromDittoProfile(content).status).toBe('failed');
  });
});

describe('K2: the event id and signature boundary', () => {
  const content = JSON.stringify(tiny());

  it('accepts an event whose id is its NIP-01 hash, and says the signature was not checked without a verifier', () => {
    expect(parseHouseEvent(event(content))).toMatchObject({ status: 'valid', writable: true, verified: false });
    expect(parseHouseEvent(event(content), { verify: () => true })).toMatchObject({ status: 'valid', verified: true });
  });

  it('refuses an id that is not the hash: a relay cannot alter the content, date or tags under a genuine id', () => {
    const genuine = event(content);
    const altered = [
      { ...genuine, content: JSON.stringify({ ...tiny(), name: 'Stolen' }) },
      { ...genuine, created_at: genuine.created_at + 1 },
      { ...genuine, tags: [...genuine.tags, ['t', 'x']] },
      { ...genuine, pubkey: 'c'.repeat(64) },
    ];
    for (const e of altered) expect(parseHouseEvent(e).issues[0].code).toBe('event-id');
  });

  it('refuses ids and signatures of the wrong shape (length, case, characters)', () => {
    expect(parseHouseEvent(event(content, { id: 'e'.repeat(63) })).issues[0].code).toBe('event-id');
    expect(parseHouseEvent(event(content, { id: 'E'.repeat(64) })).issues[0].code).toBe('event-id');
    for (const sig of ['', 'f'.repeat(127), 'F'.repeat(128), 'z'.repeat(128), `sig:${'f'.repeat(124)}`]) {
      expect(parseHouseEvent(event(content, { sig })).issues[0].code).toBe('signature');
    }
    expect(parseHouseEvent(event(content, { sig: undefined as unknown as string })).issues[0].code).toBe('signature');
  });

  it('checks shapes and the hash before the injected verifier, which never sees a mismatched event', () => {
    let calls = 0;
    const verify = () => ++calls > 0;
    parseHouseEvent({ ...event(content), content: '{}' }, { verify });
    expect(calls).toBe(0);
    parseHouseEvent(event(content), { verify });
    expect(calls).toBe(1);
  });

  it('lets a caller opt out of the id check for an event it already trusts (an unsigned preview)', () => {
    expect(parseHouseEvent(event(content, { id: '0'.repeat(64), sig: '' }), { checkId: false }).status).toBe('valid');
  });
});

describe('K3: a future-dated house never becomes the newest', () => {
  const NOW = 1_800_000_000_000; // ms
  const at = (createdAt: number) => event(JSON.stringify(tiny()), { created_at: createdAt });

  it('reads a house dated beyond MAX_HOUSE_SKEW_S of the reader clock as future: not shown, not writable', () => {
    const far = parseHouseEvent(at(4_000_000_000), { now: NOW });
    expect(far).toMatchObject({ status: 'future', doc: null, writable: false });
    expect(far.event?.createdAt).toBe(4_000_000_000);
    expect(parseHouseEvent(at(NOW / 1000 + MAX_HOUSE_SKEW_S + 1), { now: NOW }).status).toBe('future');
    // Up to the window, a fast clock is believed
    expect(parseHouseEvent(at(NOW / 1000 + MAX_HOUSE_SKEW_S), { now: NOW }).status).toBe('valid');
    // Without a clock, pure NIP-01 (as before)
    expect(parseHouseEvent(at(4_000_000_000)).status).toBe('valid');
    expect(isFutureHouse({ createdAt: 4_000_000_000 }, NOW)).toBe(true);
  });

  it('uses the same window as World Locations', () => {
    expect(MAX_HOUSE_SKEW_S).toBe(MAX_LOCATION_SKEW_S);
  });

  it('lets a legitimate update win over a far-future version for a reader with a clock', () => {
    const legit = parseHouseEvent(at(NOW / 1000), { now: NOW });
    const future = parseHouseEvent(at(4_000_000_000), { now: NOW });
    const candidates = [future, legit].filter((h) => h.status !== 'future' && h.event);
    expect(candidates).toEqual([legit]);
    expect(resolveHouse([at(4_000_000_000), at(NOW / 1000)], { owner: OWNER, houseId: MAIN_HOUSE_ID, verify: null, now: NOW })?.event?.createdAt).toBe(NOW / 1000);
  });

  it('refuses to build on a far-future version, so a forged or broken date never makes this writer sign far-future versions', () => {
    const previous = { createdAt: 4_000_000_000, tags: [] };
    expect(() => buildHouseTemplate({ houseId: 'main', doc: tiny(), now: NOW, previous })).toThrow(HouseValidationError);
    try {
      buildHouseTemplate({ houseId: 'main', doc: tiny(), now: NOW, previous });
    } catch (e) {
      expect((e as HouseValidationError).issues[0].code).toBe('previous-future');
    }
    // A clock a little behind still dates after the replaced version
    expect(buildHouseTemplate({ houseId: 'main', doc: tiny(), now: NOW, previous: { createdAt: NOW / 1000 + 600 } }).created_at).toBe(NOW / 1000 + 601);
    // A client that asked its player may continue the future version anyway
    expect(buildHouseTemplate({ houseId: 'main', doc: tiny(), now: NOW, previous, acceptFuturePrevious: true }).created_at).toBe(4_000_000_001);
  });
});

describe('ownership: only the owner can write the owner\'s house', () => {
  const NOW = 1_800_000_000_000;
  const OTHER = 'b'.repeat(64);
  const house = (over: Partial<NostrEvent>, doc: HouseDocument = tiny()) => event(JSON.stringify(doc), over);

  it('reads the owner from the author, never from the content, an a tag or a p tag', () => {
    const claims = house({ pubkey: OTHER, tags: [['d', 'main'], ['a', `31127:${OWNER}:main`], ['p', OWNER]] }, { ...tiny(), owner: OWNER } as HouseDocument);
    const parsed = parseHouseEvent(claims);
    expect(parsed.event).toMatchObject({ owner: OTHER, address: `31127:${OTHER}:main` });
    expect(parsed.issues.map((i) => i.code)).toContain('owner-ignored');
  });

  it('never takes another author\'s event, even newer and claiming the owner, as the owner\'s house', () => {
    const mine = house({ created_at: NOW / 1000 - 10 });
    const theirs = house({ pubkey: OTHER, created_at: NOW / 1000, tags: [['d', 'main'], ['p', OWNER]] }, { ...tiny(), name: 'Stolen', owner: OWNER } as HouseDocument);
    const got = resolveHouse([theirs, mine], { owner: OWNER, houseId: 'main', verify: null, now: NOW });
    expect(got?.event?.id).toBe(mine.id);
    expect(got?.doc?.name).toBe('Tiny');
    expect(resolveHouse([theirs], { owner: OWNER, houseId: 'main', verify: null })).toBeNull();
  });

  it('keeps houses apart by d, skips forged ids, bad signatures and future dates, and breaks ties by the lower id', () => {
    const a = house({ created_at: NOW / 1000 });
    const b = house({ created_at: NOW / 1000, content: JSON.stringify({ ...tiny(), name: 'B' }) });
    const low = a.id < b.id ? a : b;
    expect(resolveHouse([a, b], { owner: OWNER, houseId: 'main', verify: null })?.event?.id).toBe(low.id);
    expect(resolveHouse([b, a], { owner: OWNER, houseId: 'main', verify: null })?.event?.id).toBe(low.id);
    const cabin = house({ created_at: NOW / 1000 + 5, tags: [['d', 'cabin']] });
    const forged = { ...house({ created_at: NOW / 1000 + 6 }), content: JSON.stringify({ ...tiny(), name: 'Forged' }) };
    const future = house({ created_at: 4_000_000_000 });
    expect(resolveHouse([cabin, forged, future, a], { owner: OWNER, houseId: 'main', verify: null, now: NOW })?.event?.id).toBe(a.id);
    const badSig = house({ created_at: NOW / 1000 + 7 });
    expect(resolveHouse([badSig, a], { owner: OWNER, houseId: 'main', verify: (e) => e.id !== badSig.id })?.event?.id).toBe(a.id);
  });

  it('returns a newest invalid or newer-schema version as it is, read-only, rather than an older valid one', () => {
    const old = house({ created_at: NOW / 1000 - 100 });
    const newer = event(JSON.stringify({ v: 2, name: 'Future schema', spaces: [] }), { created_at: NOW / 1000 });
    expect(resolveHouse([old, newer], { owner: OWNER, houseId: 'main', verify: null, now: NOW })).toMatchObject({ status: 'unsupported-version', writable: false });
  });
});

describe('unknown fields survive a rewrite, whatever their names (forward compatibility)', () => {
  // Fields a newer client might write, at every level, including names that are Object.prototype members
  const NEWER = '{"v":1,"name":"x","constructor":"c","toString":1,"hasOwnProperty":2,"__proto__":{"polluted":true},"future":{"a":[1,{"b":2}]},'
    + '"rooms":[{"id":"r","size":{"w":4,"d":4,"h":3,"valueOf":3},"walls":["west"],"__proto__":{"x":1},"mood":"calm",'
    + '"floor":{"style":"wood","palette":["#fff"],"isPrototypeOf":true},'
    + '"items":[{"id":"i","type":"a:b","surface":"floor","x":1,"z":1,"__proto__":{"y":1},"constructor":{"k":1},"glow":0.5}]}]}';

  it('keeps every field, own __proto__ included, through validate and serialize, in canonical order', () => {
    const doc = JSON.parse(NEWER) as HouseDocument;
    expect(validateHouse(doc).status).toBe('valid');
    const out = JSON.parse(serializeHouse(doc));
    expect(out).toEqual(JSON.parse(NEWER));
    for (const k of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) expect(Object.prototype.hasOwnProperty.call(out, k)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(out.rooms[0].items[0], '__proto__')).toBe(true);
    // Never through the prototype: a field is never read as a known field, and nothing is polluted
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps them through event, parse, edit, serialize and parse again', () => {
    const first = parseHouseEvent(event(NEWER));
    expect(first.status).toBe('valid');
    const edited = rotateItem(first.doc!, 'i');
    const again = parseHouseEvent(event(serializeHouse(edited)));
    expect(again.status).toBe('valid');
    const expected = JSON.parse(NEWER);
    expected.rooms[0].items[0].rot = 1;
    expect(again.doc).toEqual(expected);
  });

  it('a __proto__ field cannot pass for a known field (an item\'s y, a room\'s size)', () => {
    const sneaky = JSON.parse('{"v":1,"name":"x","rooms":[{"id":"r","walls":["west"],"items":[],"__proto__":{"size":{"w":1,"d":1,"h":1}}}]}');
    expect(validateHouse(sneaky).issues.map((i) => i.code)).toContain('size-not-object');
  });

  it('keeps a Ditto placement\'s unknown __proto__ field, and a Ditto room named like a prototype member gets no false notes', () => {
    const ditto = '{"room_furniture_v2":{"v":2,"by_room":{"constructor":[{"id":"official:bed-single","at":"floor","x":1,"y":1,"__proto__":{"rot":2},"toString":5}]}}}';
    const result = houseFromDittoProfile(ditto);
    expect(result.status).toBe('converted');
    const item = result.doc!.rooms.find((r) => r.id === 'constructor')!.items[0];
    expect(Object.prototype.hasOwnProperty.call(item, '__proto__')).toBe(true);
    expect(item.rot).toBeUndefined();
    expect(item.toString).toBe(5);
    expect(result.notes.filter((n) => n.room === 'constructor').map((n) => n.code)).toEqual(['unknown-room']);
  });
});
