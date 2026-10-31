import { describe, expect, it } from 'vitest';
import {
  HOUSE_CM_PER_TILE,
  OFFICIAL_HOUSE_FURNITURE,
  SNO_FIT_TILES,
  createInitialHouse,
  footprint,
  houseFurniture,
  itemFootprint,
  itemRect,
  rectsOverlap,
  snapCenter,
  placementProblem,
  surfaceForMount,
  tilesFor,
} from './index';

/** Ditto's official furniture ids (`furniture-registry.ts`, origin/main 2026-10-24), in its order. */
const DITTO_OFFICIAL_IDS = [
  'bed-single', 'bed-round', 'bed-cushion', 'bed-basket', 'fridge', 'oven', 'bathtub', 'toybox', 'wardrobe', 'sink',
  'table-side', 'cabinet-small', 'counter', 'shelf-books', 'shelf-wall', 'shelf-floating',
  'rug-round', 'rug-rectangle', 'mirror', 'towel-rack', 'rug-runner', 'rug-paw', 'lamp-floor', 'lamp-table', 'lamp-wall', 'lamp-string',
  'plant-small', 'plant-tall', 'plant-cactus', 'plant-fern', 'plant-hanging',
  'clock-wall', 'clock-wall-modern', 'clock-wall-cute', 'clock-wall-digital', 'clock-wall-flip', 'clock-table', 'clock-bedside', 'clock-alarm', 'clock-table-digital',
  'picture-frame', 'picture-frame-gold', 'picture-frame-square', 'picture-frame-oval',
].map((slug) => `official:${slug}`);

describe('the shared furniture catalog', () => {
  it("holds exactly Ditto's 44 official types, in Ditto's order, ids unchanged", () => {
    expect(OFFICIAL_HOUSE_FURNITURE.map((d) => d.type)).toEqual(DITTO_OFFICIAL_IDS);
  });

  it('says where each piece goes, as Ditto and Blobbi Home 3D do (the bookshelf stands on the floor)', () => {
    expect(houseFurniture('official:shelf-books')!.mount).toBe('floor');
    expect(OFFICIAL_HOUSE_FURNITURE.filter((d) => d.mount === 'rug').map((d) => d.type)).toEqual(['official:rug-round', 'official:rug-rectangle', 'official:rug-runner', 'official:rug-paw']);
    expect(OFFICIAL_HOUSE_FURNITURE.filter((d) => d.mount === 'wall')).toHaveLength(16);
    expect(surfaceForMount('rug')).toBe('floor');
    expect(houseFurniture('home:tub')).toBeUndefined();
    expect(houseFurniture('home:bed-pet')).toBeUndefined();
  });

  it('keeps the stacking, rooms and interactions of the Blobbi catalog', () => {
    expect(houseFurniture('official:lamp-table')).toMatchObject({ small: true });
    expect(houseFurniture('official:table-side')).toMatchObject({ surface: true });
    expect(houseFurniture('official:fridge')).toMatchObject({ rooms: ['kitchen'], interaction: 'fridge' });
    expect(houseFurniture('official:bed-single')!.rooms).toEqual(['rest', 'home']);
    expect(OFFICIAL_HOUSE_FURNITURE.filter((d) => d.picture)).toHaveLength(4);
  });

  it('has a measured size for every piece, positive and plausible (no piece wider than a room)', () => {
    for (const d of OFFICIAL_HOUSE_FURNITURE) {
      expect(d.sizeCm.every((cm) => cm > 0)).toBe(true);
      expect(Math.max(d.sizeCm[0], d.sizeCm[2]) / HOUSE_CM_PER_TILE).toBeLessThan(8);
    }
  });
});

describe('footprint', () => {
  it('covers whole tiles, forgiving a little overhang, with an odd turn swapping width and depth', () => {
    expect(tilesFor(2.2)).toBe(2);
    expect(tilesFor(2.21)).toBe(3);
    expect(tilesFor(0.1)).toBe(1);
    expect(footprint('official:bed-single')).toMatchObject({ surface: 'floor', w: 4, d: 2 });
    expect(footprint('official:bed-single', { rot: 1 })).toMatchObject({ w: 2, d: 4 });
    expect(footprint('official:bed-single', { rot: 2 })).toMatchObject({ w: 4, d: 2 });
    expect(footprint('official:fridge')).toMatchObject({ w: 2, d: 2 });
    expect(footprint('official:bed-round')).toMatchObject({ w: 2, d: 2 });
  });

  it('follows the scale, and never exceeds the room', () => {
    expect(footprint('official:fridge', { scale: 0.5 })).toMatchObject({ w: 1, d: 1 });
    expect(footprint('official:rug-round')).toMatchObject({ w: 4, d: 4 });
    expect(footprint('official:rug-round', { scale: 2 })).toMatchObject({ w: 7, d: 7 });
    expect(footprint('official:rug-round', { scale: 2, room: { w: 5, d: 6 } })).toMatchObject({ w: 5, d: 6 });
    expect(footprint('official:rug-rectangle', { rot: 1, scale: 1.6 })).toMatchObject({ w: 4, d: 6 });
  });

  it('gives wall pieces their real width and height on the wall', () => {
    const clock = footprint('official:clock-wall');
    expect(clock).toMatchObject({ surface: 'wall' });
    expect(clock!.w).toBeCloseTo(32 / 30);
    expect(footprint('official:lamp-string')!.w).toBeCloseTo(4);
  });

  it('assumes 2 × 2 for network objects and knows nothing of unknown types', () => {
    expect(footprint('sno:naddr1abc')).toMatchObject({ w: SNO_FIT_TILES, d: SNO_FIT_TILES, assumed: true });
    expect(footprint('mygame:throne')).toBeNull();
  });

  it('measures every piece of the starting house', () => {
    for (const room of createInitialHouse().rooms) for (const item of room.items) expect(itemFootprint(item, room.size)).not.toBeNull();
  });
});

describe('itemRect: where a piece is drawn', () => {
  it("snaps a centre to the grid and keeps it in the room, as Ditto's snapCenter does", () => {
    expect(snapCenter(1.5, 4, 8)).toBe(2);
    expect(snapCenter(1.2, 1, 8)).toBe(1.5);
    expect(snapCenter(3, 2, 8)).toBe(3);
    expect(snapCenter(7.9, 2, 8)).toBe(7);
  });

  it("draws Ditto's default bed (stored at x 1.5, four tiles wide) on tiles 0–4, where Ditto draws it, without rewriting it", () => {
    const rest = createInitialHouse().rooms[3];
    const bed = rest.items[0];
    expect(bed).toMatchObject({ type: 'official:bed-single', x: 1.5, z: 3 });
    expect(itemRect(bed, rest.size)).toEqual({ surface: 'floor', x0: 0, x1: 4, z0: 2, z1: 4 });
  });

  it('hangs wall pieces in half tiles, kept on their wall', () => {
    const room = { w: 8, d: 6, h: 5 };
    const rect = itemRect({ type: 'official:clock-wall', surface: 'wall', wall: 'west', z: 5.9, y: 4.9 }, room)!;
    expect(rect).toMatchObject({ surface: 'wall', wall: 'west' });
    if (rect.surface !== 'wall') throw new Error('wall');
    expect(rect.a1).toBeLessThanOrEqual(6);
    expect(rect.y1).toBeLessThanOrEqual(5);
    expect(itemRect({ type: 'mygame:banner', surface: 'wall', wall: 'west', z: 1, y: 1 }, room)).toBeNull();
  });

  it('draws every piece of the starting house inside its room, and no two standing pieces on the same tiles', () => {
    for (const room of createInitialHouse().rooms) {
      const rects = room.items.map((item) => ({ item, rect: itemRect(item, room.size)! }));
      for (const { rect } of rects) {
        if (rect.surface === 'floor') expect(rect.x0 >= 0 && rect.x1 <= 8 && rect.z0 >= 0 && rect.z1 <= 8).toBe(true);
        else expect(rect.a0 >= 0 && rect.a1 <= 8 && rect.y0 >= 0 && rect.y1 <= 5).toBe(true);
      }
      // Rugs lie under things and small pieces stand on surfaces: only the rest must not share tiles
      const standing = rects.filter(({ item }) => item.surface === 'floor' && houseFurniture(item.type)!.mount === 'floor' && !houseFurniture(item.type)!.small);
      for (let i = 0; i < standing.length; i++) for (let j = i + 1; j < standing.length; j++) {
        expect(rectsOverlap(standing[i].rect, standing[j].rect), `${room.id}: ${standing[i].item.id} × ${standing[j].item.id}`).toBe(false);
      }
    }
  });
});

describe('placementProblem', () => {
  it('refuses a known piece on the wrong surface, and never judges unknown types', () => {
    expect(placementProblem('official:mirror', 'wall')).toBeNull();
    expect(placementProblem('official:rug-paw', 'floor')).toBeNull();
    expect(placementProblem('official:mirror', 'floor')).toMatch(/goes on the wall/);
    expect(placementProblem('official:shelf-books', 'wall')).toMatch(/goes on the floor/);
    expect(placementProblem('mygame:banner', 'wall')).toBeNull();
  });
});

describe('final review fixes (P2.1)', () => {
  it('draws a wall piece wider or taller than its wall at the wall\'s size, never past its ends', () => {
    // String lights are 4 tiles wide: on a 2-tile wall they span exactly 0–2
    const wide = itemRect({ type: 'official:lamp-string', surface: 'wall', wall: 'west', z: 1, y: 2 }, { w: 2, d: 2, h: 5 })!;
    expect(wide).toMatchObject({ surface: 'wall', a0: 0, a1: 2 });
    // A mirror is about 1.9 tiles tall: in a 1-tile-high room it spans exactly 0–1
    const tall = itemRect({ type: 'official:mirror', surface: 'wall', wall: 'north', x: 2, y: 0.5 }, { w: 4, d: 4, h: 1 })!;
    expect(tall).toMatchObject({ surface: 'wall', y0: 0, y1: 1 });
    // A piece that fits keeps its real size
    const fits = itemRect({ type: 'official:lamp-string', surface: 'wall', wall: 'north', x: 4, y: 3 }, { w: 8, d: 8, h: 5 })!;
    expect(fits).toMatchObject({ a0: 2, a1: 6 });
  });
});
