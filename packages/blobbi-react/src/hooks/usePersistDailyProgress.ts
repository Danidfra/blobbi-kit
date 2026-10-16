/**
 * usePersistDailyProgress - Keeps daily mission progress in the kind 11125
 * Blobbonaut profile content (`missions`) so it survives a reload and other
 * apps see it.
 *
 * Daily missions live in the per-user session store (keyed by pubkey). This
 * hook listens for `daily-missions-updated` (fired by the tracker when
 * something is done in the app) and saves the day's progress. It never saves
 * a finished day (every mission complete): the host's XP award writes that
 * state together with the XP. It ignores evolution updates (their own hook)
 * and merges of a copy read from elsewhere (`hydrated`).
 *
 * TWO MODES.
 *
 * Safe mode (0.10.0): the host passes BOTH `storage` (a `StorageAdapter`) and
 * `writeProfile` (a `ProfileWriter`, e.g. core's `writeProfileSafely` bound to
 * its relays, signer and verifier):
 *   - progress is kept as PENDING in the host's storage the moment it
 *     happens, before any network work, so a reload, a restart, a closed tab
 *     or relays that are down never lose it; on load it is merged back in;
 *   - 3 s after something was done in the app, it is written over the NEWEST
 *     profile (a complete read; never over an older profile, so
 *     `current_companion`, `has`, unknown tags and other content stay as the
 *     newest profile has them), with the profile's own progress merged in
 *     (`mergeDailyMissions`, never lost);
 *   - pending is cleared only when the write is confirmed (read back), and
 *     only if no new progress arrived meanwhile;
 *   - it NEVER saves (so never asks a signer) by itself on load, on a tab
 *     hide, on unmount or on a timer after a failure: what is pending waits,
 *     said in `status`, for the player's `save()` (or the next thing done in
 *     the app).
 *
 * Legacy mode (no `storage`/`writeProfile`, as 0.9): progress kept in memory
 * only, saved 3 s after an update, on a tab hide and on unmount, over a quick
 * read (`fetchFreshEvent`). One change from 0.9: the content's missions are
 * MERGED with the profile's instead of replacing them, so another app's
 * progress for the day is never written over. The legacy write still copies
 * the tags of what it read; only safe mode guarantees it never builds over an
 * older profile.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@blobbi-kit/core/nostr-protocol';

import { KIND_BLOBBONAUT_PROFILE } from '@blobbi-kit/core/blobbi';
import { mergeDailyMissions, parseProfileContent, serializeProfileContent, type MissionsContent } from '@blobbi-kit/core/missions';
import { fetchFreshEvent } from '@blobbi-kit/core/fetchFreshEvent';

import { mergeIntoDailyStore, readDailyFromStorage } from '../lib/daily-mission-tracker';
import { areAllDailyComplete, getTodayDateString } from '../lib/daily-missions';
import { clearPendingDailyIf, loadPendingDaily, savePendingDaily } from '../lib/daily-pending';

import type { ProfileWriter, PublishAdapter, StorageAdapter } from '../adapters/types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Delay before persisting daily progress (ms). */
const PERSIST_DELAY_MS = 3_000;

// ─── Options ──────────────────────────────────────────────────────────────────

export interface PersistDailyProgressOptions {
  /** Owner hex pubkey. When absent (logged out), the hook is inert. */
  pubkey: string | undefined;
  /** Publishes the updated kind 11125 profile event (host `useNostrPublish`). Legacy mode only. */
  publish: PublishAdapter['publish'];
  /** Optional callback to update the profile event in the host's query cache. */
  updateProfileEvent?: (event: NostrEvent) => void;
  /** Safe mode (with `writeProfile`): where pending progress is kept (the host's storage). */
  storage?: StorageAdapter;
  /** Safe mode (with `storage`): the host's safe profile writer. */
  writeProfile?: ProfileWriter;
  /** Safe mode: the profile's content as the host last read it (pending progress it already holds is cleared). */
  profileContent?: string;
}

export type DailyProgressStatus =
  /** Nothing waiting to be saved. */
  | { kind: 'idle' }
  /** Saved on this device, not yet in the profile: `save()` (or the next thing done in the app) sends it. */
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  /** Every mission is complete: the XP award saves the day (with the XP), not this hook. */
  | { kind: 'complete' }
  /** The last save did not land; the progress is still pending. */
  | { kind: 'failed'; reason: 'unsafe' | 'stale' | 'no-profile' | 'wrong-account' | 'failed' | 'unconfirmed' | 'storage'; message?: string };

export interface PersistDailyProgressState {
  /** Whether the hook runs in safe mode (both `storage` and `writeProfile` given). */
  safe: boolean;
  /** Safe mode: progress is waiting to be saved to the profile. */
  pending: boolean;
  status: DailyProgressStatus;
  /** Save now (the player's Save / Try again). Safe mode: the only way pending progress is saved without a new action. */
  save: () => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePersistDailyProgress(options: PersistDailyProgressOptions): PersistDailyProgressState {
  const safe = !!options.storage && !!options.writeProfile;
  const legacySave = useLegacyPersist(safe ? { ...options, pubkey: undefined } : options);
  const safeState = useSafePersist(safe ? options : { ...options, pubkey: undefined });
  if (safe) return safeState;
  return { safe: false, pending: false, status: { kind: 'idle' }, save: legacySave };
}

// ─── Safe mode ────────────────────────────────────────────────────────────────

const statusOfPending = (missions: MissionsContent | undefined): DailyProgressStatus => (!missions ? { kind: 'idle' } : areAllDailyComplete(missions) ? { kind: 'complete' } : { kind: 'pending' });

function useSafePersist({ pubkey, storage, writeProfile, updateProfileEvent, profileContent }: PersistDailyProgressOptions): PersistDailyProgressState {
  const [status, setStatus] = useState<DailyProgressStatus>({ kind: 'idle' });
  const live = useRef({ pubkey, storage, writeProfile, updateProfileEvent });
  live.current = { pubkey, storage, writeProfile, updateProfileEvent };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const write = useCallback(async (): Promise<void> => {
    const { pubkey: owner, storage: store, writeProfile: writer, updateProfileEvent: onEvent } = live.current;
    if (!owner || !store || !writer) return;
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const today = getTodayDateString();
    const pending = loadPendingDaily(store, owner, today);
    if (!pending) {
      setStatus({ kind: 'idle' });
      return;
    }
    if (areAllDailyComplete(pending.missions)) {
      setStatus({ kind: 'complete' });
      return;
    }
    setStatus({ kind: 'saving' });
    running.current = (async () => {
      let out: Awaited<ReturnType<ProfileWriter>>;
      try {
        out = await writer(owner, (base) => {
          if (!base) return { skip: 'no-profile' };
          const theirs = parseProfileContent(base.content).missions;
          const merged = mergeDailyMissions(theirs, pending.missions, today);
          if (!merged) return { skip: 'not-today' };
          // The profile holds all of it already: nothing to write
          if (JSON.stringify(merged) === JSON.stringify(mergeDailyMissions(theirs, undefined, today))) return { skip: 'up-to-date' };
          if (areAllDailyComplete(merged)) return { skip: 'complete' };
          return { template: { kind: KIND_BLOBBONAUT_PROFILE, content: serializeProfileContent(base.content, { missions: merged }), tags: base.tags } };
        });
      } catch (error) {
        setStatus({ kind: 'failed', reason: 'failed', message: error instanceof Error ? error.message : String(error) });
        return;
      }
      if (live.current.pubkey !== owner) return;
      switch (out.kind) {
        case 'sent':
          onEvent?.(out.event);
          if (!out.confirmed) {
            setStatus({ kind: 'failed', reason: 'unconfirmed' });
            return;
          }
          clearPendingDailyIf(store, owner, pending.updatedAt);
          setStatus(loadPendingDaily(store, owner) ? { kind: 'pending' } : { kind: 'saved' });
          return;
        case 'skipped':
          if (out.reason === 'complete') return setStatus({ kind: 'complete' });
          if (out.reason === 'no-profile') return setStatus({ kind: 'failed', reason: 'no-profile' });
          // Up to date (the profile holds it) or another day: nothing left to save
          clearPendingDailyIf(store, owner, pending.updatedAt);
          setStatus(loadPendingDaily(store, owner) ? { kind: 'pending' } : { kind: 'saved' });
          return;
        case 'failed':
          setStatus({ kind: 'failed', reason: 'failed', message: out.message });
          return;
        default:
          setStatus({ kind: 'failed', reason: out.kind });
      }
    })();
    try {
      await running.current;
    } finally {
      running.current = null;
    }
    if (again.current) {
      again.current = false;
      return write();
    }
  }, []);

  // On load and on an account switch: pending progress comes back into the session store (a merge: no save)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!pubkey || !storage) {
      setStatus({ kind: 'idle' });
      return;
    }
    const pending = loadPendingDaily(storage, pubkey);
    if (pending) mergeIntoDailyStore(pending.missions, pubkey);
    setStatus(statusOfPending(pending?.missions));
  }, [pubkey, storage]);

  // The profile now holds what was pending (saved here earlier, by another tab, or with the XP award): cleared
  useEffect(() => {
    if (!pubkey || !storage || !profileContent) return;
    const pending = loadPendingDaily(storage, pubkey);
    if (!pending) return;
    const today = getTodayDateString();
    const theirs = parseProfileContent(profileContent).missions;
    const merged = mergeDailyMissions(theirs, pending.missions, today);
    if (merged && theirs && JSON.stringify(merged) === JSON.stringify(mergeDailyMissions(theirs, undefined, today)) && clearPendingDailyIf(storage, pubkey, pending.updatedAt)) setStatus({ kind: 'saved' });
  }, [pubkey, storage, profileContent]);

  // Something done in the app: kept as pending at once (before any network), then saved 3 s later
  useEffect(() => {
    if (!pubkey || !storage) return;
    const onMissionUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.evolution || detail?.hydrated) return;
      const missions = readDailyFromStorage(pubkey);
      if (!missions || missions.daily.length === 0) return;
      const kept = savePendingDaily(storage, pubkey, missions);
      if (!kept) {
        setStatus({ kind: 'failed', reason: 'storage' });
        return;
      }
      setStatus(statusOfPending(kept.missions));
      if (areAllDailyComplete(kept.missions)) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void write();
      }, PERSIST_DELAY_MS);
    };
    window.addEventListener('daily-missions-updated', onMissionUpdate);
    return () => {
      window.removeEventListener('daily-missions-updated', onMissionUpdate);
      // Nothing is saved on unmount: it is pending in the host's storage already
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [pubkey, storage, write]);

  return { safe: true, pending: status.kind !== 'idle' && status.kind !== 'saved', status, save: write };
}

// ─── Legacy mode (0.9 behaviour, with the content's missions merged) ──────────

function useLegacyPersist(options: PersistDailyProgressOptions): () => Promise<void> {
  const { pubkey, publish, updateProfileEvent } = options;
  const { nostr } = useNostr();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishingRef = useRef(false);
  const pendingRef = useRef(false);
  /** Tracks whether there is unsaved progress (timer was set but hasn't fired yet). */
  const dirtyRef = useRef(false);

  // Store latest values in refs so the persist function always reads fresh
  // values without needing to be recreated (which would reset the timer).
  const pubkeyRef = useRef(pubkey);
  const nostrRef = useRef(nostr);
  const publishRef = useRef(publish);
  const updateProfileEventRef = useRef(updateProfileEvent);

  pubkeyRef.current = pubkey;
  nostrRef.current = nostr;
  publishRef.current = publish;
  updateProfileEventRef.current = updateProfileEvent;

  // Stable persist function that reads from refs — never changes identity.
  const persistRef = useRef(async () => {
    const pubkey = pubkeyRef.current;
    if (!pubkey) return;

    // If already publishing, mark pending so we re-run after completion.
    if (publishingRef.current) {
      pendingRef.current = true;
      return;
    }

    const missions = readDailyFromStorage(pubkey);
    if (!missions || missions.daily.length === 0) return;

    // Skip if all missions are complete — the host XP-award path is responsible
    // for writing the final state together with XP/level tags. Persisting here
    // would race with the XP-award write and could overwrite fresher tags.
    if (areAllDailyComplete(missions)) {
      dirtyRef.current = false;
      return;
    }

    publishingRef.current = true;
    try {
      // Fetch the fresh profile event from relays
      const prev = await fetchFreshEvent(nostrRef.current, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [pubkey],
      });

      // Safety: never publish a kind 11125 event without an existing profile.
      if (!prev) {
        console.warn('[PersistDailyProgress] No existing profile event found, skipping persist');
        return;
      }

      // Re-read missions after the async fetch. If missions became all-complete
      // while we were waiting (e.g. user completed the last mission during the
      // fetch), bail out — the host XP-award path owns the final write.
      const freshMissions = readDailyFromStorage(pubkey);
      if (!freshMissions || areAllDailyComplete(freshMissions)) return;

      // 0.10.0: the profile's own progress for the day is merged in, never written over
      const merged = mergeDailyMissions(parseProfileContent(prev.content).missions, freshMissions, freshMissions.date) ?? freshMissions;
      if (areAllDailyComplete(merged)) return;

      // Serialize only the missions field into content, preserving other keys
      const content = serializeProfileContent(prev.content, { missions: merged });

      // Skip publish if content hasn't changed
      if (content === prev.content) {
        dirtyRef.current = false;
        return;
      }

      const event = await publishRef.current({
        kind: KIND_BLOBBONAUT_PROFILE,
        content,
        // Preserve existing tags exactly — do NOT modify XP/level
        tags: prev.tags,
        prev,
      });

      dirtyRef.current = false;
      updateProfileEventRef.current?.(event);
    } catch (err) {
      console.warn('[PersistDailyProgress] Failed to persist:', err);
      // Keep dirtyRef true so a subsequent flush or pending retry can try again
    } finally {
      publishingRef.current = false;

      // If a persist was requested during this publish, re-schedule it.
      if (pendingRef.current) {
        pendingRef.current = false;
        dirtyRef.current = true;
        timerRef.current = setTimeout(() => {
          persistRef.current().catch((err) => {
            console.warn('[PersistDailyProgress] Pending persist error:', err);
          });
        }, PERSIST_DELAY_MS);
      }
    }
  });

  useEffect(() => {
    // Inert without an account (logged out, or safe mode running instead)
    if (!pubkey) return;
    // ─── Daily mission update handler (debounced) ───
    const onMissionUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      // Skip evolution updates — those are handled by usePersistEvolutionProgress — and merges of a copy read from
      // elsewhere (`hydrated`: the profile loading, a saved pending copy): nothing new happened in the app
      if (detail?.evolution || detail?.hydrated) return;

      dirtyRef.current = true;

      // Clear any pending timer and restart the debounce
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        persistRef.current().catch((err) => {
          console.warn('[PersistDailyProgress] Persist error:', err);
        });
      }, PERSIST_DELAY_MS);
    };

    // ─── Visibility change handler (flush on hide) ───
    // When the page becomes hidden (tab close, navigate away, lock screen),
    // flush any pending progress immediately rather than waiting for the
    // debounce timer that would be cleared by unmount/page destruction.
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      if (!dirtyRef.current) return;

      // Cancel the pending debounce timer — we're flushing now
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Fire-and-forget: attempt to persist. If the page is being destroyed
      // the WebSocket send may not complete, but for tab-switch / mobile-lock
      // scenarios this reliably persists before the JS context is suspended.
      persistRef.current().catch(() => {
        // Best-effort — page may be closing
      });
    };

    window.addEventListener('daily-missions-updated', onMissionUpdate);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Capture ref for cleanup (React lint rule: ref may change before cleanup runs)
    const persist = persistRef.current;

    return () => {
      window.removeEventListener('daily-missions-updated', onMissionUpdate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);

      // Flush on unmount (SPA navigation away from /blobbi) if there's
      // unsaved progress. Fire-and-forget — do not block navigation.
      if (dirtyRef.current) {
        persist().catch(() => {
          // Best-effort — component is already gone
        });
      }
    };
  }, [pubkey]);

  return useCallback(() => persistRef.current(), []);
}
