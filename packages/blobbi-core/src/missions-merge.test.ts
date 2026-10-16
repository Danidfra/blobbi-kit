import { describe, it, expect } from 'vitest';
import { isMissionComplete, mergeDailyMissions, missionProgress, type Mission, type MissionsContent } from './missions';

/**
 * `mergeDailyMissions`: the rules on hand-made cases, then properties over many generated days.
 *
 * A generated day is ONE line of rerolls (as one device, or devices that saw each other's rerolls, make it): the
 * day's three missions, then up to three rerolls, each replacing one slot's mission. Copies of that day are taken at
 * any point of the line, each with its own progress (devices make progress independently). The two known limits
 * (independent rerolls on two devices; a mission rerolled back into the same slot) are pinned by their own tests.
 */

const TODAY = '2026-10-16';
const tally = (id: string, count: number, target = 3): Mission => ({ id, target, count });
const event = (id: string, events: string[], target = 2): Mission => ({ id, target, events });
const day = (daily: Mission[], rerolls = 3, date = TODAY): MissionsContent => ({ date, daily, rerolls });

describe('mergeDailyMissions: the rules', () => {
  it('only the day counts: another date is ignored; no copy of the day, nothing', () => {
    const today = day([tally('a', 1)]);
    const yesterday = day([tally('a', 3)], 3, '2026-10-15');
    expect(mergeDailyMissions(today, yesterday, TODAY)).toEqual(today);
    expect(mergeDailyMissions(yesterday, undefined, TODAY)).toBeUndefined();
    expect(mergeDailyMissions(null, undefined, TODAY)).toBeUndefined();
  });

  it('progress: the copy with more counts (the higher count; the larger event set, then the lower), never added up', () => {
    const a = day([tally('feed', 1), event('photo', ['e2']), tally('clean', 0)]);
    const b = day([tally('feed', 2), event('photo', ['e1', 'e2']), tally('clean', 3)]);
    expect(mergeDailyMissions(a, b, TODAY)).toEqual(day([tally('feed', 2), event('photo', ['e1', 'e2']), tally('clean', 3)]));
    // Two devices, one photo each: not added (a union could complete what no copy completed)
    const here = day([tally('feed', 0), event('photo', ['e2']), tally('clean', 0)]);
    const there = day([tally('feed', 0), event('photo', ['e1']), tally('clean', 0)]);
    expect(mergeDailyMissions(here, there, TODAY)?.daily[1]).toEqual(event('photo', ['e1']));
    expect(isMissionComplete(mergeDailyMissions(here, there, TODAY)!.daily[1])).toBe(false);
    const capped = day([tally('feed', 0), event('photo', ['e9', 'e3', 'e5'], 2), tally('clean', 0)]);
    expect(mergeDailyMissions(capped, undefined, TODAY)?.daily[1]).toEqual(event('photo', ['e3', 'e5']));
  });

  it('a legacy event mission meets its tally form: counted as a tally', () => {
    const a = day([event('interact', ['e1', 'e2'], 3)]);
    const b = day([tally('interact', 1)]);
    expect(mergeDailyMissions(a, b, TODAY)?.daily[0]).toEqual(tally('interact', 2));
  });

  it('a reroll is kept and never undone: the copy with fewer rerolls left has the newer mission in that slot', () => {
    const before = day([tally('a', 2), tally('b', 1), tally('c', 0)], 3);
    const after = day([tally('x', 0), tally('b', 0), tally('c', 1)], 2);
    expect(mergeDailyMissions(before, after, TODAY)).toEqual(day([tally('x', 0), tally('b', 1), tally('c', 1)], 2));
  });

  it('completed work is never replaced: a mission completed on one device stays, even if another rerolled it', () => {
    const completedHere = day([tally('a', 3), tally('b', 0), tally('c', 0)], 3);
    const rerolledThere = day([tally('x', 1), tally('b', 1), tally('c', 0)], 2);
    const merged = mergeDailyMissions(completedHere, rerolledThere, TODAY)!;
    expect(merged.daily.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(isMissionComplete(merged.daily[0])).toBe(true);
    // The reroll was spent all the same: never given back
    expect(merged.rerolls).toBe(2);
  });

  it('idempotent once normalized; the same mission never fills two slots', () => {
    const m = mergeDailyMissions(day([event('p', ['e2', 'e1']), tally('b', 1), tally('c', 0)]), undefined, TODAY)!;
    expect(m.daily[0]).toEqual(event('p', ['e1', 'e2']));
    expect(mergeDailyMissions(m, m, TODAY)).toEqual(m);
    const ids = mergeDailyMissions(day([tally('a', 0), tally('b', 0), tally('c', 0)], 2), day([tally('b', 0), tally('a', 0), tally('c', 0)], 2), TODAY)!.daily.map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
  });
});

// ─── Generated days ─────────────────────────────────────────────────────────

function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL = Array.from({ length: 12 }, (_, i) => ({ id: `m${String(i).padStart(2, '0')}`, kind: i % 4 === 0 ? 'event' : 'tally', target: 1 + (i % 3) }));

interface Line {
  /** The day's missions after 0, 1, 2, 3 rerolls (ids by slot). */
  stages: string[][];
}

/**
 * One line of rerolls. `repick: false`: a reroll never picks a mission the day already had (in any slot): the
 * guarantees of `mergeDailyMissions` hold in full. `repick: true`: it may pick one replaced earlier in ANOTHER slot
 * (the kit's reroll only excludes the current missions), the known limit with the weaker guarantees.
 */
function line(rand: () => number, repick = false): Line {
  const pick = (exclude: Set<string>) => {
    const left = POOL.filter((m) => !exclude.has(m.id));
    return left[Math.floor(rand() * left.length)].id;
  };
  const first: string[] = [];
  for (let i = 0; i < 3; i++) first.push(pick(new Set(first)));
  const stages = [first];
  const history = first.map((id) => new Set([id]));
  const rerolls = Math.floor(rand() * 4);
  for (let r = 0; r < rerolls; r++) {
    const current = [...stages[stages.length - 1]];
    const slot = Math.floor(rand() * 3);
    current[slot] = pick(new Set([...current, ...(repick ? history[slot] : history.flatMap((h) => [...h]))]));
    history[slot].add(current[slot]);
    stages.push(current);
  }
  return { stages };
}

/** A copy of the line at some point, with this device's own progress. */
function copyOf(l: Line, rand: () => number): MissionsContent {
  const stage = Math.floor(rand() * l.stages.length);
  const daily = l.stages[stage].map((id) => {
    const def = POOL.find((m) => m.id === id)!;
    if (def.kind === 'event') return event(id, ['e1', 'e2', 'e3'].filter(() => rand() < 0.4), def.target);
    return tally(id, Math.floor(rand() * (def.target + 1)), def.target);
  });
  return day(daily, 3 - stage);
}

const stageOf = (c: MissionsContent) => 3 - c.rerolls;
const merge = (x: MissionsContent, y: MissionsContent) => mergeDailyMissions(x, y, TODAY)!;

describe('mergeDailyMissions: properties over 400 generated days (one line of rerolls, no mission picked twice)', () => {
  const cases = Array.from({ length: 400 }, (_, n) => {
    const rand = random(n + 1);
    const l = line(rand);
    return { l, copies: [copyOf(l, rand), copyOf(l, rand), copyOf(l, rand)] };
  });

  it('commutative and idempotent', () => {
    for (const { copies: [a, b] } of cases) {
      const ab = merge(a, b);
      expect(merge(b, a)).toEqual(ab);
      expect(merge(ab, ab)).toEqual(ab);
      expect(merge(ab, b)).toEqual(ab);
    }
  });

  it('associative: three copies give one result whatever the order and grouping', () => {
    for (const { copies: [a, b, c] } of cases) {
      const results = [merge(merge(a, b), c), merge(a, merge(b, c)), merge(merge(a, c), b), merge(merge(b, c), a), merge(c, merge(a, b)), merge(merge(c, b), a)];
      for (const r of results) expect(r).toEqual(results[0]);
    }
  });

  it('never undoes a reroll unless completed work was at stake; never gives back a spent reroll; never loses progress', () => {
    for (const { l, copies } of cases) {
      const out = merge(merge(copies[0], copies[1]), copies[2]);
      const latest = Math.max(...copies.map((c) => stageOf(c)));
      expect(out.rerolls).toBe(Math.min(...copies.map((c) => c.rerolls)));
      out.daily.forEach((m, slot) => {
        // The slot's newest mission, or a mission completed somewhere (completed work is never replaced)
        if (m.id !== l.stages[latest][slot]) expect(isMissionComplete(m)).toBe(true);
        // Its progress is the best any copy had for it in that slot
        const best = Math.max(...copies.filter((c) => c.daily[slot]?.id === m.id).map((c) => missionProgress(c.daily[slot])));
        expect(missionProgress(m)).toBe(Math.min(best, m.target));
      });
      // Every mission completed in a copy is still there complete, or its slot holds another completed mission
      for (const c of copies) c.daily.forEach((m, slot) => isMissionComplete(m) && expect(isMissionComplete(out.daily[slot])).toBe(true));
    }
  });
});

describe('mergeDailyMissions: the known limits, pinned', () => {
  it('a mission picked again by a reroll for ANOTHER slot: commutative, idempotent, rerolls never up, completed work kept; not always associative', () => {
    let repickDays = 0;
    for (let n = 1; n <= 400; n++) {
      const rand = random(20_000 + n);
      const l = line(rand, true);
      const [a, b, c] = [copyOf(l, rand), copyOf(l, rand), copyOf(l, rand)];
      const slotsOf = (id: string) => new Set(l.stages.flatMap((st) => st.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0)));
      if (!l.stages.flat().some((id) => slotsOf(id).size > 1)) continue;
      repickDays++;
      const out = merge(merge(a, b), c);
      expect(merge(b, a)).toEqual(merge(a, b));
      expect(merge(out, out)).toEqual(out);
      expect(out.rerolls).toBe(Math.min(a.rerolls, b.rerolls, c.rerolls));
      for (const copy of [a, b, c])
        copy.daily.forEach((m, slot) => {
          if (!isMissionComplete(m)) return;
          expect(isMissionComplete(out.daily[slot]) || out.daily.some((o) => o.id === m.id && isMissionComplete(o))).toBe(true);
        });
    }
    expect(repickDays).toBeGreaterThan(0);
    // Found by the generated days: m09 replaced in slot 1, later picked again for slot 0; B still has the earlier m09
    // complete in slot 1. Which mission fills slot 0 (m03, the slot's first, or the m09 picked again) depends on the
    // grouping. No completed work is lost in any grouping.
    const A = day([tally('m09', 0, 1), event('m04', ['e1', 'e2'], 2), event('m01', ['e1'], 2)], 0);
    const B = day([tally('m03', 0, 1), tally('m09', 1, 1), event('m07', ['e1', 'e2'], 2)], 3);
    const C = day([tally('m09', 0, 1), event('m04', [], 2), event('m01', ['e1', 'e2'], 2)], 0);
    expect(merge(merge(A, B), C).daily[0].id).toBe('m09');
    expect(merge(A, merge(B, C)).daily[0].id).toBe('m03');
    for (const r of [merge(merge(A, B), C), merge(A, merge(B, C))]) expect(r.daily.slice(1).every(isMissionComplete)).toBe(true);
  });

  it('two devices rerolling independently: deterministic and commutative, but NOT associative (no reroll history to tell)', () => {
    // A: the day as it began, progress on O1. B: rerolled slot 0 (O1 -> X). C: rerolled slot 1 instead (O2 -> Y),
    // and still has O1 in slot 0, with less progress. Nothing in the data says C never rerolled slot 0.
    const A = day([tally('O1', 2), tally('O2', 0), tally('O3', 0)], 3);
    const B = day([tally('X', 0), tally('O2', 0), tally('O3', 0)], 2);
    const C = day([tally('O1', 1), tally('Y', 0), tally('O3', 0)], 2);
    expect(merge(B, C)).toEqual(merge(C, B));
    const left = merge(merge(A, B), C);
    const right = merge(A, merge(B, C));
    // Slot 0: O1 (lower id than X) comes back in both; its progress differs: A's 2 was dropped on the left
    expect(left.daily[0]).toEqual(tally('O1', 1));
    expect(right.daily[0]).toEqual(tally('O1', 2));
    // Two rerolls were spent; the merge can only count the lower of the copies' counts
    expect(left.rerolls).toBe(2);
  });

  it('independent rerolls: the completed copy of a mission is placed, never an incomplete copy of it from another slot', () => {
    // Both found by the generated days: the completed mission must win its id over an incomplete copy elsewhere
    const p = day([tally('m05', 1), event('m04', ['e1', 'e2'], 2), event('m07', ['e1', 'e2'], 2)], 3);
    const q = day([event('m04', ['e1'], 2), tally('m02', 0), event('m07', [], 2)], 3);
    const out = merge(p, q);
    expect(out.daily.map((m) => m.id)).toEqual(['m05', 'm04', 'm07']);
    expect(isMissionComplete(out.daily[1])).toBe(true);
    expect(merge(q, p)).toEqual(out);
  });

  it('a mission rerolled back into the same slot is one mission to the merge: the earlier progress carries over', () => {
    const before = day([tally('a', 2), tally('b', 0), tally('c', 0)], 3);
    // Slot 0 rerolled a -> x -> a: a fresh `a` with no progress
    const after = day([tally('a', 0), tally('b', 0), tally('c', 0)], 1);
    expect(merge(before, after).daily[0]).toEqual(tally('a', 2));
  });

  it('even with independent rerolls: commutative, rerolls never go up, and completed work is never lost', () => {
    for (let n = 1; n <= 200; n++) {
      const rand = random(10_000 + n);
      const [p, q] = [copyOf(line(rand), rand), copyOf(line(rand), rand)];
      const out = merge(p, q);
      expect(merge(q, p)).toEqual(out);
      expect(out.rerolls).toBe(Math.min(p.rerolls, q.rerolls));
      // A completed mission stays complete: in its slot, or (no mission is placed twice) in the slot that took it
      for (const c of [p, q])
        c.daily.forEach((m, slot) => {
          if (!isMissionComplete(m)) return;
          const kept = isMissionComplete(out.daily[slot]) || out.daily.some((o) => o.id === m.id && isMissionComplete(o));
          expect(kept).toBe(true);
        });
    }
  });
});
