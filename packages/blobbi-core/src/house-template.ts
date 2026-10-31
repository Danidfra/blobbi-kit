/**
 * THE BLOBBI STARTING HOUSE (P2.1): what a Blobbi player's first house holds
 * when it is created. Application data, not protocol: other games start
 * houses of their own, of any shape.
 *
 * It is Ditto's house as Ditto shows it to a new account: the four visible
 * rooms in Ditto's order (kitchen, home, care, rest; the hidden closet is
 * left out), each an 8 × 8 floor with 5-tile walls on the west (x = 0) and
 * north (z = 0) sides, with Ditto's default finishes and furniture
 * (`room-layout-defaults.ts`, `room-furniture-defaults.ts`; Blobbi Home's are
 * the same). The pieces are stored in the house when it is created, so a
 * later change to anyone's defaults never moves them.
 *
 * Item ids are `<room>-<n>`, numbered in Ditto's order: deterministic, so the
 * same house is created everywhere.
 */
import type { HouseDocument, HouseRoom } from './house';

/** Blobbi's own cap on pieces per room (Ditto's); application policy, not a protocol limit. */
export const BLOBBI_MAX_ITEMS_PER_ROOM = 20;

/** The Blobbi room: Ditto's floor grid and wall height. */
export const BLOBBI_ROOM_SIZE = { w: 8, d: 8, h: 5 } as const;

/** The name a Blobbi house is created with. */
export const BLOBBI_HOUSE_NAME = 'Home';

/** The rooms of a new Blobbi house, in order. */
export const BLOBBI_STARTER_ROOMS: readonly HouseRoom[] = [
    {
      id: 'kitchen',
      type: 'kitchen',
      size: { w: 8, d: 8, h: 5 },
      walls: ['west', 'north'],
      wall: { style: 'solid', palette: ['#fafaf9', '#f5f5f4'] },
      floor: { style: 'tile', palette: ['#f5f5f4', '#d6d3d1'] },
      items: [
        { id: 'kitchen-1', type: 'official:fridge', surface: 'floor', x: 1, z: 1 },
        { id: 'kitchen-2', type: 'official:counter', surface: 'floor', x: 3, z: 1 },
        { id: 'kitchen-3', type: 'official:plant-small', surface: 'floor', x: 3, z: 0.5 },
        { id: 'kitchen-4', type: 'official:counter', surface: 'floor', x: 5, z: 1 },
        { id: 'kitchen-5', type: 'official:oven', surface: 'floor', x: 7, z: 1 },
        { id: 'kitchen-6', type: 'official:clock-wall', surface: 'wall', wall: 'north', x: 5, y: 3.6 },
        { id: 'kitchen-7', type: 'official:shelf-floating', surface: 'wall', wall: 'west', z: 5.5, y: 3.2, scale: 1.2 },
        { id: 'kitchen-8', type: 'official:plant-hanging', surface: 'wall', wall: 'west', z: 7.5, y: 3.9 },
      ],
    },
    {
      id: 'home',
      type: 'home',
      size: { w: 8, d: 8, h: 5 },
      walls: ['west', 'north'],
      wall: { style: 'gradient', palette: ['#fef9ef', '#fef3c7'] },
      floor: { style: 'wood', palette: ['#b45309', '#78350f'], variant: 'wide' },
      items: [
        { id: 'home-1', type: 'official:rug-round', surface: 'floor', x: 4.5, z: 4.5 },
        { id: 'home-2', type: 'official:toybox', surface: 'floor', x: 3, z: 0.5 },
        { id: 'home-3', type: 'official:lamp-floor', surface: 'floor', x: 0.5, z: 0.5 },
        { id: 'home-4', type: 'official:plant-tall', surface: 'floor', x: 7.5, z: 0.5 },
        { id: 'home-5', type: 'official:table-side', surface: 'floor', x: 0.5, z: 4.5, rot: 3 },
        { id: 'home-6', type: 'official:lamp-table', surface: 'floor', x: 0.5, z: 4.5, rot: 3 },
        { id: 'home-7', type: 'official:plant-fern', surface: 'floor', x: 0.5, z: 6.5 },
        { id: 'home-8', type: 'official:shelf-wall', surface: 'wall', wall: 'west', z: 5.5, y: 3, scale: 1.4 },
        { id: 'home-9', type: 'official:picture-frame', surface: 'wall', wall: 'north', x: 5.5, y: 3 },
      ],
    },
    {
      id: 'care',
      type: 'care',
      size: { w: 8, d: 8, h: 5 },
      walls: ['west', 'north'],
      wall: { style: 'solid', palette: ['#f0f9ff', '#e0f2fe'] },
      floor: { style: 'tile', palette: ['#f0f9ff', '#bae6fd'], angle: 45 },
      items: [
        { id: 'care-1', type: 'official:bathtub', surface: 'floor', x: 4.5, z: 1 },
        { id: 'care-2', type: 'official:sink', surface: 'floor', x: 1, z: 4, rot: 3 },
        { id: 'care-3', type: 'official:plant-fern', surface: 'floor', x: 1, z: 1, scale: 1.75 },
        { id: 'care-4', type: 'official:rug-paw', surface: 'floor', x: 5, z: 3.5 },
        { id: 'care-5', type: 'official:mirror', surface: 'wall', wall: 'west', z: 4, y: 3.8 },
        { id: 'care-6', type: 'official:towel-rack', surface: 'wall', wall: 'west', z: 6.5, y: 2.4 },
        { id: 'care-7', type: 'official:picture-frame-oval', surface: 'wall', wall: 'north', x: 5, y: 3.6 },
      ],
    },
    {
      id: 'rest',
      type: 'rest',
      size: { w: 8, d: 8, h: 5 },
      walls: ['west', 'north'],
      wall: { style: 'gradient', palette: ['#faf5ff', '#ede9fe'] },
      floor: { style: 'carpet', palette: ['#a78bfa', '#8b5cf6'], variant: 'soft' },
      items: [
        { id: 'rest-1', type: 'official:bed-single', surface: 'floor', x: 1.5, z: 3 },
        { id: 'rest-2', type: 'official:table-side', surface: 'floor', x: 0.5, z: 4.5, rot: 3 },
        { id: 'rest-3', type: 'official:clock-alarm', surface: 'floor', x: 0.5, z: 4.5, rot: 3 },
        { id: 'rest-4', type: 'official:lamp-floor', surface: 'floor', x: 0.5, z: 0.5 },
        { id: 'rest-5', type: 'official:shelf-books', surface: 'floor', x: 7, z: 0.5, scale: 1.3 },
        { id: 'rest-6', type: 'official:rug-rectangle', surface: 'floor', x: 5, z: 4, rot: 1, scale: 1.6 },
        { id: 'rest-7', type: 'official:lamp-string', surface: 'wall', wall: 'north', x: 2, y: 4.2 },
        { id: 'rest-8', type: 'official:lamp-string', surface: 'wall', wall: 'north', x: 6, y: 4.2 },
        { id: 'rest-9', type: 'official:lamp-string', surface: 'wall', wall: 'west', z: 2, y: 4.2 },
        { id: 'rest-10', type: 'official:lamp-string', surface: 'wall', wall: 'west', z: 6, y: 4.2 },
        { id: 'rest-11', type: 'official:picture-frame-square', surface: 'wall', wall: 'west', z: 3, y: 3.2 },
      ],
    },
];

/** A new Blobbi house document (no id: the id is the event's `d`, `MAIN_HOUSE_ID` for a player's first). */
export function blobbiStarterHouse(): HouseDocument {
  return { v: 1, name: BLOBBI_HOUSE_NAME, category: 'house', rooms: JSON.parse(JSON.stringify(BLOBBI_STARTER_ROOMS)) as HouseRoom[] };
}
