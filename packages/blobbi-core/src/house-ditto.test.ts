import { describe, expect, it } from 'vitest';
import {
  BLOBBI_STARTER_ROOMS,
  addRoom,
  createInitialHouse,
  dittoItemId,
  dittoRoomsFromHouse,
  houseFromDittoProfile,
  moveItem,
  validateHouse,
  type HouseDocument,
} from './index';

const SNO = 'sno:naddr1qqxnzd3cxqmrzv3exgmr2wfeqgsxu35yyt0mwjjh8pcz4zprhxegz69t4wr9t74vk6zjh8v4p4uvrv8qrqsqqqa28qkl6lh';

/**
 * A kind 11125 content shaped like a real Ditto player's (Ditto `NIP.md`,
 * origin/main 2026-10-24): missions, a decorated living room and bedroom,
 * a picture with an uploaded image, a network object, a field a newer Ditto
 * wrote on a piece, and a room a newer Ditto knows.
 */
const PROFILE = {
  missions: { date: '2026-10-23', daily: [{ id: 'feed', target: 3, count: 1 }], rerolls: 1 },
  room_layouts: {
    v: 1,
    by_room: {
      home: {
        wall: { style: 'gradient', palette: ['#fef9ef', '#fef3c7'] },
        floor: { style: 'wood', palette: ['#b45309', '#78350f'], variant: 'wide' },
      },
      rest: {
        wall: { style: 'stripes', palette: ['#ede9fe', '#ddd6fe'], angle: 90 },
        floor: { style: 'carpet', palette: ['#a78bfa'], variant: 'soft' },
      },
    },
  },
  room_furniture_v2: {
    v: 2,
    by_room: {
      home: [
        { id: 'official:rug-round', at: 'floor', x: 4.5, y: 4.5 },
        { id: 'official:table-side', at: 'floor', x: 0.5, y: 4.5, rot: 3 },
        { id: 'official:lamp-table', at: 'floor', x: 0.5, y: 4.5, rot: 3 },
        { id: 'official:shelf-wall', at: 'left', x: 5.5, y: 3, scale: 1.4 },
        { id: 'official:picture-frame', at: 'right', x: 5.5, y: 3, content: { imageUrl: 'https://blossom.example/abc.jpg' } },
        { id: SNO, at: 'floor', x: 5, y: 5 },
        { id: 'official:plant-tall', at: 'floor', x: 7.5, y: 0.5, glow: true },
      ],
      rest: [
        { id: 'official:bed-round', at: 'floor', x: 2, y: 2 },
        { id: 'official:lamp-string', at: 'right', x: 2, y: 4.2 },
        { id: 'official:lamp-string', at: 'right', x: 6, y: 4.2 },
      ],
      kitchen: [],
      attic: [{ id: 'official:wardrobe', at: 'floor', x: 3, y: 0.5 }],
    },
  },
};

describe('houseFromDittoProfile', () => {
  it('gives the house Ditto shows: saved rooms as saved, the others from the starting house', () => {
    const result = houseFromDittoProfile(JSON.stringify(PROFILE));
    expect(result.status).toBe('converted');
    const doc = result.doc!;
    expect(validateHouse(doc).status).toBe('valid');
    expect(doc.rooms.map((r) => r.id)).toEqual(['kitchen', 'home', 'care', 'rest', 'attic']);
    // Never saved in Ditto: the starting room, unchanged
    expect(doc.rooms[2]).toEqual(BLOBBI_STARTER_ROOMS[2]);
    // Saved empty: empty, not the defaults
    expect(doc.rooms[0].items).toEqual([]);
    expect(doc.rooms[0].floor).toEqual(BLOBBI_STARTER_ROOMS[0].floor);
  });

  it("maps Ditto's surfaces and coordinates: floor (x, y) → (x, z), left → west wall, right → north wall", () => {
    const home = houseFromDittoProfile(PROFILE).doc!.rooms[1];
    expect(home.items).toEqual([
      { id: 'home-1', type: 'official:rug-round', surface: 'floor', x: 4.5, z: 4.5 },
      { id: 'home-2', type: 'official:table-side', surface: 'floor', x: 0.5, z: 4.5, rot: 3 },
      { id: 'home-3', type: 'official:lamp-table', surface: 'floor', x: 0.5, z: 4.5, rot: 3 },
      { id: 'home-4', type: 'official:shelf-wall', surface: 'wall', wall: 'west', z: 5.5, y: 3, scale: 1.4 },
      { id: 'home-5', type: 'official:picture-frame', surface: 'wall', wall: 'north', x: 5.5, y: 3, content: { imageUrl: 'https://blossom.example/abc.jpg' } },
      { id: 'home-6', type: SNO, surface: 'floor', x: 5, z: 5 },
      { id: 'home-7', type: 'official:plant-tall', surface: 'floor', x: 7.5, z: 0.5, glow: true },
    ]);
    expect(home.wall).toEqual(PROFILE.room_layouts.by_room.home.wall);
  });

  it('keeps several pieces of one type apart, each with its own id', () => {
    const rest = houseFromDittoProfile(PROFILE).doc!.rooms[3];
    expect(rest.items.filter((i) => i.type === 'official:lamp-string').map((i) => i.id)).toEqual(['rest-2', 'rest-3']);
    expect(rest.wall).toEqual({ style: 'stripes', palette: ['#ede9fe', '#ddd6fe'], angle: 90 });
  });

  it('keeps a room Ditto does not know as a room, and says so', () => {
    const result = houseFromDittoProfile(PROFILE);
    expect(result.doc!.rooms[4]).toMatchObject({ id: 'attic', size: { w: 8, d: 8, h: 5 }, items: [{ type: 'official:wardrobe' }] });
    expect(result.notes).toContainEqual(expect.objectContaining({ code: 'unknown-room', room: 'attic', lossy: false }));
  });

  it('is deterministic, and reads a string or a parsed object the same', () => {
    expect(houseFromDittoProfile(PROFILE)).toEqual(houseFromDittoProfile(JSON.stringify(PROFILE)));
  });

  it('gives the starting house when Ditto has no rooms saved, or the content is not JSON', () => {
    for (const content of ['', '{}', 'not json', JSON.stringify({ missions: {} }), null]) {
      const result = houseFromDittoProfile(content);
      expect(result.doc).toEqual(createInitialHouse());
      expect(result.lossy).toBe(false);
    }
  });

  it('refuses rooms saved by a newer Ditto, as Ditto does', () => {
    const result = houseFromDittoProfile({ room_furniture_v2: { v: 3, by_room: {} } });
    expect(result).toMatchObject({ status: 'too-new', doc: null, lossy: true });
  });

  it('drops what Ditto drops, and says so: bad ids, bad surfaces, pieces on the wrong surface, no position', () => {
    const result = houseFromDittoProfile({
      room_furniture_v2: {
        v: 2,
        by_room: {
          home: [
            { id: 'Bad Id', at: 'floor', x: 1, y: 1 },
            { id: 'official:rug-paw', at: 'ceiling', x: 1, y: 1 },
            { id: 'official:mirror', at: 'floor', x: 1, y: 1 },
            { id: 'official:lamp-floor', at: 'floor', x: 'one', y: 1 },
            'nonsense',
            { id: 'official:rug-paw', at: 'floor', x: 2, y: 2 },
          ],
        },
      },
    });
    expect(result.doc!.rooms[1].items).toEqual([{ id: 'home-1', type: 'official:rug-paw', surface: 'floor', x: 2, z: 2 }]);
    expect(result.notes.filter((n) => n.code === 'placement-dropped')).toHaveLength(5);
    expect(result.lossy).toBe(true);
  });

  it('clamps positions and scales as Ditto shows them, and notes it', () => {
    const result = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: { home: [{ id: 'official:rug-paw', at: 'floor', x: 9, y: -1, scale: 3 }, { id: 'official:mirror', at: 'left', x: 2, y: 7 }] } } });
    expect(result.doc!.rooms[1].items).toEqual([
      { id: 'home-1', type: 'official:rug-paw', surface: 'floor', x: 8, z: 0, scale: 2 },
      { id: 'home-2', type: 'official:mirror', surface: 'wall', wall: 'west', z: 2, y: 5 },
    ]);
    expect(result.notes.filter((n) => n.code === 'clamped')).toHaveLength(3);
  });

  it('notes Ditto fields that cannot survive: a turn on a wall, content without an https image, a colliding field', () => {
    const result = houseFromDittoProfile({
      room_furniture_v2: {
        v: 2,
        by_room: {
          home: [
            { id: 'official:mirror', at: 'left', x: 2, y: 2, rot: 1 },
            { id: 'official:picture-frame', at: 'right', x: 2, y: 2, content: { imageUrl: 'http://insecure.example/a.png' } },
            { id: 'official:rug-paw', at: 'floor', x: 2, y: 2, surface: 'odd', z: 4 },
          ],
        },
      },
    });
    const codes = result.notes.map((n) => n.code);
    expect(codes).toEqual(expect.arrayContaining(['rot-dropped', 'content-dropped', 'field-dropped']));
    expect(result.doc!.rooms[1].items[2]).toEqual({ id: 'home-3', type: 'official:rug-paw', surface: 'floor', x: 2, z: 2 });
  });

  it('converts version 1 rooms as Ditto converts them (approximate, mirroring lost, the room piece added)', () => {
    const result = houseFromDittoProfile({
      room_furniture: {
        v: 1,
        by_room: {
          kitchen: [
            { id: 'official:shelf-wall', x: 0.27, y: 0.3, layer: 'back' },
            { id: 'official:plant-tall', x: 0.88, y: 0.72, layer: 'front', flip: true },
          ],
        },
      },
    });
    const kitchen = result.doc!.rooms[0];
    expect(kitchen.items.map((i) => i.type)).toEqual(['official:shelf-wall', 'official:plant-tall', 'official:fridge']);
    expect(kitchen.items[0]).toMatchObject({ surface: 'wall', wall: 'west' });
    expect(kitchen.items[1]).toMatchObject({ surface: 'floor' });
    expect(result.notes.map((n) => n.code)).toEqual(expect.arrayContaining(['legacy-key', 'v1-converted', 'flip-dropped', 'room-piece-added']));
    expect(validateHouse(result.doc).status).toBe('valid');
  });

  it('prefers room_furniture_v2 over the legacy key, as Ditto does', () => {
    const result = houseFromDittoProfile({ ...PROFILE, room_furniture: { v: 1, by_room: { home: [{ id: 'official:rug-paw', x: 0.5, y: 0.8, layer: 'floor' }] } } });
    expect(result.doc!.rooms[1].items).toHaveLength(7);
    expect(result.notes.map((n) => n.code)).not.toContain('legacy-key');
  });

  it('ignores finishes Ditto cannot read, and filters invalid colours as Ditto does', () => {
    const layouts = (by_room: unknown, v = 1) => houseFromDittoProfile({ room_layouts: { v, by_room } });
    const filtered = layouts({ home: { wall: { style: 'solid', palette: ['#fff', 'red'] }, floor: { style: 'wood', palette: ['#000'] } } });
    expect(filtered.doc!.rooms[1].wall).toEqual({ style: 'solid', palette: ['#fff'] });
    expect(filtered.notes.map((n) => n.code)).toContain('colour-dropped');
    const unknownStyle = layouts({ home: { wall: { style: 'marble', palette: ['#fff'] }, floor: { style: 'wood', palette: ['#000'] } } });
    expect(unknownStyle.doc!.rooms[1].wall).toEqual(BLOBBI_STARTER_ROOMS[1].wall);
    expect(unknownStyle.notes.map((n) => n.code)).toContain('layout-dropped');
    expect(layouts({}, 2).notes.map((n) => n.code)).toContain('layouts-version');
  });

  it('keeps every piece past Ditto\'s cap of 20, and notes that Ditto shows only 20', () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ id: 'official:plant-small', at: 'floor', x: 0.5 + (i % 8), y: 0.5 + Math.floor(i / 8) }));
    const result = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: { home: many } } });
    expect(result.doc!.rooms[1].items).toHaveLength(23);
    expect(result.notes).toContainEqual(expect.objectContaining({ code: 'over-cap', lossy: false }));
  });
});

describe('dittoRoomsFromHouse', () => {
  it('round-trips Ditto rooms: Ditto → house → Ditto gives back what Ditto stored', () => {
    const doc = houseFromDittoProfile(PROFILE).doc!;
    const back = dittoRoomsFromHouse(doc);
    for (const room of ['home', 'rest', 'kitchen'] as const) {
      const original = PROFILE.room_furniture_v2.by_room[room].map((p) => {
        const { glow: _glow, ...rest } = p as Record<string, unknown>;
        return rest;
      });
      expect(back.room_furniture_v2.by_room[room]).toEqual(original);
    }
    expect(back.room_layouts.by_room.home).toEqual(PROFILE.room_layouts.by_room.home);
    expect(back.room_layouts.by_room.rest).toEqual(PROFILE.room_layouts.by_room.rest);
  });

  it('round-trips the starting house both ways: house → Ditto → house is the same house', () => {
    const doc = createInitialHouse();
    const back = dittoRoomsFromHouse(doc);
    expect(houseFromDittoProfile({ room_furniture_v2: back.room_furniture_v2, room_layouts: back.room_layouts }).doc).toEqual(doc);
  });

  it('says what Ditto cannot keep: ids, unknown fields, other games\' rooms and walls, the house\'s own metadata', () => {
    let doc: HouseDocument = { ...houseFromDittoProfile(PROFILE).doc!, app: 'blobbi-home', ext: { 'blobbi-home': {} } };
    doc = addRoom(doc, { id: 'balcony', size: { w: 6, d: 3, h: 4 }, walls: ['north', 'east'] });
    const result = dittoRoomsFromHouse(doc);
    const codes = result.notes.map((n) => n.code);
    expect(codes).toEqual(expect.arrayContaining(['ids-dropped', 'house-field-dropped', 'item-field-dropped', 'room-not-shown']));
    expect(Object.keys(result.room_furniture_v2.by_room)).toEqual(['kitchen', 'home', 'care', 'rest']);
    expect(result.notes.find((n) => n.code === 'item-field-dropped')!.message).toContain('glow');
    expect(result.lossy).toBe(true);
  });

  it('leaves out pieces on walls Ditto has not, and pieces past its cap of 20', () => {
    const doc = createInitialHouse();
    doc.rooms[1] = { ...doc.rooms[1], walls: ['west', 'north', 'east'] };
    doc.rooms[1].items.push({ id: 'east-clock', type: 'official:clock-wall', surface: 'wall', wall: 'east', z: 4, y: 3 });
    for (let i = 0; i < 12; i++) doc.rooms[1].items.push({ id: `plant-${i}`, type: 'official:plant-small', surface: 'floor', x: 1 + (i % 6), z: 6 + (i % 2) });
    const result = dittoRoomsFromHouse(doc);
    expect(result.room_furniture_v2.by_room.home).toHaveLength(20);
    expect(result.notes.map((n) => n.code)).toEqual(expect.arrayContaining(['wall-not-shown', 'over-cap']));
  });

  it('leaves out finishes Ditto cannot draw', () => {
    const doc = createInitialHouse();
    doc.rooms[1] = { ...doc.rooms[1], floor: { style: 'marble', palette: ['#ffffff'] } };
    const result = dittoRoomsFromHouse(doc);
    expect(result.room_layouts.by_room.home).toBeUndefined();
    expect(result.room_layouts.by_room.kitchen).toBeDefined();
    expect(result.notes.map((n) => n.code)).toContain('layout-not-shown');
  });

  it('carries a move made in the house back to Ditto', () => {
    const doc = moveItem(createInitialHouse(), 'rest-1', { surface: 'floor', x: 5, z: 6 });
    expect(dittoRoomsFromHouse(doc).room_furniture_v2.by_room.rest[0]).toEqual({ id: 'official:bed-single', at: 'floor', x: 5, y: 6 });
  });
});

describe('review regressions (P2.1)', () => {
  it('keeps ids within the limit, unique and deterministic, for Ditto rooms with very long ids', () => {
    const a = 'a'.repeat(64);
    const b = 'a'.repeat(40) + 'b'.repeat(24);
    const profile = { room_furniture_v2: { v: 2, by_room: { [a]: [{ id: 'official:rug-paw', at: 'floor', x: 1, y: 1 }], [b]: [{ id: 'official:rug-paw', at: 'floor', x: 1, y: 1 }] } } };
    const first = houseFromDittoProfile(profile);
    expect(first.status).toBe('converted');
    const ids = first.doc!.rooms.slice(4).map((r) => r.items[0].id);
    expect(ids.every((id) => id.length <= 64)).toBe(true);
    expect(new Set(ids).size).toBe(2);
    expect(houseFromDittoProfile(profile).doc).toEqual(first.doc);
    expect(dittoItemId('kitchen', 3)).toBe('kitchen-3');
  });

  it('reports, instead of failing, Ditto data past the house limits', () => {
    const rooms = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`extra-${i}`, []]));
    const many = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: rooms } });
    expect(many.doc!.rooms).toHaveLength(64);
    expect(many.notes.filter((n) => n.code === 'over-limit')).toHaveLength(10);
    const pieces = Array.from({ length: 256 }, () => ({ id: 'official:plant-small', at: 'floor', x: 1, y: 1 }));
    const full = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: { home: pieces, rest: pieces, care: pieces, kitchen: pieces, closet: pieces } } });
    expect(full.doc!.rooms.reduce((n, r) => n + r.items.length, 0)).toBe(1024);
    expect(full.notes).toContainEqual(expect.objectContaining({ code: 'over-limit', room: 'closet', lossy: true }));
    expect(validateHouse(full.doc).status).toBe('valid');
  });

  it('says when room_furniture_v2 cannot be read and the legacy key or the defaults were used', () => {
    const result = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: [] } });
    expect(result.notes).toContainEqual(expect.objectContaining({ code: 'v2-unreadable', lossy: true }));
    expect(result.doc).toEqual(createInitialHouse());
  });

  it("says when a version 1 room had more pieces than Ditto's 20", () => {
    const v1 = Array.from({ length: 25 }, (_, i) => ({ id: 'official:plant-small', x: (i % 10) / 10, y: 0.7 + (i % 3) / 10, layer: 'floor' }));
    const result = houseFromDittoProfile({ room_furniture: { v: 1, by_room: { home: v1 } } });
    expect(result.doc!.rooms[1].items).toHaveLength(20);
    expect(result.notes).toContainEqual(expect.objectContaining({ code: 'over-cap', room: 'home', lossy: true }));
  });

  it('says which finish fields and variants Ditto drops, in both directions', () => {
    const imported = houseFromDittoProfile({ room_layouts: { v: 1, by_room: { home: { wall: { style: 'solid', palette: ['#fff'], sheen: 1 }, floor: { style: 'wood', palette: ['#000'], variant: 'glossy' } } } } });
    expect(imported.notes.map((n) => n.code)).toEqual(expect.arrayContaining(['field-dropped', 'variant-dropped']));
    const doc = createInitialHouse();
    doc.rooms[1] = { ...doc.rooms[1], type: 'living-room', wall: { ...doc.rooms[1].wall!, sheen: 1 }, size: { ...doc.rooms[1].size, shape: 'square' } };
    const exported = dittoRoomsFromHouse(doc);
    const messages = exported.notes.filter((n) => n.room === 'home').map((n) => n.message).join(' | ');
    expect(messages).toContain('`type`');
    expect(messages).toContain('sheen');
    expect(messages).toContain('shape');
    expect(exported.notes.find((n) => n.code === 'house-field-dropped')!.message).toContain('`name`');
  });
});

describe('import safety (P2.1 final review)', () => {
  /** The Blobbi starting house with its `home` room changed. */
  const starterWithHome = (change: Partial<HouseDocument['rooms'][number]>): HouseDocument => {
    const starter = createInitialHouse();
    starter.rooms[1] = { ...starter.rooms[1], items: [], ...change };
    return starter;
  };
  const toy = { id: 'official:toybox', at: 'floor', x: 3, y: 0.5 };

  it('fails with a structured reason, never a throw or a partial house, when a starter room has other dimensions', () => {
    const starter = starterWithHome({ size: { w: 4, d: 4, h: 5 } });
    const result = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: { home: [toy] } } }, { starter });
    expect(result).toMatchObject({ status: 'failed', doc: null, lossy: true });
    expect(result.failures).toEqual([expect.objectContaining({ code: 'room-incompatible', room: 'home', message: expect.stringContaining('4 × 4 × 5') })]);
  });

  it('fails when a starter room lacks a wall Ditto pieces hang on', () => {
    const starter = starterWithHome({ walls: ['north'] });
    const result = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: { home: [{ id: 'official:mirror', at: 'left', x: 3, y: 3 }] } } }, { starter });
    expect(result.status).toBe('failed');
    expect(result.doc).toBeNull();
    expect(result.failures).toEqual([expect.objectContaining({ code: 'room-incompatible', room: 'home', message: expect.stringContaining('no west wall') })]);
  });

  it('keeps out-of-bounds Ditto furniture where Ditto shows it and reports both positions; into a smaller room it fails instead of squeezing', () => {
    const profile = { room_furniture_v2: { v: 2, by_room: { home: [{ id: 'official:rug-paw', at: 'floor', x: 9, y: -1 }] } } };
    const ok = houseFromDittoProfile(profile);
    expect(ok.status).toBe('converted');
    expect(ok.failures).toEqual([]);
    expect(ok.doc!.rooms[1].items).toEqual([{ id: 'home-1', type: 'official:rug-paw', surface: 'floor', x: 8, z: 0 }]);
    expect(ok.notes).toContainEqual(expect.objectContaining({ code: 'clamped', room: 'home', lossy: true, message: expect.stringMatching(/\(9, -1\).*\(8, 0\)/) }));
    const small = houseFromDittoProfile(profile, { starter: starterWithHome({ size: { w: 6, d: 6, h: 5 } }) });
    expect(small).toMatchObject({ status: 'failed', doc: null });
    expect(small.failures.map((f) => f.code)).toEqual(['room-incompatible']);
  });

  it('reports every incompatible room at once', () => {
    const starter = createInitialHouse();
    starter.rooms[1] = { ...starter.rooms[1], items: [], size: { w: 4, d: 4, h: 5 } };
    starter.rooms[3] = { ...starter.rooms[3], items: [], walls: ['west'] };
    const result = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: { home: [toy], rest: [toy] } } }, { starter });
    expect(result.failures.map((f) => f.room)).toEqual(['home', 'rest']);
  });

  it('still converts into a non-Ditto starter room when Ditto saved no pieces for it (an empty list, or finishes only)', () => {
    const starter = starterWithHome({ size: { w: 4, d: 4, h: 5 } });
    const layouts = { v: 1, by_room: { home: { wall: { style: 'solid', palette: ['#fff'] }, floor: { style: 'wood', palette: ['#000'] } } } };
    const result = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: { home: [] } }, room_layouts: layouts }, { starter });
    expect(result.status).toBe('converted');
    expect(result.doc!.rooms[1]).toMatchObject({ size: { w: 4, d: 4, h: 5 }, items: [], wall: { style: 'solid' } });
  });

  it('fails, with the schema errors, for an invalid starter or a result that would be invalid', () => {
    const invalid = houseFromDittoProfile({}, { starter: { ...createInitialHouse(), name: '' } });
    expect(invalid).toMatchObject({ status: 'failed', doc: null });
    expect(invalid.failures).toEqual([expect.objectContaining({ code: 'starter-invalid', issues: [expect.objectContaining({ code: 'name' })] })]);
    // A valid starter whose kitchen keeps a piece with the id the import gives to the first home piece
    const starter = starterWithHome({});
    starter.rooms[0].items[0] = { ...starter.rooms[0].items[0], id: 'home-1' };
    expect(validateHouse(starter).status).toBe('valid');
    const clash = houseFromDittoProfile({ room_furniture_v2: { v: 2, by_room: { home: [toy] } } }, { starter });
    expect(clash).toMatchObject({ status: 'failed', doc: null });
    expect(clash.failures).toEqual([expect.objectContaining({ code: 'invalid-result', issues: [expect.objectContaining({ code: 'duplicate-item-id' })] })]);
  });

  it('gives a too-new result its reason in failures, and a converted one none', () => {
    expect(houseFromDittoProfile({ room_furniture_v2: { v: 3, by_room: {} } }).failures).toEqual([expect.objectContaining({ code: 'too-new' })]);
    expect(houseFromDittoProfile(PROFILE).failures).toEqual([]);
  });

  it('reports a legacy room_furniture it cannot read, instead of silently using the defaults', () => {
    for (const legacy of [{ v: 3, by_room: { home: [toy] } }, { v: 1 }, 'nonsense']) {
      const result = houseFromDittoProfile({ room_furniture: legacy });
      expect(result.status).toBe('converted');
      expect(result.doc).toEqual(createInitialHouse());
      expect(result.lossy).toBe(true);
      expect(result.notes).toContainEqual(expect.objectContaining({ code: 'legacy-unreadable', lossy: true }));
    }
    // Superseded by a readable room_furniture_v2, as in Ditto: not read, and not reported
    expect(houseFromDittoProfile({ ...PROFILE, room_furniture: { v: 3 } }).notes.map((n) => n.code)).not.toContain('legacy-unreadable');
  });
});
