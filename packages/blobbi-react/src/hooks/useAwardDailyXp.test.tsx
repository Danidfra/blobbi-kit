import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { NostrEvent } from '@blobbi-kit/core/nostr-protocol';
import { buildBlobbonautTags, parseBlobbonautEvent, updateBlobbonautTags } from '@blobbi-kit/core/blobbi';
import { parseProfileContent, serializeProfileContent, type MissionsContent } from '@blobbi-kit/core/missions';
import { BLOBBI_PROFILE_REQUIRED_RELAYS, writeProfileSafely, type ProfileRelays } from '@blobbi-kit/core/safe-profile-write';

const query = vi.fn(async () => [] as NostrEvent[]);
vi.mock('@nostrify/react', () => ({ useNostr: () => ({ nostr: { query } }) }));

import { createDailyMissionsContent, getTodayDateString, totalDailyXp } from '../lib/daily-missions';
import type { ProfileWriter } from '../adapters/types';
import { isDailyXpPaid, useAwardDailyXp } from './useAwardDailyXp';

/** useAwardDailyXp never publishes a partial or empty profile, and pays a day once. */

const [DITTO, PRIMAL] = BLOBBI_PROFILE_REQUIRED_RELAYS;
let serial = 0;
const PK = '7'.repeat(64);
const sign = (t: { kind: number; created_at?: number; tags: string[][]; content: string }): NostrEvent => {
  const id = (++serial).toString(16).padStart(64, '0');
  return { id, pubkey: PK, kind: t.kind, created_at: t.created_at ?? Math.floor(Date.now() / 1000), tags: t.tags.map((x) => [...x]), content: t.content, sig: `sig:${id}` };
};
const S = () => Math.floor(Date.now() / 1000);
const finished = (): MissionsContent => {
  const m = createDailyMissionsContent(getTodayDateString(), PK, ['baby', 'adult']);
  return { ...m, daily: m.daily.map((x) => ('count' in x ? { ...x, count: x.target } : { ...x, events: Array.from({ length: x.target }, (_, k) => `e${k}`) })) };
};
function profile(o: { at: number; content?: string; companion?: string }): NostrEvent {
  const tags = [...updateBlobbonautTags(buildBlobbonautTags(PK), { has: ['blobbi-a', 'blobbi-b'], current_companion: o.companion ?? 'blobbi-b', xp: '100' }), ['island_room', 'garden']];
  return sign({ kind: 11125, created_at: o.at, tags, content: o.content ?? '{"room_layouts":{"v":1}}' });
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>;
}

function network() {
  const relays = new Map([DITTO, PRIMAL].map((u) => [u, { events: [] as NostrEvent[], down: false }]));
  const port: ProfileRelays = {
    urls: [DITTO, PRIMAL],
    required: BLOBBI_PROFILE_REQUIRED_RELAYS,
    async query(url) {
      const r = relays.get(url)!;
      if (r.down) throw new Error('down');
      return r.events;
    },
    async publish(url, e) {
      const r = relays.get(url)!;
      if (r.down) throw new Error('down');
      r.events = [e];
    },
  };
  return { relays, port, seed: (e: NostrEvent) => relays.forEach((r) => (r.events = [e])), newest: () => relays.get(DITTO)!.events[0] };
}
const writerOver = (net: ReturnType<typeof network>, signs: { n: number }): ProfileWriter => (owner, build) =>
  writeProfileSafely({ owner, relays: net.port, sign: async (t) => (signs.n++, sign({ ...t, created_at: t.created_at! })), verify: (e) => e.sig === `sig:${e.id}`, stillAccount: () => true, timeoutMs: 20 }, build);

beforeEach(() => query.mockReset());

describe('useAwardDailyXp, legacy mode (no writer)', () => {
  it('a read that found nothing writes nothing (0.9 replaced the profile with only xp and level)', async () => {
    query.mockResolvedValue([]);
    const publish = vi.fn();
    const { result } = renderHook(() => useAwardDailyXp({ pubkey: PK, publish }), { wrapper });
    await expect(result.current.mutateAsync({ missions: finished() })).rejects.toThrow(/nothing was written/);
    expect(publish).not.toHaveBeenCalled();
  });

  it('awards over the profile read: every other tag and content key kept, the day merged in', async () => {
    const base = profile({ at: S() - 600 });
    query.mockResolvedValue([base]);
    const publish = vi.fn(async (t: { tags?: string[][]; content?: string }) => sign({ kind: 11125, tags: t.tags ?? [], content: t.content ?? '' }));
    const { result } = renderHook(() => useAwardDailyXp({ pubkey: PK, publish }), { wrapper });
    const out = await result.current.mutateAsync({ missions: finished() });
    expect(out.xpAwarded).toBe(totalDailyXp(finished()));
    const sent = publish.mock.calls[0][0];
    expect(parseBlobbonautEvent(sign({ kind: 11125, tags: sent.tags!, content: sent.content! }))).toMatchObject({ currentCompanion: 'blobbi-b', has: ['blobbi-a', 'blobbi-b'], xp: 100 + out.xpAwarded });
    expect(sent.tags).toContainEqual(['island_room', 'garden']);
    expect(JSON.parse(sent.content!).room_layouts).toEqual({ v: 1 });
    expect(isDailyXpPaid(sent.content!, getTodayDateString())).toBe(true);
  });

  it('a day already paid (by this app, another device or app) is never paid again', async () => {
    query.mockResolvedValue([profile({ at: S() - 600, content: serializeProfileContent('{}', { missions: finished() }) })]);
    const publish = vi.fn();
    const { result } = renderHook(() => useAwardDailyXp({ pubkey: PK, publish }), { wrapper });
    expect(await result.current.mutateAsync({ missions: finished() })).toMatchObject({ xpAwarded: 0, skipped: 'already-paid', newTotalXp: 100 });
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('useAwardDailyXp, with the safe writer', () => {
  it('a required relay that does not answer: nothing is signed or written', async () => {
    const net = network();
    net.seed(profile({ at: S() - 600 }));
    net.relays.get(PRIMAL)!.down = true;
    const signs = { n: 0 };
    const { result } = renderHook(() => useAwardDailyXp({ pubkey: PK, publish: vi.fn(), writeProfile: writerOver(net, signs) }), { wrapper });
    await expect(result.current.mutateAsync({ missions: finished() })).rejects.toThrow(/unsafe/);
    expect(signs.n).toBe(0);
  });

  it('no profile at all: nothing is created', async () => {
    const net = network();
    const signs = { n: 0 };
    const { result } = renderHook(() => useAwardDailyXp({ pubkey: PK, publish: vi.fn(), writeProfile: writerOver(net, signs) }), { wrapper });
    await expect(result.current.mutateAsync({ missions: finished() })).rejects.toThrow(/no-profile/);
    expect(net.newest()).toBeUndefined();
  });

  it('awarded over the newest profile (a companion chosen a moment ago kept), confirmed; a retry pays nothing more', async () => {
    const net = network();
    net.seed(profile({ at: S() - 2, companion: 'blobbi-a' }));
    const signs = { n: 0 };
    const { result } = renderHook(() => useAwardDailyXp({ pubkey: PK, publish: vi.fn(), writeProfile: writerOver(net, signs) }), { wrapper });
    const out = await result.current.mutateAsync({ missions: finished() });
    expect(out).toMatchObject({ xpAwarded: totalDailyXp(finished()), confirmed: true });
    expect(parseBlobbonautEvent(net.newest())).toMatchObject({ currentCompanion: 'blobbi-a', xp: 100 + out.xpAwarded });
    expect(parseProfileContent(net.newest().content).missions?.date).toBe(getTodayDateString());
    const again = await result.current.mutateAsync({ missions: finished() });
    expect(again).toMatchObject({ xpAwarded: 0, skipped: 'already-paid', newTotalXp: 100 + out.xpAwarded });
    expect(signs.n).toBe(1);
  });
});
