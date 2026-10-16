import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { NostrEvent } from '@blobbi-kit/core/nostr-protocol';
import { missionProgress, serializeProfileContent, type MissionsContent } from '@blobbi-kit/core/missions';

const query = vi.fn(async () => [] as NostrEvent[]);
vi.mock('@nostrify/react', () => ({ useNostr: () => ({ nostr: { query } }) }));

import { createDailyMissionsContent, getTodayDateString } from '../lib/daily-missions';
import { mergeIntoDailyStore, readDailyFromStorage, trackDailyMissionProgress, writeDailyToStorage } from '../lib/daily-mission-tracker';
import { useDailyMissions } from './useDailyMissions';
import { usePersistDailyProgress } from './usePersistDailyProgress';

/**
 * 0.10.0: the profile's missions are MERGED into this page's (never overwrite progress made here), on load and every
 * time the profile changes; a merge never starts a save.
 */

const STAGES = ['baby' as const, 'adult' as const];
let n = 0;
const freshKey = () => (++n).toString(16).padStart(64, 'c');
const today = () => createDailyMissionsContent(getTodayDateString(), undefined, STAGES);
/** The day's three missions for an account (the same three in this page and in the profile). */
function dayFor(pubkey: string): MissionsContent {
  return createDailyMissionsContent(getTodayDateString(), pubkey, STAGES);
}
function withProgress(m: MissionsContent, counts: number[]): MissionsContent {
  return { ...m, daily: m.daily.map((x, i) => ('count' in x ? { ...x, count: Math.min(x.target, counts[i] ?? 0) } : { ...x, events: Array.from({ length: Math.min(x.target, counts[i] ?? 0) }, (_, k) => `e${k}`) })) };
}
const content = (m: MissionsContent) => serializeProfileContent('{"room_layouts":{"v":1}}', { missions: m });
const progressOf = (m: MissionsContent | undefined) => m?.daily.map(missionProgress);

afterEach(() => {
  vi.useRealTimers();
  query.mockClear();
});

describe('useDailyMissions: the profile is merged in, never written over progress made here', () => {
  it('progress made here before the profile arrived is kept; the profile\'s own progress is added in', () => {
    const pk = freshKey();
    const base = dayFor(pk);
    writeDailyToStorage(withProgress(base, [1, 0, 0]), pk);
    const { rerender } = renderHook(({ c }) => useDailyMissions({ pubkey: pk, availableStages: STAGES, profileContent: c }), { initialProps: { c: undefined as string | undefined } });
    // An older profile, with progress on the second mission only
    rerender({ c: content(withProgress(base, [0, 1, 0])) });
    expect(progressOf(readDailyFromStorage(pk))).toEqual([1, 1, 0].map((v, i) => Math.min(v, base.daily[i].target)));
  });

  it('a profile changed later (another device or app) is merged again, without losing what is here', () => {
    const pk = freshKey();
    const base = dayFor(pk);
    const { rerender } = renderHook(({ c }) => useDailyMissions({ pubkey: pk, availableStages: STAGES, profileContent: c }), { initialProps: { c: content(withProgress(base, [0, 0, 0])) } });
    act(() => writeDailyToStorage(withProgress(base, [1, 0, 0]), pk));
    rerender({ c: content(withProgress(base, [0, 0, 1])) });
    expect(progressOf(readDailyFromStorage(pk))).toEqual([1, 0, 1].map((v, i) => Math.min(v, base.daily[i].target)));
  });

  it("another day's profile is ignored", () => {
    const pk = freshKey();
    const base = dayFor(pk);
    writeDailyToStorage(withProgress(base, [1, 0, 0]), pk);
    const yesterday = { ...withProgress(base, [5, 5, 5]), date: '2000-01-01' };
    renderHook(() => useDailyMissions({ pubkey: pk, availableStages: STAGES, profileContent: content(yesterday) }));
    expect(progressOf(readDailyFromStorage(pk))).toEqual([1, 0, 0].map((v, i) => Math.min(v, base.daily[i].target)));
  });

  it('a merge never starts a save (only something done in the app does)', async () => {
    vi.useFakeTimers();
    const pk = freshKey();
    const base = dayFor(pk);
    const publish = vi.fn(async () => ({}) as NostrEvent);
    const { rerender } = renderHook(({ c }) => {
      useDailyMissions({ pubkey: pk, availableStages: STAGES, profileContent: c });
      usePersistDailyProgress({ pubkey: pk, publish });
    }, { initialProps: { c: content(withProgress(base, [1, 0, 0])) } });
    rerender({ c: content(withProgress(base, [1, 1, 0])) });
    act(() => void mergeIntoDailyStore(withProgress(base, [1, 1, 1]), pk));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(publish).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    // Something done in the app does start one (the existing 3 s save)
    act(() => trackDailyMissionProgress('interact', 1, pk));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500);
    });
    expect(query).toHaveBeenCalled();
  });

  it('mergeIntoDailyStore: only today, never loses progress, says nothing when nothing changed', () => {
    const pk = freshKey();
    const base = today();
    const seen: unknown[] = [];
    const listen = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('daily-missions-updated', listen);
    mergeIntoDailyStore(withProgress(base, [2, 0, 0]), pk);
    mergeIntoDailyStore(withProgress(base, [1, 0, 0]), pk);
    mergeIntoDailyStore({ ...withProgress(base, [9, 9, 9]), date: '2000-01-01' }, pk);
    window.removeEventListener('daily-missions-updated', listen);
    expect(progressOf(readDailyFromStorage(pk))?.[0]).toBe(Math.min(2, base.daily[0].target));
    expect(seen).toEqual([{ hydrated: true }]);
  });
});
