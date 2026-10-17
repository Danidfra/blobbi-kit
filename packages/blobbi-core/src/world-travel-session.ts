/**
 * ONE WORLD'S VIEW OF ONE BLOBBI'S TRAVELS (M16): the operations over the
 * pure protocol in `world-travel.ts`. A World (Blobbi Standalone, Blobbi
 * Pixel, ...) makes one session per signed-in owner + Blobbi, and disposes it
 * when either changes. Everything outside is injected:
 *
 *   relays   per-relay query and publish, an optional live stream
 *   signer   the account's own signer, and whether it signs silently
 *   verify   the signature check (core depends on no Nostr library)
 *   store    a small key-value store (the last signed location, a pending
 *            move); optional
 *   lock     a cross-tab lock (Web Locks); optional
 *   clock and timers (tests)
 *
 * WHAT IT DOES
 *
 *   look      the canonical location: every relay, the stream and the store
 *             merged by NIP-01. The first look is HISTORICAL (shown as it is,
 *             no journey); later changes are LIVE (a journey).
 *   travel    a move here, only when asked (`travel()`): re-read the relays,
 *             already here (nothing published), just moved elsewhere and not
 *             explicit (`contended`, nothing published), else sign one World
 *             Location, check nothing newer came meanwhile, publish, then wait
 *             the departure window and arrive. One move per Blobbi at a time
 *             in this page, and with `lock`, across tabs.
 *   presence optional Active Presence while the Blobbi is played here (see
 *             "Presence" below). It never changes the location.
 *
 * WHAT IT NEVER DOES
 *
 *   - sign on load, on a subscription, on focus or on a re-render: only
 *     `travel()` signs a location, and presence signs only while enabled;
 *   - republish a location to take the Blobbi back: a move is one act;
 *   - resend a signed move once a newer location exists, or after
 *     `PENDING_TTL_MS`;
 *   - trust an event for the relay it came from.
 *
 * CONCURRENCY (no protocol makes this atomic). Two devices moving the same
 * Blobbi at once both publish; NIP-01 orders their two events the same way
 * everywhere, and both sessions end up following the same winner (each
 * re-reads after publishing, and the stream brings the other's). The re-read
 * before signing and the check after signing make a lost race rare and
 * short-lived, never impossible.
 */
import type { NostrEvent, NostrFilter } from './nostr-protocol';
import type { EventVerifier } from './profile-order';
import { createFollowCounter, FOLLOW_INTERACTIONS, FOLLOW_WINDOW_MS, type FollowCounter } from './world-travel-follow';
import {
  MAX_TRANSITION_S,
  PRESENCE_RENEW_S,
  activePresenceFilter,
  arrivalDelayMs,
  buildPresenceTemplate,
  currentWorld,
  freshPresence,
  isPresenceFresh,
  parseActivePresence,
  parseWorldLocation,
  planTransfer,
  presenceSupports,
  replacesLocation,
  resolveWorldLocation,
  transitionKind,
  worldLocationFilter,
  type ActivePresence,
  type WorldLocation,
  type WorldTravelTemplate,
} from './world-travel';

// ─── Injected interfaces ────────────────────────────────────────────────────

export interface WorldTravelRelays {
  /** Every relay read and written. */
  urls: readonly string[];
  /** The relay's stored events for the filter, once it said it sent them all (EOSE); rejects otherwise. */
  query(url: string, filter: NostrFilter, signal: AbortSignal): Promise<NostrEvent[]>;
  /** Resolves when the relay accepted the event (or already held it); rejects otherwise. */
  publish(url: string, event: NostrEvent, signal: AbortSignal): Promise<void>;
  /**
   * Live events for the filters from every relay, until the returned function is called. Optional: without it, the
   * session only sees changes when it looks again (`refresh`, the timer). Events are untrusted.
   */
  subscribe?(filters: NostrFilter[], onEvent: (event: unknown) => void): () => void;
}

/** 'silent': signs with no person asked (a key this app holds). 'prompt': may ask (an extension, a remote signer). */
export type SignerMode = 'silent' | 'prompt';

export interface WorldTravelSigner {
  mode: SignerMode;
  sign(template: WorldTravelTemplate): Promise<NostrEvent>;
}

export interface WorldTravelStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export type WorldTravelLock = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export interface WorldTravelOptions {
  owner: string;
  /** The Blobbi's d (its 31124 d). */
  d: string;
  /** This World's id. */
  world: string;
  relays: WorldTravelRelays;
  verify: EventVerifier;
  /** The account's signer now, or null when it cannot sign here (read-only: nothing is ever signed). */
  signer?: () => WorldTravelSigner | null;
  /** The account is still the signed-in one (asked before signing, after signing, and before sending). */
  stillAccount?: () => boolean;
  store?: WorldTravelStore | null;
  lock?: WorldTravelLock;
  /** Whether automatic Active Presence starts enabled (the host keeps the player's choice). */
  presenceEnabled?: boolean;
  /** The Blobbi is being played here right now (visible, a recent real input): presence is renewed only then. */
  isActive?: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** How long a relay gets for one read or publish (ms). */
  timeoutMs?: number;
  /** How often the relays are read again while visible (ms); five times as long while hidden. */
  refreshMs?: number;
  /**
   * How long this World's own arrival plays before the Blobbi has formed (ms): its teleport's "incoming" part. The
   * arrival is started that much before the moment the Blobbi may be seen here (`arrival_after`), so the wait and
   * the effect overlap instead of adding up. 0 (the default): the arrival starts at that moment. A function is read
   * at each arrival (a World whose pace or reduced motion changes during a session).
   */
  arrivalLeadMs?: number | (() => number);
  /**
   * The shortest time from the player's act to the Blobbi forming here (ms), so a move from a World nobody is playing
   * (no departure window) still reads as a journey rather than a pop. Default `MIN_TRAVEL_MS`; 0 turns it off.
   */
  minTravelMs?: number;
  /** How many interactions with this World bring the Blobbi over by themselves (`interact`). Default `FOLLOW_INTERACTIONS`. */
  followAfter?: number;
  /** The rolling window those interactions must fall in (ms). Default `FOLLOW_WINDOW_MS`. */
  followWindowMs?: number;
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

export type TravelPhase =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'signing' }
  | { phase: 'publishing' }
  /**
   * Published: the arrival starts at `at` (the clock's ms; `here` turns true then), so that the Blobbi has formed by
   * `formAt` (after the departure window, and no sooner than `MIN_TRAVEL_MS` after the player's act).
   */
  | { phase: 'arriving'; at: number; formAt: number }
  | { phase: 'failed'; reason: TravelFailure };

export type TravelFailure = 'declined' | 'unreachable' | 'stale' | 'wrong-account' | 'failed';

export type PresenceStatus =
  /** Turned off (the default). */
  | 'off'
  /** On and renewed while the Blobbi is played here. */
  | 'on'
  /** Paused: the signer asked the player (it took too long to be silent). Nothing more is asked this session. */
  | 'paused-prompting'
  /** Paused: the signer refused. Nothing more is asked this session. */
  | 'declined'
  /** No signer here (read-only). */
  | 'unavailable';

/**
 * How sure the session is of the place:
 *   pending      nothing known yet: the first look is under way, and this device kept no signed location. A World
 *                shows neither "here" nor "away" (it does not know), and asks nothing of its Blobbi.
 *   cached       the first look is under way; the last signed location this device kept is shown meanwhile.
 *   confirmed    at least one relay answered.
 *   unreachable  the first look ended with no relay answering: the kept location stands, or none (then the
 *                Blobbi's place is the default, as for a Blobbi that never travelled).
 * The first look always ends within the relay timeout: `pending` never lasts.
 */
export type TravelResolution = 'pending' | 'cached' | 'confirmed' | 'unreachable';

export interface FollowState {
  /** Interactions counted toward bringing the Blobbi over (within the rolling window). */
  count: number;
  /** How many bring it over. */
  needed: number;
  /** Casual following is off for this session (the signer refused); only an explicit request moves it. */
  suspended: boolean;
}

export interface WorldTravelSnapshot {
  owner: string;
  d: string;
  /** This World. */
  world: string;
  /** 'loading' until the relays were read once; 'unreachable' when none answered (the store's last location stands). */
  status: 'loading' | 'ready' | 'unreachable';
  /** How sure the place is (see `TravelResolution`). */
  resolution: TravelResolution;
  /** The canonical location known now (null: none, the Blobbi is at `DEFAULT_WORLD`). */
  location: WorldLocation | null;
  /** Where the Blobbi is (`currentWorld(location)`). */
  place: string;
  /** It is here and not still on its way (a move's departure window is over). */
  here: boolean;
  /**
   * How the last change of place should be shown, with a key that changes per change: 'historical' (as it is, no
   * journey), 'live' (a journey).
   */
  change: { kind: 'historical' | 'live'; key: number };
  travel: TravelPhase;
  /** Following the player here by interacting (`interact`). */
  follow: FollowState;
  presence: {
    status: PresenceStatus;
    /** When this session last sent one (ms), or null. */
    lastSentAt: number | null;
    /** A fresh presence for the World the Blobbi is in, when that is not this one ("being played there now"). */
    there: ActivePresence | null;
  };
}

export type TravelOutcome =
  /** Published (at least one relay accepted): the Blobbi arrives here after the departure window. */
  | 'moved'
  /** The canonical location already named this World: nothing was published. */
  | 'already-here'
  /** It moved elsewhere moments ago and the request was not explicit: nothing was signed. */
  | 'contended'
  /** Another move is in flight. */
  | 'busy'
  /** A casual request soon after a refusal or a failure: nothing is asked again so soon. */
  | 'cooldown'
  /** No signer here. */
  | 'read-only'
  | TravelFailure
  | 'disposed';

export type InteractOutcome =
  /** Counted; not enough yet to bring the Blobbi over. */
  | 'counted'
  /** Not counted: a repeat or part of the same gesture, the Blobbi is here or on its way, the place is not known yet,
   * there is no signer, or following is suspended. */
  | 'ignored'
  /** The interaction that completed the count: what the move it started came to. */
  | TravelOutcome;

export interface WorldTravelSession {
  snapshot(): WorldTravelSnapshot;
  subscribe(listener: (s: WorldTravelSnapshot) => void): () => void;
  /** Move the Blobbi here (the player's act). `explicit`: a deliberate request, not a press anywhere. */
  travel(opts?: { explicit?: boolean }): Promise<TravelOutcome>;
  /** Resend the stored signed move, if it is still the newest and recent (no new signature). */
  retry(): Promise<TravelOutcome>;
  /** Read the relays again now (the page became visible, came back online, reconnected). */
  refresh(): Promise<void>;
  /** Whether the page is visible (slower refreshes while hidden; a look when it shows). */
  setVisible(visible: boolean): void;
  /** A real input here: presence may be renewed (the first presence with a prompting signer waits for one). */
  noteActivity(): void;
  /**
   * The player interacting with this World (a real, trusted input the World judged meaningful; never a load, a
   * timer, focus or visibility). It is activity (`noteActivity`), and while the Blobbi is elsewhere it counts toward
   * bringing it over: the `followAfter`-th interaction within `followWindowMs` starts a casual `travel()`. `repeat`:
   * an auto-repeat of a held key, never counted; inputs closer together than `FOLLOW_GAP_MS` count once.
   */
  interact(o?: { repeat?: boolean }): Promise<InteractOutcome>;
  setPresenceEnabled(on: boolean): void;
  dispose(): void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** A signed move not yet accepted by any relay is resent at most this long after it was signed (ms). */
export const PENDING_TTL_MS = 30_000;
/** After a refusal or a failure, casual requests wait this long (explicit ones never wait) (ms). */
export const TRAVEL_COOLDOWN_MS = 60_000;
/** A signature that took longer than this probably asked the player: the location is re-read before sending (ms). */
export const SLOW_SIGN_MS = 2_000;
/** A presence signature slower than this asked the player: automatic presence pauses for the session (ms). */
export const PRESENCE_SIGN_BUDGET_MS = 1_500;
/** A signed move no relay accepted is resent once, automatically, this soon (ms). */
export const AUTO_RESEND_MS = 5_000;
/** How often presence conditions are looked at (ms). */
export const PRESENCE_TICK_MS = 15_000;
/** After a move is published, the relays are read again this soon (a simultaneous move elsewhere shows up) (ms). */
export const RECONCILE_AFTER_MS = 2_000;
/** The shortest time from the player's act to the Blobbi forming here, by default (ms). A UX target, not protocol. */
export const MIN_TRAVEL_MS = 1_500;

/** Where a session keeps the last signed World Location of a Blobbi in the host's store. */
export const worldLocationStoreKey = (owner: string, d: string) => `blobbi-kit:world-location:v1:${owner}:${d}`;
/** Where a session keeps a signed move no relay has accepted yet. */
export const pendingMoveStoreKey = (owner: string, d: string) => `blobbi-kit:world-move:v1:${owner}:${d}`;
const storeKey = worldLocationStoreKey;
const pendingKey = pendingMoveStoreKey;

/**
 * The last World Location a session kept for this Blobbi, read at once (no relay): what a World shows on its very
 * first frame, before any session answers. Untrusted like any event: checked, and null when absent or invalid. A
 * newer location on the relays always replaces it once the session looks.
 */
export function storedWorldLocation(store: WorldTravelStore | null | undefined, o: { owner: string; d: string; verify: EventVerifier; now?: number }): WorldLocation | null {
  if (!store) return null;
  try {
    const raw = store.get(worldLocationStoreKey(o.owner, o.d));
    return raw ? resolveWorldLocation([JSON.parse(raw)], o) : null;
  } catch {
    return null;
  }
}

/** The in-page fallback for `lock`: one move per Blobbi at a time in this page. */
const pageLocks = new Map<string, Promise<unknown>>();
const pageLock: WorldTravelLock = async (name, fn) => {
  const before = pageLocks.get(name) ?? Promise.resolve();
  const run = before.catch(() => {}).then(fn);
  pageLocks.set(name, run);
  try {
    return await run;
  } finally {
    if (pageLocks.get(name) === run) pageLocks.delete(name);
  }
};

// ─── The session ────────────────────────────────────────────────────────────

export function createWorldTravel(o: WorldTravelOptions): WorldTravelSession {
  const { owner, d, world, relays, verify } = o;
  const now = o.now ?? (() => Date.now());
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const timeoutMs = o.timeoutMs ?? 4_000;
  const refreshMs = o.refreshMs ?? 60_000;
  const signerNow = () => o.signer?.() ?? null;
  const stillAccount = () => (o.stillAccount ? safeBool(o.stillAccount) : true);
  const isActive = () => (o.isActive ? safeBool(o.isActive) : false);
  const lock = o.lock ?? pageLock;
  const store = o.store ?? null;
  const clampMs = (v: number | undefined, fallback: number) => Math.min(Math.max(Number.isFinite(v) ? (v as number) : fallback, 0), MAX_TRANSITION_S * 1000);
  const leadOption = o.arrivalLeadMs;
  const arrivalLead = (): number => {
    let v: number | undefined;
    try {
      v = typeof leadOption === 'function' ? leadOption() : leadOption;
    } catch {
      v = 0;
    }
    return clampMs(v, 0);
  };
  const minTravelMs = clampMs(o.minTravelMs, MIN_TRAVEL_MS);
  const counter: FollowCounter = createFollowCounter({ needed: o.followAfter ?? FOLLOW_INTERACTIONS, windowMs: o.followWindowMs ?? FOLLOW_WINDOW_MS });
  let followSuspended = false;
  let followTimer: unknown = null;

  const known = new Map<string, NostrEvent>();
  /** When this session first saw each location (ms): a stay is measured from it when the event is dated ahead. */
  const observed = new Map<string, number>();
  const presences = new Map<string, NostrEvent>();
  let location: WorldLocation | null = null;
  let firstLookDone = false;
  let disposed = false;
  let visible = true;
  let inFlight = false;
  let cooldownUntil = 0;
  let arrivalAt: number | null = null;
  let arrivalTimer: unknown = null;
  let refreshTimer: unknown = null;
  let presenceTimer: unknown = null;
  let presenceSending = false;
  let presenceEnabled = !!o.presenceEnabled;
  let presenceStatus: PresenceStatus = 'off';
  let presenceLastSent: number | null = null;
  let presenceProven = false;
  let unsubscribe: (() => void) | null = null;
  const autoResent = new Set<string>();
  let memoryPending: { at: number; event: NostrEvent } | null = null;
  const listeners = new Set<(s: WorldTravelSnapshot) => void>();

  let snap: WorldTravelSnapshot = {
    owner,
    d,
    world,
    status: 'loading',
    resolution: 'pending',
    location: null,
    place: currentWorld(null),
    here: currentWorld(null) === world,
    change: { kind: 'historical', key: 0 },
    travel: { phase: 'idle' },
    follow: { count: 0, needed: counter.needed, suspended: false },
    presence: { status: 'off', lastSentAt: null, there: null },
  };

  const presenceView = (): WorldTravelSnapshot['presence'] => {
    const place = currentWorld(location);
    const there = place === world ? null : freshPresence(presences.values(), { owner, d, world: place, now: now(), verify });
    return { status: presenceStatus, lastSentAt: presenceLastSent, there: presenceSupports(there, location) ? there : null };
  };
  const emit = (patch: Partial<WorldTravelSnapshot> = {}) => {
    if (disposed) return;
    const place = currentWorld(location);
    const follow = { count: counter.count(now()), needed: counter.needed, suspended: followSuspended };
    snap = { ...snap, ...patch, location, place, here: place === world && arrivalAt === null, follow, presence: presenceView() };
    for (const l of [...listeners]) l(snap);
  };

  // ── Learning about locations ──

  /** Take in events (any source, untrusted); returns whether the canonical location changed. */
  const learn = (events: Iterable<unknown>, how: 'look' | 'stream'): boolean => {
    for (const e of events) {
      const loc = parseWorldLocation(e, { verify });
      if (!loc || loc.owner !== owner || loc.d !== d) continue;
      known.set(loc.id, loc.event);
      if (!observed.has(loc.id)) observed.set(loc.id, now());
    }
    // An event dated too far ahead stays known, and counts once this clock reaches it (re-resolved on every look)
    const next = resolveWorldLocation(known.values(), { owner, d, verify, now: now() });
    if (!next || (location && next.id === location.id)) return false;
    if (location && !replacesLocation(next, location)) return false;
    const before = currentWorld(location);
    location = next;
    keepLocation(next.event);
    // A move elsewhere ends a wait for our own arrival: it is no longer coming here
    if (next.world !== world) clearArrival();
    if (currentWorld(next) !== before) {
      // A change of place starts any count of interactions over: they were for where it was
      counter.reset();
      const kind = transitionKind({ initial: !firstLookDone && how === 'look', createdAt: next.createdAt, now: now() });
      emit({ change: { kind, key: snap.change.key + 1 } });
    } else emit();
    if (next.world !== world) stopPresenceTimer();
    else if (presenceEnabled && presenceTimer === null) schedulePresence(0);
    return true;
  };

  const keepLocation = (event: NostrEvent) => {
    if (!store) return;
    try {
      store.set(storeKey(owner, d), JSON.stringify(event));
    } catch {
      /* not kept: the relays have it */
    }
  };

  const readStore = (key: string): unknown => {
    if (!store) return null;
    try {
      const v = store.get(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  };
  const removeStore = (key: string) => {
    try {
      store?.remove(key);
    } catch {
      /* nothing kept */
    }
  };

  /** Every relay on its own, within the timeout: what answered, and every event returned. */
  const census = async (): Promise<{ answered: number; events: NostrEvent[] }> => {
    const filter = worldLocationFilter(owner, d);
    const answers = await Promise.all(
      relays.urls.map(async (url) => {
        const controller = new AbortController();
        let timer: unknown;
        const late = new Promise<null>((resolve) => {
          timer = setTimer(() => {
            controller.abort();
            resolve(null);
          }, timeoutMs);
        });
        try {
          return await Promise.race([relays.query(url, filter, controller.signal).catch(() => null), late]);
        } finally {
          clearTimer(timer);
        }
      }),
    );
    const ok = answers.filter((a): a is NostrEvent[] => Array.isArray(a));
    return { answered: ok.length, events: ok.flat() };
  };

  const look = async (): Promise<number> => {
    const { answered, events } = await census();
    if (disposed) return answered;
    learn(events, 'look');
    if (!firstLookDone) {
      firstLookDone = true;
      emit({ status: answered > 0 ? 'ready' : 'unreachable', resolution: answered > 0 ? 'confirmed' : 'unreachable' });
    } else if (answered > 0 && snap.status !== 'ready') emit({ status: 'ready', resolution: 'confirmed' });
    return answered;
  };

  // ── Publishing ──

  /**
   * Send to every relay, each within the timeout. `first` settles as soon as one relay accepted (true) or every relay
   * failed (false), so a slow relay does not hold the arrival back; `all` counts acceptances once every relay is done.
   */
  const publishAll = (event: NostrEvent): { first: Promise<boolean>; all: Promise<number> } => {
    let settleFirst: (v: boolean) => void = () => {};
    const first = new Promise<boolean>((resolve) => (settleFirst = resolve));
    const all = Promise.all(
      relays.urls.map(async (url) => {
        const controller = new AbortController();
        let timer: unknown;
        const late = new Promise<false>((resolve) => {
          timer = setTimer(() => {
            controller.abort();
            resolve(false);
          }, timeoutMs);
        });
        try {
          const ok = await Promise.race([
            relays.publish(url, event, controller.signal).then(
              () => true,
              () => false,
            ),
            late,
          ]);
          if (ok) settleFirst(true);
          return ok;
        } finally {
          clearTimer(timer);
        }
      }),
    ).then((results) => {
      const n = results.filter(Boolean).length;
      if (n === 0) settleFirst(false);
      return n;
    });
    return { first, all };
  };

  const clearArrival = () => {
    if (arrivalTimer !== null) clearTimer(arrivalTimer);
    arrivalTimer = null;
    arrivalAt = null;
  };

  /**
   * Our move was accepted: the Blobbi is ours; it arrives after the departure window. The arrival is scheduled so
   * the Blobbi forms at `formAt` = the latest of: the departure window's end, `minTravelMs` after the player's act
   * (`startedAt`), and `arrivalLeadMs` from now; it starts `arrivalLeadMs` before that.
   */
  const arrive = (mine: WorldLocation, startedAt: number) => {
    known.set(mine.id, mine.event);
    const before = currentWorld(location);
    if (!location || replacesLocation(mine, location)) {
      location = mine;
      keepLocation(mine.event);
    }
    clearArrival();
    if (currentWorld(location) !== world) {
      emit({ travel: { phase: 'idle' } });
      return;
    }
    const t = now();
    const arrivalLeadMs = arrivalLead();
    const formAt = Math.max(t + arrivalDelayMs(mine), startedAt + minTravelMs, t + arrivalLeadMs);
    const at = Math.max(formAt - arrivalLeadMs, t);
    if (at <= t) {
      emit({ travel: { phase: 'idle' }, change: before !== world ? { kind: 'live', key: snap.change.key + 1 } : snap.change });
      schedulePresence(0);
      return;
    }
    arrivalAt = at;
    arrivalTimer = setTimer(() => {
      arrivalTimer = null;
      arrivalAt = null;
      emit({ travel: { phase: 'idle' } });
      schedulePresence(0);
    }, at - now());
    emit({ travel: { phase: 'arriving', at, formAt }, change: before !== world ? { kind: 'live', key: snap.change.key + 1 } : snap.change });
  };

  const fail = (reason: TravelFailure): TravelOutcome => {
    cooldownUntil = now() + TRAVEL_COOLDOWN_MS;
    emit({ travel: { phase: 'failed', reason } });
    return reason;
  };

  const keepPending = (event: NostrEvent, at: number) => {
    // Kept in memory too: without a store (or when it refuses), the automatic resend still has the event
    memoryPending = { at, event };
    try {
      store?.set(pendingKey(owner, d), JSON.stringify({ v: 1, world, at, event }));
    } catch {
      /* not kept: a retry needs a new signature */
    }
  };
  const readPending = (): { at: number; event: NostrEvent } | null => {
    const p = (readStore(pendingKey(owner, d)) ?? (memoryPending ? { v: 1, world, ...memoryPending } : null)) as { v?: unknown; world?: unknown; at?: unknown; event?: unknown } | null;
    if (!p || p.v !== 1 || p.world !== world || typeof p.at !== 'number') return null;
    const loc = parseWorldLocation(p.event, { verify });
    if (!loc || loc.owner !== owner || loc.d !== d || loc.world !== world) return null;
    return { at: p.at, event: loc.event };
  };

  const dropPending = () => {
    memoryPending = null;
    removeStore(pendingKey(owner, d));
  };

  /** Send a signed move (fresh, or stored); never one a newer location already replaced. */
  const send = async (mine: WorldLocation, startedAt: number): Promise<TravelOutcome> => {
    if (location && location.id !== mine.id && replacesLocation(location, mine)) {
      dropPending();
      return currentWorld(location) === world ? 'already-here' : fail('stale');
    }
    if (!stillAccount()) return fail('wrong-account');
    // Not here until the arrival: our own event may come back on the stream before the relays answer
    clearArrival();
    arrivalAt = Number.POSITIVE_INFINITY;
    emit({ travel: { phase: 'publishing' } });
    const accepted = await publishAll(mine.event).first;
    if (disposed) return 'disposed';
    if (!accepted) {
      clearArrival();
      // One automatic resend of this very event (no new signature), while it is recent and still the newest
      if (!autoResent.has(mine.id)) {
        autoResent.add(mine.id);
        setTimer(() => {
          if (!disposed) void retry();
        }, AUTO_RESEND_MS);
      }
      return fail('unreachable');
    }
    dropPending();
    arrive(mine, startedAt);
    // Someone else may have moved it at the same moment: look again soon, and follow the NIP-01 winner
    setTimer(() => {
      if (!disposed) void look();
    }, RECONCILE_AFTER_MS);
    return 'moved';
  };

  const travel = async ({ explicit = false }: { explicit?: boolean } = {}): Promise<TravelOutcome> => {
    if (disposed) return 'disposed';
    if (inFlight) return 'busy';
    if (!explicit && now() < cooldownUntil) return 'cooldown';
    if (!signerNow()) return 'read-only';
    inFlight = true;
    const actAt = now();
    try {
      const out = await lock(`blobbi-world-travel:${owner}:${d}`, async (): Promise<TravelOutcome> => {
        if (disposed) return 'disposed';
        emit({ travel: { phase: 'checking' } });
        const answered = await look();
        if (disposed) return 'disposed';
        if (answered === 0) return fail('unreachable');
        const latest = location;
        const previous = currentWorld(latest);
        const recent = presenceSupports(freshPresence(presences.values(), { owner, d, world: previous, now: now(), verify }), latest);
        const observedAt = latest ? observed.get(latest.id) : undefined;
        const plan = planTransfer({ owner, d, world, latest, now: now(), explicit, previousRecentlyActive: recent, observedAt });
        if (plan.kind === 'already-here') {
          emit({ travel: { phase: 'idle' } });
          return 'already-here';
        }
        if (plan.kind === 'contended') {
          emit({ travel: { phase: 'idle' } });
          return 'contended';
        }
        const signer = signerNow();
        if (!signer) {
          emit({ travel: { phase: 'idle' } });
          return 'read-only';
        }
        if (!stillAccount()) return fail('wrong-account');
        emit({ travel: { phase: 'signing' } });
        const startedAt = now();
        let signed: NostrEvent;
        try {
          signed = await signer.sign(plan.template);
        } catch {
          if (disposed) return 'disposed';
          return fail('declined');
        }
        if (disposed) return 'disposed';
        const mine = parseWorldLocation(signed, { verify });
        if (!mine || mine.owner !== owner || mine.d !== d || mine.world !== world || !stillAccount()) return fail('wrong-account');
        // Signed slowly (a person was asked): something may have changed meanwhile; the stream may already know
        if (now() - startedAt > SLOW_SIGN_MS) await look();
        if (disposed) return 'disposed';
        if (location && location.id !== latest?.id && replacesLocation(location, mine)) {
          // Moved again while we signed. Nothing is sent: the player sees where it is and may ask again
          if (currentWorld(location) === world) {
            emit({ travel: { phase: 'idle' } });
            return 'already-here';
          }
          return fail('stale');
        }
        keepPending(mine.event, now());
        return await send(mine, actAt);
      });
      afterTravel(out, explicit);
      return out;
    } finally {
      inFlight = false;
    }
  };

  /** The count decays as the window rolls on: the snapshot is updated as each interaction leaves it. */
  const scheduleFollowDecay = () => {
    if (followTimer !== null) clearTimer(followTimer);
    followTimer = null;
    const t = now();
    if (disposed || counter.count(t) === 0) return;
    followTimer = setTimer(() => {
      followTimer = null;
      emit();
      scheduleFollowDecay();
    }, Math.max(counter.expiresIn(t), 1));
  };

  /** A move's end resets the count (whatever it came to); a refusal suspends casual following, an explicit move resumes it. */
  const afterTravel = (out: TravelOutcome, explicit: boolean) => {
    if (disposed) return;
    counter.reset();
    if (out === 'declined') followSuspended = true;
    else if (explicit && (out === 'moved' || out === 'already-here')) followSuspended = false;
    emit();
  };

  const retry = async (): Promise<TravelOutcome> => {
    if (disposed) return 'disposed';
    if (inFlight) return 'busy';
    const pending = readPending();
    if (!pending || now() - pending.at > PENDING_TTL_MS) {
      dropPending();
      return 'stale';
    }
    inFlight = true;
    try {
      return await lock(`blobbi-world-travel:${owner}:${d}`, async () => {
        const answered = await look();
        if (disposed) return 'disposed';
        if (answered === 0) return fail('unreachable');
        const mine = parseWorldLocation(pending.event, { verify });
        return mine ? await send(mine, now()) : 'stale';
      });
    } finally {
      inFlight = false;
    }
  };

  // ── Presence ──

  const stopPresenceTimer = () => {
    if (presenceTimer !== null) clearTimer(presenceTimer);
    presenceTimer = null;
  };
  const schedulePresence = (ms: number = PRESENCE_TICK_MS) => {
    stopPresenceTimer();
    if (disposed || !presenceEnabled) return;
    presenceTimer = setTimer(() => {
      presenceTimer = null;
      void presenceTick(false);
      schedulePresence();
    }, ms);
  };
  const presenceTick = async (fromInput: boolean) => {
    if (disposed || !presenceEnabled || presenceSending) return;
    if (presenceStatus !== 'on') return;
    const signer = signerNow();
    if (!signer) return;
    // Only while it is played here, and never for a World that does not hold the Blobbi
    if (!snap.here || currentWorld(location) !== world || !isActive()) return;
    if (presenceLastSent !== null && now() - presenceLastSent < PRESENCE_RENEW_S * 1000) return;
    // A signer that may ask: the first presence of the session waits for a real input, never a timer
    if (signer.mode === 'prompt' && !presenceProven && !fromInput) return;
    if (!stillAccount()) return;
    presenceSending = true;
    const startedAt = now();
    try {
      const signed = await signer.sign(buildPresenceTemplate({ owner, d, world, now: now() }));
      if (disposed) return;
      const took = now() - startedAt;
      const p = parseActivePresence(signed, { verify });
      if (!p || p.owner !== owner || p.world !== world || !stillAccount()) return;
      presenceLastSent = now();
      if (signer.mode === 'prompt') {
        if (took > PRESENCE_SIGN_BUDGET_MS) presenceStatus = 'paused-prompting';
        else presenceProven = true;
      }
      emit();
      // Ephemeral: sent once, never confirmed, never retried
      void publishAll(signed).all;
    } catch {
      if (!disposed) {
        presenceStatus = 'declined';
        emit();
      }
    } finally {
      presenceSending = false;
    }
  };
  const syncPresenceStatus = () => {
    const before = presenceStatus;
    if (!presenceEnabled) presenceStatus = 'off';
    else if (!signerNow()) presenceStatus = 'unavailable';
    else if (presenceStatus === 'off' || presenceStatus === 'unavailable') presenceStatus = 'on';
    if (presenceStatus === 'on') schedulePresence(0);
    else stopPresenceTimer();
    if (before !== presenceStatus) emit();
  };

  // ── Refreshing ──

  const scheduleRefresh = () => {
    if (refreshTimer !== null) clearTimer(refreshTimer);
    refreshTimer = setTimer(
      () => {
        refreshTimer = null;
        if (disposed) return;
        void look().finally(scheduleRefresh);
      },
      visible ? refreshMs : refreshMs * 5,
    );
  };

  // ── Start ──

  // The store's last signed location first (it is an event like any other: a newer one always wins)
  learn([readStore(storeKey(owner, d))], 'look');
  if (location) snap = { ...snap, resolution: 'cached' };
  if (relays.subscribe) {
    try {
      unsubscribe = relays.subscribe([worldLocationFilter(owner, d), activePresenceFilter(owner, d, Math.floor(now() / 1000) - 300)], (event) => {
        if (disposed) return;
        const p = parseActivePresence(event, { verify });
        if (p) {
          if (p.owner !== owner || p.d !== d || !isPresenceFresh(p, now())) return;
          presences.set(p.id, p.event);
          for (const [id, e] of presences) {
            const q = parseActivePresence(e);
            if (!q || !isPresenceFresh(q, now())) presences.delete(id);
          }
          emit();
          return;
        }
        // The stream is live only once the first look is done: what it brings before is part of that look
        learn([event], firstLookDone ? 'stream' : 'look');
      });
    } catch {
      unsubscribe = null;
    }
  }
  void look().then(async () => {
    if (disposed) return;
    // A move signed just before a reload, accepted by no relay yet: sent now, if still the newest and recent
    const pending = readPending();
    if (pending) {
      if (now() - pending.at <= PENDING_TTL_MS) void retry();
      else dropPending();
    }
  });
  scheduleRefresh();
  syncPresenceStatus();

  return {
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    travel,
    retry,
    async refresh() {
      if (!disposed) await look();
    },
    setVisible(v) {
      if (disposed || v === visible) return;
      visible = v;
      scheduleRefresh();
      if (v) void look();
    },
    noteActivity() {
      if (disposed) return;
      void presenceTick(true);
    },
    async interact({ repeat = false } = {}) {
      if (disposed) return 'disposed';
      void presenceTick(true);
      const s = snap;
      const underWay = inFlight || s.travel.phase === 'checking' || s.travel.phase === 'signing' || s.travel.phase === 'publishing' || s.travel.phase === 'arriving';
      if (repeat || s.resolution === 'pending' || s.place === world || underWay || followSuspended || !signerNow()) return 'ignored';
      const t = now();
      if (!counter.note(t)) return 'ignored';
      if (!counter.ready(t)) {
        emit();
        scheduleFollowDecay();
        return 'counted';
      }
      const out = await travel({ explicit: false });
      // Whatever it came to (even a cooldown or a busy session), the next move needs a whole new count
      counter.reset();
      emit();
      return out;
    },
    setPresenceEnabled(on) {
      if (disposed) return;
      presenceEnabled = on;
      if (on && (presenceStatus === 'declined' || presenceStatus === 'paused-prompting')) {
        // Turning it on again is the player's act: one more try, still waiting for a real input with a prompting signer
        presenceStatus = 'on';
        presenceProven = false;
      }
      syncPresenceStatus();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearArrival();
      if (followTimer !== null) clearTimer(followTimer);
      followTimer = null;
      stopPresenceTimer();
      if (refreshTimer !== null) clearTimer(refreshTimer);
      refreshTimer = null;
      try {
        unsubscribe?.();
      } catch {
        /* the host's stream is gone anyway */
      }
      listeners.clear();
    },
  };
}

function safeBool(fn: () => boolean): boolean {
  try {
    return !!fn();
  } catch {
    return false;
  }
}
