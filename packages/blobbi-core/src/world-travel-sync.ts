/**
 * THE BLOBBI ON SCREEN, IN LINE WITH WHERE IT IS (M16). A World's own
 * journeys (its teleport, its animations) stay the World's; this drives them
 * through three verbs, the same contract as world presence v1's
 * `syncPresence`:
 *
 *   state()   'present' | 'departing' | 'absent' | 'arriving'
 *   enter()   start an arrival
 *   leave()   start a departure
 *   settle()  optional: be present or absent at once, no journey
 *
 * Rules (`reconcileTravel`):
 *   - a HISTORICAL change (the first look, an ancient event) is shown as it
 *     is, at once: a page never replays an old transfer;
 *   - an arrival never waits for the World's moment (nothing of the Blobbi's
 *     is going on while it is away);
 *   - a departure waits while the World is busy (care in flight, a bath, a
 *     ceremony, a timed action): a remote move never interrupts a moment;
 *   - a hidden page waits until it is seen, and a page just made visible
 *     waits `VISIBLE_GRACE_MS` before anything leaves;
 *   - while the place is not known at all (`resolution: 'pending'`: the
 *     first look is under way and this device kept no location), nothing is
 *     asked of the Blobbi and nothing is taken as shown. The World shows its
 *     own "looking for it" state (`travelView`); the first answer is then
 *     settled as history, never played as a journey.
 *
 * DOM-free: the host says whether the page is visible and since when.
 */
import type { WorldTravelSnapshot } from './world-travel-session';

export type ShownState = 'present' | 'departing' | 'absent' | 'arriving';

/** A page that has just become visible waits this long before playing a departure. */
export const VISIBLE_GRACE_MS = 1_500;
/** A real input this recent means the World is being played. */
export const ACTIVE_MS = 2 * 60_000;

export interface TravelView {
  /** The Blobbi belongs here now (`snapshot.here`). */
  here: boolean;
  shown: ShownState;
  visible: boolean;
  /** How long the page has been visible (ms); 0 when hidden. */
  visibleFor: number;
  /** The World's own moment that a departure must not interrupt. */
  busy: boolean;
  /** How the change that led here should be shown. */
  change: 'historical' | 'live';
  /**
   * A move here is under way (checking, signing, publishing, or waiting for its arrival). A Blobbi the World is
   * already showing (its own intro brought it in) is then left where it is: taking it away now would only bring it
   * back a moment later.
   */
  coming?: boolean;
}

export type TravelAction = 'enter' | 'leave' | 'settle-present' | 'settle-absent' | null;

export function reconcileTravel(view: TravelView): TravelAction {
  const inLine = view.here ? view.shown === 'present' || view.shown === 'arriving' : view.shown === 'absent' || view.shown === 'departing';
  if (inLine) return null;
  if (view.coming && (view.shown === 'present' || view.shown === 'arriving')) return null;
  if (view.change === 'historical') return view.here ? 'settle-present' : 'settle-absent';
  if (!view.visible) return null;
  if (view.here) return 'enter';
  if (view.busy || view.visibleFor < VISIBLE_GRACE_MS) return null;
  return 'leave';
}

export interface ShownBlobbi {
  state(): ShownState;
  enter(): void;
  leave(): void;
  /** Be present or absent at once (no journey). Without it, a historical change plays a journey instead. */
  settle?(state: 'present' | 'absent'): void;
}

export interface TravelSource {
  snapshot(): WorldTravelSnapshot;
  subscribe(listener: (s: WorldTravelSnapshot) => void): () => void;
}

export interface TravelSyncOptions {
  source: TravelSource;
  blobbi: ShownBlobbi;
  busy?: () => boolean;
  /**
   * The World is driving its Blobbi itself (a title screen, an intro, a trip of its own): nothing is asked of it,
   * and nothing is taken as shown, until it is not (a historical change is settled then, not replayed as a journey).
   */
  paused?: () => boolean;
  /** Whether the page is visible, and since when (the clock's ms; null while hidden). */
  page?: () => { visible: boolean; visibleSince: number | null };
  /** A journey began because of where the Blobbi is (`leave` names where it went). */
  onJourney?: (kind: 'enter' | 'leave', place: string) => void;
  checkMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface TravelSync {
  /** Look again now (the World's moment ended, or it moved the Blobbi itself). */
  check(): void;
  dispose(): void;
}

/** Keeps the Blobbi on screen in line with the session (`reconcileTravel`), and keeps looking while they differ. */
export function syncTravel({
  source,
  blobbi,
  busy = () => false,
  paused = () => false,
  page = () => ({ visible: true, visibleSince: 0 }),
  onJourney,
  checkMs = 300,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}: TravelSyncOptions): TravelSync {
  let timer: unknown = null;
  let disposed = false;
  // A change shown historically is settled once; any later change of the same key is not replayed
  let settledKey = -1;
  const check = () => {
    timer = null;
    if (disposed) return;
    const s = source.snapshot();
    if (paused() || s.resolution === 'pending') {
      timer = setTimer(check, checkMs);
      return;
    }
    const p = page();
    const shown = blobbi.state();
    const historical = s.change.kind === 'historical' && s.change.key !== settledKey;
    const action = reconcileTravel({
      here: s.here,
      shown,
      visible: p.visible,
      visibleFor: p.visible && p.visibleSince !== null ? now() - p.visibleSince : 0,
      busy: busy(),
      change: historical ? 'historical' : 'live',
      coming: travelView(s).kind === 'coming',
    });
    if (action === 'settle-present' || action === 'settle-absent') {
      settledKey = s.change.key;
      const target = action === 'settle-present' ? 'present' : 'absent';
      if (blobbi.settle) blobbi.settle(target);
      else if (target === 'present') blobbi.enter();
      else blobbi.leave();
    } else if (action === 'enter') {
      blobbi.enter();
      onJourney?.('enter', s.place);
    } else if (action === 'leave') {
      blobbi.leave();
      onJourney?.('leave', s.place);
    }
    if (s.change.kind === 'historical') settledKey = s.change.key;
    const after = blobbi.state();
    const settled = s.here ? after === 'present' || after === 'arriving' : after === 'absent' || after === 'departing';
    if (!settled) timer = setTimer(check, checkMs);
  };
  const unsubscribe = source.subscribe(() => {
    if (timer !== null) clearTimer(timer);
    check();
  });
  check();
  return {
    check() {
      if (disposed) return;
      if (timer !== null) clearTimer(timer);
      check();
    },
    dispose() {
      disposed = true;
      unsubscribe();
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

/**
 * Whether an input is the player's own act in this World: a trusted event (not a script's), in a visible and
 * focused page. Focus, visibility, a timer or a remote change never are.
 */
export function isMeaningfulInput(e: { trusted: boolean; visible: boolean; focused: boolean }): boolean {
  return e.trusted && e.visible && e.focused;
}

/** Whether the World is being played now: visible, and a real input within `ACTIVE_MS`. */
export function isPlayedNow(o: { visible: boolean; lastInputAt: number | null; now: number }): boolean {
  return o.visible && o.lastInputAt !== null && o.now - o.lastInputAt < ACTIVE_MS;
}

/**
 * What a World shows of its Blobbi's place, the four cases kept apart:
 *   looking      the place is not known yet (`pending`): neither here nor away; a small "looking for it" cue, never
 *                the Blobbi standing here (it may be elsewhere) and never a departure. Ends within the relay timeout.
 *   here         it is here (known, from the relays or this device's kept location).
 *   away         it is in another World (`place`).
 *   coming       a move here is under way: checking, signing, publishing, or waiting for its arrival to start.
 * `unreachable`: no relay answered the first look, so the place shown is the kept one, or the default for a Blobbi
 * that never travelled; a World may say so.
 */
export type TravelViewKind = 'looking' | 'here' | 'away' | 'coming';

export function travelView(s: Pick<WorldTravelSnapshot, 'resolution' | 'here' | 'place' | 'world' | 'travel'>): { kind: TravelViewKind; unreachable: boolean } {
  const unreachable = s.resolution === 'unreachable';
  if (s.resolution === 'pending') return { kind: 'looking', unreachable };
  const phase = s.travel?.phase;
  if (!s.here && (phase === 'checking' || phase === 'signing' || phase === 'publishing' || phase === 'arriving')) return { kind: 'coming', unreachable };
  if (s.here) return { kind: 'here', unreachable };
  return { kind: s.place === s.world ? 'coming' : 'away', unreachable };
}
