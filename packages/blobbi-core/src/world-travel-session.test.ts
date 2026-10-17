import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import { DEPARTURE_WINDOW_S, KIND_ACTIVE_PRESENCE, KIND_WORLD_LOCATION, MIN_STAY_MS, PRESENCE_RENEW_S, WORLD_HOME, WORLD_PIXEL, buildPresenceTemplate, buildWorldLocationTemplate, parseWorldLocation, type WorldTravelTemplate } from './world-travel';
import { FOLLOW_WINDOW_MS } from './world-travel-follow';
import { AUTO_RESEND_MS, HEAL_MAX_ATTEMPTS, HEAL_RETRY_MS, HEAL_VERIFY_MS, LATE_ANSWER_FACTOR, LOOK_RETRY_MS, MIN_TRAVEL_MS, PENDING_TTL_MS, RECONCILE_AFTER_MS, PRESENCE_SIGN_BUDGET_MS, TRAVEL_COOLDOWN_MS, createWorldTravel, isPermanentRefusal, storedWorldLocation, worldLocationStoreKey, type WorldTravelOptions, type WorldTravelSession, type WorldTravelSigner, type WorldTravelStore } from './world-travel-session';
import { A, B, dOf, network, relayAccept, signAs, verify, type Network } from './world-travel.test-helpers';

const D = dOf(A);
const START = Date.UTC(2027, 0, 1, 12);

/** A signer that counts what it was asked, and can refuse, stall, answer slowly or for another key. */
function signer(pubkey = A, o: { mode?: 'silent' | 'prompt'; refuse?: boolean; delayMs?: number; as?: string } = {}) {
  const asked: WorldTravelTemplate[] = [];
  const s: WorldTravelSigner & { asked: WorldTravelTemplate[]; refuse: boolean; delayMs: number } = {
    mode: o.mode ?? 'silent',
    asked,
    refuse: !!o.refuse,
    delayMs: o.delayMs ?? 0,
    async sign(t) {
      asked.push(t);
      if (s.delayMs) await new Promise((r) => setTimeout(r, s.delayMs));
      if (s.refuse) throw new Error('user rejected');
      return signAs(o.as ?? pubkey, t);
    },
  };
  return s;
}

function memoryStore(): WorldTravelStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

/** One World on one device. */
function device(net: Network, world: string, extra: Partial<WorldTravelOptions> & { sign?: ReturnType<typeof signer> | null } = {}) {
  const sign = extra.sign === undefined ? signer() : extra.sign;
  const store = (extra.store as ReturnType<typeof memoryStore>) ?? memoryStore();
  const port = net.port();
  const session = createWorldTravel({ owner: A, d: D, world, relays: port, verify, signer: () => sign, store, minTravelMs: 0, ...extra });
  const changes: string[] = [];
  session.subscribe((s) => changes.push(`${s.place}:${s.change.kind}:${s.change.key}`));
  return { session, sign: sign!, store, port, changes };
}

/** Publish a location straight to every relay (another device's move, with no session). */
function remoteMove(net: Network, world: string, atMs: number, latest: ReturnType<typeof parseWorldLocation> = null, owner = A, d = D): NostrEvent {
  const e = signAs(owner, buildWorldLocationTemplate({ owner, d, world, latest, now: atMs }));
  for (const r of net.relays) relayAccept(r, structuredClone(e));
  return e;
}

const locationsSent = (net: Network) => net.relays.flatMap((r) => r.published).filter((e) => e.kind === KIND_WORLD_LOCATION);
const settle = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

let sessions: WorldTravelSession[] = [];
const track = <T extends { session: WorldTravelSession }>(d: T): T => {
  sessions.push(d.session);
  return d;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => {
  for (const s of sessions) s.dispose();
  sessions = [];
  vi.useRealTimers();
});

describe('loading a World', () => {
  it('reads the location and signs nothing: no location at all is home', async () => {
    const net = network();
    const home = track(device(net, WORLD_HOME));
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    expect(home.session.snapshot()).toMatchObject({ status: 'ready', place: WORLD_HOME, here: true, location: null });
    expect(pixel.session.snapshot()).toMatchObject({ status: 'ready', place: WORLD_HOME, here: false });
    await settle(10 * 60_000); // refreshes, ticks, a hidden page: still nothing signed
    expect(home.sign.asked).toEqual([]);
    expect(pixel.sign.asked).toEqual([]);
    expect(locationsSent(net)).toEqual([]);
  });

  it('a Blobbi already elsewhere is away at once, shown as it is (historical: no journey replayed)', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 3_600_000);
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    expect(home.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, here: false, change: { kind: 'historical' } });
    expect(home.sign.asked).toEqual([]);
  });

  it('the stored location shows at once; a newer one on the relays replaces it; an older one never does', async () => {
    const net = network();
    const store = memoryStore();
    const old = remoteMove(net, WORLD_PIXEL, START - 60_000);
    const first = track(device(net, WORLD_HOME, { store }));
    await settle(10);
    first.session.dispose();
    // Relays move on (a move home elsewhere), but this device kept the Pixel event
    const back = remoteMove(net, WORLD_HOME, START - 1_000, parseWorldLocation(old, { verify }));
    const again = track(device(net, WORLD_HOME, { store }));
    expect(again.session.snapshot().place).toBe(WORLD_PIXEL); // from the store, before any relay answered
    await settle(10);
    expect(again.session.snapshot().location?.id).toBe(back.id);
    // A relay that lags behind (only the old event) never undoes the newer one this device has seen
    for (const r of net.relays) r.stored = [old];
    const third = track(device(net, WORLD_HOME, { store }));
    await settle(10);
    expect(third.session.snapshot().location?.id).toBe(back.id);
  });

  it('relays disagreeing: the newest valid event wins, whichever relay holds it', async () => {
    const net = network(['wss://one', 'wss://two', 'wss://three']);
    const a = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_HOME, latest: null, now: START - 30_000 }));
    const b = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: parseWorldLocation(a, { verify }), now: START - 10_000 }));
    relayAccept(net.relay('wss://one'), a);
    relayAccept(net.relay('wss://two'), b);
    relayAccept(net.relay('wss://three'), a);
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    expect(home.session.snapshot().place).toBe(WORLD_PIXEL);
  });

  it('never trusts an event for its relay: forged, other-account and other-Blobbi events change nothing', async () => {
    const net = network();
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    const forged = { ...signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: START })), sig: 'sig:nope' };
    relayAccept(net.relays[0], forged);
    remoteMove(net, WORLD_PIXEL, START, null, B, dOf(B)); // B's own Blobbi
    remoteMove(net, WORLD_PIXEL, START, null, A, dOf(A, '9999999999')); // A's other Blobbi
    await home.session.refresh();
    expect(home.session.snapshot()).toMatchObject({ place: WORLD_HOME, here: true });
  });

  it('no relay answering: unreachable, the last known location stands, and travel signs nothing', async () => {
    const net = network();
    for (const r of net.relays) r.down = true;
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    expect(pixel.session.snapshot().status).toBe('unreachable');
    expect(await pixel.session.travel()).toBe('unreachable');
    expect(pixel.sign.asked).toEqual([]);
  });
});

describe('travelling', () => {
  it('Home to Pixel: one location published on the first input; Pixel arrives; the next input publishes nothing', async () => {
    const net = network();
    const home = track(device(net, WORLD_HOME));
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    expect(await pixel.session.travel()).toBe('moved');
    expect(pixel.sign.asked).toHaveLength(1);
    expect(locationsSent(net)).toHaveLength(2); // one event, sent to each of the two relays
    expect(new Set(locationsSent(net).map((e) => e.id)).size).toBe(1);
    expect(pixel.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, here: true, travel: { phase: 'idle' } }); // home was not recently active: no wait
    // Home learns it from the stream, live
    expect(home.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, here: false, change: { kind: 'live' } });
    expect(await pixel.session.travel()).toBe('already-here');
    expect(pixel.sign.asked).toHaveLength(1);
    expect(locationsSent(net)).toHaveLength(2);
  });

  it('Pixel to Home, then back: each move is one event, ordered after the one it replaced', async () => {
    const net = network();
    const home = track(device(net, WORLD_HOME));
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    await pixel.session.travel();
    await settle(MIN_STAY_MS);
    expect(await home.session.travel()).toBe('moved');
    await settle(MIN_STAY_MS);
    expect(await pixel.session.travel()).toBe('moved');
    const ids = [...new Set(locationsSent(net).map((e) => e.id))];
    expect(ids).toHaveLength(3);
    const locs = ids.map((id) => parseWorldLocation(locationsSent(net).find((e) => e.id === id), { verify })!);
    expect(locs.map((l) => l.world)).toEqual([WORLD_PIXEL, WORLD_HOME, WORLD_PIXEL]);
    expect(locs[1].prev).toBe(locs[0].id);
    expect(locs[1].from).toBe(WORLD_PIXEL);
    expect(locs[2].createdAt).toBeGreaterThan(locs[1].createdAt);
    expect(home.session.snapshot().place).toBe(WORLD_PIXEL);
  });

  it('cross-device: two devices with their own storage agree through the relays alone', async () => {
    const net = network();
    const phone = track(device(net, WORLD_PIXEL, { store: memoryStore() }));
    await settle(10);
    await phone.session.travel();
    phone.session.dispose(); // the phone is closed
    await settle(60_000);
    const laptop = track(device(net, WORLD_HOME, { store: memoryStore() }));
    await settle(10);
    expect(laptop.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, here: false, change: { kind: 'historical' } });
    // The previous World is offline; the move does not need it
    expect(await laptop.session.travel()).toBe('moved');
    expect(laptop.session.snapshot()).toMatchObject({ place: WORLD_HOME, here: true });
    const phoneAgain = track(device(net, WORLD_PIXEL, { store: memoryStore() }));
    await settle(10);
    expect(phoneAgain.session.snapshot()).toMatchObject({ place: WORLD_HOME, here: false, change: { kind: 'historical' } });
  });

  it('a move the stream did not bring (dropped, reconnecting) is found on the next look, and shown live', async () => {
    const net = network();
    for (const r of net.relays) r.mute = true;
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    remoteMove(net, WORLD_PIXEL, Date.now());
    expect(home.session.snapshot().place).toBe(WORLD_HOME);
    await home.session.refresh(); // what a host does on reconnect, on visibility, or the timer does
    expect(home.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, change: { kind: 'live' } });
  });

  it('the timer looks again (every minute while visible, five while hidden)', async () => {
    const net = network();
    for (const r of net.relays) r.mute = true;
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    home.session.setVisible(false);
    remoteMove(net, WORLD_PIXEL, Date.now());
    await settle(60_000);
    expect(home.session.snapshot().place).toBe(WORLD_HOME);
    await settle(4 * 60_000 + 10);
    expect(home.session.snapshot().place).toBe(WORLD_PIXEL);
  });

  it('a delayed old event arriving late never regresses the location', async () => {
    const net = network();
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    const first = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: Date.now() - 20_000 }));
    const second = remoteMove(net, WORLD_HOME, Date.now(), parseWorldLocation(first, { verify }));
    // The first, older event shows up on a slow relay afterwards
    for (const s of net.relays[1].subs) s.on(first);
    expect(home.session.snapshot().location?.id).toBe(second.id);
    expect(home.session.snapshot().place).toBe(WORLD_HOME);
  });

  it('waits for the departure when the previous World was recently active, never longer than the bound', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL));
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    await pixel.session.travel();
    await settle(MIN_STAY_MS);
    // Pixel shows recent Active Presence (from another session there)
    const p = signAs(A, buildPresenceTemplate({ owner: A, d: D, world: WORLD_PIXEL, now: Date.now() }));
    for (const r of net.relays) relayAccept(r, p);
    expect(home.session.snapshot().presence.there?.world).toBe(WORLD_PIXEL);
    expect(await home.session.travel()).toBe('moved');
    const snap = home.session.snapshot();
    expect(snap).toMatchObject({ place: WORLD_HOME, here: false, travel: { phase: 'arriving' } });
    // Pixel departs at once on the event
    expect(pixel.session.snapshot()).toMatchObject({ place: WORLD_HOME, here: false, change: { kind: 'live' } });
    await settle(DEPARTURE_WINDOW_S * 1000 - 1);
    expect(home.session.snapshot().here).toBe(false);
    await settle(2);
    expect(home.session.snapshot()).toMatchObject({ here: true, travel: { phase: 'idle' } });
  });

  it('no recent presence: arrives at once (no needless wait), and correctness never depended on presence', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    expect(await home.session.travel()).toBe('moved');
    expect(home.session.snapshot()).toMatchObject({ here: true, travel: { phase: 'idle' } });
  });

  it('our own event echoing back on the stream before the relays answer does not skip the departure window', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const pixelPresence = signAs(A, buildPresenceTemplate({ owner: A, d: D, world: WORLD_PIXEL, now: START }));
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    for (const r of net.relays) relayAccept(r, pixelPresence);
    net.relays[1].queryDelay = 0;
    const heres: boolean[] = [];
    home.session.subscribe((s) => heres.push(s.here));
    const moving = home.session.travel();
    await settle(0);
    await moving;
    expect(heres.slice(0, heres.indexOf(true))).not.toContain(true);
    expect(home.session.snapshot().travel.phase).toBe('arriving');
  });
});

describe('several devices at once', () => {
  it('two devices moving the same Blobbi at the same second end on the same NIP-01 winner', async () => {
    const net = network();
    remoteMove(net, WORLD_HOME, START - 60_000);
    const pixelPhone = track(device(net, WORLD_PIXEL));
    const homeLaptop = track(device(net, WORLD_HOME));
    // A third World (e.g. Island) also moves it at the same moment
    const island = track(device(net, 'blobbi-island'));
    await settle(10);
    const [a, b] = await Promise.all([pixelPhone.session.travel({ explicit: true }), island.session.travel({ explicit: true })]);
    expect([a, b]).toEqual(['moved', 'moved']);
    await settle(3_000); // each re-reads after publishing
    const places = [pixelPhone, homeLaptop, island].map((x) => x.session.snapshot().location?.id);
    expect(new Set(places).size).toBe(1);
    const winner = pixelPhone.session.snapshot().place;
    expect([WORLD_PIXEL, 'blobbi-island']).toContain(winner);
    // The loser shows the Blobbi away and does not fight back
    const loser = winner === WORLD_PIXEL ? island : pixelPhone;
    expect(loser.session.snapshot().here).toBe(false);
    await settle(10 * 60_000);
    expect(locationsSent(net).filter((e) => e.pubkey === A)).toHaveLength(4); // two events, two relays each, nothing more
  });

  it('a casual input right after another device moved it is not a reclaim (no ping-pong); an explicit one is', async () => {
    const net = network();
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    remoteMove(net, WORLD_PIXEL, Date.now());
    expect(await home.session.travel()).toBe('contended');
    expect(home.sign.asked).toEqual([]);
    expect(await home.session.travel({ explicit: true })).toBe('moved');
  });

  it('an old device never republishes to take the Blobbi back: it stays away until asked', async () => {
    const net = network();
    const oldPhone = track(device(net, WORLD_PIXEL));
    await settle(10);
    await oldPhone.session.travel();
    remoteMove(net, WORLD_HOME, Date.now() + 1000, oldPhone.session.snapshot().location);
    await settle(30 * 60_000);
    expect(oldPhone.session.snapshot()).toMatchObject({ place: WORLD_HOME, here: false });
    expect(oldPhone.sign.asked).toHaveLength(1);
  });

  it('one move per Blobbi at a time in a page: a second request while one is in flight is busy', async () => {
    const net = network();
    remoteMove(net, WORLD_HOME, START - 60_000);
    const pixel = track(device(net, WORLD_PIXEL, { sign: signer(A, { delayMs: 500 }) }));
    await settle(10);
    const first = pixel.session.travel();
    expect(await pixel.session.travel()).toBe('busy');
    await settle(600);
    expect(await first).toBe('moved');
    expect(pixel.sign.asked).toHaveLength(1);
  });

  it('two tabs sharing a lock: the second finds the Blobbi already moved and signs nothing', async () => {
    const net = network();
    remoteMove(net, WORLD_HOME, START - 60_000);
    const locks = new Map<string, Promise<unknown>>();
    const lock = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
      const run = (locks.get(name) ?? Promise.resolve()).catch(() => {}).then(fn);
      locks.set(name, run);
      return run;
    };
    const tab1 = track(device(net, WORLD_PIXEL, { lock, sign: signer(A, { delayMs: 300 }) }));
    const tab2 = track(device(net, WORLD_PIXEL, { lock }));
    await settle(10);
    const both = Promise.all([tab1.session.travel(), tab2.session.travel()]);
    await settle(1_000);
    expect(await both).toEqual(['moved', 'already-here']);
    expect(tab2.sign.asked).toEqual([]);
  });

  it('a move made while this device was signing slowly is never overwritten: nothing is sent (stale)', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const home = track(device(net, WORLD_HOME, { sign: signer(A, { mode: 'prompt', delayMs: 5_000 }) }));
    await settle(10);
    const moving = home.session.travel({ explicit: true });
    await settle(1_000);
    // Meanwhile the player moved it to Island on another device
    remoteMove(net, 'blobbi-island', Date.now() + 120_000, home.session.snapshot().location);
    await settle(5_000);
    expect(await moving).toBe('stale');
    expect(locationsSent(net).filter((e) => e.tags.some((t) => t[0] === 'world' && t[1] === WORLD_HOME))).toEqual([]);
    expect(home.session.snapshot().place).toBe('blobbi-island');
  });

  it('accounts stay apart: a session for A ignores B entirely, and B’s session cannot move A’s Blobbi', async () => {
    const net = network();
    const a = track(device(net, WORLD_HOME));
    const bSigner = signer(B);
    const b = track({ session: createWorldTravel({ owner: B, d: dOf(B), world: WORLD_PIXEL, relays: net.port(), verify, signer: () => bSigner, minTravelMs: 0 }) });
    await settle(10);
    expect(await b.session.travel()).toBe('moved');
    expect(a.session.snapshot()).toMatchObject({ place: WORLD_HOME, here: true });
    // A signer that answers for another key is refused, and nothing is sent
    const wrong = track(device(net, WORLD_PIXEL, { sign: signer(A, { as: B }) }));
    await settle(10);
    expect(await wrong.session.travel()).toBe('wrong-account');
    expect(locationsSent(net).filter((e) => e.pubkey === A)).toEqual([]);
  });

  it('the account changing mid-move: nothing is sent', async () => {
    const net = network();
    let signedIn = true;
    const pixel = track(device(net, WORLD_PIXEL, { stillAccount: () => signedIn, sign: signer(A, { delayMs: 100 }) }));
    await settle(10);
    const moving = pixel.session.travel();
    await settle(50);
    signedIn = false;
    await settle(100);
    expect(await moving).toBe('wrong-account');
    expect(locationsSent(net)).toEqual([]);
  });
});

describe('failures and retries', () => {
  it('a refused signature: declined, nothing sent, and casual inputs do not ask again for a while', async () => {
    const net = network();
    const s = signer(A, { mode: 'prompt', refuse: true });
    const pixel = track(device(net, WORLD_PIXEL, { sign: s }));
    await settle(10);
    expect(await pixel.session.travel()).toBe('declined');
    expect(pixel.session.snapshot().travel).toEqual({ phase: 'failed', reason: 'declined' });
    expect(await pixel.session.travel()).toBe('cooldown');
    expect(s.asked).toHaveLength(1);
    s.refuse = false;
    expect(await pixel.session.travel({ explicit: true })).toBe('moved'); // the player's deliberate request
    await settle(TRAVEL_COOLDOWN_MS);
  });

  it('read-only (no signer here): never signs, never sends', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL, { sign: null }));
    await settle(10);
    expect(await pixel.session.travel({ explicit: true })).toBe('read-only');
    expect(locationsSent(net)).toEqual([]);
  });

  it('no relay accepting the move: unreachable; one automatic resend of the same event (no new signature)', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    for (const r of net.relays) r.refuse = true;
    expect(await pixel.session.travel()).toBe('unreachable');
    expect(pixel.session.snapshot()).toMatchObject({ place: WORLD_HOME, here: false, travel: { phase: 'failed', reason: 'unreachable' } });
    for (const r of net.relays) r.refuse = false;
    await settle(AUTO_RESEND_MS + 10);
    expect(pixel.sign.asked).toHaveLength(1);
    expect(pixel.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, here: true });
    expect(new Set(locationsSent(net).map((e) => e.id)).size).toBe(1);
  });

  it('a stale retry is dropped: a newer location exists, so the stored move is never sent', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    for (const r of net.relays) r.refuse = true;
    expect(await pixel.session.travel()).toBe('unreachable');
    const mine = parseWorldLocation(net.relays[0].published[0], { verify })!;
    for (const r of net.relays) r.refuse = false;
    remoteMove(net, 'blobbi-island', Date.now() + 2000, mine);
    expect(await pixel.session.retry()).toBe('stale');
    await settle(AUTO_RESEND_MS + 10);
    expect(net.relays.every((r) => !r.stored.some((e) => e.id === mine.id))).toBe(true);
    expect(pixel.session.snapshot().place).toBe('blobbi-island');
  });

  it('a stored move expires: after PENDING_TTL_MS it is never resent, and a retry is stale', async () => {
    const net = network();
    const store = memoryStore();
    const pixel = track(device(net, WORLD_PIXEL, { store }));
    await settle(10);
    for (const r of net.relays) r.down = true;
    // Census passes on relay "one", publishing fails everywhere
    net.relays[0].down = false;
    net.relays[0].refuse = true;
    expect(await pixel.session.travel()).toBe('unreachable');
    pixel.session.dispose();
    await settle(PENDING_TTL_MS + 1);
    for (const r of net.relays) Object.assign(r, { down: false, refuse: false });
    const reopened = track(device(net, WORLD_PIXEL, { store }));
    await settle(AUTO_RESEND_MS * 3);
    expect(reopened.session.snapshot().place).toBe(WORLD_HOME);
    expect(await reopened.session.retry()).toBe('stale');
    expect(net.relays.every((r) => !r.stored.length)).toBe(true);
  });

  it('a reload during a move: the signed move is resent on load (no new signature) while recent', async () => {
    const net = network();
    const store = memoryStore();
    const before = track(device(net, WORLD_PIXEL, { store }));
    await settle(10);
    for (const r of net.relays) r.refuse = true;
    await before.session.travel();
    before.session.dispose(); // reload before the automatic resend
    for (const r of net.relays) r.refuse = false;
    const after = track(device(net, WORLD_PIXEL, { store }));
    await settle(50);
    expect(after.sign.asked).toEqual([]);
    expect(after.session.snapshot()).toMatchObject({ place: WORLD_PIXEL });
  });

  it('with no store at all, the automatic resend still has the signed move (kept in memory)', async () => {
    const net = network();
    const sign = signer();
    const pixel = track({ session: createWorldTravel({ owner: A, d: D, world: WORLD_PIXEL, relays: net.port(), verify, signer: () => sign, minTravelMs: 0 }) });
    await settle(10);
    for (const r of net.relays) r.refuse = true;
    expect(await pixel.session.travel()).toBe('unreachable');
    for (const r of net.relays) r.refuse = false;
    await settle(AUTO_RESEND_MS + 10);
    expect(sign.asked).toHaveLength(1);
    expect(pixel.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, here: true });
  });

  it('one relay down: the move still happens through the others', async () => {
    const net = network();
    net.relays[0].down = true;
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(4_100);
    expect(await pixel.session.travel()).toBe('moved');
  });

  it('a relay that never answers is given up on after the timeout; the look goes on', async () => {
    const net = network();
    net.relays[0].queryDelay = 60_000;
    remoteMove(net, WORLD_PIXEL, START - 1000);
    const home = track(device(net, WORLD_HOME, { timeoutMs: 1_000 }));
    await settle(1_100);
    expect(home.session.snapshot()).toMatchObject({ status: 'ready', place: WORLD_PIXEL });
  });
});

describe('Active Presence', () => {
  const presencesSent = (net: Network) => [...new Map(net.relays.flatMap((r) => r.published).filter((e) => e.kind === KIND_ACTIVE_PRESENCE).map((e) => [e.id, e])).values()];

  it('is off by default: nothing is ever signed for it', async () => {
    const net = network();
    const home = track(device(net, WORLD_HOME, { isActive: () => true }));
    await settle(10);
    home.session.noteActivity();
    await settle(10 * 60_000);
    expect(home.sign.asked).toEqual([]);
    expect(home.session.snapshot().presence.status).toBe('off');
  });

  it('enabled with a silent signer: renewed while played here, at most once a minute; never while idle', async () => {
    const net = network();
    let active = true;
    track(device(net, WORLD_HOME, { presenceEnabled: true, isActive: () => active }));
    await settle(10);
    expect(presencesSent(net)).toHaveLength(1);
    await settle(PRESENCE_RENEW_S * 1000 * 3);
    const sent = presencesSent(net).length;
    expect(sent).toBeGreaterThanOrEqual(3);
    expect(sent).toBeLessThanOrEqual(4);
    active = false;
    await settle(10 * 60_000);
    expect(presencesSent(net)).toHaveLength(sent);
    // It never wrote a location
    expect(locationsSent(net)).toEqual([]);
  });

  it('stops when another World takes the Blobbi, and never changes or revives the location', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL, { presenceEnabled: true, isActive: () => true }));
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    await pixel.session.travel();
    await settle(PRESENCE_RENEW_S * 1000 + 100);
    const before = presencesSent(net).length;
    expect(before).toBeGreaterThanOrEqual(1);
    await settle(MIN_STAY_MS);
    await home.session.travel();
    await settle(10 * 60_000);
    expect(presencesSent(net)).toHaveLength(before);
    expect(home.session.snapshot().place).toBe(WORLD_HOME);
    expect(pixel.session.snapshot().place).toBe(WORLD_HOME);
  });

  it('with a signer that may prompt: the first presence waits for a real input, never a timer', async () => {
    const net = network();
    const s = signer(A, { mode: 'prompt' });
    const home = track(device(net, WORLD_HOME, { presenceEnabled: true, isActive: () => true, sign: s }));
    await settle(5 * 60_000);
    expect(s.asked).toEqual([]);
    home.session.noteActivity();
    await settle(10);
    expect(s.asked).toHaveLength(1); // answered at once (a remembered permission): later renewals may follow
    await settle(PRESENCE_RENEW_S * 1000 + 15_000);
    expect(s.asked).toHaveLength(2);
  });

  it('a prompting signer that asks the player each time: one presence, then paused for the session', async () => {
    const net = network();
    const s = signer(A, { mode: 'prompt', delayMs: PRESENCE_SIGN_BUDGET_MS + 500 });
    const home = track(device(net, WORLD_HOME, { presenceEnabled: true, isActive: () => true, sign: s }));
    await settle(10);
    home.session.noteActivity();
    await settle(PRESENCE_SIGN_BUDGET_MS + 600);
    expect(home.session.snapshot().presence.status).toBe('paused-prompting');
    home.session.noteActivity();
    await settle(30 * 60_000);
    expect(s.asked).toHaveLength(1);
  });

  it('a refused presence signature: declined for the session, nothing more asked; turning it on again is a new try', async () => {
    const net = network();
    const s = signer(A, { refuse: true });
    const home = track(device(net, WORLD_HOME, { presenceEnabled: true, isActive: () => true, sign: s }));
    await settle(10);
    expect(home.session.snapshot().presence.status).toBe('declined');
    await settle(30 * 60_000);
    expect(s.asked).toHaveLength(1);
    s.refuse = false;
    home.session.setPresenceEnabled(true);
    await settle(10);
    expect(s.asked).toHaveLength(2);
    expect(home.session.snapshot().presence.status).toBe('on');
  });

  it('missing presence is unknown, never "offline": the move still works and arrives at once', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 10_000);
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    expect(home.session.snapshot().presence.there).toBeNull();
    expect(await home.session.travel()).toBe('moved');
    expect(home.session.snapshot().here).toBe(true);
  });

  it('a presence for a World that no longer holds the Blobbi is ignored', async () => {
    const net = network();
    remoteMove(net, 'blobbi-island', START - 10_000);
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    const stalePixel = signAs(A, buildPresenceTemplate({ owner: A, d: D, world: WORLD_PIXEL, now: Date.now() }));
    for (const r of net.relays) relayAccept(r, stalePixel);
    expect(home.session.snapshot()).toMatchObject({ place: 'blobbi-island', presence: { there: null } });
  });
});

describe('lifecycle', () => {
  it('storedWorldLocation reads what a session kept, at once, checked like any event', async () => {
    const net = network();
    const store = memoryStore();
    expect(storedWorldLocation(store, { owner: A, d: D, verify })).toBeNull();
    expect(storedWorldLocation(null, { owner: A, d: D, verify })).toBeNull();
    const pixel = track(device(net, WORLD_PIXEL, { store }));
    await settle(10);
    await pixel.session.travel();
    expect(storedWorldLocation(store, { owner: A, d: D, verify })?.world).toBe(WORLD_PIXEL);
    expect(storedWorldLocation(store, { owner: B, d: dOf(B), verify })).toBeNull();
    // Tampered or junk: ignored
    const kept = JSON.parse(store.get(worldLocationStoreKey(A, D))!);
    store.set(worldLocationStoreKey(A, D), JSON.stringify({ ...kept, tags: [...kept.tags, ['world', 'blobbi-home']] }));
    expect(storedWorldLocation(store, { owner: A, d: D, verify })).toBeNull();
    store.set(worldLocationStoreKey(A, D), '{not json');
    expect(storedWorldLocation(store, { owner: A, d: D, verify })).toBeNull();
  });

  it('dispose: no more reads, signatures, presence or listeners; a travel after it is refused', async () => {
    const net = network();
    const home = track(device(net, WORLD_HOME, { presenceEnabled: true, isActive: () => true }));
    await settle(10);
    const asked = home.sign.asked.length;
    const seen = home.changes.length;
    home.session.dispose();
    expect(home.port.subscriptions()).toBe(0);
    remoteMove(net, WORLD_PIXEL, Date.now());
    await settle(30 * 60_000);
    expect(home.sign.asked).toHaveLength(asked);
    expect(home.changes).toHaveLength(seen);
    expect(await home.session.travel()).toBe('disposed');
  });

  it('multiple Blobbis of one account travel independently', async () => {
    const net = network();
    const other = dOf(A, '9999999999');
    const s = signer();
    const bambu = track({ session: createWorldTravel({ owner: A, d: D, world: WORLD_PIXEL, relays: net.port(), verify, signer: () => s }) });
    const brook = track({ session: createWorldTravel({ owner: A, d: other, world: WORLD_PIXEL, relays: net.port(), verify, signer: () => s }) });
    await settle(10);
    await bambu.session.travel();
    expect(bambu.session.snapshot().place).toBe(WORLD_PIXEL);
    expect(brook.session.snapshot().place).toBe(WORLD_HOME);
  });
});

// ─── M16.1 ─────────────────────────────────────────────────────────────────

describe('following the player: three interactions (M16.1)', () => {
  /** Bambu in Pixel (moved a minute ago), Home open on another device. */
  async function awayInPixel(extra: Parameters<typeof device>[2] = {}) {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const home = track(device(net, WORLD_HOME, extra));
    await settle(10);
    return { net, home };
  }

  it('the first and second interactions sign nothing; the third moves it, once, and the count starts over', async () => {
    const { net, home } = await awayInPixel();
    expect(await home.session.interact()).toBe('counted');
    expect(home.session.snapshot().follow).toEqual({ count: 1, needed: 3, suspended: false });
    await settle(1_500);
    expect(await home.session.interact()).toBe('counted');
    expect(home.sign.asked).toHaveLength(0);
    await settle(1_500);
    expect(await home.session.interact()).toBe('moved');
    expect(home.sign.asked).toHaveLength(1);
    expect(locationsSent(net)).toHaveLength(2); // one event, two relays
    expect(home.session.snapshot()).toMatchObject({ place: WORLD_HOME, follow: { count: 0 } });
    // Here now: more interactions count for nothing and sign nothing
    await settle(1_500);
    expect(await home.session.interact()).toBe('ignored');
    expect(home.sign.asked).toHaveLength(1);
  });

  it('the window rolls: two interactions, a pause, and the third is only the first of a new count', async () => {
    const { home } = await awayInPixel();
    await home.session.interact();
    await settle(1_500);
    await home.session.interact();
    await settle(FOLLOW_WINDOW_MS);
    expect(home.session.snapshot().follow.count).toBe(0); // the count decays, and the snapshot says so
    expect(await home.session.interact()).toBe('counted');
    expect(home.session.snapshot().follow.count).toBe(1);
    expect(home.sign.asked).toHaveLength(0);
  });

  it('a held key (repeats) and a burst from one gesture are one interaction at most', async () => {
    const { home } = await awayInPixel();
    expect(await home.session.interact()).toBe('counted');
    for (let i = 0; i < 30; i++) expect(await home.session.interact({ repeat: true })).toBe('ignored');
    for (let i = 0; i < 5; i++) {
      await settle(100);
      expect(await home.session.interact()).toBe('ignored');
    }
    expect(home.session.snapshot().follow.count).toBe(1);
    expect(home.sign.asked).toHaveLength(0);
  });

  it('continuous movement (an interaction every animation frame for a second) never transfers at once', async () => {
    const { home } = await awayInPixel();
    for (let t = 0; t < 1_000; t += 16) {
      await home.session.interact();
      await settle(16);
    }
    expect(home.sign.asked).toHaveLength(0);
    expect(home.session.snapshot().place).toBe(WORLD_PIXEL);
  });

  it('nothing counts while the place is not known yet (the first look is still under way)', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    for (const r of net.relays) r.queryDelay = 3_000;
    const home = track(device(net, WORLD_HOME));
    expect(home.session.snapshot().resolution).toBe('pending');
    expect(await home.session.interact()).toBe('ignored');
    await settle(3_010);
    expect(home.session.snapshot().resolution).toBe('confirmed');
    expect(await home.session.interact()).toBe('counted');
  });

  it('an explicit call moves it at once, with no interaction at all', async () => {
    const { home } = await awayInPixel();
    expect(await home.session.travel({ explicit: true })).toBe('moved');
    expect(home.sign.asked).toHaveLength(1);
  });

  it('a change of place starts the count over (the interactions were for where it was)', async () => {
    const { net, home } = await awayInPixel();
    await home.session.interact();
    await settle(1_500);
    await home.session.interact();
    const latest = home.session.snapshot().location;
    remoteMove(net, 'nostr-farm', Date.now(), latest);
    expect(home.session.snapshot()).toMatchObject({ place: 'nostr-farm', follow: { count: 0 } });
  });

  it('no ping-pong: three quick interactions right after another device moved it are contended, nothing signed', async () => {
    const net = network();
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    remoteMove(net, WORLD_PIXEL, Date.now(), null);
    expect(home.session.snapshot().place).toBe(WORLD_PIXEL);
    await home.session.interact();
    await settle(1_000);
    await home.session.interact();
    await settle(1_000);
    expect(await home.session.interact()).toBe('contended');
    expect(home.sign.asked).toHaveLength(0);
    expect(home.session.snapshot().follow.count).toBe(0);
  });

  it('a refusal suspends following: no more prompts from interactions; an explicit call asks once and resumes it', async () => {
    const s = signer(A, { mode: 'prompt', refuse: true });
    const { home } = await awayInPixel({ sign: s });
    for (let i = 0; i < 3; i++) {
      await home.session.interact();
      await settle(1_100);
    }
    expect(s.asked).toHaveLength(1);
    expect(home.session.snapshot().follow.suspended).toBe(true);
    for (let i = 0; i < 12; i++) {
      expect(await home.session.interact()).toBe('ignored');
      await settle(TRAVEL_COOLDOWN_MS / 4);
    }
    expect(s.asked).toHaveLength(1); // three minutes of play: still one prompt
    s.refuse = false;
    expect(await home.session.travel({ explicit: true })).toBe('moved');
    expect(s.asked).toHaveLength(2);
    expect(home.session.snapshot().follow.suspended).toBe(false);
  });

  it('read-only (no signer): interactions are not counted toward anything', async () => {
    const { home } = await awayInPixel({ sign: null });
    expect(await home.session.interact()).toBe('ignored');
    expect(home.session.snapshot().follow.count).toBe(0);
  });

  it('the threshold is configurable (followAfter)', async () => {
    const { home } = await awayInPixel({ followAfter: 1 });
    expect(await home.session.interact()).toBe('moved');
  });

  it('account and Blobbi changes start over: a new session never inherits a count', async () => {
    const { net, home } = await awayInPixel();
    await home.session.interact();
    await settle(1_500);
    await home.session.interact();
    home.session.dispose();
    const next = track(device(net, WORLD_HOME));
    await settle(10);
    expect(next.session.snapshot().follow.count).toBe(0);
    expect(await next.session.interact()).toBe('counted');
    expect(next.sign.asked).toHaveLength(0);
  });
});

describe('loading resolution (M16.1)', () => {
  it('pending on a fresh device, confirmed once a relay answers; no signature either way', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    for (const r of net.relays) r.queryDelay = 500;
    const home = track(device(net, WORLD_HOME));
    expect(home.session.snapshot()).toMatchObject({ resolution: 'pending', status: 'loading' });
    await settle(510);
    expect(home.session.snapshot()).toMatchObject({ resolution: 'confirmed', place: WORLD_PIXEL, here: false, change: { kind: 'historical' } });
    expect(home.sign.asked).toHaveLength(0);
  });

  it('cached: a device that kept a signed location shows it at once, before any relay', async () => {
    const net = network();
    const e = remoteMove(net, WORLD_PIXEL, START - 60_000);
    const store = memoryStore();
    store.set(worldLocationStoreKey(A, D), JSON.stringify(e));
    for (const r of net.relays) r.queryDelay = 500;
    const home = track(device(net, WORLD_HOME, { store }));
    expect(home.session.snapshot()).toMatchObject({ resolution: 'cached', place: WORLD_PIXEL, here: false });
    await settle(510);
    expect(home.session.snapshot().resolution).toBe('confirmed');
  });

  it('relays that never answer: unreachable within the timeout, never an endless wait', async () => {
    const net = network();
    for (const r of net.relays) r.queryDelay = 60_000;
    const home = track(device(net, WORLD_HOME, { timeoutMs: 4_000 }));
    await settle(4_010);
    expect(home.session.snapshot()).toMatchObject({ resolution: 'unreachable', status: 'unreachable', place: WORLD_HOME });
    expect(home.sign.asked).toHaveLength(0);
  });

  it('relays down and a kept location: unreachable, and the kept place stands', async () => {
    const net = network();
    const e = remoteMove(net, WORLD_PIXEL, START - 60_000);
    const store = memoryStore();
    store.set(worldLocationStoreKey(A, D), JSON.stringify(e));
    for (const r of net.relays) r.down = true;
    const home = track(device(net, WORLD_HOME, { store }));
    await settle(10);
    expect(home.session.snapshot()).toMatchObject({ resolution: 'unreachable', place: WORLD_PIXEL });
  });

  it('a relay holding a far-future location: ignored, the real one decides, and the next move is not inflated', async () => {
    const net = network();
    const real = remoteMove(net, WORLD_PIXEL, START - 60_000);
    const future = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: 'nostr-farm', latest: null, now: Date.UTC(2100, 0, 1) }));
    relayAccept(net.relays[0], future); // relay one replaced the real one with it
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    expect(home.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, location: { id: real.id } });
    expect(await home.session.travel({ explicit: true })).toBe('moved');
    expect(home.sign.asked[0].created_at).toBe(Math.floor(Date.now() / 1000));
  });

  it('reconnecting looks again and again: the same location never plays a second change', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    const key = home.session.snapshot().change.key;
    for (let i = 0; i < 5; i++) await home.session.refresh();
    // The same event delivered again on the stream, from every relay
    for (const r of net.relays) for (const s of r.subs) s.on(structuredClone(r.stored[0]));
    expect(home.session.snapshot().change.key).toBe(key);
  });
});

describe('the arrival schedule (M16.1)', () => {
  it('an origin nobody plays: the Blobbi forms MIN_TRAVEL_MS after the act, its arrival started arrivalLeadMs before', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const home = track(device(net, WORLD_HOME, { minTravelMs: MIN_TRAVEL_MS, arrivalLeadMs: 500 }));
    await settle(10);
    const act = Date.now();
    expect(await home.session.travel({ explicit: true })).toBe('moved');
    const t = home.session.snapshot().travel;
    expect(t).toMatchObject({ phase: 'arriving', formAt: act + MIN_TRAVEL_MS, at: act + MIN_TRAVEL_MS - 500 });
    await settle(MIN_TRAVEL_MS - 500 - 1);
    expect(home.session.snapshot().here).toBe(false);
    await settle(2);
    expect(home.session.snapshot()).toMatchObject({ here: true, travel: { phase: 'idle' } });
  });

  it('a recently active origin: the Blobbi forms at the end of the departure window; the arrival overlaps the wait', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const home = track(device(net, WORLD_HOME, { minTravelMs: MIN_TRAVEL_MS, arrivalLeadMs: 500 }));
    await settle(10);
    const p = signAs(A, buildPresenceTemplate({ owner: A, d: D, world: WORLD_PIXEL, now: Date.now() }));
    for (const r of net.relays) relayAccept(r, p);
    const act = Date.now();
    await home.session.travel({ explicit: true });
    const t = home.session.snapshot().travel;
    expect(t).toMatchObject({ phase: 'arriving', formAt: act + DEPARTURE_WINDOW_S * 1000, at: act + DEPARTURE_WINDOW_S * 1000 - 500 });
  });

  it('arrivalLeadMs may be a function, read at each arrival (reduced motion changing mid-session)', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    let lead = 500;
    const home = track(device(net, WORLD_HOME, { minTravelMs: MIN_TRAVEL_MS, arrivalLeadMs: () => lead }));
    await settle(10);
    lead = 200;
    const act = Date.now();
    await home.session.travel({ explicit: true });
    expect(home.session.snapshot().travel).toMatchObject({ phase: 'arriving', at: act + MIN_TRAVEL_MS - 200 });
  });

  it('a slow relay does not hold the arrival back: the first acceptance is enough', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const home = track(device(net, WORLD_HOME, { timeoutMs: 4_000 }));
    await settle(10);
    // Relay two takes the event but never answers in time
    const port = home.port as unknown as { publish: (url: string, e: NostrEvent, s: AbortSignal) => Promise<void> };
    const original = port.publish.bind(port);
    port.publish = (url, e, s) => (url === 'wss://two' ? new Promise<void>(() => {}) : original(url, e, s));
    const pending = home.session.travel({ explicit: true });
    await settle(50);
    expect(await pending).toBe('moved');
    expect(home.session.snapshot()).toMatchObject({ place: WORLD_HOME, here: true });
  });
});

// ─── M16.2 ─────────────────────────────────────────────────────────────────

describe('slow relays and late answers (M16.2)', () => {
  it('a relay slower than the timeout: unreachable at first, then its late answer confirms the place (shown as history)', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    for (const r of net.relays) r.queryDelay = 6_000;
    const home = track(device(net, WORLD_HOME, { timeoutMs: 4_000 }));
    await settle(4_010);
    expect(home.session.snapshot()).toMatchObject({ resolution: 'unreachable', place: WORLD_HOME });
    await settle(2_100);
    expect(home.session.snapshot()).toMatchObject({ resolution: 'confirmed', status: 'ready', place: WORLD_PIXEL, here: false, change: { kind: 'historical' } });
    expect(home.sign.asked).toHaveLength(0);
  });

  it('an answer later than LATE_ANSWER_FACTOR timeouts is given up on (aborted), and the next look tries again', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    for (const r of net.relays) r.queryDelay = 4_000 * LATE_ANSWER_FACTOR + 1_000;
    const home = track(device(net, WORLD_HOME, { timeoutMs: 4_000 }));
    await settle(4_000 * LATE_ANSWER_FACTOR + 100);
    expect(home.session.snapshot().resolution).toBe('unreachable');
    for (const r of net.relays) r.queryDelay = 0;
    await settle(LOOK_RETRY_MS * 4);
    expect(home.session.snapshot()).toMatchObject({ resolution: 'confirmed', place: WORLD_PIXEL });
  });

  it('no relay answering: looks again soon and backs off (5 s, 10 s, 20 s…), never waits a whole minute first', async () => {
    const net = network();
    for (const r of net.relays) r.down = true;
    let asked = 0;
    const port = net.port();
    const counting = { ...port, query: (url: string, f: Parameters<typeof port.query>[1], sig: AbortSignal) => (asked++, port.query(url, f, sig)) };
    const s = createWorldTravel({ owner: A, d: D, world: WORLD_HOME, relays: counting, verify, signer: () => signer(), minTravelMs: 0 });
    sessions.push(s);
    await settle(10);
    expect(asked).toBe(2);
    await settle(LOOK_RETRY_MS);
    expect(asked).toBe(4);
    await settle(LOOK_RETRY_MS * 2);
    expect(asked).toBe(6);
    await settle(LOOK_RETRY_MS * 4 - 100);
    expect(asked).toBe(6); // the third retry is 20 s after the second
    for (const r of net.relays) r.down = false;
    await settle(200); // the 20 s retry
    expect(s.snapshot().resolution).toBe('confirmed');
  });

  it('a late answer while the player is away does not play a journey, and a later live move still does', async () => {
    const net = network();
    const first = remoteMove(net, WORLD_PIXEL, START - 60_000);
    for (const r of net.relays) r.queryDelay = 5_000;
    const home = track(device(net, WORLD_HOME, { timeoutMs: 4_000 }));
    await settle(5_100);
    expect(home.session.snapshot().change.kind).toBe('historical');
    for (const r of net.relays) r.queryDelay = 0;
    remoteMove(net, 'nostr-farm', Date.now(), parseWorldLocation(first, { verify }));
    expect(home.session.snapshot()).toMatchObject({ place: 'nostr-farm', change: { kind: 'live' } });
  });
});

describe('future-dated locations: detection and explicit recovery (M16.2)', () => {
  /** Relay one has stored a location dated in 2100; relay two holds the real one. */
  async function pinnedSetup(extra: Parameters<typeof device>[2] = {}) {
    const net = network();
    const real = remoteMove(net, WORLD_PIXEL, START - 60_000);
    const future = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: 'nostr-farm', latest: null, now: Date.UTC(2100, 0, 1) }));
    relayAccept(net.relays[0], future);
    const home = track(device(net, WORLD_HOME, extra));
    await settle(10);
    return { net, real, future, home };
  }

  it('the pinned relay and the future event are reported; the real location decides; nothing is signed by itself', async () => {
    const { home, real, future } = await pinnedSetup();
    expect(home.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, location: { id: real.id }, diagnostics: { futureLocations: [future.id], pinnedRelays: ['wss://one'] } });
    await settle(10 * 60_000);
    expect(home.sign.asked).toHaveLength(0);
  });

  it('a move publishes everywhere, but the pinned relay keeps the future event (NIP-01): it stays pinned', async () => {
    const { home, net } = await pinnedSetup();
    expect(await home.session.travel({ explicit: true })).toBe('moved');
    const one = net.relays[0].stored.filter((e) => e.kind === KIND_WORLD_LOCATION);
    expect(one.map((e) => e.created_at)).toEqual([Math.floor(Date.UTC(2100, 0, 1) / 1000)]);
    await home.session.refresh();
    expect(home.session.snapshot().diagnostics.pinnedRelays).toEqual(['wss://one']);
  });

  it('repairFutureLocations (explicit): one deletion request by id, the current location resent, the relay unpinned', async () => {
    const { home, net, future } = await pinnedSetup();
    await home.session.travel({ explicit: true });
    const current = home.session.snapshot().location!;
    const out = await home.session.repairFutureLocations();
    expect(out).toEqual({ outcome: 'requested', deleted: [future.id], stillPinned: [] });
    expect(home.sign.asked.map((t) => t.kind)).toEqual([KIND_WORLD_LOCATION, 5]);
    const del = home.sign.asked[1];
    expect(del.tags).toEqual(expect.arrayContaining([['e', future.id], ['k', String(KIND_WORLD_LOCATION)]]));
    expect(del.tags.some((t) => t[0] === 'a')).toBe(false); // never by address: that would reach the real location
    expect(net.relays[0].stored.find((e) => e.kind === KIND_WORLD_LOCATION)?.id).toBe(current.id); // resent as signed
    expect(home.session.snapshot().diagnostics).toEqual({ futureLocations: [], pinnedRelays: [], laggingRelays: [] });
  });

  it('a relay that ignores the deletion stays reported as pinned', async () => {
    const { home, net } = await pinnedSetup();
    const port = home.port as unknown as { publish: (url: string, e: NostrEvent, s: AbortSignal) => Promise<void> };
    const original = port.publish.bind(port);
    port.publish = (url, e, sig) => (e.kind === 5 ? Promise.resolve() : original(url, e, sig)); // accepted, not honoured
    const out = await home.session.repairFutureLocations();
    expect(out).toMatchObject({ outcome: 'requested', stillPinned: ['wss://one'] });
    expect(net.relays[0].stored.some((e) => e.kind === KIND_WORLD_LOCATION && e.created_at > Date.now() / 1000 + 900)).toBe(true);
  });

  it('nothing to repair: nothing signed; read-only and a refusal are reported, never retried', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const clean = track(device(net, WORLD_HOME));
    await settle(10);
    expect(await clean.session.repairFutureLocations()).toEqual({ outcome: 'nothing' });
    expect(clean.sign.asked).toHaveLength(0);
    const ro = await pinnedSetup({ sign: null });
    expect(await ro.home.session.repairFutureLocations()).toEqual({ outcome: 'read-only' });
    const s = signer(A, { refuse: true });
    const refused = await pinnedSetup({ sign: s });
    expect(await refused.home.session.repairFutureLocations()).toEqual({ outcome: 'declined' });
    expect(s.asked).toHaveLength(1);
  });

  it('within the skew allowed, an event slightly ahead is not "future": nothing is reported', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START + 600_000);
    const home = track(device(net, WORLD_HOME));
    await settle(10);
    expect(home.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, diagnostics: { futureLocations: [], pinnedRelays: [] } });
  });
});

describe('relay convergence: a relay that missed a move is healed with the same signed event (0.11.1)', () => {
  const held = (net: Network, url: string) => net.relay(url).stored.find((e) => e.kind === KIND_WORLD_LOCATION)?.id ?? null;
  const sentTo = (net: Network, url: string) => net.relay(url).published.filter((e) => e.kind === KIND_WORLD_LOCATION);
  /** A port whose publishes to some relays fail for now (this device's connection to them), queries untouched. */
  function flakyPort(net: Network, failing: Set<string>) {
    const port = net.port();
    const publish = port.publish.bind(port);
    port.publish = (url, e, signal) => (failing.has(url) ? Promise.reject(new Error('error: connection lost')) : publish(url, e, signal));
    return port;
  }

  it('one relay accepts, the other refuses for now: a later look sends it the very same event; no new signature', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    Object.assign(net.relay('wss://two'), { refuse: true, refuseWith: 'rate-limited: slow down' });
    expect(await pixel.session.travel()).toBe('moved');
    const move = pixel.session.snapshot().location!.event;
    expect(held(net, 'wss://two')).toBeNull();
    await settle(RECONCILE_AFTER_MS + 10); // the look after the move: two lags, one heal, refused for now
    expect(pixel.session.snapshot().diagnostics.laggingRelays).toEqual(['wss://two']);
    expect(sentTo(net, 'wss://two')).toHaveLength(2);
    net.relay('wss://two').refuse = false;
    await settle(60_000); // the next refresh, past the pause: healed
    expect(held(net, 'wss://two')).toBe(move.id);
    await settle(HEAL_VERIFY_MS + 10); // read again: it kept it
    expect(pixel.session.snapshot().diagnostics.laggingRelays).toEqual([]);
    expect(pixel.sign.asked).toHaveLength(1);
    for (const e of sentTo(net, 'wss://two')) expect(e).toEqual(move); // id, created_at, tags, content and sig unchanged
    const sent = locationsSent(net).length;
    await settle(10 * 60_000);
    expect(locationsSent(net)).toHaveLength(sent); // in agreement: nothing more
  });

  it('a relay that was down during the move gets it once it answers again (a reconnect or a refresh)', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    net.relay('wss://two').down = true;
    expect(await pixel.session.travel()).toBe('moved');
    await settle(RECONCILE_AFTER_MS + 10);
    expect(sentTo(net, 'wss://two')).toHaveLength(0); // it answered nothing: nothing is sent blindly
    net.relay('wss://two').down = false;
    await pixel.session.refresh();
    await settle(10);
    expect(held(net, 'wss://two')).toBe(pixel.session.snapshot().location!.id);
    expect(pixel.sign.asked).toHaveLength(1);
  });

  it('a relay that never answers a publish: each heal ends at the timeout, at most HEAL_MAX_ATTEMPTS, spaced out', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    net.relay('wss://two').stall = true;
    expect(await pixel.session.travel()).toBe('moved'); // one relay is enough for a move
    await settle(RECONCILE_AFTER_MS + 10);
    expect(sentTo(net, 'wss://two')).toHaveLength(2); // the move, the first heal
    await settle(HEAL_RETRY_MS - RECONCILE_AFTER_MS - 1_000);
    await pixel.session.refresh(); // a look before the pause is over sends nothing
    expect(sentTo(net, 'wss://two')).toHaveLength(2);
    await settle(60 * 60_000);
    expect(sentTo(net, 'wss://two')).toHaveLength(1 + HEAL_MAX_ATTEMPTS);
    expect(pixel.session.snapshot().diagnostics.laggingRelays).toEqual(['wss://two']); // given up on, still reported
    expect(pixel.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, here: true });
  });

  it('a relay holding an older location is healed on load with the newer one; nothing older is ever sent, nothing signed', async () => {
    const net = network();
    const old = remoteMove(net, WORLD_HOME, START - 120_000);
    const newer = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: parseWorldLocation(old, { verify }), now: START - 60_000 }));
    relayAccept(net.relay('wss://two'), newer);
    const home = track(device(net, WORLD_HOME, { sign: signer(A, { mode: 'prompt' }) }));
    await settle(10);
    expect(home.session.snapshot().location?.id).toBe(newer.id);
    expect(held(net, 'wss://one')).toBe(newer.id);
    expect(locationsSent(net)).toEqual([newer]);
    expect(home.sign.asked).toHaveLength(0);
  });

  it('a read-only device heals too: it only carries the owner\'s event, it signs nothing', async () => {
    const net = network();
    const move = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: START - 60_000 }));
    relayAccept(net.relay('wss://one'), move);
    track(device(net, WORLD_HOME, { sign: null }));
    await settle(10);
    expect(held(net, 'wss://two')).toBe(move.id);
  });

  it('a device whose kept location is newer than the relays\' heals them from it; a lagging relay never undoes it', async () => {
    const net = network();
    const store = memoryStore();
    const old = remoteMove(net, WORLD_HOME, START - 120_000);
    const newer = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: parseWorldLocation(old, { verify }), now: START - 60_000 }));
    store.set(worldLocationStoreKey(A, D), JSON.stringify(newer)); // signed and kept here; the relays lost it
    const home = track(device(net, WORLD_HOME, { store }));
    await settle(10);
    expect(home.session.snapshot().location?.id).toBe(newer.id);
    expect([held(net, 'wss://one'), held(net, 'wss://two')]).toEqual([newer.id, newer.id]);
    expect(locationsSent(net).some((e) => e.id === old.id)).toBe(false);
  });

  it('relays already in agreement: nothing is ever sent, whatever the looks', async () => {
    const net = network();
    remoteMove(net, WORLD_PIXEL, START - 60_000);
    const home = track(device(net, WORLD_HOME));
    await settle(30 * 60_000);
    home.session.setVisible(false);
    home.session.setVisible(true);
    await home.session.refresh();
    expect(locationsSent(net)).toEqual([]);
    expect(home.session.snapshot().diagnostics.laggingRelays).toEqual([]);
  });

  it('equal created_at: every device keeps the lower id (NIP-01) whatever the relay order, and the other relay is healed with it', async () => {
    const net = network();
    const t = START - 30_000;
    const x = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: t }));
    const y = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: 'nostr-farm', latest: null, now: t }));
    const [low, high] = x.id < y.id ? [x, y] : [y, x];
    relayAccept(net.relay('wss://one'), high);
    relayAccept(net.relay('wss://two'), low);
    const a = track(device(net, WORLD_HOME));
    const b = track(device(net, WORLD_HOME, { relays: net.port({ urls: ['wss://two', 'wss://one'] }) }));
    await settle(10);
    expect(a.session.snapshot().location?.id).toBe(low.id);
    expect(b.session.snapshot().location?.id).toBe(low.id);
    expect([held(net, 'wss://one'), held(net, 'wss://two')]).toEqual([low.id, low.id]);
    expect(locationsSent(net).every((e) => e.id === low.id)).toBe(true);
  });

  it('a relay pinned by a future-dated location is left to the explicit repair; the others are healed', async () => {
    const net = network(['wss://one', 'wss://two', 'wss://three']);
    const real = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: START - 60_000 }));
    relayAccept(net.relay('wss://three'), real);
    relayAccept(net.relay('wss://one'), signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: 'nostr-farm', latest: null, now: Date.UTC(2100, 0, 1) })));
    const home = track(device(net, WORLD_HOME));
    await settle(10 * 60_000);
    expect(home.session.snapshot().location?.id).toBe(real.id);
    expect(sentTo(net, 'wss://one')).toHaveLength(0);
    expect(held(net, 'wss://two')).toBe(real.id);
    expect(home.session.snapshot().diagnostics).toMatchObject({ pinnedRelays: ['wss://one'], laggingRelays: [] });
    expect(home.sign.asked).toHaveLength(0);
  });

  it('an invalid event never counts and is never sent; a relay that keeps it is healed a bounded number of times', async () => {
    const net = network();
    const real = remoteMove(net, WORLD_PIXEL, START - 60_000);
    const forged = { ...signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_HOME, latest: parseWorldLocation(real, { verify }), now: START - 1_000 })), sig: 'sig:nope' };
    relayAccept(net.relay('wss://one'), forged); // this relay checks nothing: the forged one replaced the real one
    const home = track(device(net, WORLD_HOME));
    await settle(60 * 60_000);
    expect(home.session.snapshot().location?.id).toBe(real.id);
    expect(locationsSent(net).some((e) => e.id === forged.id)).toBe(false);
    expect(sentTo(net, 'wss://one')).toHaveLength(HEAL_MAX_ATTEMPTS); // accepted, never kept (it holds a "newer" one)
    expect(home.session.snapshot().diagnostics.laggingRelays).toEqual(['wss://one']);
  });

  it('two devices moving at once, each reaching one relay: both follow the NIP-01 winner, and both relays end up holding it', async () => {
    const net = network();
    const homeFails = new Set(['wss://two']);
    const pixelFails = new Set(['wss://one']);
    const home = track(device(net, WORLD_HOME, { relays: flakyPort(net, homeFails) }));
    const pixel = track(device(net, WORLD_PIXEL, { relays: flakyPort(net, pixelFails) }));
    await settle(10);
    remoteMove(net, 'nostr-farm', START - 60_000); // it was elsewhere: both moves are real
    await home.session.refresh();
    await pixel.session.refresh();
    const outs = await Promise.all([home.session.travel({ explicit: true }), pixel.session.travel({ explicit: true })]);
    expect(outs).toEqual(['moved', 'moved']);
    homeFails.clear();
    pixelFails.clear();
    await settle(RECONCILE_AFTER_MS + HEAL_VERIFY_MS + 100);
    const [h, p] = [home.session.snapshot().location!, pixel.session.snapshot().location!];
    expect(h.id).toBe(p.id);
    expect([held(net, 'wss://one'), held(net, 'wss://two')]).toEqual([h.id, h.id]);
    const loser = [...new Set(locationsSent(net).map((e) => e.id))].find((id) => id !== h.id)!;
    expect(locationsSent(net).filter((e) => e.id === loser)).toHaveLength(1); // its own move, to the one relay it reached; never resent over the winner
    expect(home.sign.asked.length + pixel.sign.asked.length).toBe(2);
  });

  it('a permanent refusal of the move: the relay is never healed with it; travel through the other relay goes on', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    Object.assign(net.relay('wss://two'), { refuse: true, refuseWith: 'blocked: kind 31126 is not allowed here' });
    expect(await pixel.session.travel()).toBe('moved');
    await settle(60 * 60_000);
    expect(sentTo(net, 'wss://two')).toHaveLength(1); // the move only
    expect(pixel.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, here: true, diagnostics: { laggingRelays: ['wss://two'] } });
  });

  it('a permanent refusal of a heal: one attempt, never again for that event', async () => {
    const net = network();
    const move = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: START - 60_000 }));
    relayAccept(net.relay('wss://one'), move);
    Object.assign(net.relay('wss://two'), { refuse: true, refuseWith: 'invalid: unknown kind' });
    track(device(net, WORLD_HOME));
    await settle(60 * 60_000);
    expect(sentTo(net, 'wss://two')).toHaveLength(1);
  });

  it('accepted is not stored: a relay that accepts and keeps nothing is healed at most HEAL_MAX_ATTEMPTS times, with bounded reads', async () => {
    const net = network();
    const port = net.port();
    let queries = 0;
    const query = port.query.bind(port);
    port.query = (url, f, s) => {
      queries++;
      return query(url, f, s);
    };
    const pixel = track(device(net, WORLD_PIXEL, { relays: port }));
    await settle(10);
    net.relay('wss://two').forget = true;
    expect(await pixel.session.travel()).toBe('moved');
    await settle(60 * 60_000);
    expect(sentTo(net, 'wss://two')).toHaveLength(1 + HEAL_MAX_ATTEMPTS);
    expect(pixel.session.snapshot().diagnostics.laggingRelays).toEqual(['wss://two']);
    // One look a minute (two relays each), the travel's own and the one after it, one read after each accepted heal
    expect(queries).toBeLessThanOrEqual(2 * (60 + 2 + HEAL_MAX_ATTEMPTS + 1));
    expect(pixel.sign.asked).toHaveLength(1);
  });

  it('offline: nothing is sent while no relay answers; back online, the relay that missed the move is healed', async () => {
    const net = network();
    const pixel = track(device(net, WORLD_PIXEL));
    await settle(10);
    net.relay('wss://two').down = true;
    expect(await pixel.session.travel()).toBe('moved');
    net.relay('wss://one').down = true; // the device goes offline
    const sent = locationsSent(net).length;
    await settle(10 * 60_000);
    expect(locationsSent(net)).toHaveLength(sent);
    expect(pixel.session.snapshot()).toMatchObject({ place: WORLD_PIXEL, here: true }); // all relays gone: the place stands
    for (const r of net.relays) r.down = false;
    await pixel.session.refresh(); // back online
    await settle(10);
    expect(held(net, 'wss://two')).toBe(pixel.session.snapshot().location!.id);
  });

  it('a slow relay\'s late answer is healed too', async () => {
    const net = network();
    const move = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: START - 60_000 }));
    relayAccept(net.relay('wss://one'), move);
    net.relay('wss://two').queryDelay = 6_000;
    track(device(net, WORLD_HOME, { timeoutMs: 4_000 }));
    await settle(4_100);
    expect(held(net, 'wss://two')).toBeNull();
    await settle(2_000);
    expect(held(net, 'wss://two')).toBe(move.id);
  });

  it('never while the account changed, and never during a move under way', async () => {
    const net = network();
    const move = signAs(A, buildWorldLocationTemplate({ owner: A, d: D, world: WORLD_PIXEL, latest: null, now: START - 60_000 }));
    relayAccept(net.relay('wss://one'), move);
    track(device(net, WORLD_HOME, { stillAccount: () => false }));
    await settle(10 * 60_000);
    expect(sentTo(net, 'wss://two')).toHaveLength(0);
  });

  it('isPermanentRefusal: blocked, invalid, restricted, pow and auth-required are final; rate-limited and errors are not', () => {
    for (const m of ['blocked: no', 'invalid: bad', 'restricted: paid', 'pow: 20 bits', 'auth-required: login']) expect(isPermanentRefusal(new Error(m))).toBe(true);
    for (const m of ['rate-limited: slow', 'error: db', 'unreachable', 'aborted', '']) expect(isPermanentRefusal(new Error(m))).toBe(false);
    expect(isPermanentRefusal(undefined)).toBe(false);
  });
});
