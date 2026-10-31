import { describe, expect, it } from 'vitest';
import {
  BLOBBI_MAX_ITEMS_PER_ROOM,
  HouseEditError,
  addItem,
  addRoom,
  createInitialHouse,
  createItemId,
  findItem,
  houseFurniture,
  houseSupport,
  moveItem,
  removeItem,
  removeRoom,
  reorderRooms,
  rotateItem,
  serializeHouse,
  setRoomMaterials,
  validateHouse,
  type HouseDocument,
  type NewRoom,
} from './index';

/** A seeded random source, for deterministic ids. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Freeze deeply, so any mutation of an input throws. */
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

function oneRoom(): HouseDocument {
  return { v: 1, name: 'Studio', app: 'some-game', rooms: [{ id: 'main-room', size: { w: 6, d: 4, h: 3 }, walls: ['west', 'north'], items: [] }] };
}

const ATTIC: NewRoom = { id: 'attic', type: 'attic', size: { w: 4, d: 4, h: 2 }, walls: ['north'], floor: { style: 'wood', palette: ['#78350f'] } };

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof HouseEditError) return e.code;
    throw e;
  }
  throw new Error('no error thrown');
}

describe('createInitialHouse', () => {
  it('is deterministic: the same house, byte for byte, every time', () => {
    expect(createInitialHouse()).toEqual(createInitialHouse());
    expect(serializeHouse(createInitialHouse())).toBe(serializeHouse(createInitialHouse()));
  });

  it("is Ditto's four visible rooms in Ditto's order, without the closet, with the defaults stored in it", () => {
    const doc = createInitialHouse();
    expect(doc.name).toBe('Home');
    expect(doc.rooms.map((r) => r.id)).toEqual(['kitchen', 'home', 'care', 'rest']);
    expect(doc.rooms.every((r) => r.size.w === 8 && r.size.d === 8 && r.size.h === 5 && r.walls.join() === 'west,north' && r.wall && r.floor)).toBe(true);
    expect(doc.rooms.map((r) => r.items.length)).toEqual([8, 9, 7, 11]);
    expect(doc.rooms.flatMap((r) => r.items.map((i) => i.id)).slice(0, 3)).toEqual(['kitchen-1', 'kitchen-2', 'kitchen-3']);
    expect(doc.rooms.every((r) => r.items.length <= BLOBBI_MAX_ITEMS_PER_ROOM)).toBe(true);
  });

  it('takes a name, an originating app and a category', () => {
    expect(createInitialHouse({ name: 'Casa', app: 'blobbi-home', category: 'house' })).toMatchObject({ name: 'Casa', app: 'blobbi-home', category: 'house' });
    expect(createInitialHouse({ starter: oneRoom() }).rooms.map((r) => r.id)).toEqual(['main-room']);
  });
});

describe('rooms', () => {
  it('grows a house one room at a time, keeping every room, piece and finish as it was', () => {
    let doc = addItem(oneRoom(), 'main-room', { id: 'lamp', type: 'official:lamp-floor' }, { surface: 'floor', x: 1, z: 1 });
    const before = JSON.parse(JSON.stringify(doc.rooms[0]));
    doc = addRoom(doc, { ...ATTIC, links: [{ room: 'main-room' }] });
    doc = addRoom(doc, { id: 'garden', size: { w: 10, d: 10, h: 1 }, walls: [], ext: { 'some-game': { unlockedBy: 'quest-7' } } });
    expect(doc.rooms.map((r) => r.id)).toEqual(['main-room', 'attic', 'garden']);
    expect(doc.rooms[0]).toEqual(before);
    expect(doc.rooms[1].items).toEqual([]);
    expect(doc.rooms[2].ext).toEqual({ 'some-game': { unlockedBy: 'quest-7' } });
    expect(validateHouse(doc).status).toBe('valid');
  });

  it('puts a new room where asked in the order', () => {
    expect(addRoom(createInitialHouse(), ATTIC, { at: 1 }).rooms.map((r) => r.id)).toEqual(['kitchen', 'attic', 'home', 'care', 'rest']);
  });

  it('refuses a room id in use, an invalid room, or a link to a room that does not exist', () => {
    expect(code(() => addRoom(createInitialHouse(), { ...ATTIC, id: 'kitchen' }))).toBe('duplicate-room-id');
    expect(code(() => addRoom(oneRoom(), { ...ATTIC, size: { w: 0, d: 4, h: 2 } }))).toBe('size-w');
    expect(code(() => addRoom(oneRoom(), { ...ATTIC, links: [{ room: 'nowhere' }] }))).toBe('link-unknown-room');
  });

  it('removes only an empty room, and the links to it', () => {
    let doc = addRoom(addRoom(oneRoom(), ATTIC), { id: 'hall', size: { w: 2, d: 6, h: 3 }, walls: [], links: [{ room: 'attic' }] });
    expect(code(() => removeRoom(createInitialHouse(), 'kitchen'))).toBe('room-not-empty');
    doc = removeRoom(doc, 'attic');
    expect(doc.rooms.map((r) => r.id)).toEqual(['main-room', 'hall']);
    expect(doc.rooms[1].links).toBeUndefined();
    expect(code(() => removeRoom(doc, 'attic'))).toBe('no-room');
  });

  it('reorders rooms only by a full permutation', () => {
    expect(reorderRooms(createInitialHouse(), ['rest', 'care', 'home', 'kitchen']).rooms.map((r) => r.id)).toEqual(['rest', 'care', 'home', 'kitchen']);
    expect(code(() => reorderRooms(createInitialHouse(), ['rest', 'care']))).toBe('bad-order');
    expect(code(() => reorderRooms(createInitialHouse(), ['rest', 'rest', 'home', 'kitchen']))).toBe('bad-order');
  });

  it('changes or removes finishes, and refuses invalid ones', () => {
    const doc = setRoomMaterials(createInitialHouse(), 'home', { floor: { style: 'carpet', palette: ['#a78bfa'], variant: 'soft' } });
    expect(doc.rooms[1].floor).toEqual({ style: 'carpet', palette: ['#a78bfa'], variant: 'soft' });
    expect(doc.rooms[1].wall).toEqual(createInitialHouse().rooms[1].wall);
    expect(setRoomMaterials(doc, 'home', { wall: null }).rooms[1].wall).toBeUndefined();
    expect(code(() => setRoomMaterials(doc, 'home', { wall: { style: 'solid', palette: [] } }))).toBe('material-palette');
  });
});

describe('pieces', () => {
  it('adds pieces with fresh ids, several of the same type, unknown types included', () => {
    const random = seeded(7);
    let doc = oneRoom();
    doc = addItem(doc, 'main-room', { type: 'official:plant-small' }, { surface: 'floor', x: 1, z: 1 }, { random });
    doc = addItem(doc, 'main-room', { type: 'official:plant-small' }, { surface: 'floor', x: 2, z: 1 }, { random });
    doc = addItem(doc, 'main-room', { type: 'mygame:throne', rot: 2, colour: 'gold' }, { surface: 'floor', x: 3, z: 2 }, { random });
    const [a, b, c] = doc.rooms[0].items;
    expect(a.id).not.toBe(b.id);
    expect([a.type, b.type]).toEqual(['official:plant-small', 'official:plant-small']);
    expect(c).toMatchObject({ type: 'mygame:throne', rot: 2, colour: 'gold' });
    // The same seed gives the same ids
    let again = oneRoom();
    const replay = seeded(7);
    again = addItem(again, 'main-room', { type: 'official:plant-small' }, { surface: 'floor', x: 1, z: 1 }, { random: replay });
    expect(again.rooms[0].items[0].id).toBe(a.id);
  });

  it('places wall pieces along the wall they hang on: z on a west wall, x on a north wall', () => {
    let doc = addItem(oneRoom(), 'main-room', { id: 'mirror', type: 'official:mirror' }, { surface: 'wall', wall: 'west', along: 2, y: 2 });
    doc = addItem(doc, 'main-room', { id: 'clock', type: 'official:clock-wall' }, { surface: 'wall', wall: 'north', along: 5, y: 2.5 });
    expect(doc.rooms[0].items).toEqual([
      { id: 'mirror', type: 'official:mirror', surface: 'wall', wall: 'west', z: 2, y: 2 },
      { id: 'clock', type: 'official:clock-wall', surface: 'wall', wall: 'north', x: 5, y: 2.5 },
    ]);
  });

  it('refuses a known piece on the wrong surface, a taken id, a missing wall and a position off the room', () => {
    expect(code(() => addItem(oneRoom(), 'main-room', { type: 'official:clock-wall' }, { surface: 'floor', x: 1, z: 1 }))).toBe('wrong-surface');
    expect(code(() => addItem(oneRoom(), 'main-room', { type: 'official:bed-single' }, { surface: 'wall', wall: 'west', along: 1, y: 1 }))).toBe('wrong-surface');
    expect(code(() => addItem(createInitialHouse(), 'home', { id: 'kitchen-1', type: 'official:rug-paw' }, { surface: 'floor', x: 1, z: 1 }))).toBe('duplicate-item-id');
    expect(code(() => addItem(oneRoom(), 'main-room', { type: 'official:mirror' }, { surface: 'wall', wall: 'east', along: 1, y: 1 }))).toBe('wall-missing');
    expect(code(() => addItem(oneRoom(), 'main-room', { type: 'official:rug-paw' }, { surface: 'floor', x: 7, z: 1 }))).toBe('x-bounds');
    expect(code(() => addItem(oneRoom(), 'nowhere', { type: 'official:rug-paw' }, { surface: 'floor', x: 1, z: 1 }))).toBe('no-room');
  });

  it('moves a piece and keeps everything else about it', () => {
    const doc = addItem(oneRoom(), 'main-room', { id: 'throne', type: 'mygame:throne', rot: 3, scale: 1.5, colour: 'gold', ext: { 'some-game': { level: 2 } } }, { surface: 'floor', x: 1, z: 1 });
    const moved = moveItem(doc, 'throne', { surface: 'floor', x: 4.5, z: 3 });
    expect(moved.rooms[0].items[0]).toEqual({ id: 'throne', type: 'mygame:throne', surface: 'floor', x: 4.5, z: 3, rot: 3, scale: 1.5, colour: 'gold', ext: { 'some-game': { level: 2 } } });
    expect(doc.rooms[0].items[0].x).toBe(1);
  });

  it('moves a piece to another room, keeping its id', () => {
    const doc = moveItem(createInitialHouse(), 'home-1', { surface: 'floor', x: 4, z: 4 }, { room: 'rest' });
    expect(findItem(doc, 'home-1')!.room.id).toBe('rest');
    expect(doc.rooms[1].items.some((i) => i.id === 'home-1')).toBe(false);
    expect(code(() => moveItem(addRoom(createInitialHouse(), ATTIC), 'home-9', { surface: 'wall', wall: 'west', along: 1, y: 1 }, { room: 'attic' }))).toBe('wall-missing');
  });

  it('drops the turn when a piece goes from the floor to a wall (other games\' pieces may)', () => {
    const doc = addItem(oneRoom(), 'main-room', { id: 'banner', type: 'mygame:banner', rot: 1 }, { surface: 'floor', x: 1, z: 1 });
    const hung = moveItem(doc, 'banner', { surface: 'wall', wall: 'north', along: 3, y: 2 });
    expect(hung.rooms[0].items[0]).toEqual({ id: 'banner', type: 'mygame:banner', surface: 'wall', wall: 'north', x: 3, y: 2 });
    expect(code(() => moveItem(createInitialHouse(), 'kitchen-1', { surface: 'wall', wall: 'west', along: 2, y: 2 }))).toBe('wrong-surface');
  });

  it('turns floor pieces by quarter turns either way, and never wall pieces', () => {
    let doc = createInitialHouse();
    doc = rotateItem(doc, 'kitchen-1');
    expect(findItem(doc, 'kitchen-1')!.item.rot).toBe(1);
    doc = rotateItem(doc, 'kitchen-1', -2);
    expect(findItem(doc, 'kitchen-1')!.item.rot).toBe(3);
    doc = rotateItem(doc, 'kitchen-1', 5);
    expect(findItem(doc, 'kitchen-1')!.item.rot).toBeUndefined();
    expect(code(() => rotateItem(doc, 'kitchen-6'))).toBe('wall-rot');
    expect(code(() => rotateItem(doc, 'kitchen-1', 0.5))).toBe('rot');
  });

  it('removes a piece, and only that piece', () => {
    const doc = removeItem(createInitialHouse(), 'rest-7');
    expect(findItem(doc, 'rest-7')).toBeNull();
    expect(doc.rooms[3].items.map((i) => i.id)).toEqual(['rest-1', 'rest-2', 'rest-3', 'rest-4', 'rest-5', 'rest-6', 'rest-8', 'rest-9', 'rest-10', 'rest-11']);
    expect(code(() => removeItem(doc, 'rest-7'))).toBe('no-item');
  });
});

describe('editing is pure and safe', () => {
  it('never changes its input', () => {
    const doc = frozen(createInitialHouse());
    expect(() => {
      addRoom(doc, ATTIC);
      addItem(doc, 'home', { type: 'official:rug-paw' }, { surface: 'floor', x: 2, z: 2 });
      moveItem(doc, 'home-1', { surface: 'floor', x: 2, z: 2 });
      rotateItem(doc, 'home-2');
      removeItem(doc, 'home-3');
      setRoomMaterials(doc, 'home', { wall: null });
      reorderRooms(doc, ['home', 'kitchen', 'care', 'rest']);
    }).not.toThrow();
    expect(doc).toEqual(createInitialHouse());
  });

  it('refuses to edit an invalid house (it would lose what it cannot read)', () => {
    const broken = { ...createInitialHouse(), name: '' };
    expect(code(() => addItem(broken, 'home', { type: 'official:rug-paw' }, { surface: 'floor', x: 1, z: 1 }))).toBe('not-editable');
    expect(code(() => addRoom({ v: 2 } as unknown as HouseDocument, ATTIC))).toBe('not-editable');
  });

  it('keeps unknown fields at every level through any edit', () => {
    const doc = { ...createInitialHouse(), future: [1, 2], ext: { 'blobbi-home': { preferredRoom: 'home' } } } as HouseDocument;
    doc.rooms[0] = { ...doc.rooms[0], lighting: 'warm' };
    const edited = rotateItem(addRoom(doc, ATTIC), 'home-2');
    expect(edited.future).toEqual([1, 2]);
    expect(edited.ext).toEqual({ 'blobbi-home': { preferredRoom: 'home' } });
    expect(edited.rooms[0].lighting).toBe('warm');
  });
});

describe('ids and support', () => {
  it('makes ids that are valid, free and reproducible with a seed', () => {
    const taken = new Set(['abc']);
    const id = createItemId(taken, seeded(3));
    expect(id).toMatch(/^[a-z0-9]{10}$/);
    expect(createItemId(taken, seeded(3))).toBe(id);
    expect(code(() => createItemId(new Set(['0000000000']), () => 0))).toBe('no-id');
  });

  it('tells a client which pieces it must skip (and keep)', () => {
    let doc = createInitialHouse();
    doc = addItem(doc, 'home', { id: 'throne', type: 'mygame:throne' }, { surface: 'floor', x: 6, z: 6 });
    const support = houseSupport(doc, (t) => houseFurniture(t) !== undefined);
    expect(support.supported).toBe(35);
    expect(support.unsupported).toEqual([{ room: 'home', item: expect.objectContaining({ id: 'throne' }) }]);
  });
});

describe('final review fixes (P2.1)', () => {
  it('removing a room keeps an empty links list another room already had, and drops only a list it emptied', () => {
    let doc = addRoom(oneRoom(), ATTIC);
    doc = addRoom(doc, { id: 'hall', size: { w: 2, d: 6, h: 3 }, walls: [], links: [{ room: 'attic' }] });
    doc = addRoom(doc, { id: 'porch', size: { w: 2, d: 2, h: 2 }, walls: [], links: [] });
    const after = removeRoom(doc, 'attic');
    expect(after.rooms.find((r) => r.id === 'porch')!.links).toEqual([]);
    expect('links' in after.rooms.find((r) => r.id === 'hall')!).toBe(false);
  });
});
