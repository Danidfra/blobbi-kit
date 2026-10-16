import { describe, it, expect } from 'vitest';
import type { NostrEvent, NostrFilter } from './nostr-protocol';
import { buildBlobbonautTags, parseBlobbonautEvent, updateBlobbonautTags } from './blobbi';
import { BLOBBI_PROFILE_REQUIRED_RELAYS, profileWriteQueue, readProfileCensus, writeProfileSafely, type ProfileBuild, type ProfileRelays, type SafeProfileWriteDeps } from './safe-profile-write';

/**
 * The safe profile write against an in-memory relay network. Signing and verification are stand-ins (core depends on
 * no Nostr library): an event is "signed" when its sig is `sig:<id>`, and only its account makes such events.
 */

const [DITTO, PRIMAL] = BLOBBI_PROFILE_REQUIRED_RELAYS;
const BAND = 'wss://relay.nostr.band';
const NOW = 1_800_000_000_000;
const S = NOW / 1000;

let serial = 0;
function account(prefix: string) {
  const pubkey = prefix.repeat(64).slice(0, 64);
  return {
    pubkey,
    sign: (t: { kind: number; created_at: number; tags: string[][]; content: string }): NostrEvent => {
      const id = (++serial).toString(16).padStart(64, '0');
      return { id, pubkey, kind: t.kind, created_at: t.created_at, tags: t.tags.map((x) => [...x]), content: t.content, sig: `sig:${id}` };
    },
  };
}
type Account = ReturnType<typeof account>;
const verify = (e: NostrEvent) => e.sig === `sig:${e.id}`;

function profile(acc: Account, o: { companion?: string; has?: string[]; at: number; extra?: string[][]; content?: string }): NostrEvent {
  const tags = [...updateBlobbonautTags(buildBlobbonautTags(acc.pubkey), { has: o.has ?? ['blobbi-a'], ...(o.companion ? { current_companion: o.companion } : {}), xp: '420' }), ...(o.extra ?? [])];
  return acc.sign({ kind: 11125, created_at: o.at, tags, content: o.content ?? '{"room_layouts":{"v":1}}' });
}

interface Relay {
  events: NostrEvent[];
  down: boolean;
  silent: boolean;
  refuse: boolean;
  forget: boolean;
  sent: NostrEvent[];
}

function network(urls: readonly string[] = [DITTO, PRIMAL, BAND], required: readonly string[] = BLOBBI_PROFILE_REQUIRED_RELAYS) {
  const relays = new Map<string, Relay>(urls.map((u) => [u, { events: [], down: false, silent: false, refuse: false, forget: false, sent: [] }]));
  const keep = (r: Relay, e: NostrEvent) => {
    const old = r.events.find((x) => x.kind === e.kind && x.pubkey === e.pubkey);
    if (old && (old.created_at > e.created_at || (old.created_at === e.created_at && old.id <= e.id))) return;
    r.events = r.events.filter((x) => !(x.kind === e.kind && x.pubkey === e.pubkey));
    r.events.push(e);
  };
  const port: ProfileRelays = {
    urls,
    required,
    async query(url, filter: NostrFilter, signal) {
      const r = relays.get(url)!;
      if (r.down) throw new Error('unreachable');
      if (r.silent) return new Promise<NostrEvent[]>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      return r.events.filter((e) => filter.kinds!.includes(e.kind) && filter.authors!.includes(e.pubkey));
    },
    async publish(url, event) {
      const r = relays.get(url)!;
      if (r.down || r.silent) throw new Error('unreachable');
      r.sent.push(event);
      if (r.refuse) throw new Error('blocked');
      if (!r.forget) keep(r, event);
    },
  };
  return { relays, port, seed: (e: NostrEvent, on: readonly string[] = urls) => on.forEach((u) => keep(relays.get(u)!, e)), sent: () => [...relays.values()].flatMap((r) => r.sent) };
}
type Net = ReturnType<typeof network>;

function deps(net: Net, acc: Account, over: Partial<SafeProfileWriteDeps> = {}) {
  const signed: NostrEvent[] = [];
  const d: SafeProfileWriteDeps = {
    owner: acc.pubkey,
    relays: net.port,
    sign: async (t) => {
      const e = acc.sign({ kind: t.kind, created_at: t.created_at!, tags: t.tags, content: t.content });
      signed.push(e);
      return e;
    },
    verify,
    stillAccount: () => true,
    now: () => NOW,
    timeoutMs: 30,
    ...over,
  };
  return { deps: d, signed };
}

/** A daily-award-like change: only the xp tag, over whatever profile is newest. */
const award = (base: NostrEvent | null): ProfileBuild => ({ template: { kind: 11125, content: base!.content, tags: updateBlobbonautTags(base!.tags, { xp: '999' }) } });
const newestOn = (net: Net, url = DITTO) => [...net.relays.get(url)!.events].sort((a, b) => b.created_at - a.created_at)[0];

describe('writeProfileSafely', () => {
  it('builds over the newest profile (even one only a single relay holds), keeps every other tag and the content, comes after it, and is confirmed', async () => {
    const acc = account('a');
    const net = network();
    net.seed(profile(acc, { companion: 'blobbi-a', at: S - 600 }), [PRIMAL]);
    const newest = profile(acc, { companion: 'blobbi-b', has: ['blobbi-a', 'blobbi-b'], at: S + 300, extra: [['island_room', 'garden'], ['client', 'Ditto']] });
    net.seed(newest, [DITTO]);
    const run = deps(net, acc);
    const out = await writeProfileSafely(run.deps, award);
    expect(out).toMatchObject({ kind: 'sent', confirmed: true });
    const written = newestOn(net);
    expect(parseBlobbonautEvent(written)).toMatchObject({ currentCompanion: 'blobbi-b', has: ['blobbi-a', 'blobbi-b'], xp: 999 });
    expect(written.tags).toEqual(expect.arrayContaining([['island_room', 'garden'], ['client', 'Ditto']]));
    expect(written.content).toBe(newest.content);
    expect(written.created_at).toBe(newest.created_at + 1);
  });

  it('a required relay that does not answer: nothing is built, signed or sent, and it is never taken for "no profile"', async () => {
    const acc = account('b');
    for (const fault of ['down', 'silent'] as const) {
      const net = network();
      net.relays.get(PRIMAL)![fault] = true;
      const run = deps(net, acc);
      // No profile anywhere that answered, and creating is allowed: still unsafe, never a new profile
      const out = await writeProfileSafely(run.deps, () => ({ template: { kind: 11125, content: '', tags: buildBlobbonautTags(acc.pubkey) } }), { create: true });
      expect(out.kind).toBe('unsafe');
      expect(run.signed).toHaveLength(0);
      expect(net.sent()).toHaveLength(0);
    }
  });

  it('an optional relay down does not stop it; the host may set its own required relays', async () => {
    const acc = account('c');
    const net = network();
    net.seed(profile(acc, { at: S - 100 }));
    net.relays.get(BAND)!.down = true;
    expect((await writeProfileSafely(deps(net, acc).deps, award)).kind).toBe('sent');
    const strict = network([DITTO, PRIMAL, BAND], [DITTO, PRIMAL, BAND]);
    strict.seed(profile(acc, { at: S - 100 }));
    strict.relays.get(BAND)!.down = true;
    expect((await writeProfileSafely(deps(strict, acc).deps, award)).kind).toBe('unsafe');
    // Required relays none of which is asked: every relay must answer
    const odd = network([DITTO, BAND], ['wss://elsewhere']);
    odd.seed(profile(acc, { at: S - 100 }));
    odd.relays.get(BAND)!.down = true;
    expect((await writeProfileSafely(deps(odd, acc).deps, award)).kind).toBe('unsafe');
  });

  it('never creates a profile unless allowed, and then only when a complete read finds none', async () => {
    const acc = account('d');
    const create = (): ProfileBuild => ({ template: { kind: 11125, content: '', tags: updateBlobbonautTags(buildBlobbonautTags(acc.pubkey), { has: ['blobbi-n'] }) } });
    const none = network();
    expect((await writeProfileSafely(deps(none, acc).deps, create)).kind).toBe('no-profile');
    expect(none.sent()).toHaveLength(0);
    const empty = network();
    expect((await writeProfileSafely(deps(empty, acc).deps, create, { create: true })).kind).toBe('sent');
    expect(parseBlobbonautEvent(newestOn(empty))?.has).toEqual(['blobbi-n']);
  });

  it('a profile written while the signer was asked: nothing is sent, the newer one stands (also when creating)', async () => {
    const acc = account('e');
    const net = network();
    net.seed(profile(acc, { companion: 'blobbi-a', at: S - 600 }));
    const run = deps(net, acc, {
      sign: async (t) => {
        net.seed(profile(acc, { companion: 'blobbi-b', at: S - 5 }));
        return acc.sign({ kind: t.kind, created_at: t.created_at!, tags: t.tags, content: t.content });
      },
    });
    expect((await writeProfileSafely(run.deps, award)).kind).toBe('stale');
    expect(net.sent()).toHaveLength(0);
    expect(parseBlobbonautEvent(newestOn(net))?.currentCompanion).toBe('blobbi-b');

    const fresh = network();
    const creating = deps(fresh, acc, {
      sign: async (t) => {
        fresh.seed(profile(acc, { at: S - 1 }));
        return acc.sign({ kind: t.kind, created_at: t.created_at!, tags: t.tags, content: t.content });
      },
    });
    expect((await writeProfileSafely(creating.deps, () => ({ template: { kind: 11125, content: '', tags: buildBlobbonautTags(acc.pubkey) } }), { create: true })).kind).toBe('stale');
    expect(fresh.sent()).toHaveLength(0);
  });

  it('the account gone before signing, after signing or right before sending, or a signer for another key: nothing is sent', async () => {
    const acc = account('f');
    const other = account('9');
    for (const until of [0, 1, 2]) {
      const net = network();
      net.seed(profile(acc, { at: S - 100 }));
      let n = 0;
      expect((await writeProfileSafely(deps(net, acc, { stillAccount: () => n++ < until }).deps, award)).kind).toBe('wrong-account');
      expect(net.sent()).toHaveLength(0);
    }
    const net = network();
    net.seed(profile(acc, { at: S - 100 }));
    const wrongKey = deps(net, acc, { sign: async (t) => other.sign({ kind: t.kind, created_at: t.created_at!, tags: t.tags, content: t.content }) });
    expect((await writeProfileSafely(wrongKey.deps, award)).kind).toBe('wrong-account');
    expect(net.sent()).toHaveLength(0);
  });

  it('a refused signature or no relay accepting: failed; a relay that accepts and keeps nothing: sent but not confirmed', async () => {
    const acc = account('1');
    const refusedSigner = network();
    refusedSigner.seed(profile(acc, { at: S - 100 }));
    expect(await writeProfileSafely(deps(refusedSigner, acc, { sign: async () => Promise.reject(new Error('User rejected')) }).deps, award)).toMatchObject({ kind: 'failed', message: 'User rejected' });
    const refusing = network();
    refusing.seed(profile(acc, { at: S - 100 }));
    for (const r of refusing.relays.values()) r.refuse = true;
    expect((await writeProfileSafely(deps(refusing, acc).deps, award)).kind).toBe('failed');
    const forgetful = network();
    forgetful.seed(profile(acc, { at: S - 100 }));
    for (const r of forgetful.relays.values()) r.forget = true;
    expect(await writeProfileSafely(deps(forgetful, acc).deps, award)).toMatchObject({ kind: 'sent', confirmed: false });
    const one = network();
    one.seed(profile(acc, { at: S - 100 }));
    one.relays.get(PRIMAL)!.forget = true;
    one.relays.get(BAND)!.forget = true;
    expect(await writeProfileSafely(deps(one, acc, { confirmations: 2 }).deps, award)).toMatchObject({ kind: 'sent', confirmed: false });
  });

  it('ignores forged profiles and other authors; a write the caller decides against asks no signer', async () => {
    const acc = account('2');
    const net = network();
    const real = profile(acc, { companion: 'blobbi-a', at: S - 600 });
    net.seed(real);
    const forged = { ...profile(acc, { companion: 'blobbi-x', at: S - 1 }), sig: 'forged' };
    net.relays.get(PRIMAL)!.events.push(forged);
    expect((await readProfileCensus(net.port, acc.pubkey, { verify })).newest?.id).toBe(real.id);
    const run = deps(net, acc);
    expect(await writeProfileSafely(run.deps, (base) => ({ skip: `kept ${parseBlobbonautEvent(base!)?.currentCompanion}` }))).toMatchObject({ kind: 'skipped', reason: 'kept blobbi-a' });
    expect(run.signed).toHaveLength(0);
  });

  it('two writes of the same account at once: one after the other, the second built over the first', async () => {
    const acc = account('3');
    const net = network();
    net.seed(profile(acc, { companion: 'blobbi-a', at: S - 600 }));
    const choice = writeProfileSafely(deps(net, acc).deps, (base) => ({ template: { kind: 11125, content: base!.content, tags: updateBlobbonautTags(base!.tags.filter((t) => t[0] !== 'current_companion'), { current_companion: 'blobbi-b' }) } }));
    const xp = writeProfileSafely({ ...deps(net, acc).deps, now: () => NOW + 1_000 }, award);
    const [c, p] = await Promise.all([choice, xp]);
    expect([c.kind, p.kind]).toEqual(['sent', 'sent']);
    expect(parseBlobbonautEvent(newestOn(net))).toMatchObject({ currentCompanion: 'blobbi-b', xp: 999 });
  });
});

describe('profileWriteQueue', () => {
  it('runs one job at a time per account, in order; a failure never blocks the next; accounts never wait', async () => {
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = profileWriteQueue.run('q1', async () => {
      log.push('a1 start');
      await gate;
      log.push('a1 end');
      throw new Error('boom');
    });
    const second = profileWriteQueue.run('q1', async () => void log.push('a2'));
    await profileWriteQueue.run('q2', async () => void log.push('b1'));
    expect(log).toEqual(['a1 start', 'b1']);
    release();
    await expect(first).rejects.toThrow('boom');
    await second;
    expect(log).toEqual(['a1 start', 'b1', 'a1 end', 'a2']);
  });
});
