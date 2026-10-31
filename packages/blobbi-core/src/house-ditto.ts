/**
 * DITTO'S ROOMS (P2.1): pure converters between a house and the rooms Ditto
 * keeps in the player's kind 11125 content (`room_furniture_v2`, the legacy
 * `room_furniture`, `room_layouts`; Ditto's `NIP.md`).
 *
 * Importing reads 11125 the way Ditto does (the same versions, the same
 * clamps, the same conversion of version 1 rooms) so the house shows what
 * Ditto showed. Exporting gives the two keys Ditto reads. Nothing is written
 * or published here, and nothing runs on anyone's data: a host decides what
 * to do with the result.
 *
 * Every conversion returns notes. A note with `lossy: true` is information
 * that did not survive; a host must never let a lossy result replace the
 * canonical house (or the 11125 rooms) without the player's say.
 *
 * Notes are recoverable: the conversion still gives a house. When no valid
 * house can be made (rooms from a newer Ditto, or Ditto pieces that would land
 * in a starter room not shaped like Ditto's), the import never throws and
 * never returns part of a house: `doc` is null and `failures` says why.
 */
import { HOUSE_LIMITS, isHouseId, isHouseItemType, validateHouse } from './house';
import type { HouseDocument, HouseIssue, HouseItem, HouseRoom, QuarterTurn, SurfaceMaterial } from './house';
import { houseFurniture } from './house-catalog';
import { BLOBBI_MAX_ITEMS_PER_ROOM, BLOBBI_ROOM_SIZE, BLOBBI_STARTER_ROOMS, blobbiStarterHouse } from './house-template';

/** Ditto's room ids (`room-config.ts`); `closet` is hidden in Ditto's room order. */
export const DITTO_ROOM_IDS = ['home', 'kitchen', 'care', 'rest', 'closet'] as const;
export type DittoRoomId = (typeof DITTO_ROOM_IDS)[number];
const DITTO_GRID = 8;
const DITTO_WALL_HEIGHT = 5;
const DITTO_WALL_STYLES = ['solid', 'stripes', 'dots', 'gradient'];
const DITTO_FLOOR_STYLES = ['solid', 'wood', 'tile', 'carpet'];
const DITTO_VARIANTS = ['soft', 'medium', 'bold', 'wide', 'narrow'];
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/** Ditto's finish for the closet (`room-layout-defaults.ts`), for a closet saved in Ditto. */
const DITTO_CLOSET_LAYOUT = {
  wall: { style: 'solid', palette: ['#faf5f0', '#f0e8df'] },
  floor: { style: 'wood', palette: ['#78350f', '#451a03'], variant: 'narrow' },
};

/** A Ditto placement (`room_furniture_v2`). */
export interface DittoPlacement {
  id: string;
  at: 'floor' | 'left' | 'right';
  x: number;
  y: number;
  rot?: 1 | 2 | 3;
  scale?: number;
  content?: { imageUrl?: string };
  [key: string]: unknown;
}

/** A recoverable finding: the conversion still produced a house. */
export interface HouseConversionNote {
  code: string;
  message: string;
  room?: string;
  /** Information that did not survive the conversion. */
  lossy: boolean;
}

/** A fatal finding: no house was produced. */
export interface HouseConversionFailure {
  /** `too-new`, `starter-invalid`, `room-incompatible`, `invalid-result`. */
  code: string;
  message: string;
  room?: string;
  /** The schema errors behind `starter-invalid` and `invalid-result`. */
  issues?: HouseIssue[];
}

/**
 * Why a house room cannot hold Ditto's coordinates, or null when it can:
 * Ditto's 8 × 8 floor, 5-tile walls, and a west and a north wall.
 */
export function dittoFrameProblem(room: Pick<HouseRoom, 'size' | 'walls'>): string | null {
  const { w, d, h } = room.size;
  if (w !== DITTO_GRID || d !== DITTO_GRID || h !== DITTO_WALL_HEIGHT) return `it is ${w} × ${d} × ${h}, not Ditto's ${DITTO_GRID} × ${DITTO_GRID} × ${DITTO_WALL_HEIGHT}`;
  const missing = (['west', 'north'] as const).filter((wall) => !room.walls.includes(wall));
  if (missing.length) return `it has no ${missing.join(' or ')} wall, which Ditto's pieces hang on`;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isHttps(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** FNV-1a, 32 bits, as 8 hex digits: a short stable digest for ids. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * The id of the n-th stored piece of a Ditto room: `<room>-<n>`. A room id
 * too long to leave room for the number is shortened to its first 40
 * characters plus a digest of the whole id, so ids stay unique, deterministic
 * and within the id limit.
 */
export function dittoItemId(roomId: string, n: number): string {
  const suffix = `-${n}`;
  const prefix = roomId.length + suffix.length <= HOUSE_LIMITS.maxIdLength ? roomId : `${roomId.slice(0, 40)}.${fnv1a(roomId)}`;
  return `${prefix}${suffix}`;
}

function profileObject(content: unknown): Record<string, unknown> | null {
  if (isRecord(content)) return content;
  if (typeof content !== 'string' || !content.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Ditto → house ────────────────────────────────────────────────────────────

/** House fields a Ditto placement's unknown fields must not overwrite. */
const HOUSE_ITEM_KEYS = new Set(['id', 'type', 'surface', 'wall', 'x', 'y', 'z', 'rot', 'scale', 'variant', 'content', 'ext']);
const DITTO_PLACEMENT_KEYS = new Set(['id', 'at', 'x', 'y', 'rot', 'scale', 'content']);

/** One Ditto placement in house terms (without an id), or null with the reason noted. */
function fromDittoPlacement(raw: unknown, room: string, notes: HouseConversionNote[]): Omit<HouseItem, 'id'> | null {
  const drop = (message: string) => {
    notes.push({ code: 'placement-dropped', room, message, lossy: true });
    return null;
  };
  if (!isRecord(raw)) return drop('a placement that is not an object was skipped (Ditto skips it too)');
  const { id, at, x, y } = raw;
  if (!isHouseItemType(id)) return drop(`a placement with an invalid id (${JSON.stringify(id)}) was skipped (Ditto skips it too)`);
  if (at !== 'floor' && at !== 'left' && at !== 'right') return drop(`${id}: an invalid \`at\` was skipped (Ditto skips it too)`);
  if (!finite(x) || !finite(y)) return drop(`${id}: a placement without a numeric position was skipped (Ditto skips it too)`);
  const def = houseFurniture(id);
  if (def && (def.mount === 'wall') !== (at !== 'floor')) return drop(`${id} on the ${at === 'floor' ? 'floor' : 'wall'} was skipped: it goes on the ${def.mount === 'wall' ? 'wall' : 'floor'} (Ditto skips it too)`);
  const cx = clamp(x, 0, DITTO_GRID);
  const cy = clamp(y, 0, at === 'floor' ? DITTO_GRID : DITTO_WALL_HEIGHT);
  if (cx !== x || cy !== y) notes.push({ code: 'clamped', room, message: `${id}: (${x}, ${y}) is outside Ditto's room and was moved to (${cx}, ${cy}), where Ditto shows it`, lossy: true });
  const item: Omit<HouseItem, 'id'> =
    at === 'floor'
      ? { type: id, surface: 'floor', x: cx, z: cy }
      : at === 'left'
        ? { type: id, surface: 'wall', wall: 'west', z: cx, y: cy }
        : { type: id, surface: 'wall', wall: 'north', x: cx, y: cy };
  if (raw.rot !== undefined) {
    if (at === 'floor' && (raw.rot === 1 || raw.rot === 2 || raw.rot === 3)) item.rot = raw.rot as QuarterTurn;
    else if (raw.rot !== 0) notes.push({ code: 'rot-dropped', room, message: `${id}: a turn Ditto ignores (${JSON.stringify(raw.rot)}) was dropped`, lossy: true });
  }
  if (raw.scale !== undefined) {
    if (finite(raw.scale)) {
      item.scale = clamp(raw.scale, 0.5, 2);
      if (item.scale !== raw.scale) notes.push({ code: 'clamped', room, message: `${id}: scale ${raw.scale} became ${item.scale}, as Ditto shows it`, lossy: true });
      if (item.scale === 1) delete item.scale;
    } else notes.push({ code: 'scale-dropped', room, message: `${id}: a scale that is not a number was dropped`, lossy: true });
  }
  if (raw.content !== undefined) {
    if (isRecord(raw.content) && isHttps(raw.content.imageUrl)) {
      item.content = { imageUrl: raw.content.imageUrl };
      const extra = Object.keys(raw.content).filter((k) => k !== 'imageUrl');
      if (extra.length) notes.push({ code: 'content-dropped', room, message: `${id}: content fields Ditto ignores (${extra.join(', ')}) were dropped`, lossy: true });
    } else notes.push({ code: 'content-dropped', room, message: `${id}: content without a valid https imageUrl was dropped (Ditto drops it too)`, lossy: true });
  }
  // Fields a newer Ditto wrote stay on the piece, unless they would collide with the house's own
  for (const [k, v] of Object.entries(raw)) {
    if (DITTO_PLACEMENT_KEYS.has(k)) continue;
    if (HOUSE_ITEM_KEYS.has(k)) notes.push({ code: 'field-dropped', room, message: `${id}: Ditto field \`${k}\` has a different meaning in a house and was dropped`, lossy: true });
    else item[k] = v;
  }
  return item;
}

/** Ditto's conversion of a version 1 (front-facing picture) placement to the tile grid (`migrateV1Placement`). */
function fromDittoV1Placement(raw: unknown, room: string, notes: HouseConversionNote[]): DittoPlacement | null {
  if (!isRecord(raw) || !isHouseItemType(raw.id) || !finite(raw.x) || !finite(raw.y) || (raw.layer !== 'back' && raw.layer !== 'floor' && raw.layer !== 'front')) {
    notes.push({ code: 'placement-dropped', room, message: 'an invalid version 1 placement was skipped (Ditto skips it too)', lossy: true });
    return null;
  }
  const id = raw.id;
  const u = clamp(raw.x, 0, 1);
  const v = clamp(raw.y, 0, 1);
  const G = DITTO_GRID;
  const round2 = (n: number) => Math.round(n * 2) / 2;
  const mount = houseFurniture(id)?.mount;
  let p: DittoPlacement;
  if (raw.layer === 'back' || mount === 'wall') {
    const along = 0.75 + Math.abs(0.5 - u) * 2 * (G - 1.5);
    const height = clamp(((0.6 - Math.min(v, 0.6)) / 0.6) * DITTO_WALL_HEIGHT + 0.5, 0.5, DITTO_WALL_HEIGHT - 0.5);
    const wall = u < 0.5 ? 'left' : 'right';
    if ((mount ?? 'wall') === 'wall') p = { id, at: wall, x: round2(along), y: round2(height) };
    else if (wall === 'left') p = { id, at: 'floor', x: 0.5, y: round2(along) };
    else p = { id, at: 'floor', x: round2(along), y: 0.5 };
  } else {
    const across = (u - 0.5) * 2;
    const depth = (clamp(v, 0.6, 1) - 0.6) / 0.4;
    const s = 0.25 + depth * 0.5;
    p = { id, at: 'floor', x: round2(clamp(G * (s + across * 0.4), 0.5, G - 0.5)), y: round2(clamp(G * (s - across * 0.4), 0.5, G - 0.5)) };
  }
  if (finite(raw.scale)) p.scale = clamp(raw.scale, 0.5, 2);
  if (isRecord(raw.content) && isHttps(raw.content.imageUrl)) p.content = { imageUrl: raw.content.imageUrl };
  if (raw.flip === true) notes.push({ code: 'flip-dropped', room, message: `${id}: mirroring has no equivalent on the tile grid (Ditto drops it too)`, lossy: true });
  return p;
}

/** Ditto's free floor spot (`openFloorSpot`): two tiles from other standing pieces, nearest `near`. */
function openFloorSpot(placements: DittoPlacement[], near: { x: number; y: number }): { x: number; y: number } {
  const taken = placements.filter((p) => p.at === 'floor' && houseFurniture(p.id)?.mount !== 'rug');
  const candidates = [near];
  for (let x = 1; x < DITTO_GRID; x++) for (let y = 1; y < DITTO_GRID; y++) candidates.push({ x, y });
  let best = near;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const clearance = Math.min(...taken.map((p) => Math.hypot(p.x - c.x, p.y - c.y)), DITTO_GRID);
    const score = Math.min(clearance, 2) * 10 - Math.hypot(c.x - near.x, c.y - near.y);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Ditto gives a version 1 room its room's piece (fridge, bathtub, bed, toy box) when it has none (`addRoomPiece`). */
function addRoomPiece(room: string, placements: DittoPlacement[], notes: HouseConversionNote[]): DittoPlacement[] {
  const result = [...placements];
  const defaults = BLOBBI_STARTER_ROOMS.find((r) => r.id === room)?.items ?? [];
  for (const piece of defaults.map(toDittoPlacement).filter((p): p is DittoPlacement => p !== null)) {
    const interaction = houseFurniture(piece.id)?.interaction;
    if (!interaction || result.length >= BLOBBI_MAX_ITEMS_PER_ROOM) continue;
    if (result.some((p) => houseFurniture(p.id)?.interaction === interaction)) continue;
    result.push({ ...piece, at: 'floor', ...openFloorSpot(result, { x: piece.x, y: piece.y }) });
    notes.push({ code: 'room-piece-added', room, message: `${piece.id} was added to the version 1 room, as Ditto adds it`, lossy: false });
  }
  return result;
}

/** Ditto's surface check (`parseSurface`); invalid colours are filtered as Ditto filters them. */
function fromDittoSurface(raw: unknown, kind: 'wall' | 'floor', room: string, notes: HouseConversionNote[]): SurfaceMaterial | null {
  if (!isRecord(raw)) return null;
  const styles = kind === 'wall' ? DITTO_WALL_STYLES : DITTO_FLOOR_STYLES;
  if (typeof raw.style !== 'string' || !styles.includes(raw.style) || !Array.isArray(raw.palette)) return null;
  const palette = raw.palette.filter((c): c is string => typeof c === 'string' && HEX_COLOR_RE.test(c));
  if (palette.length < 1 || palette.length > 4) return null;
  if (palette.length !== raw.palette.length) notes.push({ code: 'colour-dropped', room, message: `invalid ${kind} colours were dropped (Ditto drops them too)`, lossy: true });
  const out: SurfaceMaterial = { style: raw.style, palette };
  if (typeof raw.variant === 'string' && DITTO_VARIANTS.includes(raw.variant)) out.variant = raw.variant;
  else if (raw.variant !== undefined) notes.push({ code: 'variant-dropped', room, message: `a ${kind} variant Ditto does not know (${JSON.stringify(raw.variant)}) was dropped (Ditto drops it too)`, lossy: true });
  // Ditto reads an angle as whole degrees in 0–359, so a stored 45.6 or 405 is drawn at 46 or 45. Taken as drawn,
  // without a note: nothing Ditto shows is lost (HOUSE.md §15)
  if (finite(raw.angle)) out.angle = ((Math.round(raw.angle) % 360) + 360) % 360;
  const extra = Object.keys(raw).filter((k) => !['style', 'palette', 'variant', 'angle'].includes(k));
  if (extra.length) notes.push({ code: 'field-dropped', room, message: `${kind} finish fields Ditto ignores (${extra.join(', ')}) were dropped`, lossy: true });
  return out;
}

export interface DittoImportOptions {
  /** The house to fill (default: the Blobbi starting house); rooms Ditto never saved keep its contents. */
  starter?: HouseDocument;
  name?: string;
  app?: string;
}

export interface DittoImport {
  /**
   * - `converted`: `doc` is the house Ditto shows (rooms never saved come from the starter); `failures` is empty.
   * - `too-new`: Ditto's rooms were saved by a newer version; nothing is converted (Ditto shows defaults then, and
   *   refuses to save).
   * - `failed`: no valid house can be made (`failures` says why); nothing is converted.
   *
   * `doc` is null unless `converted`: there is never a partial house.
   */
  status: 'converted' | 'too-new' | 'failed';
  doc: HouseDocument | null;
  /** Recoverable findings (a converted house still has them). */
  notes: HouseConversionNote[];
  /** Fatal findings: why there is no house. Empty when converted. */
  failures: HouseConversionFailure[];
  /** Whether anything did not survive (see the notes); always true without a house. */
  lossy: boolean;
}

/**
 * The house that a kind 11125 content (string or parsed object) shows in
 * Ditto. Rooms are Ditto's room ids; items get ids `<room>-<n>` in Ditto's
 * order (deterministic, but positional: Ditto has no ids, so an id here
 * names "the n-th piece of this room as stored", not a piece across edits).
 */
export function houseFromDittoProfile(content: unknown, { starter = blobbiStarterHouse(), name, app }: DittoImportOptions = {}): DittoImport {
  const notes: HouseConversionNote[] = [];
  const failures: HouseConversionFailure[] = [];
  const failed = (): DittoImport => ({ status: 'failed', doc: null, notes, failures, lossy: true });
  const errorsOf = (issues: HouseIssue[]) => issues.filter((i) => i.severity === 'error');
  const starterCheck = validateHouse(starter);
  if (starterCheck.status !== 'valid') {
    failures.push({ code: 'starter-invalid', message: `the starting house is ${starterCheck.status}: nothing was converted`, issues: errorsOf(starterCheck.issues) });
    return failed();
  }
  const raw = profileObject(content) ?? {};
  const doc = JSON.parse(JSON.stringify(starter)) as HouseDocument;
  if (name !== undefined) doc.name = name;
  if (app !== undefined) doc.app = app;

  // Furniture: version 2 wins; version 1 (or a v2 shape) under the old key is the fallback; newer is refused
  const v2 = raw.room_furniture_v2;
  if (isRecord(v2) && typeof v2.v === 'number' && v2.v > 2) {
    return { status: 'too-new', doc: null, notes: [], failures: [{ code: 'too-new', message: `room_furniture_v2 is version ${v2.v}; this converter knows 2` }], lossy: true };
  }
  let byRoom: Record<string, unknown> | null = null;
  let version = 0;
  if (isRecord(v2) && v2.v === 2 && isRecord(v2.by_room)) {
    byRoom = v2.by_room;
    version = 2;
  } else if (v2 !== undefined) {
    notes.push({ code: 'v2-unreadable', message: 'room_furniture_v2 is not a version 2 object Ditto can read: it was not converted (Ditto falls back the same way)', lossy: true });
  }
  if (!byRoom && raw.room_furniture !== undefined) {
    const legacy = raw.room_furniture;
    if (isRecord(legacy) && (legacy.v === 1 || legacy.v === 2) && isRecord(legacy.by_room)) {
      byRoom = legacy.by_room;
      version = legacy.v;
      notes.push({ code: 'legacy-key', message: `rooms read from the legacy room_furniture (version ${version})`, lossy: false });
    } else {
      const what = isRecord(legacy) ? `version ${JSON.stringify(legacy.v)}${isRecord(legacy.by_room) ? '' : ' without by_room'}` : 'not an object';
      notes.push({ code: 'legacy-unreadable', message: `the legacy room_furniture (${what}) is not one Ditto reads: its rooms were not converted (Ditto ignores them too)`, lossy: true });
    }
  }
  const layouts = isRecord(raw.room_layouts) ? raw.room_layouts : null;
  if (layouts && layouts.v !== 1) notes.push({ code: 'layouts-version', message: `room_layouts version ${JSON.stringify(layouts.v)} is not understood: its finishes were not read (Ditto ignores them too)`, lossy: true });
  const layoutRooms = layouts && layouts.v === 1 && isRecord(layouts.by_room) ? layouts.by_room : {};
  for (const source of [v2, raw.room_layouts]) {
    if (!isRecord(source)) continue;
    const extra = Object.keys(source).filter((k) => k !== 'v' && k !== 'by_room');
    if (extra.length) notes.push({ code: 'field-dropped', message: `fields a newer Ditto wrote (${extra.join(', ')}) have no place in a house`, lossy: true });
  }

  const roomIds = [...new Set([...Object.keys(byRoom ?? {}), ...Object.keys(layoutRooms)])];
  for (const roomId of roomIds) {
    if (!isHouseId(roomId)) {
      notes.push({ code: 'room-dropped', message: `a Ditto room called ${JSON.stringify(roomId)} cannot be a house room id and was skipped`, lossy: true });
      continue;
    }
    let room = doc.rooms.find((r) => r.id === roomId);
    if (!room && doc.rooms.length >= HOUSE_LIMITS.maxRooms) {
      notes.push({ code: 'over-limit', room: roomId, message: `a house holds at most ${HOUSE_LIMITS.maxRooms} rooms: ${roomId} was left out`, lossy: true });
      continue;
    }
    if (!room) {
      const known = (DITTO_ROOM_IDS as readonly string[]).includes(roomId);
      room = { id: roomId, type: roomId, size: { ...BLOBBI_ROOM_SIZE }, walls: ['west', 'north'], items: [] };
      if (roomId === 'closet') Object.assign(room, JSON.parse(JSON.stringify(DITTO_CLOSET_LAYOUT)));
      doc.rooms.push(room);
      notes.push({ code: known ? 'room-added' : 'unknown-room', room: roomId, message: known ? `${roomId}, saved in Ditto but not in the starting house, was added` : `${roomId} is not a Ditto room (Ditto skips it); it was kept as a room`, lossy: false });
    }
    const list = byRoom?.[roomId];
    if (Array.isArray(list)) {
      let placements: (Omit<HouseItem, 'id'> | null)[];
      if (version === 1) {
        notes.push({ code: 'v1-converted', room: roomId, message: 'version 1 positions were converted to the tile grid as Ditto converts them (approximate)', lossy: true });
        const converted = list.map((p) => fromDittoV1Placement(p, roomId, notes)).filter((p): p is DittoPlacement => p !== null);
        if (converted.length > BLOBBI_MAX_ITEMS_PER_ROOM) notes.push({ code: 'over-cap', room: roomId, message: `${converted.length - BLOBBI_MAX_ITEMS_PER_ROOM} version 1 pieces past Ditto's ${BLOBBI_MAX_ITEMS_PER_ROOM} were dropped, as Ditto drops them`, lossy: true });
        placements = addRoomPiece(roomId, converted.slice(0, BLOBBI_MAX_ITEMS_PER_ROOM), notes).map((p) => fromDittoPlacement(p, roomId, notes));
      } else {
        placements = list.map((p) => fromDittoPlacement(p, roomId, notes));
      }
      const kept = placements.filter((p): p is Omit<HouseItem, 'id'> => p !== null);
      // Ditto's coordinates only mean something in Ditto's room: never squeeze or drop pieces to fit another shape
      const problem = kept.length ? dittoFrameProblem(room) : null;
      if (problem) {
        failures.push({ code: 'room-incompatible', room: roomId, message: `${kept.length} Ditto piece(s) cannot go into the starting house's ${roomId}: ${problem}` });
        continue;
      }
      if (kept.length > BLOBBI_MAX_ITEMS_PER_ROOM) notes.push({ code: 'over-cap', room: roomId, message: `${kept.length} pieces: Ditto shows only the first ${BLOBBI_MAX_ITEMS_PER_ROOM}; all were kept`, lossy: false });
      if (kept.length > HOUSE_LIMITS.maxItemsPerRoom) {
        notes.push({ code: 'over-limit', room: roomId, message: `only the first ${HOUSE_LIMITS.maxItemsPerRoom} pieces fit a house room`, lossy: true });
        kept.length = HOUSE_LIMITS.maxItemsPerRoom;
      }
      room.items = kept.map((p, i) => ({ id: dittoItemId(roomId, i + 1), ...p }) as HouseItem);
    } else if (byRoom && roomId in byRoom) {
      notes.push({ code: 'room-not-list', room: roomId, message: 'saved furniture that is not a list was ignored (Ditto ignores it too); the room keeps its starting pieces', lossy: true });
    }
    if (roomId in layoutRooms) {
      const saved = layoutRooms[roomId];
      const wall = isRecord(saved) ? fromDittoSurface(saved.wall, 'wall', roomId, notes) : null;
      const floor = isRecord(saved) ? fromDittoSurface(saved.floor, 'floor', roomId, notes) : null;
      if (wall && floor) {
        room.wall = wall;
        room.floor = floor;
      } else notes.push({ code: 'layout-dropped', room: roomId, message: 'a saved finish Ditto cannot read was ignored (Ditto ignores it too)', lossy: true });
    }
  }
  if (failures.length) return failed();
  // The house-wide piece limit: the last rooms give up their last pieces, and say so
  let total = doc.rooms.reduce((n, r) => n + r.items.length, 0);
  for (let i = doc.rooms.length - 1; i >= 0 && total > HOUSE_LIMITS.maxItems; i--) {
    const room = doc.rooms[i];
    const cut = Math.min(room.items.length, total - HOUSE_LIMITS.maxItems);
    room.items.length -= cut;
    total -= cut;
    notes.push({ code: 'over-limit', room: room.id, message: `a house holds at most ${HOUSE_LIMITS.maxItems} pieces: the last ${cut} of ${room.id} were left out`, lossy: true });
  }
  if (!byRoom && !roomIds.length) notes.push({ code: 'defaults', message: 'no rooms saved in Ditto: the starting house', lossy: false });

  const result = validateHouse(doc);
  if (result.status !== 'valid') {
    // A last guard (an imported id taken by a piece the starter keeps in another room, say): no house, never a broken one
    failures.push({ code: 'invalid-result', message: 'the converted house would not be valid: nothing was converted', issues: errorsOf(result.issues) });
    return failed();
  }
  return { status: 'converted', doc, notes, failures, lossy: notes.some((n) => n.lossy) };
}

// ─── House → Ditto ────────────────────────────────────────────────────────────

/** A house piece as a Ditto placement, or null when Ditto has no place for it (an east or south wall). */
function toDittoPlacement(item: HouseItem): DittoPlacement | null {
  let p: DittoPlacement;
  if (item.surface === 'floor') p = { id: item.type, at: 'floor', x: item.x!, y: item.z! };
  else if (item.wall === 'west') p = { id: item.type, at: 'left', x: item.z!, y: item.y! };
  else if (item.wall === 'north') p = { id: item.type, at: 'right', x: item.x!, y: item.y! };
  else return null;
  if (item.surface === 'floor' && item.rot) p.rot = item.rot as 1 | 2 | 3;
  if (item.scale !== undefined && item.scale !== 1) p.scale = item.scale;
  if (isRecord(item.content) && isHttps(item.content.imageUrl)) p.content = { imageUrl: item.content.imageUrl };
  return p;
}

const ITEM_KEYS_DITTO_KEEPS = new Set(['id', 'type', 'surface', 'wall', 'x', 'y', 'z', 'rot', 'scale', 'content']);

export interface DittoExport {
  /** Ditto's `room_furniture_v2` value for the rooms Ditto can show. */
  room_furniture_v2: { v: 2; by_room: Record<string, DittoPlacement[]> };
  /** Ditto's `room_layouts` value for the rooms whose finishes Ditto can show. */
  room_layouts: { v: 1; by_room: Record<string, { wall: SurfaceMaterial; floor: SurfaceMaterial }> };
  notes: HouseConversionNote[];
  lossy: boolean;
}

/**
 * The house as Ditto's two room keys. Only rooms Ditto has (its five ids, an
 * 8 × 8 floor, 5-tile walls, a west and a north wall) can be shown there;
 * everything else is noted. Ditto keeps no instance ids, so they never
 * survive (nor `variant`, `ext`, unknown fields, house and room names).
 *
 * A host merging this into an 11125 must follow Ditto's rules (rewrite only
 * the rooms it changed, keep every other key and room); that is P2.2.
 */
export function dittoRoomsFromHouse(doc: HouseDocument): DittoExport {
  const notes: HouseConversionNote[] = [];
  const furniture: Record<string, DittoPlacement[]> = {};
  const layouts: Record<string, { wall: SurfaceMaterial; floor: SurfaceMaterial }> = {};
  notes.push({ code: 'ids-dropped', message: 'Ditto keeps no piece ids: they are re-made on the next import', lossy: true });
  const houseExtra = Object.keys(doc).filter((k) => !['v', 'rooms'].includes(k) && doc[k] !== undefined);
  if (houseExtra.length) notes.push({ code: 'house-field-dropped', message: `the house's ${houseExtra.map((k) => `\`${k}\``).join(', ')} have no place in Ditto`, lossy: true });
  for (const room of doc.rooms) {
    const fits = (DITTO_ROOM_IDS as readonly string[]).includes(room.id) && dittoFrameProblem(room) === null;
    if (!fits) {
      notes.push({ code: 'room-not-shown', room: room.id, message: `${room.id} is not a room Ditto can show (Ditto's five rooms, 8 × 8, 5 high, west and north walls): left out`, lossy: true });
      continue;
    }
    const roomExtra = Object.keys(room).filter((k) => !['id', 'size', 'walls', 'wall', 'floor', 'items'].includes(k) && room[k] !== undefined && !(k === 'type' && room.type === room.id));
    if (roomExtra.length) notes.push({ code: 'room-field-dropped', room: room.id, message: `the room's ${roomExtra.map((k) => `\`${k}\``).join(', ')} have no place in Ditto`, lossy: true });
    const sizeExtra = Object.keys(room.size).filter((k) => !['w', 'd', 'h'].includes(k));
    if (sizeExtra.length) notes.push({ code: 'room-field-dropped', room: room.id, message: `size fields ${sizeExtra.join(', ')} have no place in Ditto`, lossy: true });
    const placements: DittoPlacement[] = [];
    for (const item of room.items) {
      const p = toDittoPlacement(item);
      if (!p) {
        notes.push({ code: 'wall-not-shown', room: room.id, message: `${item.id} (${item.type}) is on the ${item.wall} wall, which Ditto has not: left out`, lossy: true });
        continue;
      }
      const extra = Object.keys(item).filter((k) => !ITEM_KEYS_DITTO_KEEPS.has(k) && item[k] !== undefined);
      if (isRecord(item.content)) extra.push(...Object.keys(item.content).filter((k) => k !== 'imageUrl').map((k) => `content.${k}`));
      if (extra.length) notes.push({ code: 'item-field-dropped', room: room.id, message: `${item.id}: ${extra.join(', ')} have no place in Ditto`, lossy: true });
      placements.push(p);
    }
    if (placements.length > BLOBBI_MAX_ITEMS_PER_ROOM) {
      notes.push({ code: 'over-cap', room: room.id, message: `${placements.length} pieces: Ditto shows the first ${BLOBBI_MAX_ITEMS_PER_ROOM}, the rest were left out`, lossy: true });
      placements.length = BLOBBI_MAX_ITEMS_PER_ROOM;
    }
    furniture[room.id] = placements;
    const wall = room.wall && DITTO_WALL_STYLES.includes(room.wall.style) ? room.wall : null;
    const floor = room.floor && DITTO_FLOOR_STYLES.includes(room.floor.style) ? room.floor : null;
    if (wall && floor) {
      const pick = (m: SurfaceMaterial): SurfaceMaterial => {
        const out: SurfaceMaterial = { style: m.style, palette: [...m.palette] };
        if (m.variant !== undefined && DITTO_VARIANTS.includes(m.variant)) out.variant = m.variant;
        else if (m.variant !== undefined) notes.push({ code: 'variant-dropped', room: room.id, message: `finish variant ${m.variant} is not one Ditto knows`, lossy: true });
        if (m.angle !== undefined) out.angle = m.angle;
        const extra = Object.keys(m).filter((k) => !['style', 'palette', 'variant', 'angle'].includes(k));
        if (extra.length) notes.push({ code: 'field-dropped', room: room.id, message: `finish fields ${extra.join(', ')} have no place in Ditto`, lossy: true });
        return out;
      };
      layouts[room.id] = { wall: pick(wall), floor: pick(floor) };
    } else if (room.wall || room.floor) {
      notes.push({ code: 'layout-not-shown', room: room.id, message: 'Ditto needs both a wall and a floor finish in its own styles: the finishes were left out', lossy: true });
    }
  }
  return { room_furniture_v2: { v: 2, by_room: furniture }, room_layouts: { v: 1, by_room: layouts }, notes, lossy: notes.some((n) => n.lossy) };
}
