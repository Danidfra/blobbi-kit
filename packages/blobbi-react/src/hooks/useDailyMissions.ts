/**
 * useDailyMissions - Hook for reading daily mission state
 *
 * Provides reactive access to the current day's daily missions.
 * Progress tracking is done via the tracker module (non-React).
 * Completion is implicit (derived from count/events vs target).
 * XP is awarded automatically when missions complete.
 *
 * State lives in a pubkey-scoped in-memory Map. On mount or account
 * switch, hydrates from kind 11125 content JSON if the session store
 * is empty. Completed missions are persisted by `useAwardDailyXp`;
 * intermediate progress resets on page refresh.
 *
 * NOTE: Evolution missions are NOT managed here. They live on kind 31124
 * (per-Blobbi) and are handled by the evolution session store.
 */

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';

import type { MissionsContent } from '@blobbi-kit/core/missions';
import { isMissionComplete, missionProgress } from '@blobbi-kit/core/missions';
import { parseProfileContent } from '@blobbi-kit/core/missions';

import {
  type BlobbiStage,
  type DailyMissionAction,
  getTodayDateString,
  needsDailyReset,
  createDailyMissionsContent,
  areAllDailyComplete,
  totalDailyXp,
  getDefinition,
  MAX_DAILY_REROLLS,
  DAILY_BONUS_XP,
} from '@blobbi-kit/react/lib/daily-missions';

import {
  mergeIntoDailyStore,
  readDailyFromStorage,
  writeDailyToStorage,
} from '@blobbi-kit/react/lib/daily-mission-tracker';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyMissionView {
  /** Mission ID (matches pool definition) */
  id: string;
  /** Display title */
  title: string;
  /** Description */
  description: string;
  /** Action type */
  action: DailyMissionAction;
  /** Required count */
  target: number;
  /** Current progress */
  progress: number;
  /** Whether mission is complete */
  complete: boolean;
  /** XP reward */
  xp: number;
}

export interface UseDailyMissionsOptions {
  /**
   * The owner's hex pubkey. Missions are scoped per pubkey. When absent
   * (logged out), the hook behaves as it did for logged-out users: the
   * session store is keyed on the empty string and no persisted data hydrates.
   */
  pubkey?: string;
  /** Available Blobbi stages the user has (filters eligible missions) */
  availableStages?: BlobbiStage[];
  /**
   * Raw content string from the kind 11125 profile event.
   * Pass `profile.content` here. The hook parses it to extract
   * persisted daily missions and hydrates the session store on first load.
   */
  profileContent?: string;
}

export interface UseDailyMissionsResult {
  /** Today's daily missions with computed progress */
  missions: DailyMissionView[];
  /** The raw missions content (for persistence/mutation hooks) */
  raw: MissionsContent | undefined;
  /** Whether all daily missions are complete */
  allComplete: boolean;
  /** Total XP earned today (completed missions + bonus) */
  todayXp: number;
  /** Whether the daily bonus is unlocked (all missions complete) */
  bonusUnlocked: boolean;
  /** Bonus XP amount */
  bonusXp: number;
  /**
   * Whether the account has no hatched (baby/adult) Blobbi at all.
   * True only when availableStages contains neither 'baby' nor 'adult'.
   * NOT a loading indicator — use `isLoading` for that.
   */
  noMissionsAvailable: boolean;
  /** Whether the hook is still hydrating and missions aren't ready yet */
  isLoading: boolean;
  /** Rerolls remaining today */
  rerollsRemaining: number;
  /** Max rerolls per day */
  maxRerolls: number;
  /** Force refresh missions (testing) */
  forceReset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyMissions(options: UseDailyMissionsOptions = {}): UseDailyMissionsResult {
  const { pubkey, availableStages, profileContent } = options;

  // Version counter to trigger re-reads from session store
  const [version, setVersion] = useState(0);

  // Track whether we've hydrated for this pubkey
  const hydratedRef = useRef<string | null>(null);

  // Hydrate the session store from the kind 11125 content: on mount, on account switch, and whenever the profile
  // changes (a save from this app, another device, another Blobbi app). The profile's missions are MERGED into what
  // this page already has (`mergeIntoDailyStore`, `mergeDailyMissions`): progress made here before the profile
  // arrived, or not saved yet, is never overwritten by an older profile. A merge never starts a save.
  // If profileContent hasn't loaded yet, we still mark as hydrated so the hook can generate fresh missions.
  useEffect(() => {
    if (!pubkey) return;

    if (profileContent) {
      const parsed = parseProfileContent(profileContent);
      if (parsed.missions) mergeIntoDailyStore(parsed.missions, pubkey);
    }

    if (hydratedRef.current !== pubkey) {
      hydratedRef.current = pubkey;
      setVersion((v) => v + 1);
    }
  }, [pubkey, profileContent]);

  // Listen for tracker events
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener('daily-missions-updated', handler);
    return () => window.removeEventListener('daily-missions-updated', handler);
  }, []);

  // Stable stages key for deps
  const stagesKey = availableStages?.sort().join(',') ?? '';

  // Read and ensure current state.
  // CRITICAL: Don't create a fresh store entry until hydration is complete.
  const hydrated = hydratedRef.current === pubkey;
  const raw = useMemo((): MissionsContent | undefined => {
    const stored = readDailyFromStorage(pubkey);

    if (!needsDailyReset(stored)) return stored;

    // If the store is empty and we haven't hydrated yet, wait for the
    // hydration effect to seed persisted data before creating fresh missions.
    if (!stored && !hydrated) return undefined;

    // Reset for new day
    const fresh = createDailyMissionsContent(
      getTodayDateString(),
      pubkey,
      availableStages,
    );
    writeDailyToStorage(fresh, pubkey);
    return fresh;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, pubkey, stagesKey, hydrated]);

  // Build view models
  const missions: DailyMissionView[] = useMemo(() => {
    if (!raw?.daily) return [];
    return raw.daily.map((m) => {
      const def = getDefinition(m.id);
      return {
        id: m.id,
        title: def?.title ?? m.id,
        description: def?.description ?? '',
        action: def?.action ?? 'interact',
        target: m.target,
        progress: missionProgress(m),
        complete: isMissionComplete(m),
        xp: def?.xp ?? 0,
      };
    });
  }, [raw]);

  const allComplete = raw ? areAllDailyComplete(raw) : false;
  const todayXp = raw ? totalDailyXp(raw) : 0;
  const bonusUnlocked = allComplete;
  // noMissionsAvailable means the account genuinely has no hatched Blobbi.
  // It does NOT reflect loading state — use `isLoading` for that.
  const hasHatchedStage = availableStages
    ? availableStages.includes('baby') || availableStages.includes('adult')
    : true; // default to true (assume hatched) when stages aren't known yet
  const noMissionsAvailable = !hasHatchedStage;
  const isLoading = !raw && hasHatchedStage;
  const rerollsRemaining = raw?.rerolls ?? MAX_DAILY_REROLLS;

  const forceReset = useCallback(() => {
    const fresh = createDailyMissionsContent(
      getTodayDateString(),
      pubkey,
      availableStages,
    );
    writeDailyToStorage(fresh, pubkey);
    setVersion((v) => v + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, stagesKey]);

  return {
    missions,
    raw,
    allComplete,
    todayXp,
    bonusUnlocked,
    bonusXp: DAILY_BONUS_XP,
    noMissionsAvailable,
    isLoading,
    rerollsRemaining,
    maxRerolls: MAX_DAILY_REROLLS,
    forceReset,
  };
}
