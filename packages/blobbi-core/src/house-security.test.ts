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
  KIND_BLOBBI_HOUSE,
  MAIN_HOUSE_ID,
  houseFromDittoProfile,
  parseHouseEvent,
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
      (d: string) => `{"v":1,"name":"x","rooms":${nestedArrays(30_000)}}`,
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
