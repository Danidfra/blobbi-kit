/**
 * THE BLOBBI HOUSE (P2.1): one persistent house that every Blobbi app, and
 * any Nostr game that wants to, can read and draw (the full specification is
 * `HOUSE.md` at the package root).
 *
 *   House  kind 31127, addressable, one per owner + house id (`d`). The
 *          content is the whole house as JSON: rooms, their materials, the
 *          pieces placed in them. A player may own any number of houses.
 *
 * The house is logical, not visual: rooms are tile grids, pieces have a
 * stable instance id, a namespaced type, a surface and a position in tiles.
 * Nothing about a camera, a screen or a renderer is stored, so the same
 * house can be drawn in 2D, 3D or pixel art.
 *
 * This module is pure: the schema, validation, parsing, canonical
 * serialization and event templates. No clock, no relay, no signer. Edits are
 * `house-ops.ts`, the shared furniture catalog `house-catalog.ts`, the Blobbi
 * starting house `house-template.ts`, Ditto's 11125 rooms `house-ditto.ts`.
 *
 * EXPERIMENTAL KIND. 31127 was chosen after a collision search on 2026-10-24
 * (no NIP or registry entry, no NIP pull request, no public code, no events
 * on five large relays), which is evidence, not a registry.
 */
import { BLOBBI_ECOSYSTEM_NAMESPACE } from './blobbi';
import type { NostrEvent, NostrFilter } from './nostr-protocol';
import type { EventVerifier } from './profile-order';

// ─── Kind, version, limits ────────────────────────────────────────────────────

/** A house: addressable (30000–39999), beside 31124 (pet), 31125 (legacy profile) and 31126 (World Location). Experimental. */
export const KIND_BLOBBI_HOUSE = 31127;
export const HOUSE_KIND_STATUS: 'experimental' | 'stable' = 'experimental';

/** The schema version this module reads and writes (`content.v`, and the `["v", "1"]` tag). */
export const HOUSE_VERSION = 1;

/** The id of a player's first house. A fixed id, so two devices creating it at once make one house, not two. It does not mean "preferred". */
export const MAIN_HOUSE_ID = 'main';

/**
 * Security limits: a house past any of these is refused outright, as hostile
 * or broken. They are deliberately far above what a real house needs, so
 * houses can grow; they are not a size recommendation.
 */
export const HOUSE_LIMITS = {
  /** UTF-8 bytes of the event content. */
  maxContentBytes: 262_144,
  maxRooms: 64,
  maxItemsPerRoom: 256,
  maxItems: 1024,
  maxLinksPerRoom: 16,
  /** Floor sides (`w`, `d`) in tiles. */
  maxRoomSide: 64,
  /** Wall height in tiles. */
  maxRoomHeight: 32,
  /** House, room and item ids. */
  maxIdLength: 64,
  /** Item types (`sno:` types are long). */
  maxTypeLength: 256,
  maxNameLength: 120,
} as const;

/**
 * The size a house should stay under to be accepted by strict relays (the
 * NIP-11 example limit is 16 KiB). Larger houses are valid but may be refused
 * by some relays; `houseContentBytes` measures one.
 */
export const HOUSE_RECOMMENDED_CONTENT_BYTES = 16_384;

// ─── Schema ───────────────────────────────────────────────────────────────────

/** A room's walls, by the plane they stand in: west x = 0, north z = 0, east x = w, south z = d. */
export type HouseWall = 'west' | 'north' | 'east' | 'south';
export const HOUSE_WALLS: readonly HouseWall[] = ['west', 'north', 'east', 'south'];

/** Where a piece is: on the floor, or hanging on one of the room's walls. */
export type HouseSurface = 'floor' | 'wall';

/** Quarter turns clockwise, seen from above. 0 faces +z (south). Floor pieces only. */
export type QuarterTurn = 0 | 1 | 2 | 3;

/** A wall or floor finish (Ditto's `room_layouts` surface, unchanged). */
export interface SurfaceMaterial {
  style: string;
  /** 1–4 colours, `#rgb`, `#rrggbb` or `#rrggbbaa`. */
  palette: string[];
  variant?: string;
  /** Pattern rotation in whole degrees, 0–359. */
  angle?: number;
  [key: string]: unknown;
}

/** A room's floor (`w` along x, `d` along z) and wall height (`h`), in whole tiles. */
export interface RoomSize {
  w: number;
  d: number;
  h: number;
  [key: string]: unknown;
}

/** A way from one room to another (advisory: a client may ignore it, and must keep it). */
export interface RoomLink {
  room: string;
  [key: string]: unknown;
}

/**
 * One placed piece.
 *
 * Floor pieces: `x` and `z`, the centre of the footprint; optional `rot`.
 * Wall pieces: `wall`, the position along it (`z` on west and east walls, `x`
 * on north and south walls) and `y`, the height of the piece's centre.
 */
export interface HouseItem {
  /** Unique in the house, stable for the piece's whole life (moves, turns, room changes). */
  id: string;
  /** Namespaced catalog type: `official:bed-single`, `sno:<naddr>`, `<namespace>:<slug>`. */
  type: string;
  surface: HouseSurface;
  wall?: HouseWall;
  x?: number;
  y?: number;
  z?: number;
  rot?: QuarterTurn;
  /** 0.5–2; absent means 1. */
  scale?: number;
  /** A visual variant the type's renderers understand (a colour, a finish). */
  variant?: string;
  /** Per-piece data, such as a picture frame's `imageUrl` (https only). */
  content?: Record<string, unknown>;
  /** Application data, by namespace (see `HOUSE.md`). */
  ext?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HouseRoom {
  /** Unique in the house, stable for the room's whole life. */
  id: string;
  /** What kind of room it is (`kitchen`, `bedroom`, …); for Blobbi rooms the same as Ditto's room id. */
  type?: string;
  name?: string;
  size: RoomSize;
  /** The walls the room has (any of the four, any order, no repeats). */
  walls: HouseWall[];
  /** The finish of every wall. Absent: the client's own. */
  wall?: SurfaceMaterial;
  floor?: SurfaceMaterial;
  items: HouseItem[];
  links?: RoomLink[];
  ext?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The content of a house event. The owner is never here: it is the event's author. */
export interface HouseDocument {
  v: typeof HOUSE_VERSION;
  name: string;
  /** The application that created the house (metadata; never a restriction on who may read or edit it). */
  app?: string;
  /** What kind of home it is (`house`, `apartment`, …). */
  category?: string;
  /** In display order. */
  rooms: HouseRoom[];
  ext?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Identifiers ──────────────────────────────────────────────────────────────

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
/** Ditto's furniture id format, so every house type can be mirrored into Ditto's rooms. */
const TYPE_RE = /^[a-z][a-z0-9]*:[a-z][a-z0-9-]*$/;
const TOKEN_RE = /^[a-z0-9][a-z0-9._:-]*$/;
const STYLE_RE = /^[a-z][a-z0-9-]*$/;
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const MAX_TOKEN_LENGTH = 64;
const MAX_STYLE_LENGTH = 32;

/** A house, room or item id: lower-case letters, digits, `.`, `_`, `-`, starting with a letter or digit, at most 64. */
export function isHouseId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= HOUSE_LIMITS.maxIdLength && ID_RE.test(value);
}

/** A piece's type: `<namespace>:<slug>` (Ditto's format), at most 256 characters. */
export function isHouseItemType(value: unknown): value is string {
  return typeof value === 'string' && value.length <= HOUSE_LIMITS.maxTypeLength && TYPE_RE.test(value);
}

/** An `app`, `category` or room `type`: lower-case, digits, `.`, `_`, `:`, `-`, at most 64. */
export function isHouseToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TOKEN_LENGTH && TOKEN_RE.test(value);
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface HouseIssue {
  /** `error`: the house (or a part of it) is not valid. `warning`: valid, but worth knowing. */
  severity: 'error' | 'warning';
  /** A stable machine-readable code. */
  code: string;
  /** Where, as a JSON path (`rooms[1].items[0].x`). */
  path: string;
  message: string;
}

/**
 * - `valid`: the house, writable.
 * - `invalid`: parts of it break the schema; `doc` holds the valid parts for display only. Never write it back: that
 *   would lose the invalid parts.
 * - `unsupported-version`: written by a newer schema; `doc` is null. Never write over it.
 * - `malformed`: not a house at all, or past a security limit; `doc` is null.
 */
export type HouseStatus = 'valid' | 'invalid' | 'unsupported-version' | 'malformed';

export interface HouseValidation {
  status: HouseStatus;
  doc: HouseDocument | null;
  issues: HouseIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class Issues {
  readonly list: HouseIssue[] = [];
  error(path: string, code: string, message: string): false {
    this.list.push({ severity: 'error', code, path, message });
    return false;
  }
  warn(path: string, code: string, message: string): void {
    this.list.push({ severity: 'warning', code, path, message });
  }
  get errors(): number {
    return this.list.filter((i) => i.severity === 'error').length;
  }
}

function checkExt(value: unknown, path: string, out: Issues): boolean {
  if (value === undefined || isRecord(value)) return true;
  return out.error(path, 'ext-not-object', '`ext` must be an object keyed by namespace');
}

function checkMaterial(value: unknown, path: string, out: Issues): boolean {
  if (!isRecord(value)) return out.error(path, 'material-not-object', 'a material must be an object');
  let ok = true;
  if (typeof value.style !== 'string' || value.style.length > MAX_STYLE_LENGTH || !STYLE_RE.test(value.style)) ok = out.error(`${path}.style`, 'material-style', '`style` must be a lower-case word');
  const palette = value.palette;
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 4 || !palette.every((c) => typeof c === 'string' && HEX_COLOR_RE.test(c))) {
    ok = out.error(`${path}.palette`, 'material-palette', '`palette` must hold 1–4 hex colours');
  }
  if (value.variant !== undefined && (typeof value.variant !== 'string' || value.variant.length > MAX_STYLE_LENGTH || !STYLE_RE.test(value.variant))) {
    ok = out.error(`${path}.variant`, 'material-variant', '`variant` must be a lower-case word');
  }
  if (value.angle !== undefined && !(Number.isInteger(value.angle) && (value.angle as number) >= 0 && (value.angle as number) <= 359)) {
    ok = out.error(`${path}.angle`, 'material-angle', '`angle` must be a whole number of degrees, 0–359');
  }
  return ok;
}

function checkSize(value: unknown, path: string, out: Issues): value is RoomSize {
  if (!isRecord(value)) return out.error(path, 'size-not-object', '`size` must be an object with `w`, `d` and `h`');
  const side = (n: unknown, max: number) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= max;
  let ok = true;
  if (!side(value.w, HOUSE_LIMITS.maxRoomSide)) ok = out.error(`${path}.w`, 'size-w', `\`w\` must be a whole number of tiles, 1–${HOUSE_LIMITS.maxRoomSide}`);
  if (!side(value.d, HOUSE_LIMITS.maxRoomSide)) ok = out.error(`${path}.d`, 'size-d', `\`d\` must be a whole number of tiles, 1–${HOUSE_LIMITS.maxRoomSide}`);
  if (!side(value.h, HOUSE_LIMITS.maxRoomHeight)) ok = out.error(`${path}.h`, 'size-h', `\`h\` must be a whole number of tiles, 1–${HOUSE_LIMITS.maxRoomHeight}`);
  return ok;
}

/** The axis a wall runs along, and its length in a room of `size`. */
export function wallAxis(wall: HouseWall, size: Pick<RoomSize, 'w' | 'd'>): { axis: 'x' | 'z'; length: number } {
  return wall === 'west' || wall === 'east' ? { axis: 'z', length: size.d } : { axis: 'x', length: size.w };
}

function checkHttps(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('https://')) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** One piece against its room. Returns whether it is valid (errors are added to `out`). */
function checkItem(value: unknown, room: { size: RoomSize; walls: readonly HouseWall[] }, path: string, out: Issues): boolean {
  if (!isRecord(value)) return out.error(path, 'item-not-object', 'an item must be an object');
  let ok = true;
  if (!isHouseId(value.id)) ok = out.error(`${path}.id`, 'item-id', 'an item needs an `id`: lower-case letters, digits, `.`, `_`, `-`, at most 64');
  if (!isHouseItemType(value.type)) ok = out.error(`${path}.type`, 'item-type', 'an item needs a namespaced `type` such as `official:bed-single`');
  const { w, d, h } = room.size;
  const inRange = (n: unknown, max: number) => finite(n) && n >= 0 && n <= max;
  if (value.surface === 'floor') {
    if (value.wall !== undefined) ok = out.error(`${path}.wall`, 'floor-wall', 'a floor item names no wall');
    if (value.y !== undefined) ok = out.error(`${path}.y`, 'floor-y', 'a floor item has no `y`: how high it stands is worked out, not stored');
    if (!inRange(value.x, w)) ok = out.error(`${path}.x`, 'x-bounds', `\`x\` must be a number of tiles, 0–${w}`);
    if (!inRange(value.z, d)) ok = out.error(`${path}.z`, 'z-bounds', `\`z\` must be a number of tiles, 0–${d}`);
    if (value.rot !== undefined && !(Number.isInteger(value.rot) && (value.rot as number) >= 0 && (value.rot as number) <= 3)) {
      ok = out.error(`${path}.rot`, 'rot', '`rot` must be 0, 1, 2 or 3 quarter turns');
    }
  } else if (value.surface === 'wall') {
    const wall = value.wall;
    if (!(HOUSE_WALLS as readonly unknown[]).includes(wall)) {
      ok = out.error(`${path}.wall`, 'wall-name', 'a wall item needs `wall`: west, north, east or south');
    } else if (!room.walls.includes(wall as HouseWall)) {
      ok = out.error(`${path}.wall`, 'wall-missing', `the room has no ${wall as string} wall`);
    } else {
      const { axis, length } = wallAxis(wall as HouseWall, room.size);
      const across = axis === 'x' ? 'z' : 'x';
      if (!inRange(value[axis], length)) ok = out.error(`${path}.${axis}`, `${axis}-bounds`, `\`${axis}\` must be a number of tiles along the wall, 0–${length}`);
      if (value[across] !== undefined) ok = out.error(`${path}.${across}`, `wall-${across}`, `a ${wall as string}-wall item has no \`${across}\`: the wall fixes it`);
    }
    if (!inRange(value.y, h)) ok = out.error(`${path}.y`, 'y-bounds', `\`y\` must be the height of the item's centre, 0–${h}`);
    if (value.rot !== undefined) ok = out.error(`${path}.rot`, 'wall-rot', 'a wall item has no `rot`: it faces into the room');
  } else {
    ok = out.error(`${path}.surface`, 'surface', '`surface` must be `floor` or `wall`');
  }
  if (value.scale !== undefined && !(finite(value.scale) && value.scale >= 0.5 && value.scale <= 2)) ok = out.error(`${path}.scale`, 'scale', '`scale` must be 0.5–2');
  if (value.variant !== undefined && !isHouseToken(value.variant)) ok = out.error(`${path}.variant`, 'variant', '`variant` must be a short lower-case token');
  if (value.content !== undefined) {
    if (!isRecord(value.content)) ok = out.error(`${path}.content`, 'content-not-object', '`content` must be an object');
    else if (value.content.imageUrl !== undefined && !checkHttps(value.content.imageUrl)) ok = out.error(`${path}.content.imageUrl`, 'image-url', '`imageUrl` must be an https URL');
  }
  if (!checkExt(value.ext, `${path}.ext`, out)) ok = false;
  if ('owner' in value) out.warn(`${path}.owner`, 'owner-ignored', 'an `owner` in the content is ignored: the owner is the event author');
  return ok;
}

/**
 * Check a house document (untrusted JSON). Never throws.
 *
 * Unknown fields, at every level, and unknown item types are valid and kept.
 * See `HouseStatus` for what each result allows.
 */
export function validateHouse(input: unknown): HouseValidation {
  const out = new Issues();
  if (!isRecord(input)) {
    out.error('', 'not-object', 'a house is a JSON object');
    return { status: 'malformed', doc: null, issues: out.list };
  }
  if (input.v !== HOUSE_VERSION) {
    if (Number.isInteger(input.v) && (input.v as number) > HOUSE_VERSION) {
      out.error('v', 'newer-version', `written by schema version ${input.v as number}; this client knows ${HOUSE_VERSION}: read only`);
      return { status: 'unsupported-version', doc: null, issues: out.list };
    }
    out.error('v', 'version', `\`v\` must be ${HOUSE_VERSION}`);
    return { status: 'malformed', doc: null, issues: out.list };
  }
  if (!Array.isArray(input.rooms)) {
    out.error('rooms', 'rooms-not-array', '`rooms` must be an array');
    return { status: 'malformed', doc: null, issues: out.list };
  }
  // Security limits first: a hostile house is refused before anything walks it
  const rooms = input.rooms as unknown[];
  const itemCount = rooms.reduce<number>((n, r) => n + (isRecord(r) && Array.isArray(r.items) ? r.items.length : 0), 0);
  if (rooms.length > HOUSE_LIMITS.maxRooms) out.error('rooms', 'too-many-rooms', `at most ${HOUSE_LIMITS.maxRooms} rooms`);
  if (itemCount > HOUSE_LIMITS.maxItems) out.error('rooms', 'too-many-items', `at most ${HOUSE_LIMITS.maxItems} items in a house`);
  rooms.forEach((r, i) => {
    if (isRecord(r) && Array.isArray(r.items) && r.items.length > HOUSE_LIMITS.maxItemsPerRoom) out.error(`rooms[${i}].items`, 'too-many-items', `at most ${HOUSE_LIMITS.maxItemsPerRoom} items in a room`);
    if (isRecord(r) && Array.isArray(r.links) && r.links.length > HOUSE_LIMITS.maxLinksPerRoom) out.error(`rooms[${i}].links`, 'too-many-links', `at most ${HOUSE_LIMITS.maxLinksPerRoom} links in a room`);
  });
  if (out.errors) return { status: 'malformed', doc: null, issues: out.list };

  const doc = clone(input) as HouseDocument;
  if (typeof input.name !== 'string' || input.name.trim() === '' || input.name.length > HOUSE_LIMITS.maxNameLength) {
    out.error('name', 'name', `a house needs a \`name\`, at most ${HOUSE_LIMITS.maxNameLength} characters`);
    doc.name = '';
  }
  if (input.app !== undefined && !isHouseToken(input.app)) {
    out.error('app', 'app', '`app` must be a short lower-case token');
    delete doc.app;
  }
  if (input.category !== undefined && !isHouseToken(input.category)) {
    out.error('category', 'category', '`category` must be a short lower-case token');
    delete doc.category;
  }
  if (!checkExt(input.ext, 'ext', out)) delete doc.ext;
  if ('owner' in input) out.warn('owner', 'owner-ignored', 'an `owner` in the content is ignored: the owner is the event author');

  // Rooms, then their items: the shown copy keeps only what is valid
  const roomIds = new Set<string>();
  const itemIds = new Set<string>();
  const shownRooms: HouseRoom[] = [];
  const indexOf = new Map<HouseRoom, number>();
  rooms.forEach((raw, i) => {
    const path = `rooms[${i}]`;
    if (!isRecord(raw)) return void out.error(path, 'room-not-object', 'a room must be an object');
    let ok = true;
    if (!isHouseId(raw.id)) ok = out.error(`${path}.id`, 'room-id', 'a room needs an `id`: lower-case letters, digits, `.`, `_`, `-`, at most 64');
    else if (roomIds.has(raw.id)) ok = out.error(`${path}.id`, 'duplicate-room-id', `two rooms are called ${raw.id}`);
    if (raw.type !== undefined && !isHouseToken(raw.type)) ok = out.error(`${path}.type`, 'room-type', '`type` must be a short lower-case token');
    if (raw.name !== undefined && (typeof raw.name !== 'string' || raw.name.length > HOUSE_LIMITS.maxNameLength)) ok = out.error(`${path}.name`, 'room-name', `\`name\` must be text, at most ${HOUSE_LIMITS.maxNameLength} characters`);
    if (!checkSize(raw.size, `${path}.size`, out)) ok = false;
    const walls = raw.walls;
    if (!Array.isArray(walls) || !walls.every((w) => (HOUSE_WALLS as readonly unknown[]).includes(w)) || new Set(walls).size !== walls.length) {
      ok = out.error(`${path}.walls`, 'walls', '`walls` must list distinct walls: west, north, east, south');
    }
    if (raw.wall !== undefined && !checkMaterial(raw.wall, `${path}.wall`, out)) ok = false;
    if (raw.floor !== undefined && !checkMaterial(raw.floor, `${path}.floor`, out)) ok = false;
    if (!Array.isArray(raw.items)) ok = out.error(`${path}.items`, 'items-not-array', '`items` must be an array');
    if (raw.links !== undefined && !Array.isArray(raw.links)) ok = out.error(`${path}.links`, 'links-not-array', '`links` must be an array');
    if (!checkExt(raw.ext, `${path}.ext`, out)) ok = false;
    if (isHouseId(raw.id)) roomIds.add(raw.id);
    if (!ok) return;
    const room = clone(raw) as HouseRoom;
    room.items = [];
    (raw.items as unknown[]).forEach((item, j) => {
      const itemPath = `${path}.items[${j}]`;
      let valid = checkItem(item, raw as { size: RoomSize; walls: HouseWall[] }, itemPath, out);
      const id = isRecord(item) ? item.id : undefined;
      if (isHouseId(id)) {
        if (itemIds.has(id)) valid = out.error(`${itemPath}.id`, 'duplicate-item-id', `two items are called ${id}`);
        itemIds.add(id);
      }
      if (valid) room.items.push(clone(item) as HouseItem);
    });
    shownRooms.push(room);
    indexOf.set(room, i);
  });
  // Links need every room known first
  shownRooms.forEach((room) => {
    const i = indexOf.get(room);
    if (!room.links) return;
    const seen = new Set<string>();
    room.links = room.links.filter((link, j) => {
      const path = `rooms[${i}].links[${j}]`;
      if (!isRecord(link) || !isHouseId(link.room)) return out.error(path, 'link', 'a link names a room: `{ "room": "<id>" }`');
      if (link.room === room.id) return out.error(`${path}.room`, 'link-self', 'a room does not link to itself');
      if (!roomIds.has(link.room)) return out.error(`${path}.room`, 'link-unknown-room', `no room is called ${link.room}`);
      if (seen.has(link.room)) return out.error(`${path}.room`, 'duplicate-link', `two links to ${link.room}`);
      seen.add(link.room);
      return true;
    });
  });
  doc.rooms = shownRooms;

  const bytes = utf8Bytes(JSON.stringify(input));
  if (bytes > HOUSE_RECOMMENDED_CONTENT_BYTES) out.warn('', 'large', `${bytes} bytes: above the ${HOUSE_RECOMMENDED_CONTENT_BYTES} that strict relays accept`);
  if (out.errors) return { status: 'invalid', doc, issues: out.list };
  return { status: 'valid', doc: clone(input) as HouseDocument, issues: out.list };
}

// ─── Canonical serialization ──────────────────────────────────────────────────

/** UTF-8 length of a string (no TextEncoder needed). */
export function utf8Bytes(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** Known fields first, in a fixed order, then every other field in the order it came. */
function ordered(value: Record<string, unknown>, known: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of known) if (value[k] !== undefined) out[k] = value[k];
  for (const [k, v] of Object.entries(value)) if (!(k in out) && v !== undefined) out[k] = v;
  return out;
}

const DOC_KEYS = ['v', 'name', 'app', 'category', 'rooms', 'ext'] as const;
const ROOM_KEYS = ['id', 'type', 'name', 'size', 'walls', 'wall', 'floor', 'items', 'links', 'ext'] as const;
const ITEM_KEYS = ['id', 'type', 'surface', 'wall', 'x', 'y', 'z', 'rot', 'scale', 'variant', 'content', 'ext'] as const;
const SIZE_KEYS = ['w', 'd', 'h'] as const;
const MATERIAL_KEYS = ['style', 'palette', 'variant', 'angle'] as const;

/** The house in its canonical shape (fixed key order, unknown fields kept), as plain JSON. */
export function canonicalHouse(doc: HouseDocument): HouseDocument {
  const material = (m: SurfaceMaterial | undefined) => (m ? ordered(m, MATERIAL_KEYS) : undefined);
  return ordered(
    {
      ...doc,
      rooms: doc.rooms.map((room) =>
        ordered(
          {
            ...room,
            size: ordered(room.size, SIZE_KEYS),
            wall: material(room.wall),
            floor: material(room.floor),
            items: room.items.map((item) => ordered(item, ITEM_KEYS)),
          },
          ROOM_KEYS,
        ),
      ),
    },
    DOC_KEYS,
  ) as HouseDocument;
}

export class HouseValidationError extends Error {
  constructor(readonly issues: HouseIssue[]) {
    super(`not a valid house: ${issues.filter((i) => i.severity === 'error').map((i) => `${i.path || '(root)'} ${i.code}`).join(', ')}`);
    this.name = 'HouseValidationError';
  }
}

/** The event content for a house: validated, canonical JSON. Throws `HouseValidationError` on an invalid house. */
export function serializeHouse(doc: HouseDocument): string {
  const result = validateHouse(doc);
  if (result.status !== 'valid') throw new HouseValidationError(result.issues);
  const json = JSON.stringify(canonicalHouse(doc));
  if (utf8Bytes(json) > HOUSE_LIMITS.maxContentBytes) {
    throw new HouseValidationError([{ severity: 'error', code: 'too-large', path: '', message: `above ${HOUSE_LIMITS.maxContentBytes} bytes` }]);
  }
  return json;
}

/** The content's size in UTF-8 bytes, and whether strict relays should accept it. */
export function houseContentBytes(doc: HouseDocument): { bytes: number; recommended: boolean } {
  const bytes = utf8Bytes(JSON.stringify(canonicalHouse(doc)));
  return { bytes, recommended: bytes <= HOUSE_RECOMMENDED_CONTENT_BYTES };
}

// ─── Events ───────────────────────────────────────────────────────────────────

/** `31127:<owner>:<house id>`. */
export function houseAddress(owner: string, houseId: string): string {
  return `${KIND_BLOBBI_HOUSE}:${owner}:${houseId}`;
}

/** The owner and house id of a house address, or null. */
export function parseHouseAddress(address: unknown): { owner: string; houseId: string } | null {
  if (typeof address !== 'string') return null;
  const [kind, owner, ...rest] = address.split(':');
  const houseId = rest.join(':');
  if (kind !== String(KIND_BLOBBI_HOUSE) || !HEX64.test(owner ?? '') || !isHouseId(houseId)) return null;
  return { owner: owner!, houseId };
}

/** One owner's houses, or one house. */
export function houseFilter(owner: string, houseId?: string): NostrFilter {
  return houseId === undefined ? { kinds: [KIND_BLOBBI_HOUSE], authors: [owner] } : { kinds: [KIND_BLOBBI_HOUSE], authors: [owner], '#d': [houseId] };
}

export interface HouseEventInfo {
  id: string;
  /** The event author. The only owner there is. */
  owner: string;
  houseId: string;
  address: string;
  createdAt: number;
}

export interface ParsedHouse extends HouseValidation {
  /** Null when the event is not a house event at all. */
  event: HouseEventInfo | null;
  /** Only a `valid` house may be edited and written back. */
  writable: boolean;
}

export interface HouseParseOptions {
  /** Checks id and signature (core depends on no Nostr library). Without it the signature is NOT checked. */
  verify?: EventVerifier;
}

function single(tags: string[][], name: string): string | undefined | null {
  const found = tags.filter((t) => t[0] === name);
  if (found.length === 0) return undefined;
  if (found.length > 1 || typeof found[0][1] !== 'string') return null;
  return found[0][1];
}

function wellFormed(event: unknown): event is NostrEvent {
  if (!isRecord(event)) return false;
  return (
    typeof event.id === 'string' &&
    typeof event.pubkey === 'string' &&
    HEX64.test(event.pubkey) &&
    Number.isInteger(event.kind) &&
    Number.isInteger(event.created_at) &&
    typeof event.content === 'string' &&
    Array.isArray(event.tags) &&
    event.tags.every((t) => Array.isArray(t) && t.every((v) => typeof v === 'string'))
  );
}

/**
 * A house event, read as untrusted input. Never throws.
 *
 * The owner is the event author, whatever the content says. The content is
 * authoritative; the tags are an index (`d` is required and names the house;
 * a `v` tag, when present, must agree with the content).
 */
export function parseHouseEvent(event: unknown, opts: HouseParseOptions = {}): ParsedHouse {
  const refuse = (code: string, message: string, info: HouseEventInfo | null = null): ParsedHouse => ({
    status: 'malformed',
    doc: null,
    issues: [{ severity: 'error', code, path: '', message }],
    event: info,
    writable: false,
  });
  if (!wellFormed(event)) return refuse('not-an-event', 'not a well-formed Nostr event');
  if (event.kind !== KIND_BLOBBI_HOUSE) return refuse('wrong-kind', `kind ${event.kind} is not a house (${KIND_BLOBBI_HOUSE})`);
  const d = single(event.tags, 'd');
  if (!isHouseId(d)) return refuse('house-id', 'a house needs exactly one valid `d` tag');
  const info: HouseEventInfo = { id: event.id, owner: event.pubkey, houseId: d, address: houseAddress(event.pubkey, d), createdAt: event.created_at };
  if (opts.verify) {
    let verified = false;
    try {
      verified = opts.verify(event);
    } catch {
      verified = false;
    }
    if (!verified) return refuse('signature', 'the signature does not verify', info);
  }
  if (utf8Bytes(event.content) > HOUSE_LIMITS.maxContentBytes) return refuse('too-large', `content above ${HOUSE_LIMITS.maxContentBytes} bytes`, info);
  let content: unknown;
  try {
    content = JSON.parse(event.content);
  } catch {
    return refuse('content-json', 'the content is not JSON', info);
  }
  const result = validateHouse(content);
  const vTag = single(event.tags, 'v');
  if (result.status !== 'malformed' && isRecord(content)) {
    if (vTag === null) result.issues.push({ severity: 'warning', code: 'v-tag', path: '', message: 'more than one `v` tag, or one without a value; the content wins' });
    else if (vTag !== undefined && vTag !== String(content.v)) result.issues.push({ severity: 'warning', code: 'v-tag', path: '', message: `the \`v\` tag (${vTag}) disagrees with the content; the content wins` });
  }
  return { ...result, event: info, writable: result.status === 'valid' };
}

/** An unsigned house event for a signer. */
export interface HouseTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface HouseTemplateInput {
  houseId: string;
  doc: HouseDocument;
  /** The writer's clock (ms). */
  now: number;
  /** The version being replaced, if any: the new one is dated after it, and keeps its unknown tags. */
  previous?: { createdAt: number; tags?: string[][] } | null;
}

const MANAGED_TAGS = new Set(['d', 'v', 'b', 'alt']);
/** Tags never carried over from the version being replaced: a NIP-40 `expiration` would have relays delete a house, which is persistent. */
const NOT_CARRIED_TAGS = new Set(['expiration']);

/**
 * The house event to sign. `created_at` is after the version it replaces even
 * when this clock is behind (NIP-01 would otherwise keep the old one). Tags
 * this module does not manage, from the previous version, are kept, except
 * `expiration` (NIP-40), which is dropped.
 * Throws `HouseValidationError` on an invalid house.
 */
export function buildHouseTemplate({ houseId, doc, now, previous = null }: HouseTemplateInput): HouseTemplate {
  if (!isHouseId(houseId)) throw new HouseValidationError([{ severity: 'error', code: 'house-id', path: '', message: 'invalid house id' }]);
  const content = serializeHouse(doc);
  const createdAt = Math.max(Math.floor(now / 1000), previous ? previous.createdAt + 1 : 0);
  const kept = (previous?.tags ?? []).filter((t) => !MANAGED_TAGS.has(t[0]) && !NOT_CARRIED_TAGS.has(t[0]));
  const tags: string[][] = [['d', houseId], ['v', String(HOUSE_VERSION)], ...kept, ['b', BLOBBI_ECOSYSTEM_NAMESPACE], ['alt', `Blobbi house: ${doc.name}`]];
  return { kind: KIND_BLOBBI_HOUSE, created_at: createdAt, tags, content };
}

/** NIP-01 for addressable events: whether `a` replaces `b` (newer; or as new, with the lower id). */
export function replacesHouse(a: Pick<HouseEventInfo, 'id' | 'createdAt'>, b: Pick<HouseEventInfo, 'id' | 'createdAt'>): boolean {
  return a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);
}
