/**
 * useAwardDailyXp - Award XP for completed daily missions.
 *
 * Completion is implicit (derived from progress vs target). This hook
 * calculates the total XP earned today and persists the updated XP total to
 * the kind 11125 Blobbonaut profile tags, with the finished day in the
 * content (`missions`).
 *
 * NEVER A PARTIAL OR EMPTY PROFILE (0.10.0). The award is built over a profile
 * that was actually read, keeping every other tag (`current_companion`,
 * `has`, unknown tags) and every other content key. A read that found nothing
 * writes nothing (it throws): the 0.9 award published a profile with only the
 * xp and level tags after an empty read, replacing the player's profile.
 *
 * PAID ONCE PER DAY. A profile whose `missions` are already that day's and all
 * complete has been paid for it (the award writes them together with the XP):
 * the award then writes nothing (`skipped: 'already-paid'`), however many
 * retries, reloads, devices or apps ask. The day's missions are merged with
 * the profile's (`mergeDailyMissions`), so no progress is lost either.
 *
 * TWO MODES. With `writeProfile` (a `ProfileWriter`, e.g. core's
 * `writeProfileSafely` bound to the host's relays, signer and verifier) the
 * read is COMPLETE (every required relay answered) or nothing is written, the
 * award is never built over an older profile, and it runs in the account's
 * profile queue. Without it (as 0.9), the read is the quick `fetchFreshEvent`:
 * an empty read is refused, but a read that missed a newer profile cannot be
 * told apart, so hosts should pass `writeProfile`.
 *
 * Headless and app-agnostic: it surfaces success/error through the returned
 * mutation (and optional callbacks) so the host app can render its own user
 * feedback. The host supplies the owner `pubkey`, a `publish` function (legacy
 * mode), and an optional cache-update callback.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@blobbi-kit/core/nostr-protocol';

import { KIND_BLOBBONAUT_PROFILE, updateBlobbonautTags, parseBlobbonautEvent } from '@blobbi-kit/core/blobbi';
import { buildXpTagUpdates } from '@blobbi-kit/core/progression';
import { mergeDailyMissions, parseProfileContent, serializeProfileContent } from '@blobbi-kit/core/missions';
import type { MissionsContent } from '@blobbi-kit/core/missions';
import { fetchFreshEvent } from '@blobbi-kit/core/fetchFreshEvent';

import { areAllDailyComplete, totalDailyXp } from '../lib/daily-missions';

import type { ProfileWriter, PublishAdapter } from '../adapters/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAwardDailyXpOptions {
  /** Owner hex pubkey. When absent (logged out), awarding throws. */
  pubkey: string | undefined;
  /** Publishes the updated kind 11125 profile event (host `useNostrPublish`). Legacy mode only. */
  publish: PublishAdapter['publish'];
  /** Optional callback to update the profile event in the host's query cache. */
  updateProfileEvent?: (event: NostrEvent) => void;
  /** The host's safe profile writer: complete reads, never over an older profile (recommended). */
  writeProfile?: ProfileWriter;
  /**
   * Optional success callback, forwarded to the underlying mutation. Hosts use
   * this to surface user feedback (toasts, etc.) — the hook itself stays UI-free.
   */
  onSuccess?: (result: AwardDailyXpResult, variables: AwardDailyXpRequest) => void;
  /**
   * Optional error callback, forwarded to the underlying mutation. Hosts use
   * this to surface user feedback (toasts, etc.) — the hook itself stays UI-free.
   */
  onError?: (error: Error, variables: AwardDailyXpRequest) => void;
}

export interface AwardDailyXpRequest {
  /** Current missions state to calculate XP from */
  missions: MissionsContent;
}

export interface AwardDailyXpResult {
  xpAwarded: number;
  newTotalXp: number;
  /** Set when nothing was written: the day was paid already, or its missions are not all complete. */
  skipped?: 'already-paid' | 'not-complete';
  /** Safe mode: whether the award was read back from the relays. */
  confirmed?: boolean;
}

/** Whether a profile's content says `date` has been paid: that day's missions, all complete (the award writes them). */
export function isDailyXpPaid(content: string, date: string): boolean {
  const missions = parseProfileContent(content).missions;
  return !!missions && missions.date === date && areAllDailyComplete(missions);
}

type AwardPlan = { kind: 'award'; xp: number; newTotalXp: number; content: string; tags: string[][] } | { kind: 'skip'; reason: 'already-paid' | 'not-complete'; currentXp: number };

/** The award over a profile that was read: paid once, the day's missions merged, every other tag and key kept. */
function planAward(base: NostrEvent, missions: MissionsContent): AwardPlan {
  const currentXp = parseBlobbonautEvent(base)?.xp ?? 0;
  if (isDailyXpPaid(base.content, missions.date)) return { kind: 'skip', reason: 'already-paid', currentXp };
  const merged = mergeDailyMissions(parseProfileContent(base.content).missions, missions, missions.date) ?? missions;
  if (!areAllDailyComplete(merged)) return { kind: 'skip', reason: 'not-complete', currentXp };
  const xp = totalDailyXp(merged);
  if (xp <= 0) return { kind: 'skip', reason: 'not-complete', currentXp };
  const newTotalXp = currentXp + xp;
  return { kind: 'award', xp, newTotalXp, content: serializeProfileContent(base.content, { missions: merged }), tags: updateBlobbonautTags(base.tags, buildXpTagUpdates(newTotalXp)) };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAwardDailyXp(
  options: UseAwardDailyXpOptions,
): UseMutationResult<AwardDailyXpResult, Error, AwardDailyXpRequest> {
  const { pubkey, publish, updateProfileEvent, writeProfile, onSuccess, onError } = options;
  const { nostr } = useNostr();

  return useMutation<AwardDailyXpResult, Error, AwardDailyXpRequest>({
    mutationFn: async ({ missions }): Promise<AwardDailyXpResult> => {
      if (!pubkey) throw new Error('Must be logged in');
      if (totalDailyXp(missions) <= 0) return { xpAwarded: 0, newTotalXp: 0, skipped: 'not-complete' };

      if (writeProfile) {
        let plan: AwardPlan | null = null;
        const out = await writeProfile(pubkey, (base) => {
          if (!base) return { skip: 'no-profile' };
          plan = planAward(base, missions);
          return plan.kind === 'award' ? { template: { kind: KIND_BLOBBONAUT_PROFILE, content: plan.content, tags: plan.tags } } : { skip: plan.reason };
        });
        const decided = plan as AwardPlan | null;
        if (out.kind === 'sent' && decided?.kind === 'award') {
          updateProfileEvent?.(out.event);
          return { xpAwarded: decided.xp, newTotalXp: decided.newTotalXp, confirmed: out.confirmed };
        }
        if (out.kind === 'skipped' && decided?.kind === 'skip') return { xpAwarded: 0, newTotalXp: decided.currentXp, skipped: decided.reason };
        throw new Error(out.kind === 'failed' ? out.message : `The daily XP was not saved (${out.kind}): nothing was written.`);
      }

      // Legacy mode: the quick read. An empty read writes nothing.
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [pubkey],
      });
      if (!prev) throw new Error('Your Blobbonaut profile could not be read: nothing was written.');

      const plan = planAward(prev, missions);
      if (plan.kind === 'skip') return { xpAwarded: 0, newTotalXp: plan.currentXp, skipped: plan.reason };

      const event = await publish({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: plan.content,
        tags: plan.tags,
        prev,
      });

      updateProfileEvent?.(event);

      return { xpAwarded: plan.xp, newTotalXp: plan.newTotalXp };
    },
    onSuccess,
    onError,
  });
}
