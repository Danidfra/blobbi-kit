/**
 * HOUSE EDITS (P2.1): pure, deterministic operations on a house document.
 *
 * Every operation takes a valid house and returns a new one (the input is
 * never changed), or throws `HouseEditError` and changes nothing. Each
 * result is validated again, so no operation can produce an invalid house.
 * Unknown fields and unknown item types are carried through untouched.
 *
 * Not here: relays, signing, publishing, storage, merging edits from two
 * devices (P2.2), and any game's rules (a room's unlock, an item's price).
 */
import { HOUSE_LIMITS, isHouseId, validateHouse, wallAxis } from './house';
import type { HouseDocument, HouseItem, HouseRoom, HouseWall, QuarterTurn, RoomLink, RoomSize, SurfaceMaterial } from './house';
import { placementProblem } from './house-catalog';
import { blobbiStarterHouse } from './house-template';

export class HouseEditError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HouseEditError';
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A copy of a valid house to edit; refuses an invalid or newer one (editing it would lose data). */
function editable(doc: HouseDocument): HouseDocument {
  const result = validateHouse(doc);
  if (result.status !== 'valid') throw new HouseEditError('not-editable', `this house is ${result.status}: it can be shown but not edited`);
  return clone(doc);
}

/** The edited house, checked; any schema error is the operation's fault and nothing changes. */
function done(doc: HouseDocument): HouseDocument {
  const result = validateHouse(doc);
  if (result.status !== 'valid') {
    const first = result.issues.find((i) => i.severity === 'error');
    throw new HouseEditError(first?.code ?? 'invalid', first ? `${first.path}: ${first.message}` : 'the edit would make the house invalid');
  }
  return doc;
}

function roomOf(doc: HouseDocument, roomId: string): HouseRoom {
  const room = doc.rooms.find((r) => r.id === roomId);
  if (!room) throw new HouseEditError('no-room', `no room is called ${roomId}`);
  return room;
}

/** Where a piece is: its room and its index there, or null. */
export function findItem(doc: HouseDocument, itemId: string): { room: HouseRoom; item: HouseItem; index: number } | null {
  for (const room of doc.rooms) {
    const index = room.items.findIndex((i) => i.id === itemId);
    if (index >= 0) return { room, item: room.items[index], index };
  }
  return null;
}

function itemIn(doc: HouseDocument, itemId: string): { room: HouseRoom; item: HouseItem; index: number } {
  const found = findItem(doc, itemId);
  if (!found) throw new HouseEditError('no-item', `no item is called ${itemId}`);
  return found;
}

function allItemIds(doc: HouseDocument): Set<string> {
  return new Set(doc.rooms.flatMap((r) => r.items.map((i) => i.id)));
}

function checkPlacement(type: string, surface: HouseItem['surface']): void {
  const problem = placementProblem(type, surface);
  if (problem) throw new HouseEditError('wrong-surface', problem);
}

// ─── Creating ─────────────────────────────────────────────────────────────────

export interface InitialHouseOptions {
  /** The rooms and pieces to start with (default: the Blobbi starting house). */
  starter?: HouseDocument;
  /** Default: the starter's name. */
  name?: string;
  /** The application creating it (metadata only). */
  app?: string;
  category?: string;
}

/** A new house: the same input always gives the same house (no clock, no randomness). */
export function createInitialHouse({ starter = blobbiStarterHouse(), name, app, category }: InitialHouseOptions = {}): HouseDocument {
  const doc = clone(starter);
  if (name !== undefined) doc.name = name;
  if (app !== undefined) doc.app = app;
  if (category !== undefined) doc.category = category;
  return done(doc);
}

/**
 * A fresh item id: 10 base-36 characters from `random` (default
 * `Math.random`; pass a seeded one for determinism), never one in `taken`.
 */
export function createItemId(taken: ReadonlySet<string> = new Set(), random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let id = '';
    for (let i = 0; i < 10; i++) id += Math.floor(random() * 36).toString(36);
    if (isHouseId(id) && !taken.has(id)) return id;
  }
  throw new HouseEditError('no-id', 'could not make a free item id');
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

export interface NewRoom {
  id: string;
  type?: string;
  name?: string;
  size: RoomSize;
  walls: HouseWall[];
  wall?: SurfaceMaterial;
  floor?: SurfaceMaterial;
  links?: RoomLink[];
  ext?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Add a room (a house grows: a room unlocked, bought, built). It starts
 * empty; every existing room, piece and finish stays as it was. `at` puts it
 * at that position in the room order (default: last).
 */
export function addRoom(doc: HouseDocument, room: NewRoom, { at }: { at?: number } = {}): HouseDocument {
  const next = editable(doc);
  if (next.rooms.some((r) => r.id === room.id)) throw new HouseEditError('duplicate-room-id', `a room is already called ${room.id}`);
  if (next.rooms.length >= HOUSE_LIMITS.maxRooms) throw new HouseEditError('too-many-rooms', `a house holds at most ${HOUSE_LIMITS.maxRooms} rooms`);
  const added = { ...clone(room), items: [] } as HouseRoom;
  const index = at === undefined ? next.rooms.length : Math.max(0, Math.min(next.rooms.length, Math.floor(at)));
  next.rooms.splice(index, 0, added);
  return done(next);
}

/**
 * Remove an empty room. A room with pieces in it is refused (move or remove
 * them first: nothing is deleted as a side effect); links to it from other
 * rooms go with it.
 */
export function removeRoom(doc: HouseDocument, roomId: string): HouseDocument {
  const next = editable(doc);
  const room = roomOf(next, roomId);
  if (room.items.length) throw new HouseEditError('room-not-empty', `${roomId} still has ${room.items.length} item(s) in it`);
  next.rooms = next.rooms.filter((r) => r.id !== roomId);
  for (const r of next.rooms) {
    if (!r.links) continue;
    const before = r.links.length;
    r.links = r.links.filter((l) => l.room !== roomId);
    // Only a list this removal emptied goes; a `links: []` that was already there stays as it was
    if (before && !r.links.length) delete r.links;
  }
  return done(next);
}

/** Put the rooms in a new order: `ids` must name every room exactly once. */
export function reorderRooms(doc: HouseDocument, ids: readonly string[]): HouseDocument {
  const next = editable(doc);
  const current = next.rooms.map((r) => r.id);
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.includes(id))) {
    throw new HouseEditError('bad-order', 'the new order must name every room exactly once');
  }
  next.rooms = ids.map((id) => next.rooms.find((r) => r.id === id)!);
  return done(next);
}

/** Change a room's wall and/or floor finish; `null` removes one (the client's own is used). */
export function setRoomMaterials(doc: HouseDocument, roomId: string, materials: { wall?: SurfaceMaterial | null; floor?: SurfaceMaterial | null }): HouseDocument {
  const next = editable(doc);
  const room = roomOf(next, roomId);
  for (const key of ['wall', 'floor'] as const) {
    const value = materials[key];
    if (value === null) delete room[key];
    else if (value !== undefined) room[key] = clone(value);
  }
  return done(next);
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/** Where a piece goes: on the floor at (x, z), or on a wall at `along` tiles and height `y`. */
export type ItemPlacement = { surface: 'floor'; x: number; z: number } | { surface: 'wall'; wall: HouseWall; along: number; y: number };

/** Write a placement onto an item (and drop what the other surface used). */
function place(item: HouseItem, placement: ItemPlacement, room: HouseRoom): void {
  delete item.x;
  delete item.y;
  delete item.z;
  delete item.wall;
  item.surface = placement.surface;
  if (placement.surface === 'floor') {
    item.x = placement.x;
    item.z = placement.z;
  } else {
    delete item.rot;
    item.wall = placement.wall;
    item[wallAxis(placement.wall, room.size).axis] = placement.along;
    item.y = placement.y;
  }
}

export interface NewItem {
  /** Default: a fresh id (`createItemId`). */
  id?: string;
  type: string;
  rot?: QuarterTurn;
  scale?: number;
  variant?: string;
  content?: Record<string, unknown>;
  ext?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Place a new piece. Unknown types are allowed (other games' pieces); a
 * known type must go on its surface. Overlaps are not checked here: they are
 * a client's placement rule (`footprint` gives the tiles).
 *
 * The piece's id is `item.id` when given; otherwise a fresh random one
 * (`createItemId` with `random`, default `Math.random`). This is the only
 * place randomness enters the house operations: pass an `id` or a seeded
 * `random` for a fully deterministic result. Random ids keep two devices that
 * add "the same" piece from giving both pieces one id.
 */
export function addItem(doc: HouseDocument, roomId: string, item: NewItem, placement: ItemPlacement, { random }: { random?: () => number } = {}): HouseDocument {
  const next = editable(doc);
  const room = roomOf(next, roomId);
  const taken = allItemIds(next);
  const id = item.id ?? createItemId(taken, random);
  if (taken.has(id)) throw new HouseEditError('duplicate-item-id', `an item is already called ${id}`);
  checkPlacement(item.type, placement.surface);
  const added = { ...clone(item), id } as HouseItem;
  place(added, placement, room);
  if (added.rot === 0) delete added.rot;
  room.items.push(added);
  return done(next);
}

/** Move a piece within its room, or to another room (`room`); it keeps its id, type, turn, scale and every other field. */
export function moveItem(doc: HouseDocument, itemId: string, placement: ItemPlacement, { room: toRoomId }: { room?: string } = {}): HouseDocument {
  const next = editable(doc);
  const { room, item, index } = itemIn(next, itemId);
  checkPlacement(item.type, placement.surface);
  const target = toRoomId === undefined ? room : roomOf(next, toRoomId);
  place(item, placement, target);
  if (target !== room) {
    room.items.splice(index, 1);
    target.items.push(item);
  }
  return done(next);
}

/** Turn a floor piece by `by` quarter turns clockwise (negative: anticlockwise). Wall pieces do not turn. */
export function rotateItem(doc: HouseDocument, itemId: string, by = 1): HouseDocument {
  const next = editable(doc);
  const { item } = itemIn(next, itemId);
  if (item.surface !== 'floor') throw new HouseEditError('wall-rot', 'a wall item faces into the room and does not turn');
  if (!Number.isInteger(by)) throw new HouseEditError('rot', 'turns are whole quarter turns');
  const rot = ((((item.rot ?? 0) + by) % 4) + 4) % 4;
  if (rot === 0) delete item.rot;
  else item.rot = rot as QuarterTurn;
  return done(next);
}

/** Remove a piece. */
export function removeItem(doc: HouseDocument, itemId: string): HouseDocument {
  const next = editable(doc);
  const { room, index } = itemIn(next, itemId);
  room.items.splice(index, 1);
  return done(next);
}

// ─── Compatibility ────────────────────────────────────────────────────────────

/**
 * How much of a house a client can draw: the pieces whose types it supports,
 * and the ones it must skip (and keep). A house that parses is
 * protocol-compatible; this is the furniture-support level.
 */
export function houseSupport(doc: HouseDocument, supports: (type: string) => boolean): { supported: number; unsupported: { room: string; item: HouseItem }[] } {
  const unsupported: { room: string; item: HouseItem }[] = [];
  let supported = 0;
  for (const room of doc.rooms) {
    for (const item of room.items) {
      if (supports(item.type)) supported++;
      else unsupported.push({ room: room.id, item });
    }
  }
  return { supported, unsupported };
}
