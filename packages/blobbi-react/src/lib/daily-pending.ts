/**
 * Daily progress not saved to the profile yet, kept by the HOST's storage
 * (`StorageAdapter`: localStorage, IndexedDB-backed, native storage, ...), so
 * it survives a reload, a restart, a closed tab and relays that are down.
 * This package touches no browser storage itself.
 *
 * One record per account (`blobbi-kit:daily-pending:v1:<pubkey>`), public
 * data only (the day's missions). It is written BEFORE anything goes to the
 * network, merged with what is already there (`mergeDailyMissions`, so a
 * second tab or a reroll never loses progress), and cleared only once a
 * profile holding it is confirmed (`clearPendingDailyIf`, and only if no new
 * progress arrived meanwhile). A record of another day is dropped.
 */
import { mergeDailyMissions, parseMissionsValue, type MissionsContent } from '@blobbi-kit/core/missions';
import type { StorageAdapter } from '../adapters/types';
import { getTodayDateString } from './daily-missions';

export const DAILY_PENDING_VERSION = 1;
export const dailyPendingKey = (pubkey: string): string => `blobbi-kit:daily-pending:v${DAILY_PENDING_VERSION}:${pubkey}`;

export interface PendingDailyProgress {
  v: typeof DAILY_PENDING_VERSION;
  pubkey: string;
  /** The day's missions as this device has them (today only). */
  missions: MissionsContent;
  /** When it last changed (ms; strictly increasing per account): the write that clears it must have seen this one. */
  updatedAt: number;
}

function read(storage: StorageAdapter, pubkey: string): PendingDailyProgress | null {
  try {
    const raw = storage.getItem(dailyPendingKey(pubkey));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingDailyProgress>;
    const missions = parseMissionsValue(v.missions);
    if (v.v !== DAILY_PENDING_VERSION || v.pubkey !== pubkey || !missions || typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt)) return null;
    return { v: DAILY_PENDING_VERSION, pubkey, missions, updatedAt: v.updatedAt };
  } catch {
    return null;
  }
}

function remove(storage: StorageAdapter, pubkey: string): void {
  try {
    storage.removeItem(dailyPendingKey(pubkey));
  } catch {
    /* nothing to do */
  }
}

/** Today's pending progress for this account, or null. A record of another day is removed. */
export function loadPendingDaily(storage: StorageAdapter, pubkey: string, today: string = getTodayDateString()): PendingDailyProgress | null {
  const p = read(storage, pubkey);
  if (p && p.missions.date !== today) {
    remove(storage, pubkey);
    return null;
  }
  return p;
}

/**
 * Keep the day's missions as pending, merged with what is already pending (never losing progress). Null when the
 * storage refused (the progress is then only in this page: the caller should say so).
 */
export function savePendingDaily(storage: StorageAdapter, pubkey: string, missions: MissionsContent, now: number = Date.now(), today: string = getTodayDateString()): PendingDailyProgress | null {
  const before = loadPendingDaily(storage, pubkey, today);
  const merged = mergeDailyMissions(before?.missions, missions, today);
  if (!merged) return before;
  const record: PendingDailyProgress = { v: DAILY_PENDING_VERSION, pubkey, missions: merged, updatedAt: Math.max(now, (before?.updatedAt ?? 0) + 1) };
  try {
    storage.setItem(dailyPendingKey(pubkey), JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

/** Clear the pending record, only if it is still the one a confirmed write carried (`updatedAt`). */
export function clearPendingDailyIf(storage: StorageAdapter, pubkey: string, updatedAt: number): boolean {
  const now = read(storage, pubkey);
  if (!now || now.updatedAt !== updatedAt) return false;
  remove(storage, pubkey);
  return true;
}
