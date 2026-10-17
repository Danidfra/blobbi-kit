/**
 * World travel in React (M16): one `createWorldTravel` session per owner +
 * Blobbi + World for the life of the component, and the sync that keeps the
 * World's own Blobbi on screen in line with it. The protocol, the rules and
 * every Nostr detail live in `@blobbi-kit/core` (`world-travel*.ts`); these
 * hooks only own the lifecycle:
 *
 *   - a new session when the owner, the Blobbi, the World or the relays
 *     change; the old one disposed (no signature, no write, no listener
 *     outlives it);
 *   - the host's signer, account check and activity are read when needed
 *     (a re-render never restarts anything, and never signs);
 *   - a look again when the page shows or comes back online.
 *
 * Nothing here signs on mount, on a re-render or on unmount: only
 * `session.travel()` (the player's act) and enabled presence do.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  createWorldTravel,
  syncTravel,
  type ShownBlobbi,
  type TravelSync,
  type WorldTravelOptions,
  type WorldTravelSession,
  type WorldTravelSnapshot,
} from '@blobbi-kit/core';

export interface WorldTravelState {
  /** The session's snapshot, or null while there is none (signed out, no Blobbi, turned off). */
  snapshot: WorldTravelSnapshot | null;
  session: WorldTravelSession | null;
}

const noop = () => () => {};
const none = () => null;

/** The session for `options` (null: none). Recreated only when owner, d, world or the relay set change. */
export function useWorldTravel(options: WorldTravelOptions | null): WorldTravelState {
  const latest = useRef(options);
  latest.current = options;
  const [session, setSession] = useState<WorldTravelSession | null>(null);
  const key = options ? `${options.owner}|${options.d}|${options.world}|${options.relays.urls.join(',')}` : null;

  useEffect(() => {
    const o = latest.current;
    if (!key || !o) return;
    const s = createWorldTravel({
      ...o,
      // Read at the moment they are needed, so the host's latest answer counts
      signer: () => latest.current?.signer?.() ?? null,
      stillAccount: () => latest.current?.stillAccount?.() ?? true,
      isActive: () => latest.current?.isActive?.() ?? false,
    });
    setSession(s);
    const doc = typeof document !== 'undefined' ? document : null;
    const win = typeof window !== 'undefined' ? window : null;
    const onVisibility = () => s.setVisible(doc?.visibilityState !== 'hidden');
    const onOnline = () => void s.refresh();
    onVisibility();
    doc?.addEventListener('visibilitychange', onVisibility);
    win?.addEventListener('online', onOnline);
    return () => {
      doc?.removeEventListener('visibilitychange', onVisibility);
      win?.removeEventListener('online', onOnline);
      s.dispose();
      setSession((current) => (current === s ? null : current));
    };
  }, [key]);

  const presenceEnabled = !!options?.presenceEnabled;
  useEffect(() => {
    session?.setPresenceEnabled(presenceEnabled);
  }, [session, presenceEnabled]);

  const snapshot = useSyncExternalStore(session ? session.subscribe : noop, session ? session.snapshot : none, none);
  return { snapshot, session };
}

export interface WorldTravelSyncOptions {
  session: WorldTravelSession | null;
  /** The World's Blobbi on screen (its teleport), or null while there is none. */
  blobbi: () => ShownBlobbi | null;
  /** The World's own moment, which a departure waits for (care in flight, a bath, a ceremony). */
  busy: boolean;
  /** The World is driving its Blobbi itself (an entry, a trip of its own): the sync stands aside. */
  paused: boolean;
  /** A journey began because of where the Blobbi is. */
  onJourney?: (kind: 'enter' | 'leave', place: string) => void;
}

/** Keeps the World's Blobbi where it is: settles on load, departs on a live move away, arrives on a move here. */
export function useWorldTravelSync({ session, blobbi, busy, paused, onJourney }: WorldTravelSyncOptions): void {
  const latest = useRef({ blobbi, busy, paused, onJourney });
  latest.current = { blobbi, busy, paused, onJourney };
  const visibleSince = useRef<number | null>(typeof document === 'undefined' || document.visibilityState !== 'hidden' ? Date.now() : null);
  const syncRef = useRef<TravelSync | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      visibleSince.current = document.visibilityState === 'hidden' ? null : Date.now();
      syncRef.current?.check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!session) return;
    const shown = (): ShownBlobbi | null => latest.current.blobbi();
    const sync = syncTravel({
      source: session,
      paused: () => latest.current.paused || !latest.current.blobbi(),
      blobbi: {
        // No Blobbi on screen: reported as in line (the sync is paused meanwhile anyway)
        state: () => {
          const b = shown();
          if (b) return b.state();
          return session.snapshot().here ? 'present' : 'absent';
        },
        enter: () => shown()?.enter(),
        leave: () => shown()?.leave(),
        settle: (s) => {
          const b = shown();
          if (!b) return;
          if (b.settle) b.settle(s);
          else if (s === 'present') b.enter();
          else b.leave();
        },
      },
      busy: () => latest.current.busy,
      page: () => ({ visible: visibleSince.current !== null, visibleSince: visibleSince.current }),
      onJourney: (kind, place) => latest.current.onJourney?.(kind, place),
    });
    syncRef.current = sync;
    return () => {
      sync.dispose();
      if (syncRef.current === sync) syncRef.current = null;
    };
  }, [session]);

  // The World's moment ended, or it stopped driving its Blobbi: look again now
  useEffect(() => {
    if (!busy && !paused) syncRef.current?.check();
  }, [busy, paused]);
}
