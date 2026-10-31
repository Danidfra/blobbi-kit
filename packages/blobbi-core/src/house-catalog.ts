/**
 * THE SHARED FURNITURE CATALOG (P2.1): what the official Blobbi furniture is,
 * without any renderer: where each piece may go, how big it is, and the
 * tiles it covers. A 2D, 3D or pixel client places and collides pieces the
 * same way without loading a single model.
 *
 * The ids are Ditto's and Blobbi Home's (`official:*`, unchanged). Mount,
 * stacking, rooms and interactions are Ditto's registry (Blobbi Home's 3D
 * catalog is the same, item for item). The sizes were measured once from the
 * official models, which Ditto and Blobbi Home share line for line: the
 * bounding box of each model as both rooms build it, in centimetres
 * (`official-models.ts`, 2026-10-24). If a model changes, its size here must
 * be measured again.
 *
 * Labels are English defaults; applications translate them. Art, models and
 * sprites stay in each application.
 */
import { wallAxis } from './house';
import type { HouseItem, HouseSurface, QuarterTurn, RoomSize } from './house';

/** Floor pieces stand on the floor, rugs lie under them, wall pieces hang. Rugs and floor pieces are `surface: 'floor'` in a house. */
export type FurnitureMount = 'floor' | 'rug' | 'wall';
export type FurnitureCategory = 'furniture' | 'decor' | 'plants' | 'clocks' | 'frames';
/** What a Blobbi can do with a piece. */
export type FurnitureInteraction = 'bed' | 'fridge' | 'bath' | 'toys';

export interface HouseFurnitureDefinition {
  type: string;
  category: FurnitureCategory;
  /** English default. */
  label: string;
  mount: FurnitureMount;
  /** Small enough to stand on a `surface` piece (a lamp on a side table). */
  small?: true;
  /** Small pieces may stand on it. */
  surface?: true;
  /** Rooms (by room `type`) the Blobbi catalog offers it in. Advisory: a house is valid with it anywhere. */
  rooms?: readonly string[];
  interaction?: FurnitureInteraction;
  /** A picture frame: its `content.imageUrl` is the picture. */
  picture?: true;
  /** Model bounding box at scale 1 in centimetres: width (x), height (y), depth (z). Fronts face +z. */
  sizeCm: readonly [number, number, number];
}

/** Model centimetres per floor tile. */
export const HOUSE_CM_PER_TILE = 30;

const BEDROOM = ['rest', 'home'] as const;

/** The official furniture, in Ditto's catalog order. */
export const OFFICIAL_HOUSE_FURNITURE: readonly HouseFurnitureDefinition[] = [
  { type: 'official:bed-single', category: 'furniture', label: 'Bed', mount: 'floor', rooms: BEDROOM, interaction: 'bed', sizeCm: [100, 40, 64] },
  { type: 'official:bed-round', category: 'furniture', label: 'Round Bed', mount: 'floor', rooms: BEDROOM, interaction: 'bed', sizeCm: [66, 14, 66] },
  { type: 'official:bed-cushion', category: 'furniture', label: 'Cushion Bed', mount: 'floor', rooms: BEDROOM, interaction: 'bed', sizeCm: [60, 13, 48] },
  { type: 'official:bed-basket', category: 'furniture', label: 'Basket Bed', mount: 'floor', rooms: BEDROOM, interaction: 'bed', sizeCm: [62, 19.46, 47.4] },
  { type: 'official:fridge', category: 'furniture', label: 'Fridge', mount: 'floor', rooms: ['kitchen'], interaction: 'fridge', sizeCm: [56, 136, 55.6] },
  { type: 'official:oven', category: 'furniture', label: 'Oven', mount: 'floor', rooms: ['kitchen'], sizeCm: [46, 57.1, 52.1] },
  { type: 'official:bathtub', category: 'furniture', label: 'Bathtub', mount: 'floor', rooms: ['care'], interaction: 'bath', sizeCm: [110, 65.4, 62] },
  { type: 'official:toybox', category: 'furniture', label: 'Toy Box', mount: 'floor', interaction: 'toys', sizeCm: [56, 65.54, 39.9] },
  { type: 'official:wardrobe', category: 'furniture', label: 'Wardrobe', mount: 'floor', sizeCm: [74, 129, 38.4] },
  { type: 'official:sink', category: 'furniture', label: 'Sink', mount: 'floor', rooms: ['care'], sizeCm: [54, 81.2, 40] },
  { type: 'official:table-side', category: 'furniture', label: 'Side Table', mount: 'floor', surface: true, sizeCm: [34, 40.2, 26] },
  { type: 'official:cabinet-small', category: 'furniture', label: 'Small Cabinet', mount: 'floor', surface: true, sizeCm: [38, 47.6, 23.2] },
  { type: 'official:counter', category: 'furniture', label: 'Counter', mount: 'floor', surface: true, rooms: ['kitchen'], sizeCm: [62, 51.2, 53] },
  { type: 'official:shelf-books', category: 'furniture', label: 'Bookshelf', mount: 'floor', sizeCm: [40, 80, 18] },
  { type: 'official:shelf-wall', category: 'furniture', label: 'Wall Shelf', mount: 'wall', sizeCm: [60, 20.2, 12] },
  { type: 'official:shelf-floating', category: 'furniture', label: 'Floating Shelf', mount: 'wall', sizeCm: [70, 12, 13.4] },
  { type: 'official:rug-round', category: 'decor', label: 'Round Rug', mount: 'rug', sizeCm: [100, 1.4, 100] },
  { type: 'official:rug-rectangle', category: 'decor', label: 'Rectangle Rug', mount: 'rug', sizeCm: [100, 1.4, 64] },
  { type: 'official:mirror', category: 'decor', label: 'Mirror', mount: 'wall', sizeCm: [38, 56, 8] },
  { type: 'official:towel-rack', category: 'decor', label: 'Towel Rack', mount: 'wall', sizeCm: [50.4, 25, 8.75] },
  { type: 'official:rug-runner', category: 'decor', label: 'Runner Rug', mount: 'rug', sizeCm: [125, 1.02, 34] },
  { type: 'official:rug-paw', category: 'decor', label: 'Paw Rug', mount: 'rug', sizeCm: [64, 1.2, 59.2] },
  { type: 'official:lamp-floor', category: 'decor', label: 'Floor Lamp', mount: 'floor', sizeCm: [24, 80, 24] },
  { type: 'official:lamp-table', category: 'decor', label: 'Table Lamp', mount: 'floor', small: true, sizeCm: [18, 24, 18] },
  { type: 'official:lamp-wall', category: 'decor', label: 'Wall Sconce', mount: 'wall', sizeCm: [12, 16, 13.52] },
  { type: 'official:lamp-string', category: 'decor', label: 'String Lights', mount: 'wall', sizeCm: [120, 19.8, 3.2] },
  { type: 'official:plant-small', category: 'plants', label: 'Small Plant', mount: 'floor', small: true, sizeCm: [15.12, 18.16, 15.57] },
  { type: 'official:plant-tall', category: 'plants', label: 'Tall Plant', mount: 'floor', sizeCm: [20.59, 65, 19.43] },
  { type: 'official:plant-cactus', category: 'plants', label: 'Cactus', mount: 'floor', small: true, sizeCm: [13.08, 31.2, 12.97] },
  { type: 'official:plant-fern', category: 'plants', label: 'Fern', mount: 'floor', sizeCm: [25.06, 24.53, 22.73] },
  { type: 'official:plant-hanging', category: 'plants', label: 'Hanging Plant', mount: 'wall', sizeCm: [15.2, 37.25, 12.97] },
  { type: 'official:clock-wall', category: 'clocks', label: 'Wall Clock', mount: 'wall', sizeCm: [32, 32, 4.55] },
  { type: 'official:clock-wall-modern', category: 'clocks', label: 'Modern Clock', mount: 'wall', sizeCm: [32, 32, 4.55] },
  { type: 'official:clock-wall-cute', category: 'clocks', label: 'Cute Clock', mount: 'wall', sizeCm: [32, 32, 4.55] },
  { type: 'official:clock-wall-digital', category: 'clocks', label: 'Digital Wall Clock', mount: 'wall', sizeCm: [32, 14, 3] },
  { type: 'official:clock-wall-flip', category: 'clocks', label: 'Flip Wall Clock', mount: 'wall', sizeCm: [30, 15, 4.4] },
  { type: 'official:clock-table', category: 'clocks', label: 'Table Clock', mount: 'floor', small: true, sizeCm: [22, 24, 9] },
  { type: 'official:clock-bedside', category: 'clocks', label: 'Bedside Clock', mount: 'floor', small: true, rooms: BEDROOM, sizeCm: [22, 13, 8] },
  { type: 'official:clock-alarm', category: 'clocks', label: 'Alarm Clock', mount: 'floor', small: true, rooms: BEDROOM, sizeCm: [21, 26.37, 8] },
  { type: 'official:clock-table-digital', category: 'clocks', label: 'Table Digital Clock', mount: 'floor', small: true, rooms: BEDROOM, sizeCm: [20, 12, 6] },
  { type: 'official:picture-frame', category: 'frames', label: 'Picture Frame', mount: 'wall', picture: true, sizeCm: [24, 30, 2.4] },
  { type: 'official:picture-frame-gold', category: 'frames', label: 'Gold Frame', mount: 'wall', picture: true, sizeCm: [26, 32, 2.4] },
  { type: 'official:picture-frame-square', category: 'frames', label: 'Square Frame', mount: 'wall', picture: true, sizeCm: [28, 28, 2.4] },
  { type: 'official:picture-frame-oval', category: 'frames', label: 'Oval Frame', mount: 'wall', picture: true, sizeCm: [22, 28, 2.6] },
];

const byType = new Map(OFFICIAL_HOUSE_FURNITURE.map((def) => [def.type, def]));

/** The official definition of a type, or undefined (unknown namespaces, network objects, other games' pieces). */
export function houseFurniture(type: string): HouseFurnitureDefinition | undefined {
  return byType.get(type);
}

/** The surface a mount goes on in a house. */
export function surfaceForMount(mount: FurnitureMount): HouseSurface {
  return mount === 'wall' ? 'wall' : 'floor';
}

/** Network objects (kind 33331, Simple Nostr Objects): `sno:<naddr>`. */
export const SNO_TYPE_PREFIX = 'sno:';
/** A network object is fitted so its longest side is this many tiles (Ditto's rule). Its real proportions need its model. */
export const SNO_FIT_TILES = 2;

/** The whole tiles a side of `size` tiles covers (a little overhang is forgiven): Ditto's and Blobbi Home's rule. */
export function tilesFor(size: number): number {
  return Math.max(1, Math.ceil(size - 0.2));
}

export interface FloorFootprint {
  surface: 'floor';
  /** Tiles covered along x and z, after the turn. */
  w: number;
  d: number;
  /** The piece's size in tiles (x, y, z) after scale and turn, before fitting to tiles. */
  size: { x: number; y: number; z: number };
  /** True when the size is assumed, not known (a network object without its model). */
  assumed?: true;
}

export interface WallFootprint {
  surface: 'wall';
  /** Tiles along the wall and up it (not rounded: wall pieces move in half tiles). */
  w: number;
  h: number;
  size: { x: number; y: number; z: number };
}

export type Footprint = FloorFootprint | WallFootprint;

export interface FootprintOptions {
  scale?: number;
  rot?: QuarterTurn;
  /** The room, to cap a footprint at the floor's sides (default 8 × 8, the Blobbi room). */
  room?: Pick<RoomSize, 'w' | 'd'>;
}

/**
 * The tiles a piece of `type` covers, or null for a type this catalog does
 * not know. Floor pieces cover whole tiles (`tilesFor`, capped at the room);
 * an odd turn swaps width and depth. Network objects are assumed to fill
 * SNO_FIT_TILES × SNO_FIT_TILES.
 */
export function footprint(type: string, { scale = 1, rot = 0, room = { w: 8, d: 8 } }: FootprintOptions = {}): Footprint | null {
  const def = houseFurniture(type);
  if (!def) {
    if (!type.startsWith(SNO_TYPE_PREFIX)) return null;
    const side = SNO_FIT_TILES * scale;
    const t = Math.min(room.w, room.d, tilesFor(side));
    return { surface: 'floor', w: t, d: t, size: { x: side, y: side, z: side }, assumed: true };
  }
  // The same arithmetic as the rooms that draw them, so a footprint here is the footprint there
  const k = (1 / HOUSE_CM_PER_TILE) * scale;
  const [x, y, z] = def.sizeCm.map((cm) => cm * k) as [number, number, number];
  if (def.mount === 'wall') return { surface: 'wall', w: x, h: y, size: { x, y, z } };
  const turned = rot % 2 === 1;
  const size = turned ? { x: z, y, z: x } : { x, y, z };
  return { surface: 'floor', w: Math.min(room.w, tilesFor(size.x)), d: Math.min(room.d, tilesFor(size.z)), size };
}

/** A piece's footprint in its room (null for an unknown type). */
export function itemFootprint(item: Pick<HouseItem, 'type' | 'scale' | 'rot'>, room: Pick<RoomSize, 'w' | 'd'>): Footprint | null {
  return footprint(item.type, { scale: item.scale ?? 1, rot: item.rot ?? 0, room });
}

/** A centre kept far enough from the edges for a piece `size` wide to stay inside `extent` (Ditto's `clampToRoom`). */
export function clampToRoom(center: number, size: number, extent: number): number {
  const half = size / 2;
  return Math.max(half, Math.min(extent - half, center));
}

/** A floor centre lined up with the grid: odd footprints on tile centres (k + 0.5), even ones on tile edges (k), kept in the room (Ditto's `snapCenter`). */
export function snapCenter(center: number, size: number, extent: number): number {
  const offset = size % 2 === 1 ? 0.5 : 0;
  return clampToRoom(Math.round(center - offset) + offset, size, extent);
}

/** The area a floor piece covers (x0..x1 × z0..z1), or a wall piece covers on its wall (a0..a1 along it, y0..y1 up it). */
export type ItemRect =
  | { surface: 'floor'; x0: number; x1: number; z0: number; z1: number }
  | { surface: 'wall'; wall: NonNullable<HouseItem['wall']>; a0: number; a1: number; y0: number; y1: number };

/**
 * Where a piece is drawn: its stored centre snapped to the grid and kept
 * inside the room, the way Ditto and Blobbi Home draw it (floor pieces on
 * whole tiles, wall pieces in half tiles). The stored `x`/`z`/`y` are the
 * requested centre and are never rewritten; every renderer that uses this
 * draws the piece in the same place. Null for an unknown type.
 */
export function itemRect(item: Pick<HouseItem, 'type' | 'surface' | 'wall' | 'x' | 'y' | 'z' | 'scale' | 'rot'>, room: Pick<RoomSize, 'w' | 'd' | 'h'>): ItemRect | null {
  const f = itemFootprint(item, room);
  if (!f) return null;
  if (f.surface === 'floor' && item.surface === 'floor') {
    const x = snapCenter(item.x ?? 0, f.w, room.w);
    const z = snapCenter(item.z ?? 0, f.d, room.d);
    return { surface: 'floor', x0: x - f.w / 2, x1: x + f.w / 2, z0: z - f.d / 2, z1: z + f.d / 2 };
  }
  if (f.surface === 'wall' && item.surface === 'wall' && item.wall) {
    const { axis, length } = wallAxis(item.wall, room);
    // A piece wider (or taller) than its wall is drawn at the wall's size, as a floor footprint is capped at the room's
    const w = Math.min(length, f.w);
    const h = Math.min(room.h, f.h);
    const a = clampToRoom(Math.round((item[axis] ?? 0) * 2) / 2, w, length);
    const y = clampToRoom(Math.round((item.y ?? 0) * 2) / 2, h, room.h);
    return { surface: 'wall', wall: item.wall, a0: a - w / 2, a1: a + w / 2, y0: y - h / 2, y1: y + h / 2 };
  }
  return null;
}

/** Whether two drawn areas overlap (same surface, and for walls the same wall). Touching edges do not overlap. */
export function rectsOverlap(a: ItemRect, b: ItemRect): boolean {
  if (a.surface === 'floor' && b.surface === 'floor') return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
  if (a.surface === 'wall' && b.surface === 'wall') return a.wall === b.wall && a.a0 < b.a1 && b.a0 < a.a1 && a.y0 < b.y1 && b.y0 < a.y1;
  return false;
}

/**
 * Where a known type may go: an error message, or null when `surface` is
 * right. Unknown types are never refused here (other games' pieces are kept).
 */
export function placementProblem(type: string, surface: HouseSurface): string | null {
  const def = houseFurniture(type);
  if (!def) return null;
  const want = surfaceForMount(def.mount);
  return want === surface ? null : `${type} goes on the ${want}, not the ${surface}`;
}

