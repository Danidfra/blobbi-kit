/**
 * A PROFILE WRITE THAT NEVER RESTORES AN OLDER PROFILE.
 *
 * The Blobbonaut profile (kind 11125) is replaceable and every Blobbi app
 * writes it: whatever is published replaces the player's profile everywhere,
 * `current_companion`, `has`, xp, unknown tags and content included. A write
 * built over an older version (a read cut short, a relay a moment behind,
 * another write meanwhile) would undo what replaced it. So, one write at a
 * time per account (`profileWriteQueue`):
 *
 *   read      every relay on its own; COMPLETE only when each relay of
 *             `required` answered to the end. Incomplete: nothing is built
 *             (`unsafe`), and an incomplete read is never taken for "there is
 *             no profile".
 *   base      the newest profile by the canonical order (`profile-order.ts`),
 *             signatures checked by the host's verifier.
 *   build     the caller's change over that base; with no profile at all,
 *             `no-profile`, unless the caller is explicitly allowed to create
 *             one (`create`).
 *   stamp     `created_at` after the base's (a clock behind still replaces it).
 *   sign      by the account, still the active one; another key is refused.
 *   re-check  a second complete read: a profile written meanwhile means
 *             nothing is sent (`stale`). Never rebuilt here: the signer is
 *             asked at most once per write.
 *   send      only if the account is still the active one; to every relay.
 *   confirm   read back: `confirmed` when at least `confirmations` relays
 *             return the very event.
 *
 * No Nostr library: the host supplies the relays (`ProfileRelays`), the
 * signer and the signature verifier.
 */
import { BLOBBONAUT_PROFILE_KINDS, getBlobbonautQueryDValues } from './blobbi';
import type { NostrEvent, NostrFilter } from './nostr-protocol';
import { pickNewestBlobbonautProfile, profileStamp, replacesProfile, type EventVerifier } from './profile-order';

/**
 * The relays every Blobbi app writes profiles to (Ditto, Blobbi Standalone,
 * Blobbi Pixel): a read in which each answered has seen the newest profile.
 * The default; a host sets its own policy in `ProfileRelays.required`.
 */
export const BLOBBI_PROFILE_REQUIRED_RELAYS: readonly string[] = ['wss://relay.ditto.pub', 'wss://relay.primal.net'];

/** The relays, one at a time (the host wraps its own client). */
export interface ProfileRelays {
  /** Every relay asked and written to. */
  urls: readonly string[];
  /** A read is complete only when each of these (among `urls`) answered. Empty or none among `urls`: every relay. */
  required: readonly string[];
  /** Resolves with the relay's stored events once it says it sent them all (EOSE); rejects on anything else. */
  query(url: string, filter: NostrFilter, signal: AbortSignal): Promise<NostrEvent[]>;
  /** Resolves when the relay accepted the event (or already had it); rejects otherwise. */
  publish(url: string, event: NostrEvent, signal: AbortSignal): Promise<void>;
}

/** What the writer signs. `created_at` and `prev` are set by the writer. */
export interface ProfileWriteTemplate {
  kind: number;
  content: string;
  tags: string[][];
  created_at?: number;
  /** The profile this one replaces (hosts keep `published_at` from it). */
  prev?: NostrEvent;
}

/** What the caller makes of the newest profile: a template, or a reason to write nothing. */
export type ProfileBuild<R = string> = { template: ProfileWriteTemplate } | { skip: R };

export type SafeProfileWriteOutcome<R = string> =
  /** Accepted by at least one relay; `confirmed` when read back from enough relays. */
  | { kind: 'sent'; event: NostrEvent; confirmed: boolean }
  /** The caller decided nothing needs writing over the newest profile. */
  | { kind: 'skipped'; reason: R; base: NostrEvent | null }
  /** A complete read found no profile, and creating one was not allowed. */
  | { kind: 'no-profile' }
  /** A relay that must answer did not: nothing was built or sent. */
  | { kind: 'unsafe' }
  /** A profile was written meanwhile: nothing was sent. */
  | { kind: 'stale' }
  /** The account changed, or the signer answered for another key: nothing was sent. */
  | { kind: 'wrong-account' }
  /** The signer refused, or no relay accepted. */
  | { kind: 'failed'; message: string };

export interface SafeProfileWriteDeps {
  owner: string;
  relays: ProfileRelays;
  /** Signs as the account. */
  sign: (template: ProfileWriteTemplate) => Promise<NostrEvent>;
  /** Checks an event's id and signature (injected: core depends on no Nostr library). */
  verify: EventVerifier;
  /** The account is still the active one (asked before signing, after signing, and right before sending). */
  stillAccount: () => boolean;
  /** How many relays must return the event for `confirmed` (default 1). */
  confirmations?: number;
  now?: () => number;
  timeoutMs?: number;
}

export const profileFilter = (owner: string): NostrFilter => ({ kinds: [...BLOBBONAUT_PROFILE_KINDS], authors: [owner], '#d': getBlobbonautQueryDValues(owner), limit: 20 });

export interface ProfileCensus {
  /** Every required relay answered to the end. */
  complete: boolean;
  /** The newest profile among every answer (canonical order, signatures checked). */
  newest: NostrEvent | null;
  /** Each relay's answer, or null when it did not answer. */
  byRelay: ReadonlyMap<string, NostrEvent[] | null>;
}

/** A read of the owner's profile from every relay on its own (see the header). */
export async function readProfileCensus(relays: ProfileRelays, owner: string, opts: { verify: EventVerifier; timeoutMs?: number }): Promise<ProfileCensus> {
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const filter = profileFilter(owner);
  const byRelay = new Map<string, NostrEvent[] | null>();
  await Promise.all(
    relays.urls.map(async (url) => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, timeoutMs);
      });
      try {
        byRelay.set(url, await Promise.race([relays.query(url, filter, controller.signal), late]));
      } catch {
        byRelay.set(url, null);
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  const required = relays.required.filter((u) => relays.urls.includes(u));
  const must = required.length ? required : relays.urls;
  const complete = must.length > 0 && must.every((u) => byRelay.get(u) != null);
  const all = [...byRelay.values()].flatMap((evs) => evs ?? []);
  return { complete, newest: pickNewestBlobbonautProfile(all, owner, opts.verify), byRelay };
}

// ─── One write at a time, per account ────────────────────────────────────────

const tails = new Map<string, Promise<unknown>>();

/**
 * One profile write at a time per account, for the whole page: every writer
 * that builds the profile from a read should run here, or two writes could
 * each be built over the profile before the other. Accounts never wait for
 * each other; a failed job never blocks the next.
 */
export const profileWriteQueue = {
  run<T>(account: string, job: () => Promise<T>): Promise<T> {
    const before = tails.get(account) ?? Promise.resolve();
    const mine = before.then(job, job);
    const tail = mine.then(
      () => undefined,
      () => undefined,
    );
    tails.set(account, tail);
    void tail.then(() => {
      if (tails.get(account) === tail) tails.delete(account);
    });
    return mine;
  },
};

// ─── The write ───────────────────────────────────────────────────────────────

export function writeProfileSafely<R = string>(deps: SafeProfileWriteDeps, build: (base: NostrEvent | null) => ProfileBuild<R>, opts: { create?: boolean } = {}): Promise<SafeProfileWriteOutcome<R>> {
  return profileWriteQueue.run(deps.owner, () => write(deps, build, opts));
}

function safe(check: EventVerifier, event: NostrEvent): boolean {
  try {
    return check(event);
  } catch {
    return false;
  }
}

async function write<R>(deps: SafeProfileWriteDeps, build: (base: NostrEvent | null) => ProfileBuild<R>, opts: { create?: boolean }): Promise<SafeProfileWriteOutcome<R>> {
  const { relays, owner, verify } = deps;
  const timeoutMs = deps.timeoutMs ?? 8_000;
  const nowS = Math.floor((deps.now ?? Date.now)() / 1000);

  const first = await readProfileCensus(relays, owner, { verify, timeoutMs });
  if (!first.complete) return { kind: 'unsafe' };
  const base = first.newest;
  if (!base && !opts.create) return { kind: 'no-profile' };
  const built = build(base);
  if ('skip' in built) return { kind: 'skipped', reason: built.skip, base };
  const template: ProfileWriteTemplate = { ...built.template, created_at: base ? Math.max(nowS, base.created_at + 1) : nowS, prev: base ?? undefined };
  if (!base) delete template.prev;

  if (!deps.stillAccount()) return { kind: 'wrong-account' };
  let signed: NostrEvent;
  try {
    signed = await deps.sign(template);
  } catch (error) {
    return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
  if (signed.pubkey !== owner || !safe(verify, signed) || !deps.stillAccount()) return { kind: 'wrong-account' };

  const again = await readProfileCensus(relays, owner, { verify, timeoutMs });
  if (!again.complete) return { kind: 'unsafe' };
  const top = again.newest;
  if (top && top.id !== base?.id && (!base || replacesProfile(profileStamp(top), profileStamp(base)))) return { kind: 'stale' };

  if (!deps.stillAccount()) return { kind: 'wrong-account' };
  const results = await Promise.allSettled(relays.urls.map((url) => relays.publish(url, signed, AbortSignal.timeout(timeoutMs))));
  if (!results.some((r) => r.status === 'fulfilled')) return { kind: 'failed', message: 'No relay accepted the profile.' };

  // Read back: confirmed only where a relay returns this very event
  const back = await readProfileCensus(relays, owner, { verify, timeoutMs });
  const holders = [...back.byRelay.values()].filter((evs) => evs?.some((e) => e.id === signed.id)).length;
  return { kind: 'sent', event: signed, confirmed: holders >= Math.max(1, deps.confirmations ?? 1) };
}
