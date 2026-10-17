/**
 * FOLLOWING THE PLAYER (M16.1): a Blobbi that is in another World comes over by itself after a few meaningful
 * interactions with this one, the way a pet notices you are playing nearby. One stray press does not pull it out of
 * the World it was just moved to; a few, within a short while, do.
 *
 * This is the pure count only. Which inputs are meaningful stays each World's business (a trusted press or key in a
 * visible, focused page, a distinct burst of movement), never a load, a timer, focus, visibility, a re-render or a
 * script's event. The session (`interact`) feeds it and starts the move.
 *
 *   - an auto-repeat of a held key is never counted (the World says so with `repeat`);
 *   - inputs closer than `gapMs` to the last counted one are the same gesture (a pointerdown and its keydown, a
 *     double tap, frames of one movement) and count once;
 *   - only the interactions of the last `windowMs` count (rolling): a pause long enough starts over;
 *   - the host resets it after a move, or when the Blobbi, the account or the World changes (a new session).
 */

/** Interactions that bring the Blobbi over. */
export const FOLLOW_INTERACTIONS = 3;
/** The rolling window they must fall in (ms). */
export const FOLLOW_WINDOW_MS = 20_000;
/** Inputs closer together than this are one gesture, counted once (ms). Three interactions take at least 2 s. */
export const FOLLOW_GAP_MS = 1_000;

export interface FollowCounterOptions {
  needed?: number;
  windowMs?: number;
  gapMs?: number;
}

export interface FollowCounter {
  readonly needed: number;
  /** An interaction at `at` (ms): whether it counted (not a repeat of the same gesture). */
  note(at: number): boolean;
  /** Interactions counted within the window ending at `at`. */
  count(at: number): number;
  /** Whether the count has reached `needed` at `at`. */
  ready(at: number): boolean;
  /** How long until the oldest counted interaction leaves the window (ms; 0 when none). */
  expiresIn(at: number): number;
  reset(): void;
}

export function createFollowCounter({ needed = FOLLOW_INTERACTIONS, windowMs = FOLLOW_WINDOW_MS, gapMs = FOLLOW_GAP_MS }: FollowCounterOptions = {}): FollowCounter {
  const need = Math.max(1, Math.floor(Number.isFinite(needed) ? needed : FOLLOW_INTERACTIONS));
  const span = Math.max(0, Number.isFinite(windowMs) ? windowMs : FOLLOW_WINDOW_MS);
  const gap = Math.max(0, Number.isFinite(gapMs) ? gapMs : FOLLOW_GAP_MS);
  let counted: number[] = [];
  const prune = (at: number) => {
    counted = counted.filter((t) => t <= at && at - t < span);
  };
  return {
    needed: need,
    note(at) {
      prune(at);
      const last = counted.at(-1);
      if (last !== undefined && at - last < gap) return false;
      counted.push(at);
      return true;
    },
    count(at) {
      prune(at);
      return counted.length;
    },
    ready(at) {
      prune(at);
      return counted.length >= need;
    },
    expiresIn(at) {
      prune(at);
      return counted.length ? Math.max(0, counted[0] + span - at) : 0;
    },
    reset() {
      counted = [];
    },
  };
}
