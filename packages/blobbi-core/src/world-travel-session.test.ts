import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import { KIND_ACTIVE_PRESENCE, KIND_WORLD_LOCATION, MIN_STAY_MS, PRESENCE_RENEW_S, WORLD_HOME, WORLD_PIXEL, buildPresenceTemplate, buildWorldLocationTemplate, parseWorldLocation, type WorldTravelTemplate } from './world-travel';
import { AUTO_RESEND_MS, PENDING_TTL_MS, PRESENCE_SIGN_BUDGET_MS, TRAVEL_COOLDOWN_MS, createWorldTravel, type WorldTravelOptions, type WorldTravelSession, type WorldTravelSigner, type WorldTravelStore } from './world-travel-session';
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
  const session = createWorldTravel({ owner: A, d: D, world, relays: port, verify, signer: () => sign, store, ...extra });
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
    await settle(2_999);
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
    const b = track({ session: createWorldTravel({ owner: B, d: dOf(B), world: WORLD_PIXEL, relays: net.port(), verify, signer: () => bSigner }) });
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
