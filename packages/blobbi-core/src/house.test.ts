import { describe, expect, it } from 'vitest';
import {
  BLOBBI_ECOSYSTEM_NAMESPACE,
  HOUSE_LIMITS,
  HOUSE_RECOMMENDED_CONTENT_BYTES,
  KIND_BLOBBI_HOUSE,
  MAIN_HOUSE_ID,
  addRoom,
  rotateItem,
  buildHouseTemplate,
  canonicalHouse,
  createInitialHouse,
  houseAddress,
  houseContentBytes,
  houseFilter,
  isHouseId,
  isHouseItemType,
  parseHouseAddress,
  parseHouseEvent,
  replacesHouse,
  serializeHouse,
  utf8Bytes,
  validateHouse,
  type HouseDocument,
  type NostrEvent,
} from './index';
// Imported rather than read from disk: `import.meta.url` is not a file URL under jsdom.
import houseDoc from '../HOUSE.md?raw';

const OWNER = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

/** A small valid house: one room, a floor piece and a wall piece. */
function tiny(): HouseDocument {
  return {
    v: 1,
    name: 'Tiny',
    rooms: [
      {
        id: 'room',
        size: { w: 4, d: 3, h: 3 },
        walls: ['west', 'north'],
        items: [
          { id: 'bed', type: 'official:bed-single', surface: 'floor', x: 2, z: 1.5, rot: 1 },
          { id: 'clock', type: 'official:clock-wall', surface: 'wall', wall: 'west', z: 1, y: 2 },
        ],
      },
    ],
  };
}

function event(content: unknown, over: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey: OWNER,
    created_at: 1_800_000_000,
    kind: KIND_BLOBBI_HOUSE,
    tags: [['d', MAIN_HOUSE_ID], ['v', '1'], ['b', BLOBBI_ECOSYSTEM_NAMESPACE]],
    content: typeof content === 'string' ? content : JSON.stringify(content),
    sig: 'f'.repeat(128),
    ...over,
  };
}

function codes(doc: unknown): string[] {
  return validateHouse(doc).issues.filter((i) => i.severity === 'error').map((i) => i.code);
}

describe('the house kind', () => {
  it('is 31127, in the addressable range, and the first house is "main"', () => {
    expect(KIND_BLOBBI_HOUSE).toBe(31127);
    expect(KIND_BLOBBI_HOUSE >= 30000 && KIND_BLOBBI_HOUSE < 40000).toBe(true);
    expect(MAIN_HOUSE_ID).toBe('main');
  });
});

describe('validateHouse', () => {
  it('accepts the Blobbi starting house and a small custom house', () => {
    expect(validateHouse(createInitialHouse()).status).toBe('valid');
    expect(validateHouse(tiny())).toMatchObject({ status: 'valid', issues: [] });
  });

  it('calls a non-object, a missing version or a missing room list malformed', () => {
    expect(validateHouse(null).status).toBe('malformed');
    expect(validateHouse([]).status).toBe('malformed');
    expect(validateHouse({ ...tiny(), v: undefined }).status).toBe('malformed');
    expect(validateHouse({ ...tiny(), v: '1' }).status).toBe('malformed');
    expect(validateHouse({ ...tiny(), rooms: {} }).status).toBe('malformed');
  });

  it('reads a newer schema as unsupported (read only), never as this one', () => {
    const result = validateHouse({ ...tiny(), v: 2, rooms: 'anything' });
    expect(result.status).toBe('unsupported-version');
    expect(result.doc).toBeNull();
  });

  it('needs a name, and checks app and category tokens', () => {
    expect(codes({ ...tiny(), name: '' })).toEqual(['name']);
    expect(codes({ ...tiny(), name: 'x'.repeat(HOUSE_LIMITS.maxNameLength + 1) })).toEqual(['name']);
    expect(codes({ ...tiny(), app: 'blobbi-home', category: 'apartment' })).toEqual([]);
    expect(codes({ ...tiny(), app: 'Blobbi Home' })).toEqual(['app']);
    expect(codes({ ...tiny(), category: 7 })).toEqual(['category']);
  });

  it('refuses duplicate room ids and duplicate item ids anywhere in the house; the shown copy drops the duplicates', () => {
    const doc = tiny();
    doc.rooms.push({ id: 'room', size: { w: 2, d: 2, h: 2 }, walls: [], items: [] });
    expect(codes(doc)).toContain('duplicate-room-id');

    const items = tiny();
    items.rooms.push({ id: 'other', size: { w: 2, d: 2, h: 2 }, walls: [], items: [{ id: 'bed', type: 'official:rug-paw', surface: 'floor', x: 1, z: 1 }] });
    const result = validateHouse(items);
    expect(result.status).toBe('invalid');
    expect(result.issues.map((i) => i.code)).toContain('duplicate-item-id');
    expect(result.doc!.rooms[1].items).toEqual([]);
    expect(result.doc!.rooms[0].items.map((i) => i.id)).toEqual(['bed', 'clock']);
  });

  it('checks room ids, sizes and walls', () => {
    const room = tiny().rooms[0];
    const withRoom = (over: object) => ({ ...tiny(), rooms: [{ ...room, ...over }] });
    expect(codes(withRoom({ id: 'Kitchen' }))).toEqual(['room-id']);
    expect(codes(withRoom({ size: { w: 0, d: 3, h: 3 } }))).toContain('size-w');
    expect(codes(withRoom({ size: { w: 4, d: 3.5, h: 3 } }))).toContain('size-d');
    expect(codes(withRoom({ size: { w: 4, d: 3, h: HOUSE_LIMITS.maxRoomHeight + 1 } }))).toContain('size-h');
    expect(codes(withRoom({ walls: ['west', 'west'] }))).toContain('walls');
    expect(codes(withRoom({ walls: ['up'] }))).toContain('walls');
  });

  it('keeps floor pieces inside the floor, with whole quarter turns and no height', () => {
    const at = (over: object) => ({ ...tiny(), rooms: [{ ...tiny().rooms[0], items: [{ id: 'p', type: 'official:rug-paw', surface: 'floor', x: 1, z: 1, ...over }] }] });
    expect(codes(at({}))).toEqual([]);
    expect(codes(at({ x: 4 }))).toEqual([]);
    expect(codes(at({ x: 4.01 }))).toEqual(['x-bounds']);
    expect(codes(at({ z: -0.5 }))).toEqual(['z-bounds']);
    expect(codes(at({ x: Number.NaN }))).toEqual(['x-bounds']);
    expect(codes(at({ y: 1 }))).toEqual(['floor-y']);
    expect(codes(at({ rot: 4 }))).toEqual(['rot']);
    expect(codes(at({ rot: 1.5 }))).toEqual(['rot']);
    expect(codes(at({ wall: 'west' }))).toEqual(['floor-wall']);
  });

  it('keeps wall pieces on a wall the room has, along it and up to its height, without a turn', () => {
    const at = (over: object) => ({ ...tiny(), rooms: [{ ...tiny().rooms[0], items: [{ id: 'p', type: 'official:mirror', surface: 'wall', wall: 'north', x: 2, y: 1, ...over }] }] });
    expect(codes(at({}))).toEqual([]);
    expect(codes(at({ wall: 'east', x: undefined, z: 1 }))).toEqual(['wall-missing']);
    expect(codes(at({ wall: 'ceiling' }))).toEqual(['wall-name']);
    expect(codes(at({ x: 4.5 }))).toEqual(['x-bounds']);
    expect(codes(at({ z: 1 }))).toEqual(['wall-z']);
    expect(codes(at({ y: 3.5 }))).toEqual(['y-bounds']);
    expect(codes(at({ rot: 1 }))).toEqual(['wall-rot']);
    // A west wall runs along z, as long as the room is deep
    const west = (over: object) => at({ wall: 'west', x: undefined, z: 3, ...over });
    expect(codes(west({}))).toEqual([]);
    expect(codes(west({ z: 3.5 }))).toEqual(['z-bounds']);
  });

  it('checks ids, namespaced types, scale, variant, content and ext of pieces', () => {
    const at = (over: object) => ({ ...tiny(), rooms: [{ ...tiny().rooms[0], items: [{ id: 'p', type: 'official:rug-paw', surface: 'floor', x: 1, z: 1, ...over }] }] });
    expect(codes(at({ id: 'P 1' }))).toEqual(['item-id']);
    expect(codes(at({ id: 'x'.repeat(65) }))).toEqual(['item-id']);
    expect(codes(at({ type: 'bed' }))).toEqual(['item-type']);
    expect(codes(at({ type: 'Official:bed' }))).toEqual(['item-type']);
    expect(codes(at({ surface: 'ceiling' }))).toEqual(['surface']);
    expect(codes(at({ scale: 0.4 }))).toEqual(['scale']);
    expect(codes(at({ scale: 2 }))).toEqual([]);
    expect(codes(at({ variant: 'Blue!' }))).toEqual(['variant']);
    expect(codes(at({ content: { imageUrl: 'http://example.com/a.png' } }))).toEqual(['image-url']);
    expect(codes(at({ content: { imageUrl: 'https://blossom.example/a.png' } }))).toEqual([]);
    expect(codes(at({ content: 'x' }))).toEqual(['content-not-object']);
    expect(codes(at({ ext: [] }))).toEqual(['ext-not-object']);
  });

  it('accepts unknown item types (other games, network objects): they are kept, not judged', () => {
    const doc = tiny();
    doc.rooms[0].items.push({ id: 'throne', type: 'mygame:throne', surface: 'floor', x: 1, z: 1 });
    doc.rooms[0].items.push({ id: 'sno', type: 'sno:naddr1qqxnzd3cxqmrzv3exgmr2wfeqgsxu35yyt0mwjjh8pcz4zprhxegz69t4wr9t74vk6zjh8v4p4uvrv8qrqsqqqa28qkl6lh', surface: 'floor', x: 3, z: 2 });
    expect(validateHouse(doc).status).toBe('valid');
  });

  it('checks finishes: a style word, 1–4 hex colours, a variant word, whole degrees', () => {
    const room = tiny().rooms[0];
    const withFloor = (floor: unknown) => ({ ...tiny(), rooms: [{ ...room, floor }] });
    expect(codes(withFloor({ style: 'wood', palette: ['#b45309'], variant: 'wide', angle: 45 }))).toEqual([]);
    expect(codes(withFloor({ style: 'marble', palette: ['#fff', '#000000', '#00000080'] }))).toEqual([]);
    expect(codes(withFloor({ style: 'wood', palette: [] }))).toEqual(['material-palette']);
    expect(codes(withFloor({ style: 'wood', palette: ['#fff', '#fff', '#fff', '#fff', '#fff'] }))).toEqual(['material-palette']);
    expect(codes(withFloor({ style: 'wood', palette: ['red'] }))).toEqual(['material-palette']);
    expect(codes(withFloor({ style: 'Wood', palette: ['#fff'] }))).toEqual(['material-style']);
    expect(codes(withFloor({ style: 'wood', palette: ['#fff'], angle: 360 }))).toEqual(['material-angle']);
    expect(codes(withFloor({ style: 'wood', palette: ['#fff'], angle: 12.5 }))).toEqual(['material-angle']);
  });

  it('checks links: to another existing room, once', () => {
    const two = (links: unknown) => ({
      ...tiny(),
      rooms: [{ ...tiny().rooms[0], links }, { id: 'hall', size: { w: 2, d: 2, h: 2 }, walls: [], items: [] }],
    });
    expect(codes(two([{ room: 'hall', door: 'north' }]))).toEqual([]);
    expect(codes(two([{ room: 'room' }]))).toEqual(['link-self']);
    expect(codes(two([{ room: 'attic' }]))).toEqual(['link-unknown-room']);
    expect(codes(two([{ room: 'hall' }, { room: 'hall' }]))).toEqual(['duplicate-link']);
    expect(codes(two({ room: 'hall' }))).toEqual(['links-not-array']);
  });

  it('refuses a house past the security limits outright', () => {
    const rooms = Array.from({ length: HOUSE_LIMITS.maxRooms + 1 }, (_, i) => ({ id: `r${i}`, size: { w: 1, d: 1, h: 1 }, walls: [], items: [] }));
    expect(validateHouse({ v: 1, name: 'Big', rooms }).status).toBe('malformed');
    const crowded = tiny();
    crowded.rooms[0].items = Array.from({ length: HOUSE_LIMITS.maxItemsPerRoom + 1 }, (_, i) => ({ id: `i${i}`, type: 'official:rug-paw', surface: 'floor' as const, x: 1, z: 1 }));
    expect(validateHouse(crowded).status).toBe('malformed');
  });

  it('warns, without refusing, about a house above the size strict relays accept', () => {
    const doc = tiny();
    doc.rooms[0].items = Array.from({ length: 200 }, (_, i) => ({ id: `piece-${i}`, type: 'official:plant-small', surface: 'floor' as const, x: 1, z: 1, note: 'a field another game keeps on every piece' }));
    const result = validateHouse(doc);
    expect(result.status).toBe('valid');
    expect(result.issues.map((i) => i.code)).toEqual(['large']);
    expect(houseContentBytes(doc).recommended).toBe(false);
    expect(houseContentBytes(tiny())).toEqual({ bytes: utf8Bytes(serializeHouse(tiny())), recommended: true });
    expect(houseContentBytes(createInitialHouse()).bytes).toBeLessThan(HOUSE_RECOMMENDED_CONTENT_BYTES);
  });

  it('ignores an owner written in the content (the owner is the event author), with a warning', () => {
    const result = validateHouse({ ...tiny(), owner: OTHER });
    expect(result.status).toBe('valid');
    expect(result.issues).toEqual([expect.objectContaining({ severity: 'warning', code: 'owner-ignored' })]);
  });
});

describe('serializeHouse', () => {
  it('round-trips the house exactly, unknown fields at every level included', () => {
    const doc = tiny() as HouseDocument & Record<string, unknown>;
    doc.future = { rooms: 'kept' };
    doc.ext = { 'blobbi-home': { theme: 'meadow' } };
    doc.rooms[0].ext = { 'some-game': { unlocked: 'level-3' } };
    (doc.rooms[0].size as Record<string, unknown>).shape = 'square';
    doc.rooms[0].floor = { style: 'wood', palette: ['#b45309'], sheen: 0.2 };
    doc.rooms[0].items[0].colour = 'teal';
    const parsed = JSON.parse(serializeHouse(doc));
    expect(parsed).toEqual(doc);
    expect(serializeHouse(parsed)).toBe(serializeHouse(doc));
  });

  it('is canonical: the same house in any key order gives the same text', () => {
    const reverse = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverse(v)])) : value;
    const scrambled = reverse(tiny()) as HouseDocument;
    expect(Object.keys(scrambled)).toEqual(['rooms', 'name', 'v']);
    expect(serializeHouse(scrambled)).toBe(serializeHouse(tiny()));
    expect(Object.keys(JSON.parse(serializeHouse(scrambled)))).toEqual(['v', 'name', 'rooms']);
    expect(canonicalHouse(tiny())).toEqual(tiny());
  });

  it('refuses an invalid house instead of writing it', () => {
    expect(() => serializeHouse({ ...tiny(), name: '' })).toThrow(/not a valid house: name name/);
  });
});

describe('parseHouseEvent', () => {
  it('reads a house: the owner is the author, the id is the d tag, valid means writable', () => {
    const result = parseHouseEvent(event(tiny()));
    expect(result.status).toBe('valid');
    expect(result.writable).toBe(true);
    expect(result.event).toEqual({ id: 'e'.repeat(64), owner: OWNER, houseId: 'main', address: `31127:${OWNER}:main`, createdAt: 1_800_000_000 });
    expect(result.doc).toEqual(tiny());
  });

  it('never takes an owner from the content', () => {
    const result = parseHouseEvent(event({ ...tiny(), owner: OTHER }));
    expect(result.event!.owner).toBe(OWNER);
    expect(result.doc!.owner).toBe(OTHER);
  });

  it('refuses events that are not houses', () => {
    expect(parseHouseEvent(null)).toMatchObject({ status: 'malformed', event: null });
    expect(parseHouseEvent({ kind: 31127 })).toMatchObject({ status: 'malformed', event: null });
    expect(parseHouseEvent(event(tiny(), { kind: 31124 }))).toMatchObject({ status: 'malformed', issues: [expect.objectContaining({ code: 'wrong-kind' })] });
    expect(parseHouseEvent(event(tiny(), { pubkey: 'not-hex' })).status).toBe('malformed');
    expect(parseHouseEvent(event(tiny(), { tags: [['d', 1 as unknown as string]] })).status).toBe('malformed');
  });

  it('needs exactly one valid d tag', () => {
    expect(parseHouseEvent(event(tiny(), { tags: [] })).issues[0].code).toBe('house-id');
    expect(parseHouseEvent(event(tiny(), { tags: [['d', 'a'], ['d', 'b']] })).issues[0].code).toBe('house-id');
    expect(parseHouseEvent(event(tiny(), { tags: [['d', 'My House']] })).issues[0].code).toBe('house-id');
  });

  it('refuses content that is not JSON or too large, and a signature the verifier rejects', () => {
    expect(parseHouseEvent(event('{not json')).issues[0].code).toBe('content-json');
    expect(parseHouseEvent(event('x'.repeat(HOUSE_LIMITS.maxContentBytes + 1))).issues[0].code).toBe('too-large');
    expect(parseHouseEvent(event(tiny()), { verify: () => false }).issues[0].code).toBe('signature');
    expect(parseHouseEvent(event(tiny()), { verify: () => { throw new Error('boom'); } }).issues[0].code).toBe('signature');
    expect(parseHouseEvent(event(tiny()), { verify: () => true }).status).toBe('valid');
  });

  it('keeps the identity of a newer or invalid house so a client can show it without writing over it', () => {
    const newer = parseHouseEvent(event({ v: 2, name: 'Future', spaces: [] }));
    expect(newer).toMatchObject({ status: 'unsupported-version', writable: false, doc: null });
    expect(newer.event!.address).toBe(`31127:${OWNER}:main`);
    const broken = parseHouseEvent(event({ ...tiny(), rooms: [{ ...tiny().rooms[0], items: [{ id: 'x', type: 'official:bed-single', surface: 'floor', x: 99, z: 1 }] }] }));
    expect(broken).toMatchObject({ status: 'invalid', writable: false });
    expect(broken.doc!.rooms[0].items).toEqual([]);
  });

  it('lets the content win when a v tag disagrees, with a warning', () => {
    const result = parseHouseEvent(event(tiny(), { tags: [['d', 'main'], ['v', '9']] }));
    expect(result.status).toBe('valid');
    expect(result.issues.map((i) => i.code)).toEqual(['v-tag']);
  });
});

describe('house events', () => {
  it('builds the event to sign: d, v, b, alt and the canonical content', () => {
    const t = buildHouseTemplate({ houseId: 'main', doc: tiny(), now: 1_800_000_000_500 });
    expect(t).toEqual({
      kind: 31127,
      created_at: 1_800_000_000,
      tags: [['d', 'main'], ['v', '1'], ['b', BLOBBI_ECOSYSTEM_NAMESPACE], ['alt', 'Blobbi house: Tiny']],
      content: serializeHouse(tiny()),
    });
    expect(parseHouseEvent({ ...t, id: '0'.repeat(64), pubkey: OWNER, sig: '' }).status).toBe('valid');
  });

  it('dates a new version after the one it replaces, and keeps tags it does not manage', () => {
    const t = buildHouseTemplate({ houseId: 'cabin', doc: tiny(), now: 1_000_000, previous: { createdAt: 1_800_000_000, tags: [['d', 'cabin'], ['t', 'cosy'], ['alt', 'old'], ['client', 'some-game']] } });
    expect(t.created_at).toBe(1_800_000_001);
    expect(t.tags).toEqual([['d', 'cabin'], ['v', '1'], ['t', 'cosy'], ['client', 'some-game'], ['b', BLOBBI_ECOSYSTEM_NAMESPACE], ['alt', 'Blobbi house: Tiny']]);
  });

  it('refuses an invalid house or house id', () => {
    expect(() => buildHouseTemplate({ houseId: 'Main House', doc: tiny(), now: 0 })).toThrow();
    expect(() => buildHouseTemplate({ houseId: 'main', doc: { ...tiny(), name: '' }, now: 0 })).toThrow();
  });

  it('gives each house of an owner its own address; a filter reads one house or all of them', () => {
    expect(houseAddress(OWNER, 'main')).not.toBe(houseAddress(OWNER, 'beach-house'));
    expect(parseHouseAddress(houseAddress(OWNER, 'beach-house'))).toEqual({ owner: OWNER, houseId: 'beach-house' });
    expect(parseHouseAddress(`31124:${OWNER}:main`)).toBeNull();
    expect(parseHouseAddress(`31127:${OWNER}:`)).toBeNull();
    expect(parseHouseAddress('31127:xyz:main')).toBeNull();
    expect(houseFilter(OWNER)).toEqual({ kinds: [31127], authors: [OWNER] });
    expect(houseFilter(OWNER, 'main')).toEqual({ kinds: [31127], authors: [OWNER], '#d': ['main'] });
  });

  it('orders versions as NIP-01 does: newer wins; equal times, the lower id', () => {
    expect(replacesHouse({ id: 'b', createdAt: 2 }, { id: 'a', createdAt: 1 })).toBe(true);
    expect(replacesHouse({ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 1 })).toBe(true);
    expect(replacesHouse({ id: 'b', createdAt: 1 }, { id: 'a', createdAt: 1 })).toBe(false);
  });
});

describe('identifiers and sizes', () => {
  it('accepts lower-case ids and Ditto-style namespaced types', () => {
    expect(['main', 'beach-house', 'room.2', 'a_b'].every(isHouseId)).toBe(true);
    expect(['', 'Main', '-x', 'a b', 'x'.repeat(65)].some(isHouseId)).toBe(false);
    expect(['official:bed-single', 'mygame:throne', 'sno:naddr1abc'].every(isHouseItemType)).toBe(true);
    expect(['bed', 'official:', 'my-game:x', 'official:Bed'].some(isHouseItemType)).toBe(false);
  });

  it('counts UTF-8 bytes as Node does', () => {
    for (const s of ['plain', 'Café', '家', '🏠 casa', 'x\u{1F600}y']) expect(utf8Bytes(s)).toBe(Buffer.byteLength(s, 'utf8'));
  });
});

describe('HOUSE.md', () => {
  it('holds a complete example event that parses as a valid house', () => {
    const block = houseDoc.split('<!-- house-example:start -->')[1].split('<!-- house-example:end -->')[0];
    const json = block.slice(block.indexOf('{'), block.lastIndexOf('}') + 1);
    const example = JSON.parse(json);
    const result = parseHouseEvent(example);
    expect(result.status).toBe('valid');
    expect(result.event!.houseId).toBe('main');
    expect(result.doc!.rooms.map((r) => r.id)).toEqual(['home', 'rest']);
  });
});

describe('review regressions (P2.1)', () => {
  it('reads several houses of one owner as separate, independent houses', () => {
    const cabin = { ...tiny(), name: 'Cabin', app: 'some-game', category: 'cabin' };
    const a = parseHouseEvent(event(tiny()));
    const b = parseHouseEvent(event(cabin, { id: 'c'.repeat(64), tags: [['d', 'cabin-7f3a']] }));
    expect([a.status, b.status]).toEqual(['valid', 'valid']);
    expect(a.event!.address).not.toBe(b.event!.address);
    expect(b.event!.owner).toBe(a.event!.owner);
    expect(b.doc).toMatchObject({ name: 'Cabin', app: 'some-game', category: 'cabin' });
  });

  it('keeps unknown fields through event → parse → edit → serialize → event', () => {
    const doc = { ...tiny(), future: { a: 1 }, ext: { 'some-game': { x: 1 } } } as HouseDocument;
    doc.rooms[0] = { ...doc.rooms[0], mood: 'calm' };
    doc.rooms[0].items[0] = { ...doc.rooms[0].items[0], glow: 'warm' };
    const parsed = parseHouseEvent(event(doc));
    const edited = rotateItem(parsed.doc!, 'bed');
    const again = parseHouseEvent(event(serializeHouse(edited)));
    expect(again.doc!.future).toEqual({ a: 1 });
    expect(again.doc!.ext).toEqual({ 'some-game': { x: 1 } });
    expect(again.doc!.rooms[0].mood).toBe('calm');
    expect(again.doc!.rooms[0].items[0]).toMatchObject({ glow: 'warm', rot: 2 });
  });

  it('keeps every house within the security limits valid however many rooms are added, and refuses past them', () => {
    let doc = tiny();
    for (let i = 1; i < HOUSE_LIMITS.maxRooms; i++) doc = addRoom(doc, { id: `room-${i}`, size: { w: 2, d: 2, h: 2 }, walls: [] });
    expect(doc.rooms).toHaveLength(HOUSE_LIMITS.maxRooms);
    expect(validateHouse(doc).status).toBe('valid');
    expect(() => addRoom(doc, { id: 'one-too-many', size: { w: 2, d: 2, h: 2 }, walls: [] })).toThrow(/at most 64 rooms/);
  });
});

describe('final review fixes (P2.1)', () => {
  it('never carries a NIP-40 expiration over from the replaced version (a house is persistent), and keeps every other unknown tag', () => {
    const previous = { createdAt: 1_800_000_000, tags: [['d', 'main'], ['t', 'cosy'], ['expiration', '1800000500'], ['client', 'some-game'], ['expiration', '1900000000']] };
    const t = buildHouseTemplate({ houseId: 'main', doc: tiny(), now: 0, previous });
    expect(t.tags.some((tag) => tag[0] === 'expiration')).toBe(false);
    expect(t.tags).toEqual([['d', 'main'], ['v', '1'], ['t', 'cosy'], ['client', 'some-game'], ['b', BLOBBI_ECOSYSTEM_NAMESPACE], ['alt', 'Blobbi house: Tiny']]);
  });

  it('says plainly when the v tag is repeated or empty, instead of printing null', () => {
    for (const tags of [[['d', 'main'], ['v', '1'], ['v', '1']], [['d', 'main'], ['v']]]) {
      const result = parseHouseEvent(event(tiny(), { tags }));
      expect(result.status).toBe('valid');
      expect(result.issues).toEqual([expect.objectContaining({ severity: 'warning', code: 'v-tag', message: expect.stringContaining('more than one `v` tag') })]);
      expect(result.issues[0].message).not.toContain('null');
    }
    expect(parseHouseEvent(event(tiny(), { tags: [['d', 'main'], ['v', '1']] })).issues).toEqual([]);
  });
});
