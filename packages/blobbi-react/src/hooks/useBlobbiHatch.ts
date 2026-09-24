/**
 * Headless hook for the Blobbi hatch stage transition (egg -> baby).
 *
 * The canonical hatch, as Ditto's ceremony has published it since the modern
 * contract: the same `d`, the same `seed` (and therefore the same colours,
 * pattern, mark and future adult form), `stage` flipped to `baby`, every stat
 * to the maximum (a newborn starts fresh), the care streak credited, the
 * egg's task and progression tags cleaned up, and the baby placed straight
 * into `evolving` with a fresh set of evolve missions in the event content.
 *
 * `planHatchTransition` is the pure part: canonical event in, event template
 * out. `useBlobbiHatch` wraps it exactly like {@link useBlobbiEvolve} wraps
 * the evolve transition, so a host wires both the same way (publish adapter,
 * fresh read, cache update) and renders its own ceremony around them.
 *
 * Eligibility is NOT checked here beyond `stage === 'egg'`: the hatch
 * missions (`useHatchTasks().allCompleted`) are a host gate, as they are for
 * evolve, so a host can also offer a dev-only or ceremony-driven hatch.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { NostrEvent } from '@blobbi-kit/core/nostr-protocol';

import type { BlobbiCompanion, BlobbonautProfile } from '@blobbi-kit/core/blobbi';
import { KIND_BLOBBI_STATE, STAT_MAX, updateBlobbiTags } from '@blobbi-kit/core/blobbi';
import { validateAndRepairBlobbiTags } from '@blobbi-kit/core/blobbi-tag-schema';
import { serializeEvolutionContent } from '@blobbi-kit/core/missions';

import { clearEvolutionFromStorage, writeEvolutionToStorage } from '../lib/daily-mission-tracker';
import { createEvolveMissions } from '../lib/evolution-missions';
import { getStreakTagUpdates } from '../lib/blobbi-streak';

import type { PublishAdapter, PublishEventTemplate } from '../adapters/types';
import type { CanonicalActionResult, StageTransitionResult } from './useBlobbiEvolve';

// ─── Pure planning ───────────────────────────────────────────────────────────

export interface HatchTransitionOptions {
  /**
   * Put the newborn straight into `evolving` with fresh evolve missions, as
   * Ditto's ceremony does. `false` leaves it in `progression_state: none` so
   * the host (or the player) starts evolution deliberately. Default `true`.
   */
  startEvolution?: boolean;
}

export interface HatchTransitionPlan {
  /** The kind 31124 republish, ready for a publish adapter. */
  event: PublishEventTemplate & { kind: typeof KIND_BLOBBI_STATE; content: string; tags: string[][]; prev: NostrEvent };
  /** The evolve missions written into the content (empty when evolution is not started). */
  evolution: ReturnType<typeof createEvolveMissions>;
}

/**
 * Plan the egg -> baby republish from a fresh canonical read. Pure.
 *
 * Throws when the companion is not an egg or the merged tags fail the tag
 * integrity guard (which never invents identity: `seed`, `d`, `name`).
 */
export function planHatchTransition(
  canonical: CanonicalActionResult,
  now: number,
  options: HatchTransitionOptions = {},
): HatchTransitionPlan {
  const { startEvolution = true } = options;
  const companion = canonical.companion;
  if (companion.stage !== 'egg') {
    throw new Error(companion.stage === 'baby' ? 'This Blobbi has already hatched' : 'Only eggs can hatch');
  }

  const nowStr = now.toString();
  const max = STAT_MAX.toString();
  const streakUpdates = getStreakTagUpdates(companion) ?? {};

  // Identity rides through `updateBlobbiTags`: `d`, `seed`, `name`,
  // `visual_generation` and every unknown tag are kept, and the six mirror
  // trait tags are re-derived from the seed, so the baby is the same Blobbi.
  const mergedTags = updateBlobbiTags(canonical.allTags, {
    stage: 'baby',
    state: 'active',
    hunger: max,
    happiness: max,
    health: max,
    hygiene: max,
    energy: max,
    ...streakUpdates,
    last_interaction: nowStr,
    last_decay_at: nowStr,
  });

  // The integrity guard removes the egg's task and progression tags
  // (`getTransitionCleanupTagNames`) and repairs anything stage-specific.
  const repair = validateAndRepairBlobbiTags(mergedTags, canonical.allTags, { cleanupTaskTags: true });
  if (repair.errors.length > 0) {
    throw new Error(`Tag validation failed: ${repair.errors.join(', ')}`);
  }

  // Progression is set AFTER the cleanup, which cleared it.
  const evolution = startEvolution ? createEvolveMissions() : [];
  const tags = updateBlobbiTags(
    repair.tags,
    startEvolution
      ? { progression_state: 'evolving', progression_started_at: nowStr }
      : { progression_state: 'none' },
  );

  // Content starts over: the egg's hatch missions are done with. (Ditto
  // resets to `{}` here too; keys such as `social_checkpoint` do not survive
  // a hatch in any host.)
  const content = serializeEvolutionContent(JSON.stringify({}), evolution);

  return {
    event: { kind: KIND_BLOBBI_STATE, content, tags, prev: companion.event },
    evolution,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseBlobbiHatchParams {
  companion: BlobbiCompanion | null;
  profile: BlobbonautProfile | null;
  /** Owner hex pubkey. When absent (logged out), hatching throws. */
  pubkey: string | undefined;
  /** Publishes the updated kind 31124 companion event (host publish adapter). */
  publish: PublishAdapter['publish'];
  /** Called to fetch fresh companion + profile data before acting. */
  ensureCanonicalBeforeAction: () => Promise<CanonicalActionResult | null>;
  /** Update companion event in local cache. */
  updateCompanionEvent: (event: NostrEvent) => void;
  /** See {@link HatchTransitionOptions}. */
  startEvolution?: boolean;
  onSuccess?: (result: StageTransitionResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to hatch an egg into a baby.
 *
 * Transition: egg -> baby. Same `d`, same `seed`. Stats reset to the
 * maximum, streak credited, egg tasks cleaned up, evolution started (by
 * default) with fresh missions. The hatch missions are a host gate.
 */
export function useBlobbiHatch({
  companion,
  profile,
  pubkey,
  publish,
  ensureCanonicalBeforeAction,
  updateCompanionEvent,
  startEvolution = true,
  onSuccess,
  onError,
}: UseBlobbiHatchParams): UseMutationResult<StageTransitionResult, Error, void> {
  return useMutation<StageTransitionResult, Error, void>({
    mutationFn: async (): Promise<StageTransitionResult> => {
      if (!pubkey) throw new Error('You must be logged in to hatch');
      if (!companion) throw new Error('No companion selected');
      if (!profile) throw new Error('Profile not found');
      if (companion.stage !== 'egg') {
        throw new Error(companion.stage === 'baby' ? 'This Blobbi has already hatched' : 'Only eggs can hatch');
      }

      const canonical = await ensureCanonicalBeforeAction();
      if (!canonical) throw new Error('Failed to prepare companion for hatching');

      const now = Math.floor(Date.now() / 1000);
      const plan = planHatchTransition(canonical, now, { startEvolution });

      const event = await publish(plan.event);
      updateCompanionEvent(event);

      // The egg's hatch missions are finished; the newborn's evolve missions
      // become the session store so task hooks pick them up at once.
      clearEvolutionFromStorage(pubkey, canonical.companion.d);
      if (plan.evolution.length > 0) writeEvolutionToStorage(plan.evolution, pubkey, canonical.companion.d);

      return {
        previousStage: 'egg',
        newStage: 'baby',
        name: canonical.companion.name,
        decayedStats: { hunger: STAT_MAX, happiness: STAT_MAX, health: STAT_MAX, hygiene: STAT_MAX, energy: STAT_MAX },
      };
    },
    onSuccess,
    onError,
  });
}
