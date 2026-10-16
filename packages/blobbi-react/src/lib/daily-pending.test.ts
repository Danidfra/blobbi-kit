import { describe, it, expect } from 'vitest';
import { missionProgress, type MissionsContent } from '@blobbi-kit/core/missions';
import type { StorageAdapter } from '../adapters/types';
import { createDailyMissionsContent, getTodayDateString } from './daily-missions';
import { clearPendingDailyIf, dailyPendingKey, loadPendingDaily, savePendingDaily } from './daily-pending';

const PK = 'e'.repeat(64);
const OTHER = 'f'.repeat(64);
const TODAY = getTodayDateString();

function memory(): StorageAdapter & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}
const day = () => createDailyMissionsContent(TODAY, PK, ['baby', 'adult']);
function withProgress(m: MissionsContent, counts: number[]): MissionsContent {
  return { ...m, daily: m.daily.map((x, i) => ('count' in x ? { ...x, count: Math.min(x.target, counts[i] ?? 0) } : { ...x, events: Array.from({ length: Math.min(x.target, counts[i] ?? 0) }, (_, k) => `e${k}`) })) };
}

describe('pending daily progress (through the host storage)', () => {
  it('kept per account; merged with what is already pending (never loses progress); updatedAt only goes up', () => {
    const s = memory();
    const first = savePendingDaily(s, PK, withProgress(day(), [1, 0, 0]), 1_000)!;
    const second = savePendingDaily(s, PK, withProgress(day(), [0, 1, 0]), 500)!;
    expect(second.missions.daily.slice(0, 2).map(missionProgress)).toEqual([1, 1].map((v, i) => Math.min(v, day().daily[i].target)));
    expect(second.updatedAt).toBe(first.updatedAt + 1);
    expect(loadPendingDaily(s, OTHER)).toBeNull();
    expect([...s.map.keys()]).toEqual([dailyPendingKey(PK)]);
  });

  it('cleared only by the write that carried this very version; another day is dropped; junk is ignored', () => {
    const s = memory();
    const kept = savePendingDaily(s, PK, withProgress(day(), [1, 0, 0]), 1_000)!;
    const newer = savePendingDaily(s, PK, withProgress(day(), [1, 1, 0]), 2_000)!;
    expect(clearPendingDailyIf(s, PK, kept.updatedAt)).toBe(false);
    expect(loadPendingDaily(s, PK)).not.toBeNull();
    expect(clearPendingDailyIf(s, PK, newer.updatedAt)).toBe(true);
    expect(loadPendingDaily(s, PK)).toBeNull();

    savePendingDaily(s, PK, withProgress(day(), [1, 0, 0]), 1_000);
    expect(loadPendingDaily(s, PK, '2999-01-01')).toBeNull();
    expect(s.map.size).toBe(0);
    s.setItem(dailyPendingKey(PK), '{not json');
    expect(loadPendingDaily(s, PK)).toBeNull();
    s.setItem(dailyPendingKey(PK), JSON.stringify({ v: 1, pubkey: OTHER, missions: day(), updatedAt: 1 }));
    expect(loadPendingDaily(s, PK)).toBeNull();
  });

  it('a storage that refuses: nothing kept, the caller is told (null); a storage that throws on read: nothing pending', () => {
    const refusing: StorageAdapter = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(savePendingDaily(refusing, PK, day(), 1)).toBeNull();
    const broken: StorageAdapter = { getItem: () => { throw new Error('denied'); }, setItem: () => {}, removeItem: () => {} };
    expect(loadPendingDaily(broken, PK)).toBeNull();
  });
});
