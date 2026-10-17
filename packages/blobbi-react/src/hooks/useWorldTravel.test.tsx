import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { WORLD_HOME, WORLD_PIXEL, buildWorldLocationTemplate, type ShownBlobbi, type ShownState, type WorldTravelOptions, type WorldTravelTemplate } from '@blobbi-kit/core';
import type { NostrEvent, NostrFilter } from '@blobbi-kit/core/nostr-protocol';
import { A, B, dOf, network, relayAccept, signAs, verify } from '@blobbi-kit/core/world-travel.test-helpers';
import { useWorldTravel, useWorldTravelSync } from './useWorldTravel';
import { poolWorldTravelRelays, type TravelPoolLike } from '../lib/world-travel-relays';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2027, 0, 1));
});
afterEach(() => vi.useRealTimers());

const flush = async (ms = 10) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

function counting(pubkey = A) {
  const asked: WorldTravelTemplate[] = [];
  return { asked, signer: { mode: 'silent' as const, sign: async (t: WorldTravelTemplate) => (asked.push(t), signAs(pubkey, t)) } };
}

describe('useWorldTravel', () => {
  it('one session per owner, Blobbi and World: re-renders never restart it, and nothing is signed by mounting, rendering or unmounting', async () => {
    const net = network();
    const s = counting();
    const port = net.port();
    const opts = (owner: string): WorldTravelOptions => ({ owner, d: dOf(owner), world: WORLD_PIXEL, relays: port, verify, signer: () => s.signer, minTravelMs: 0 });
    const { result, rerender, unmount } = renderHook(({ owner }) => useWorldTravel(opts(owner)), { initialProps: { owner: A } });
    await flush();
    const first = result.current.session;
    expect(first).not.toBeNull();
    expect(result.current.snapshot).toMatchObject({ owner: A, place: WORLD_HOME, here: false, status: 'ready' });
    for (let i = 0; i < 5; i++) rerender({ owner: A });
    await flush();
    expect(result.current.session).toBe(first);
    expect(port.subscriptions()).toBe(1);
    // Another account: a new session, the old one gone
    rerender({ owner: B });
    await flush();
    expect(result.current.session).not.toBe(first);
    expect(result.current.snapshot?.owner).toBe(B);
    expect(port.subscriptions()).toBe(1);
    unmount();
    await flush(10 * 60_000);
    expect(port.subscriptions()).toBe(0);
    expect(s.asked).toEqual([]);
  });

  it('null: no session at all (signed out, no Blobbi, travel turned off)', async () => {
    const { result } = renderHook(() => useWorldTravel(null));
    await flush();
    expect(result.current).toEqual({ snapshot: null, session: null });
  });

  it('a remote move shows up in the snapshot; travel publishes and the snapshot follows', async () => {
    const net = network();
    const s = counting();
    const port = net.port();
    const { result } = renderHook(() => useWorldTravel({ owner: A, d: dOf(A), world: WORLD_HOME, relays: port, verify, signer: () => s.signer, minTravelMs: 0 }));
    await flush();
    const away = signAs(A, buildWorldLocationTemplate({ owner: A, d: dOf(A), world: WORLD_PIXEL, latest: null, now: Date.now() - 60_000 }));
    act(() => {
      for (const r of net.relays) relayAccept(r, away);
    });
    expect(result.current.snapshot).toMatchObject({ place: WORLD_PIXEL, here: false, change: { kind: 'live' } });
    let outcome = '';
    await act(async () => {
      outcome = await result.current.session!.travel();
    });
    expect(outcome).toBe('moved');
    expect(result.current.snapshot).toMatchObject({ place: WORLD_HOME, here: true });
    expect(s.asked).toHaveLength(1);
  });

  it('presence follows the option without restarting the session', async () => {
    const net = network();
    const s = counting();
    const port = net.port();
    const { result, rerender } = renderHook(({ on }) => useWorldTravel({ owner: A, d: dOf(A), world: WORLD_HOME, relays: port, verify, signer: () => s.signer, minTravelMs: 0, presenceEnabled: on, isActive: () => true }), { initialProps: { on: false } });
    await flush();
    const session = result.current.session;
    expect(result.current.snapshot?.presence.status).toBe('off');
    rerender({ on: true });
    await flush();
    expect(result.current.session).toBe(session);
    expect(result.current.snapshot?.presence.status).toBe('on');
    expect(s.asked.map((t) => t.kind)).toEqual([21124]);
    rerender({ on: false });
    await flush(10 * 60_000);
    expect(s.asked).toHaveLength(1);
  });
});

describe('useWorldTravelSync', () => {
  function teleport(initial: ShownState) {
    const log: string[] = [];
    let state = initial;
    const b: ShownBlobbi = {
      state: () => state,
      enter: () => (log.push('enter'), (state = 'present')),
      leave: () => (log.push('leave'), (state = 'absent')),
      settle: (s) => (log.push(`settle-${s}`), (state = s)),
    };
    return { b, log };
  }

  it('settles on load (no journey), departs on a live move once not busy, arrives on a move back', async () => {
    const net = network();
    const port = net.port();
    const away = signAs(A, buildWorldLocationTemplate({ owner: A, d: dOf(A), world: WORLD_PIXEL, latest: null, now: Date.now() - 3_600_000 }));
    for (const r of net.relays) relayAccept(r, away);
    const t = teleport('present');
    const journeys: string[] = [];
    const { result, rerender } = renderHook(
      ({ busy }) => {
        const travel = useWorldTravel({ owner: A, d: dOf(A), world: WORLD_HOME, relays: port, verify, signer: () => counting().signer, minTravelMs: 0 });
        useWorldTravelSync({ session: travel.session, blobbi: () => t.b, busy, paused: false, onJourney: (k, p) => journeys.push(`${k}:${p}`) });
        return travel;
      },
      { initialProps: { busy: false } },
    );
    await flush(2_000);
    expect(t.log).toEqual(['settle-absent']);
    expect(journeys).toEqual([]);
    await act(async () => {
      await result.current.session!.travel({ explicit: true });
    });
    await flush(500);
    expect(t.log).toEqual(['settle-absent', 'enter']);
    // Busy (care in flight) when another device takes it: the departure waits for the moment to end
    rerender({ busy: true });
    act(() => {
      const there = signAs(A, buildWorldLocationTemplate({ owner: A, d: dOf(A), world: WORLD_PIXEL, latest: result.current.snapshot!.location, now: Date.now() + 10_000 }));
      for (const r of net.relays) relayAccept(r, there);
    });
    await flush(5_000);
    expect(t.log).toEqual(['settle-absent', 'enter']);
    rerender({ busy: false });
    await flush(400);
    expect(t.log).toEqual(['settle-absent', 'enter', 'leave']);
    expect(journeys).toEqual([`enter:${WORLD_HOME}`, `leave:${WORLD_PIXEL}`]);
  });
});

describe('poolWorldTravelRelays', () => {
  /** A pool over the in-memory network, whose streams can be cut. */
  function pool(net: ReturnType<typeof network>) {
    const live = new Map<string, Set<{ push: (m: unknown) => void; end: () => void }>>();
    const p: TravelPoolLike & { cut: (url: string) => void; reqs: number } = {
      reqs: 0,
      cut(url) {
        for (const s of live.get(url) ?? []) s.end();
      },
      relay(url) {
        const r = net.relay(url);
        return {
          async query(filters: NostrFilter[]) {
            return r.stored.filter((e) => filters.some((f) => f.kinds?.includes(e.kind)));
          },
          async event(e: NostrEvent) {
            if (r.stored.some((x) => x.id === e.id)) throw new Error('duplicate: have it');
            relayAccept(r, e);
          },
          req(filters: NostrFilter[], { signal }: { signal: AbortSignal }) {
            p.reqs++;
            const queue: unknown[] = [];
            let wake: (() => void) | null = null;
            let ended = false;
            const sub = { filters, on: (e: unknown) => entry.push(['EVENT', 's', e]) };
            const entry = {
              push: (m: unknown) => {
                queue.push(m);
                wake?.();
              },
              end: () => {
                ended = true;
                wake?.();
              },
            };
            r.subs.add(sub);
            if (!live.has(url)) live.set(url, new Set());
            live.get(url)!.add(entry);
            signal.addEventListener('abort', entry.end);
            queue.push(['EOSE', 's']);
            return {
              async *[Symbol.asyncIterator]() {
                try {
                  while (true) {
                    if (queue.length) yield queue.shift();
                    else if (ended) return;
                    else await new Promise<void>((res) => (wake = res));
                    wake = null;
                  }
                } finally {
                  r.subs.delete(sub);
                  live.get(url)!.delete(entry);
                }
              },
            };
          },
        };
      },
    };
    return p;
  }

  it('reads and writes each relay on its own; a duplicate counts as held', async () => {
    const net = network();
    const relays = poolWorldTravelRelays(pool(net), ['wss://one', 'wss://two']);
    const e = signAs(A, buildWorldLocationTemplate({ owner: A, d: dOf(A), world: WORLD_PIXEL, latest: null, now: Date.now() }));
    await relays.publish('wss://one', e, new AbortController().signal);
    await expect(relays.publish('wss://one', e, new AbortController().signal)).resolves.toBeUndefined();
    expect(await relays.query('wss://one', { kinds: [31126] }, new AbortController().signal)).toHaveLength(1);
    expect(await relays.query('wss://two', { kinds: [31126] }, new AbortController().signal)).toHaveLength(0);
  });

  it('streams every relay; a dropped stream is subscribed again and the session told to look again; stop ends it all', async () => {
    const net = network();
    const p = pool(net);
    const reconnects = vi.fn();
    const relays = poolWorldTravelRelays(p, ['wss://one', 'wss://two'], { onReconnect: reconnects });
    const got: unknown[] = [];
    const stop = relays.subscribe!([{ kinds: [31126] }], (e) => got.push(e));
    await flush();
    expect(p.reqs).toBe(2);
    const e = signAs(A, buildWorldLocationTemplate({ owner: A, d: dOf(A), world: WORLD_PIXEL, latest: null, now: Date.now() }));
    relayAccept(net.relay('wss://one'), e);
    await flush();
    expect(got).toHaveLength(1);
    p.cut('wss://one');
    await flush(2_100);
    expect(p.reqs).toBe(3);
    expect(reconnects).toHaveBeenCalledTimes(1);
    stop();
    await flush(120_000);
    expect(p.reqs).toBe(3);
  });
});
