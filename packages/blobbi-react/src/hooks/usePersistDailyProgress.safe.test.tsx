import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { NostrEvent, NostrFilter } from '@blobbi-kit/core/nostr-protocol';
import { buildBlobbonautTags, parseBlobbonautEvent, updateBlobbonautTags } from '@blobbi-kit/core/blobbi';
import { missionProgress, parseProfileContent, serializeProfileContent, type MissionsContent } from '@blobbi-kit/core/missions';
import { BLOBBI_PROFILE_REQUIRED_RELAYS, writeProfileSafely, type ProfileRelays } from '@blobbi-kit/core/safe-profile-write';

const relayQuery = vi.fn(async (_filters: NostrFilter[]) => [] as NostrEvent[]);
vi.mock('@nostrify/react', () => ({ useNostr: () => ({ nostr: { query: relayQuery } }) }));

import { createDailyMissionsContent, getTodayDateString } from '../lib/daily-missions';
import { readDailyFromStorage, trackDailyMissionProgress, writeDailyToStorage } from '../lib/daily-mission-tracker';
import { dailyPendingKey, loadPendingDaily } from '../lib/daily-pending';
import type { ProfileWriter, StorageAdapter } from '../adapters/types';
import { usePersistDailyProgress } from './usePersistDailyProgress';

/**
 * Safe mode of usePersistDailyProgress, against core's real `writeProfileSafely` over an in-memory relay network
 * (signing and verification are stand-ins: an event is signed when its sig is `sig:<id>`).
 */

const [DITTO, PRIMAL] = BLOBBI_PROFILE_REQUIRED_RELAYS;
const STAGES = ['baby' as const, 'adult' as const];
let serial = 0;
let keys = 0;

function account() {
  const pubkey = (++keys).toString(16).padStart(64, 'd');
  return {
    pubkey,
    sign: (t: { kind: number; created_at?: number; tags: string[][]; content: string }): NostrEvent => {
      const id = (++serial).toString(16).padStart(64, '0');
      return { id, pubkey, kind: t.kind, created_at: t.created_at ?? Math.floor(Date.now() / 1000), tags: t.tags.map((x) => [...x]), content: t.content, sig: `sig:${id}` };
    },
  };
}
type Account = ReturnType<typeof account>;

function memoryStorage(): StorageAdapter & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

function network() {
  const relays = new Map([DITTO, PRIMAL].map((u) => [u, { events: [] as NostrEvent[], down: false, forget: false }]));
  const keep = (url: string, e: NostrEvent) => {
    const r = relays.get(url)!;
    const old = r.events.find((x) => x.pubkey === e.pubkey && x.kind === e.kind);
    if (old && (old.created_at > e.created_at || (old.created_at === e.created_at && old.id <= e.id))) return;
    r.events = r.events.filter((x) => !(x.pubkey === e.pubkey && x.kind === e.kind));
    r.events.push(e);
  };
  const port: ProfileRelays = {
    urls: [DITTO, PRIMAL],
    required: BLOBBI_PROFILE_REQUIRED_RELAYS,
    async query(url, filter) {
      const r = relays.get(url)!;
      if (r.down) throw new Error('down');
      return r.events.filter((e) => filter.authors!.includes(e.pubkey) && filter.kinds!.includes(e.kind));
    },
    async publish(url, event) {
      const r = relays.get(url)!;
      if (r.down) throw new Error('down');
      if (!r.forget) keep(url, event);
    },
  };
  return { relays, port, seed: (e: NostrEvent) => [DITTO, PRIMAL].forEach((u) => keep(u, e)), newest: () => [...relays.get(DITTO)!.events].sort((a, b) => b.created_at - a.created_at)[0] };
}
type Net = ReturnType<typeof network>;

function writerFor(net: Net, acc: Account, signs: { n: number }, active = () => true): ProfileWriter {
  return (owner, build) =>
    writeProfileSafely(
      {
        owner,
        relays: net.port,
        sign: async (t) => (signs.n++, acc.sign({ ...t, created_at: t.created_at! })),
        verify: (e) => e.sig === `sig:${e.id}`,
        stillAccount: active,
        timeoutMs: 20,
      },
      build,
    );
}

const day = (pk: string) => createDailyMissionsContent(getTodayDateString(), pk, STAGES);
function withProgress(m: MissionsContent, counts: number[]): MissionsContent {
  return { ...m, daily: m.daily.map((x, i) => ('count' in x ? { ...x, count: Math.min(x.target, counts[i] ?? 0) } : { ...x, events: Array.from({ length: Math.min(x.target, counts[i] ?? 0) }, (_, k) => `e${k}`) })) };
}
/** A profile as other apps write it: a companion, has, xp, an unknown tag, other content keys, maybe missions. */
function profile(acc: Account, o: { companion: string; at: number; missions?: MissionsContent }): NostrEvent {
  const tags = [...updateBlobbonautTags(buildBlobbonautTags(acc.pubkey), { has: ['blobbi-a', 'blobbi-b'], current_companion: o.companion, xp: '420' }), ['island_room', 'garden']];
  const content = serializeProfileContent('{"room_layouts":{"v":1,"by_room":{"home":[1]}}}', o.missions ? { missions: o.missions } : {});
  return acc.sign({ kind: 11125, created_at: o.at, tags, content });
}
/** Something done in the app that counts for the first mission of the day. */
function doFirstMission(pk: string) {
  const first = readDailyFromStorage(pk)?.daily[0] ?? day(pk).daily[0];
  const m = readDailyFromStorage(pk) ?? day(pk);
  writeDailyToStorage({ ...m, daily: m.daily.map((x) => (x.id === first.id ? ('count' in x ? { ...x, count: Math.min(x.target, x.count + 1) } : { ...x, events: [...x.events, `ev${++serial}`].slice(0, x.target) }) : x)) }, pk);
  trackDailyMissionProgress('interact', 0, pk); // only the update signal: the store already holds the progress
}
const firstProgress = (m: MissionsContent | undefined) => (m ? missionProgress(m.daily[0]) : 0);
const S = () => Math.floor(Date.now() / 1000);

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('usePersistDailyProgress, safe mode', () => {
  it('keeps progress as pending at once (before any network), then saves it 3 s later over the newest profile: companion, has, tags and content kept', async () => {
    const acc = account();
    const net = network();
    const storage = memoryStorage();
    const signs = { n: 0 };
    // The newest profile: a companion chosen a moment ago in another app, with that app's progress on mission 2
    net.seed(profile(acc, { companion: 'blobbi-b', at: S() - 5, missions: withProgress(day(acc.pubkey), [0, 1, 0]) }));
    writeDailyToStorage(day(acc.pubkey), acc.pubkey);
    const { result } = renderHook(() => usePersistDailyProgress({ pubkey: acc.pubkey, publish: vi.fn(), storage, writeProfile: writerFor(net, acc, signs) }));
    expect(result.current.safe).toBe(true);
    act(() => doFirstMission(acc.pubkey));
    // Kept on the device before anything else
    expect(firstProgress(loadPendingDaily(storage, acc.pubkey)?.missions)).toBe(1);
    expect(signs.n).toBe(0);
    expect(result.current.status.kind).toBe('pending');
    await tick(3_100);
    expect(result.current.status.kind).toBe('saved');
    expect(signs.n).toBe(1);
    const written = net.newest();
    expect(parseBlobbonautEvent(written)).toMatchObject({ currentCompanion: 'blobbi-b', has: ['blobbi-a', 'blobbi-b'], xp: 420 });
    expect(written.tags).toContainEqual(['island_room', 'garden']);
    const content = parseProfileContent(written.content);
    expect(JSON.parse(written.content).room_layouts).toEqual({ v: 1, by_room: { home: [1] } });
    // This device's progress and the other app's, both
    expect(content.missions?.daily.map(missionProgress).slice(0, 2)).toEqual([1, 1].map((v, i) => Math.min(v, day(acc.pubkey).daily[i].target)));
    // Confirmed: cleared
    expect(storage.map.has(dailyPendingKey(acc.pubkey))).toBe(false);
  });

  it('never saves by itself on load, on a tab hide or on unmount; pending progress comes back after a reload', async () => {
    const acc = account();
    const net = network();
    const storage = memoryStorage();
    const signs = { n: 0 };
    net.seed(profile(acc, { companion: 'blobbi-a', at: S() - 600 }));
    writeDailyToStorage(day(acc.pubkey), acc.pubkey);
    net.relays.get(PRIMAL)!.down = true; // the save fails: progress stays pending
    const first = renderHook(() => usePersistDailyProgress({ pubkey: acc.pubkey, publish: vi.fn(), storage, writeProfile: writerFor(net, acc, signs) }));
    act(() => doFirstMission(acc.pubkey));
    await tick(3_100);
    expect(first.result.current.status).toMatchObject({ kind: 'failed', reason: 'unsafe' });
    expect(signs.n).toBe(0);
    // A tab hide, then the page goes (unmount): nothing is saved, nothing asks the signer
    net.relays.get(PRIMAL)!.down = false;
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    first.unmount();
    await tick(60_000);
    expect(signs.n).toBe(0);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    // Reload: this page's memory starts over (no progress); the pending progress comes back, still nothing saved
    writeDailyToStorage(day(acc.pubkey), acc.pubkey);
    const again = renderHook(() => usePersistDailyProgress({ pubkey: acc.pubkey, publish: vi.fn(), storage, writeProfile: writerFor(net, acc, signs) }));
    expect(firstProgress(readDailyFromStorage(acc.pubkey))).toBe(1);
    expect(again.result.current.status.kind).toBe('pending');
    await tick(60_000);
    expect(signs.n).toBe(0);
    // The player's Save
    await act(async () => {
      await again.result.current.save();
    });
    expect(again.result.current.status.kind).toBe('saved');
    expect(signs.n).toBe(1);
    expect(firstProgress(parseProfileContent(net.newest().content).missions)).toBe(1);
  });

  it('a write not read back keeps the progress pending; progress made during a write is never cleared by it', async () => {
    const acc = account();
    const net = network();
    const storage = memoryStorage();
    const signs = { n: 0 };
    net.seed(profile(acc, { companion: 'blobbi-a', at: S() - 600 }));
    writeDailyToStorage(day(acc.pubkey), acc.pubkey);
    for (const r of net.relays.values()) r.forget = true;
    const { result } = renderHook(() => usePersistDailyProgress({ pubkey: acc.pubkey, publish: vi.fn(), storage, writeProfile: writerFor(net, acc, signs) }));
    act(() => doFirstMission(acc.pubkey));
    await tick(3_100);
    expect(result.current.status).toMatchObject({ kind: 'failed', reason: 'unconfirmed' });
    expect(loadPendingDaily(storage, acc.pubkey)).not.toBeNull();

    for (const r of net.relays.values()) r.forget = false;
    // New progress arrives while the save is out: that save must not clear it
    const slowWriter: ProfileWriter = async (owner, build) => {
      const out = await writerFor(net, acc, signs)(owner, build);
      act(() => doFirstMission(acc.pubkey));
      return out;
    };
    const slow = renderHook(() => usePersistDailyProgress({ pubkey: acc.pubkey, publish: vi.fn(), storage, writeProfile: slowWriter }));
    await act(async () => {
      await slow.result.current.save();
    });
    expect(loadPendingDaily(storage, acc.pubkey)).not.toBeNull();
    expect(slow.result.current.status.kind).not.toBe('saved');
  });

  it('a finished day is never saved by this hook (the XP award does it); once the profile holds it, pending is cleared', async () => {
    const acc = account();
    const net = network();
    const storage = memoryStorage();
    const signs = { n: 0 };
    net.seed(profile(acc, { companion: 'blobbi-a', at: S() - 600 }));
    const done = withProgress(day(acc.pubkey), [9, 9, 9]);
    writeDailyToStorage(done, acc.pubkey);
    const { result, rerender } = renderHook(({ c }) => usePersistDailyProgress({ pubkey: acc.pubkey, publish: vi.fn(), storage, writeProfile: writerFor(net, acc, signs), profileContent: c }), { initialProps: { c: undefined as string | undefined } });
    act(() => trackDailyMissionProgress('interact', 0, acc.pubkey));
    await tick(10_000);
    expect(result.current.status.kind).toBe('complete');
    expect(signs.n).toBe(0);
    expect(loadPendingDaily(storage, acc.pubkey)).not.toBeNull();
    // The award wrote the finished day (with the XP): the profile now holds it
    rerender({ c: serializeProfileContent('{}', { missions: done }) });
    expect(loadPendingDaily(storage, acc.pubkey)).toBeNull();
    expect(result.current.status.kind).toBe('saved');
  });

  it("one account's pending progress is never loaded, shown or written for another", async () => {
    const a = account();
    const b = account();
    const net = network();
    const storage = memoryStorage();
    const signs = { n: 0 };
    net.seed(profile(b, { companion: 'blobbi-a', at: S() - 600 }));
    writeDailyToStorage(day(a.pubkey), a.pubkey);
    const { result, rerender } = renderHook(({ pk }) => usePersistDailyProgress({ pubkey: pk, publish: vi.fn(), storage, writeProfile: writerFor(net, b, signs) }), { initialProps: { pk: a.pubkey } });
    act(() => doFirstMission(a.pubkey));
    expect(loadPendingDaily(storage, a.pubkey)).not.toBeNull();
    rerender({ pk: b.pubkey });
    expect(result.current.status.kind).toBe('idle');
    await act(async () => {
      await result.current.save();
    });
    expect(signs.n).toBe(0);
    expect(loadPendingDaily(storage, b.pubkey)).toBeNull();
    expect(firstProgress(readDailyFromStorage(b.pubkey))).toBe(0);
  });
});

describe('usePersistDailyProgress, legacy mode (no storage or writer): as 0.9, the missions merged', () => {
  it('saves 3 s after an update over a quick read, keeps other content keys, and merges the profile\'s own progress', async () => {
    const acc = account();
    const base = profile(acc, { companion: 'blobbi-a', at: S() - 600, missions: withProgress(day(acc.pubkey), [0, 1, 0]) });
    relayQuery.mockResolvedValue([base]);
    writeDailyToStorage(day(acc.pubkey), acc.pubkey);
    const publish = vi.fn(async (t: { content?: string; tags?: string[][] }) => acc.sign({ kind: 11125, tags: t.tags ?? [], content: t.content ?? '' }));
    const { result } = renderHook(() => usePersistDailyProgress({ pubkey: acc.pubkey, publish }));
    expect(result.current.safe).toBe(false);
    act(() => doFirstMission(acc.pubkey));
    await tick(3_100);
    expect(publish).toHaveBeenCalledTimes(1);
    const sent = publish.mock.calls[0][0];
    expect(sent.tags).toEqual(base.tags);
    expect(JSON.parse(sent.content!).room_layouts).toEqual({ v: 1, by_room: { home: [1] } });
    expect(parseProfileContent(sent.content!).missions?.daily.map(missionProgress).slice(0, 2)).toEqual([1, 1].map((v, i) => Math.min(v, day(acc.pubkey).daily[i].target)));
    relayQuery.mockReset();
  });
});
