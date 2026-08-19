/**
 * Protocol-level Nostr contracts owned by Blobbi Kit.
 *
 * These are the *only* Nostr shapes the kit needs, declared locally so that
 * neither published package requires consumers to install — or agree on a
 * version of — any particular Nostr library.
 *
 * ## Why these live here
 *
 * `NostrEvent` and `NostrFilter` are NIP-01 wire types: they are defined by the
 * protocol, not by any library, and every Nostr client in the ecosystem models
 * them identically. Naming a specific library's copy in the kit's public
 * signatures turned a protocol fact into a dependency-resolution constraint,
 * which is what forced host apps onto npm `overrides` every time Nostrify cut a
 * minor release.
 *
 * `NostrQuerier` replaces Nostrify's `NPool` in the kit's public API. `NPool` is
 * a *class* with `private` members, so TypeScript types it nominally: only that
 * exact class from that exact installed copy satisfied it. The kit never
 * constructs a pool, never calls `req`/`event`/`group`/`close`, and never
 * depends on relay behavior — it calls `query` and nothing else. Declaring that
 * one method is both honest about the requirement and strictly more permissive.
 *
 * ## Structural interchange
 *
 * Every type here is a plain structural interface with no brands, classes,
 * nominal markers, or `readonly` constraints. Values typed with Nostrify's
 * equivalents flow in and out without conversion, in both directions;
 * `nostr-protocol.test.ts` pins that with compile-time assignability checks
 * against the real Nostrify types, which the monorepo keeps as a dev-only
 * fixture.
 *
 * @module nostr-protocol
 */

/**
 * A signed NIP-01 event.
 *
 * Field-for-field identical to the wire format, so it is interchangeable with
 * any other library's event type.
 */
export interface NostrEvent {
  /** 32-byte lowercase hex sha256 of the serialized event data. */
  id: string;
  /** 32-byte lowercase hex public key of the event creator. */
  pubkey: string;
  /** Unix timestamp in seconds. */
  created_at: number;
  /** Integer between 0 and 65535. */
  kind: number;
  /** Matrix of arbitrary strings. */
  tags: string[][];
  /** Arbitrary string. */
  content: string;
  /** 64-byte lowercase hex signature of the sha256 hash of the serialized event data. */
  sig: string;
}

/**
 * A NIP-01 subscription filter.
 *
 * The template-literal index signature is load-bearing: Blobbi queries address
 * replaceable events by `#d`, and interaction logs by `#a` / `#p`. Narrowing it
 * to a fixed set of keys would reject filters the kit itself builds.
 */
export interface NostrFilter {
  /** A list of event IDs. */
  ids?: string[];
  /** A list of lowercase pubkeys; the pubkey of an event must be one of these. */
  authors?: string[];
  /** A list of kind numbers. */
  kinds?: number[];
  /** Unix timestamp in seconds; events must be newer than this to pass. */
  since?: number;
  /** Unix timestamp in seconds; events must be older than this to pass. */
  until?: number;
  /** Maximum number of events relays SHOULD return in the initial query. */
  limit?: number;
  /** NIP-50 search query. */
  search?: string;
  /** Tag filters: `#e` a list of event ids, `#p` a list of pubkeys, and so on. */
  [key: `#${string}`]: string[] | undefined;
}

/** Options accepted by {@link NostrQuerier.query}. */
export interface NostrQueryOptions {
  /** Aborts the query. Implementations SHOULD honor it; the kit always supplies one. */
  signal?: AbortSignal;
}

/**
 * The minimal read contract Blobbi Kit needs from a relay pool, store, or cache.
 *
 * Deliberately one method wide. Anything that can answer a filter query
 * satisfies it — a Nostrify `NPool` or `NRelay1`, an `NSet`, an IndexedDB-backed
 * store, a host's own pool wrapper, or a test double literally written as
 * `{ query: async () => [] }`.
 *
 * Implementations may accept more options than {@link NostrQueryOptions}
 * declares (Nostrify's `NPool.query` also takes `relays`); the kit passes only
 * what it needs.
 */
export interface NostrQuerier {
  /**
   * Resolve every event matching any of `filters`.
   *
   * Callers in this package rely on the returned array being deduplicated and
   * carrying the latest version of replaceable events, which is the standard
   * `query` contract across Nostr implementations.
   */
  query(filters: NostrFilter[], opts?: NostrQueryOptions): Promise<NostrEvent[]>;
}
