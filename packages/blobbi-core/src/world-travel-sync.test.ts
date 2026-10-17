import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORLD_HOME, WORLD_PIXEL } from './world-travel';
import type { WorldTravelSnapshot } from './world-travel-session';
import { ACTIVE_MS, VISIBLE_GRACE_MS, isMeaningfulInput, isPlayedNow, reconcileTravel, syncTravel, travelView, type ShownBlobbi, type ShownState, type TravelView } from './world-travel-sync';

const view = (v: Partial<TravelView>): TravelView => ({ here: true, shown: 'present', visible: true, visibleFor: 10_000, busy: false, change: 'live', ...v });

describe('reconcileTravel', () => {
  it('nothing to do when the Blobbi on screen is already in line', () => {
    for (const shown of ['present', 'arriving'] as ShownState[]) expect(reconcileTravel(view({ here: true, shown }))).toBeNull();
    for (const shown of ['absent', 'departing'] as ShownState[]) expect(reconcileTravel(view({ here: false, shown }))).toBeNull();
  });

  it('a historical change is shown as it is, at once, busy or hidden (no journey replayed)', () => {
    expect(reconcileTravel(view({ here: false, shown: 'present', change: 'historical', busy: true, visible: false }))).toBe('settle-absent');
    expect(reconcileTravel(view({ here: true, shown: 'absent', change: 'historical' }))).toBe('settle-present');
  });

  it('a live arrival never waits for the World’s moment; a live departure does, and waits for the page to be seen', () => {
    expect(reconcileTravel(view({ here: true, shown: 'absent', busy: true }))).toBe('enter');
    expect(reconcileTravel(view({ here: true, shown: 'departing' }))).toBe('enter'); // turned back
    expect(reconcileTravel(view({ here: false, shown: 'present' }))).toBe('leave');
    expect(reconcileTravel(view({ here: false, shown: 'present', busy: true }))).toBeNull();
    expect(reconcileTravel(view({ here: false, shown: 'present', visible: false }))).toBeNull();
    expect(reconcileTravel(view({ here: true, shown: 'absent', visible: false }))).toBeNull();
    expect(reconcileTravel(view({ here: false, shown: 'present', visibleFor: VISIBLE_GRACE_MS - 1 }))).toBeNull();
  });
});

describe('syncTravel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function source(initial: Partial<WorldTravelSnapshot>) {
    let snap = { owner: 'a', d: 'd', world: WORLD_HOME, status: 'ready', location: null, place: WORLD_HOME, here: true, change: { kind: 'historical', key: 0 }, travel: { phase: 'idle' }, presence: { status: 'off', lastSentAt: null, there: null }, ...initial } as WorldTravelSnapshot;
    const listeners = new Set<(s: WorldTravelSnapshot) => void>();
    return {
      snapshot: () => snap,
      subscribe: (l: (s: WorldTravelSnapshot) => void) => (listeners.add(l), () => listeners.delete(l)),
      set(p: Partial<WorldTravelSnapshot>) {
        snap = { ...snap, ...p };
        for (const l of listeners) l(snap);
      },
    };
  }
  function blobbi(initial: ShownState, withSettle = true) {
    const log: string[] = [];
    let state = initial;
    const b: ShownBlobbi & { log: string[] } = {
      log,
      state: () => state,
      enter: () => {
        log.push('enter');
        state = 'arriving';
      },
      leave: () => {
        log.push('leave');
        state = 'departing';
      },
    };
    if (withSettle) b.settle = (s) => (log.push(`settle-${s}`), (state = s));
    return b;
  }

  it('on load: away elsewhere is settled at once, never a departure', () => {
    const src = source({ place: WORLD_PIXEL, here: false });
    const b = blobbi('present');
    const journeys: string[] = [];
    const sync = syncTravel({ source: src, blobbi: b, onJourney: (k, p) => journeys.push(`${k}:${p}`) });
    expect(b.log).toEqual(['settle-absent']);
    expect(journeys).toEqual([]);
    sync.dispose();
  });

  it('pending (nothing known yet): nothing is asked of the Blobbi; the first answer is settled, never a journey (no flash)', () => {
    const src = source({ resolution: 'pending', status: 'loading', place: WORLD_HOME, here: true });
    const b = blobbi('absent'); // the World shows its "looking" cue, not the Blobbi
    const sync = syncTravel({ source: src, blobbi: b });
    vi.advanceTimersByTime(3_000);
    expect(b.log).toEqual([]);
    src.set({ resolution: 'confirmed', status: 'ready', place: WORLD_PIXEL, here: false, change: { kind: 'historical', key: 1 } });
    expect(b.log).toEqual([]); // already absent: in line, nothing to do, no departure
    sync.dispose();
    const home = source({ resolution: 'pending', status: 'loading' });
    const b2 = blobbi('absent');
    const sync2 = syncTravel({ source: home, blobbi: b2 });
    home.set({ resolution: 'confirmed', status: 'ready' });
    expect(b2.log).toEqual(['settle-present']); // home all along: it simply is there, no arrival replayed
    sync2.dispose();
  });

  it('a live move away departs once the World’s moment ends; the journey is reported with its place', () => {
    const src = source({});
    const b = blobbi('present');
    let busy = true;
    const journeys: string[] = [];
    const sync = syncTravel({ source: src, blobbi: b, busy: () => busy, onJourney: (k, p) => journeys.push(`${k}:${p}`) });
    src.set({ place: WORLD_PIXEL, here: false, change: { kind: 'live', key: 1 } });
    vi.advanceTimersByTime(2_000);
    expect(b.log).toEqual([]);
    busy = false;
    vi.advanceTimersByTime(300);
    expect(b.log).toEqual(['leave']);
    expect(journeys).toEqual([`leave:${WORLD_PIXEL}`]);
    sync.dispose();
  });

  it('a live arrival plays the journey (not a settle), and a historical change is never replayed later', () => {
    const src = source({ place: WORLD_PIXEL, here: false });
    const b = blobbi('present');
    const sync = syncTravel({ source: src, blobbi: b });
    expect(b.log).toEqual(['settle-absent']);
    src.set({ travel: { phase: 'idle' } }); // same change key, any other update
    expect(b.log).toEqual(['settle-absent']);
    src.set({ place: WORLD_HOME, here: true, change: { kind: 'live', key: 1 } });
    expect(b.log).toEqual(['settle-absent', 'enter']);
    sync.dispose();
  });

  it('a hidden page waits; once seen, it gives an input the grace before anything leaves', () => {
    const src = source({});
    const b = blobbi('present');
    let page = { visible: false, visibleSince: null as number | null };
    const sync = syncTravel({ source: src, blobbi: b, page: () => page });
    src.set({ place: WORLD_PIXEL, here: false, change: { kind: 'live', key: 1 } });
    vi.advanceTimersByTime(60_000);
    expect(b.log).toEqual([]);
    page = { visible: true, visibleSince: Date.now() };
    vi.advanceTimersByTime(VISIBLE_GRACE_MS - 400);
    expect(b.log).toEqual([]);
    vi.advanceTimersByTime(700);
    expect(b.log).toEqual(['leave']);
    sync.dispose();
  });

  it('without settle, a historical change falls back to the journey; dispose stops everything', () => {
    const src = source({ place: WORLD_PIXEL, here: false });
    const b = blobbi('present', false);
    const sync = syncTravel({ source: src, blobbi: b });
    expect(b.log).toEqual(['leave']);
    sync.dispose();
    src.set({ place: WORLD_HOME, here: true, change: { kind: 'live', key: 1 } });
    vi.advanceTimersByTime(5_000);
    expect(b.log).toEqual(['leave']);
  });
});

describe('inputs', () => {
  it('only a trusted input in a visible, focused page is the player’s act', () => {
    expect(isMeaningfulInput({ trusted: true, visible: true, focused: true })).toBe(true);
    expect(isMeaningfulInput({ trusted: false, visible: true, focused: true })).toBe(false);
    expect(isMeaningfulInput({ trusted: true, visible: false, focused: true })).toBe(false);
    expect(isMeaningfulInput({ trusted: true, visible: true, focused: false })).toBe(false);
  });
  it('played now: visible and a real input within ACTIVE_MS', () => {
    expect(isPlayedNow({ visible: true, lastInputAt: 0, now: ACTIVE_MS - 1 })).toBe(true);
    expect(isPlayedNow({ visible: true, lastInputAt: 0, now: ACTIVE_MS })).toBe(false);
    expect(isPlayedNow({ visible: false, lastInputAt: 0, now: 1 })).toBe(false);
    expect(isPlayedNow({ visible: true, lastInputAt: null, now: 1 })).toBe(false);
  });
});

describe('syncTravel while the World drives its Blobbi', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('paused: nothing is asked, and the historical change is settled once it resumes (not a departure)', () => {
    let snap = { here: false, place: WORLD_PIXEL, change: { kind: 'historical', key: 1 } } as unknown as WorldTravelSnapshot;
    const log: string[] = [];
    let state: ShownState = 'present';
    let paused = true;
    const sync = syncTravel({
      source: { snapshot: () => snap, subscribe: () => () => {} },
      blobbi: { state: () => state, enter: () => log.push('enter'), leave: () => log.push('leave'), settle: (s) => (log.push(`settle-${s}`), (state = s)) },
      paused: () => paused,
    });
    vi.advanceTimersByTime(10_000);
    expect(log).toEqual([]);
    paused = false;
    vi.advanceTimersByTime(300);
    expect(log).toEqual(['settle-absent']);
    snap = { ...snap };
    sync.check();
    expect(log).toEqual(['settle-absent']);
    sync.dispose();
  });
});

describe('travelView', () => {
  const snap = (p: Partial<WorldTravelSnapshot>) => ({ resolution: 'confirmed', here: true, place: WORLD_HOME, world: WORLD_HOME, travel: { phase: 'idle' }, ...p }) as WorldTravelSnapshot;
  it('keeps unknown, here, away, coming and unreachable apart', () => {
    expect(travelView(snap({ resolution: 'pending' }))).toEqual({ kind: 'looking', unreachable: false });
    expect(travelView(snap({}))).toEqual({ kind: 'here', unreachable: false });
    expect(travelView(snap({ here: false, place: WORLD_PIXEL }))).toEqual({ kind: 'away', unreachable: false });
    expect(travelView(snap({ here: false, place: WORLD_PIXEL, travel: { phase: 'signing' } })).kind).toBe('coming');
    expect(travelView(snap({ here: false, travel: { phase: 'arriving', at: 1, formAt: 2 } })).kind).toBe('coming');
    expect(travelView(snap({ resolution: 'unreachable', here: false, place: WORLD_PIXEL }))).toEqual({ kind: 'away', unreachable: true });
    expect(travelView(snap({ here: false, place: WORLD_PIXEL, travel: { phase: 'failed', reason: 'declined' } })).kind).toBe('away');
  });
});
