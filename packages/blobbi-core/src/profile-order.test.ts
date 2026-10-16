import { describe, it, expect } from 'vitest';
import type { NostrEvent } from './nostr-protocol';
import { BLOBBI_ECOSYSTEM_NAMESPACE, KIND_BLOBBONAUT_PROFILE, KIND_BLOBBONAUT_PROFILE_LEGACY } from './blobbi';
import { compareBlobbonautProfiles, pickNewestBlobbonautProfile, replacesProfile } from './profile-order';

const OWNER = 'a'.repeat(64);

function profile(o: { id: string; at: number; kind?: number; pubkey?: string; valid?: boolean; sig?: string }): NostrEvent {
  return {
    id: o.id,
    pubkey: o.pubkey ?? OWNER,
    created_at: o.at,
    kind: o.kind ?? KIND_BLOBBONAUT_PROFILE,
    tags: o.valid === false ? [['d', 'x']] : [['d', `blobbonaut-${OWNER.slice(0, 12)}`], ['b', BLOBBI_ECOSYSTEM_NAMESPACE]],
    content: '',
    sig: o.sig ?? 'ok',
  };
}

describe('the canonical order of profile events (NIP-01)', () => {
  it('the newer created_at replaces; on equal created_at the lower id replaces; never itself', () => {
    expect(replacesProfile({ id: 'b', createdAt: 2 }, { id: 'a', createdAt: 1 })).toBe(true);
    expect(replacesProfile({ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 2 })).toBe(false);
    expect(replacesProfile({ id: 'a', createdAt: 5 }, { id: 'b', createdAt: 5 })).toBe(true);
    expect(replacesProfile({ id: 'b', createdAt: 5 }, { id: 'a', createdAt: 5 })).toBe(false);
    expect(replacesProfile({ id: 'a', createdAt: 5 }, { id: 'a', createdAt: 5 })).toBe(false);
  });

  it('picks 11125 before 31125, then the newest, then the lower id, whatever the order received', () => {
    const events = [
      profile({ id: '3'.repeat(64), at: 900, kind: KIND_BLOBBONAUT_PROFILE_LEGACY }),
      profile({ id: 'c'.repeat(64), at: 500 }),
      profile({ id: 'b'.repeat(64), at: 500 }),
      profile({ id: '1'.repeat(64), at: 400 }),
    ];
    const expected = 'b'.repeat(64);
    for (const order of [events, [...events].reverse(), [events[2], events[0], events[3], events[1]]]) {
      expect(pickNewestBlobbonautProfile(order, OWNER)?.id).toBe(expected);
    }
    const sorted = [...events].sort(compareBlobbonautProfiles).map((e) => e.id[0]);
    expect(sorted).toEqual(['b', 'c', '1', '3']);
  });

  it('ignores other authors, invalid profiles and (with a verifier) bad signatures; a throwing verifier counts as invalid', () => {
    const good = profile({ id: '1'.repeat(64), at: 100 });
    const events = [
      good,
      profile({ id: '2'.repeat(64), at: 999, pubkey: 'b'.repeat(64) }),
      profile({ id: '3'.repeat(64), at: 998, valid: false }),
      profile({ id: '4'.repeat(64), at: 997, sig: 'forged' }),
    ];
    expect(pickNewestBlobbonautProfile(events, OWNER, (e) => e.sig === 'ok')?.id).toBe(good.id);
    expect(pickNewestBlobbonautProfile(events, OWNER)?.id).toBe('4'.repeat(64));
    expect(pickNewestBlobbonautProfile(events, OWNER, () => { throw new Error('boom'); })).toBeNull();
    expect(pickNewestBlobbonautProfile([], OWNER)).toBeNull();
  });
});
