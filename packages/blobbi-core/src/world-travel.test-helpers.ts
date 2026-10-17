/**
 * Test helpers for world travel: deterministic accounts (no Nostr library, as the other core suites) and an
 * in-memory relay network with the NIP-01 storage rules the protocol relies on. An event is "signed" when its id is
 * the NIP-01 hash of its contents and its sig is `sig:<id>`; only its account makes such events.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { NostrEvent, NostrFilter } from './nostr-protocol';
import type { WorldTravelRelays } from './world-travel-session';

export const A = 'a1'.repeat(32);
export const B = 'b2'.repeat(32);
export const dOf = (pk: string, pet = '0123456789') => `blobbi-${pk.slice(0, 12)}-${pet}`;

export interface Template {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export function eventId(pubkey: string, t: Template): string {
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([0, pubkey, t.created_at, t.kind, t.tags, t.content]))));
}

export function signAs(pubkey: string, t: Template): NostrEvent {
  const id = eventId(pubkey, t);
  return { ...t, tags: t.tags.map((x) => [...x]), pubkey, id, sig: `sig:${id}` };
}

export const verify = (e: NostrEvent): boolean => e.sig === `sig:${e.id}` && e.id === eventId(e.pubkey, e);

// ─── An in-memory relay network ───

export interface FakeRelay {
  url: string;
  stored: NostrEvent[];
  down: boolean;
  /** Refuse every publish (OK false). */
  refuse: boolean;
  /** Delay before a query answers (ms, the session's timers). */
  queryDelay: number;
  /** Do not deliver live events to subscribers (a dropped stream). */
  mute: boolean;
  subs: Set<{ filters: NostrFilter[]; on: (e: unknown) => void }>;
  published: NostrEvent[];
}

const addressOf = (e: NostrEvent) => `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;

export function matches(e: NostrEvent, f: NostrFilter): boolean {
  if (f.kinds && !f.kinds.includes(e.kind)) return false;
  if (f.authors && !f.authors.includes(e.pubkey)) return false;
  if (f.since !== undefined && e.created_at < f.since) return false;
  for (const [k, v] of Object.entries(f)) {
    if (!k.startsWith('#') || !Array.isArray(v)) continue;
    const name = k.slice(1);
    if (!e.tags.some((t) => t[0] === name && (v as string[]).includes(t[1]))) return false;
  }
  return true;
}

export function fakeRelay(url: string): FakeRelay {
  return { url, stored: [], down: false, refuse: false, queryDelay: 0, mute: false, subs: new Set(), published: [] };
}

/** Store an event the way a relay does: ephemeral never, addressable newest-per-address (NIP-01), else append. */
export function relayAccept(r: FakeRelay, e: NostrEvent): void {
  if (e.kind >= 20000 && e.kind < 30000) {
    // ephemeral: delivered, never stored
  } else if (e.kind >= 30000 && e.kind < 40000) {
    const i = r.stored.findIndex((x) => addressOf(x) === addressOf(e));
    if (i < 0) r.stored.push(e);
    else if (r.stored[i].created_at < e.created_at || (r.stored[i].created_at === e.created_at && e.id < r.stored[i].id)) r.stored[i] = e;
    else return; // older: kept out, and not broadcast as new
  } else if (!r.stored.some((x) => x.id === e.id)) r.stored.push(e);
  if (!r.mute) for (const s of r.subs) if (s.filters.some((f) => matches(e, f))) s.on(structuredClone(e));
}

export interface Network {
  relays: FakeRelay[];
  /** One device's view of the relays (its own subscriptions). */
  port(opts?: { urls?: string[] }): WorldTravelRelays & { subscriptions: () => number };
  relay(url: string): FakeRelay;
}

export function network(urls: string[] = ['wss://one', 'wss://two']): Network {
  const relays = urls.map(fakeRelay);
  const relay = (url: string) => relays.find((r) => r.url === url)!;
  return {
    relays,
    relay,
    port(opts = {}) {
      const mine = opts.urls ?? urls;
      let open = 0;
      return {
        urls: mine,
        subscriptions: () => open,
        async query(url, filter, signal) {
          const r = relay(url);
          if (r.down) throw new Error('unreachable');
          if (r.queryDelay) {
            await new Promise<void>((resolve, reject) => {
              const t = setTimeout(resolve, r.queryDelay);
              signal.addEventListener('abort', () => {
                clearTimeout(t);
                reject(new Error('aborted'));
              });
            });
          }
          if (r.down) throw new Error('unreachable');
          return r.stored.filter((e) => matches(e, filter)).map((e) => structuredClone(e));
        },
        async publish(url, event) {
          const r = relay(url);
          if (r.down) throw new Error('unreachable');
          r.published.push(event);
          if (r.refuse) throw new Error('blocked: no');
          relayAccept(r, structuredClone(event));
        },
        subscribe(filters, on) {
          const subs = mine.map((url) => {
            const s = { filters, on };
            relay(url).subs.add(s);
            return { url, s };
          });
          open++;
          return () => {
            open--;
            for (const { url, s } of subs) relay(url).subs.delete(s);
          };
        },
      };
    },
  };
}
