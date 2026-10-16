/**
 * Missions Content Model
 *
 * Two separate persistence locations:
 *   - Daily missions → kind 11125 content JSON (per-user)
 *   - Evolution missions → kind 31124 content JSON (per-Blobbi)
 *
 * Tally missions track a `count` (no event IDs).
 * Event missions track an `events` array of Nostr event IDs.
 * Completion is derived: count >= target or events.length >= target.
 */

// ─── Mission Entry Types ─────────────────────────────────────────────────────

/** A mission tracked by a simple counter (feed, clean, interact, etc.) */
export interface TallyMission {
  id: string;
  target: number;
  count: number;
}

/** A mission tracked by Nostr event IDs (post, photo, theme, etc.) */
export interface EventMission {
  id: string;
  target: number;
  events: string[];
}

/** Union of both mission shapes */
export type Mission = TallyMission | EventMission;

/** Type guard: mission tracks events */
export function isEventMission(m: Mission): m is EventMission {
  return 'events' in m;
}

/** Type guard: mission tracks a tally */
export function isTallyMission(m: Mission): m is TallyMission {
  return 'count' in m;
}

/** Check if a mission is complete */
export function isMissionComplete(m: Mission): boolean {
  if (isEventMission(m)) return m.events.length >= m.target;
  return m.count >= m.target;
}

/** Get current progress numerator */
export function missionProgress(m: Mission): number {
  if (isEventMission(m)) return m.events.length;
  return m.count;
}

// ─── Daily Missions (kind 11125) ─────────────────────────────────────────────

/** Daily missions object stored in kind 11125 content JSON */
export interface MissionsContent {
  date: string;                  // YYYY-MM-DD for daily reset detection
  daily: Mission[];              // 3 daily missions, reset each day
  rerolls: number;               // daily rerolls remaining (resets with date)
}

/**
 * The top-level content JSON for kind 11125.
 * Keys are added alongside each other; `serializeProfileContent` preserves unknown keys.
 *
 * Only `missions` is interpreted by @blobbi-kit/core. All other top-level keys
 * (e.g. Ditto's `room_layouts` / `room_furniture`, or any future extension) are
 * preserved opaquely as `unknown` and round-tripped unchanged — their shapes are
 * owned and parsed by their respective host modules, not by @blobbi-kit/core.
 */
export interface ProfileContent {
  missions?: MissionsContent;
  /** Opaque extension keys (room layouts/furniture, etc.), preserved verbatim. */
  [key: string]: unknown;
}

// ─── Evolution Missions (kind 31124) ─────────────────────────────────────────

/**
 * Evolution mission state stored in kind 31124 content JSON.
 * Per-Blobbi progression that survives reloads.
 */
export interface EvolutionContent {
  evolution: Mission[];
}

/**
 * Parse evolution missions from a kind 31124 content field.
 * Returns empty array for empty/invalid/non-JSON content. Never throws.
 */
export function parseEvolutionContent(content: string): Mission[] {
  if (!content || !content.trim()) return [];
  try {
    const raw = JSON.parse(content);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];
    return parseMissionArray(raw.evolution);
  } catch {
    // Old-format content is plain text (e.g. "Luna is an egg...") — not JSON
    return [];
  }
}

/**
 * Serialize evolution missions into kind 31124 content JSON.
 * Preserves any unknown top-level keys from the existing content.
 */
export function serializeEvolutionContent(
  existingContent: string,
  evolution: Mission[],
): string {
  let base: Record<string, unknown> = {};
  if (existingContent && existingContent.trim()) {
    try {
      const parsed = JSON.parse(existingContent);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        base = parsed;
      }
    } catch {
      // Old-format text content — start fresh
    }
  }
  return JSON.stringify({ ...base, evolution });
}

// ─── Profile Content (kind 11125) ────────────────────────────────────────────

/**
 * Parse the kind 11125 content field into a typed ProfileContent.
 * Only extracts `missions`; other keys (e.g. `room_layouts`) have dedicated parsers.
 * Returns an empty object for empty/invalid content. Never throws.
 */
export function parseProfileContent(content: string): ProfileContent {
  if (!content || !content.trim()) return {};
  try {
    const raw = JSON.parse(content);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const result: ProfileContent = {};
    if (raw.missions && typeof raw.missions === 'object') {
      result.missions = parseMissionsContent(raw.missions);
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Serialize ProfileContent back to a JSON string for publishing.
 * Preserves any unknown top-level keys from the existing content.
 *
 * NOTE: Strips any legacy `evolution` key from the missions object
 * so old 11125 events don't carry stale per-Blobbi data.
 */
export function serializeProfileContent(
  existingContent: string,
  updates: Partial<ProfileContent>,
): string {
  let base: Record<string, unknown> = {};
  if (existingContent && existingContent.trim()) {
    try {
      const parsed = JSON.parse(existingContent);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        base = parsed;
      }
    } catch {
      // corrupt content -- start fresh but don't lose updates
    }
  }
  const merged = { ...base, ...updates };

  // Strip legacy evolution from missions if present
  if (merged.missions && typeof merged.missions === 'object' && !Array.isArray(merged.missions)) {
    const m = merged.missions as unknown as Record<string, unknown>;
    if ('evolution' in m) {
      delete m.evolution;
    }
  }

  return JSON.stringify(merged);
}

/**
 * Read a `missions` object (as stored in the kind 11125 content) safely: the
 * same validation as `parseProfileContent`. Undefined when it is not one.
 */
export function parseMissionsValue(raw: unknown): MissionsContent | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  return parseMissionsContent(raw as Record<string, unknown>);
}

// ─── Merging two copies of the day's missions ───────────────────────────────

/**
 * Merge two copies of the day's missions (this device's, another device's or
 * app's, the profile's) into one, without losing progress.
 *
 * WHAT A COPY SAYS. `daily` is the day's three missions by slot; a reroll
 * replaces the mission of one slot and spends one of `rerolls`. Progress on a
 * mission only grows during the day (a count up to its target, event ids
 * added).
 *
 * THE RULES.
 *  1. The day: only copies dated `today` count; none: undefined.
 *  2. Progress: of the copies holding a mission in the same slot, the one
 *     with MORE progress counts (the higher count; for an event mission the
 *     larger set of event ids, then the lower one in sorted order), capped at
 *     the lower target. Progress is never added across copies: adding would
 *     count one action twice when a copy is merged again, and a union of two
 *     incomplete event lists could complete a mission no copy completed,
 *     which would make the merge depend on the order of merging. So a
 *     mission is complete exactly when some copy completed it.
 *  3. Rerolls: `rerolls` is the lower of the two (a spent reroll is never
 *     restored). In each slot, a COMPLETE mission comes first (completed work
 *     is never replaced; between two complete missions, the lower id); then
 *     the mission of the copy with FEWER rerolls left (it has seen more
 *     rerolls), then the lower id. Missions are placed best first over all
 *     slots at once, so a completed mission is always placed, and no mission
 *     is placed in two slots (a slot whose every candidate went elsewhere
 *     keeps its best one).
 *
 * GUARANTEES. Deterministic and commutative; idempotent once normalized
 * (`merge(m, m)` is `m` with sorted events); a completed mission is never
 * replaced by an incomplete one; `rerolls` never goes up. When the copies come
 * from ONE line of rerolls (no two devices rerolling independently on the
 * same day), it is also associative (three copies merge to the same result in
 * any order) and never brings back a mission a reroll replaced, unless that
 * mission was completed elsewhere first (completed work wins).
 *
 * KNOWN LIMITS (the missions data has no reroll history; see the tests):
 *  - Two devices or apps rerolling independently on the same day (or making
 *    the day's missions independently): still deterministic and commutative,
 *    but not associative, a replaced mission can come back, and one spent
 *    reroll can be counted once instead of twice.
 *  - A reroll that picks, in the SAME slot, a mission replaced there earlier
 *    the same day: the two are one mission to the merge, so the earlier
 *    progress carries over.
 */
export function mergeDailyMissions(a: MissionsContent | null | undefined, b: MissionsContent | null | undefined, today: string): MissionsContent | undefined {
  const copies = [a, b].filter((m): m is MissionsContent => !!m && m.date === today);
  if (copies.length === 0) return undefined;
  const [p, q] = copies.length === 1 ? [copies[0], copies[0]] : copies;

  // Progress by (slot, id): the same mission in the same slot
  const key = (slot: number, id: string) => `${slot}\u0000${id}`;
  const joined = new Map<string, Mission>();
  for (const copy of [p, q]) {
    copy.daily.forEach((m, slot) => {
      const k = key(slot, m.id);
      joined.set(k, joinMission(joined.get(k), m));
    });
  }

  type Candidate = { slot: number; id: string; rerolls: number; mission: Mission };
  const rank = (c: Candidate): [number, number, string, number] => (isMissionComplete(c.mission) ? [0, 0, c.id, c.slot] : [1, c.rerolls, c.id, c.slot]);
  const before = (x: Candidate, y: Candidate) => {
    const [a0, a1, a2, a3] = rank(x);
    const [b0, b1, b2, b3] = rank(y);
    return a0 - b0 || a1 - b1 || (a2 < b2 ? -1 : a2 > b2 ? 1 : 0) || a3 - b3;
  };

  const slots = Math.max(p.daily.length, q.daily.length);
  const candidates: Candidate[] = [];
  for (let slot = 0; slot < slots; slot++) {
    for (const copy of [p, q]) {
      const m = copy.daily[slot];
      if (!m) continue;
      const existing = candidates.find((c) => c.slot === slot && c.id === m.id);
      if (existing) existing.rerolls = Math.min(existing.rerolls, copy.rerolls);
      else candidates.push({ slot, id: m.id, rerolls: copy.rerolls, mission: joined.get(key(slot, m.id))! });
    }
  }
  // Placed best first, over every slot at once: a completed mission is always placed (in its slot), and one mission
  // never fills two slots. A slot whose every candidate went elsewhere keeps its best one.
  candidates.sort(before);
  const placed: (Mission | undefined)[] = Array.from({ length: slots });
  const used = new Set<string>();
  for (const c of candidates) {
    if (placed[c.slot] || used.has(c.id)) continue;
    placed[c.slot] = c.mission;
    used.add(c.id);
  }
  const daily = placed.map((m, slot) => m ?? candidates.find((c) => c.slot === slot)!.mission);
  return { date: today, daily, rerolls: Math.min(p.rerolls, q.rerolls) };
}

/** One mission's progress from two copies of it: the copy with more (see `mergeDailyMissions`, rule 2). */
function joinMission(a: Mission | undefined, b: Mission): Mission {
  const x = a ?? b;
  const target = Math.min(x.target, b.target);
  if (isEventMission(x) && isEventMission(b)) {
    const norm = (events: readonly string[]) => [...new Set(events)].sort().slice(0, target);
    const [ex, eb] = [norm(x.events), norm(b.events)];
    const lower = (p: string[], q: string[]) => p.join('\u0000') <= q.join('\u0000');
    const events = ex.length !== eb.length ? (ex.length > eb.length ? ex : eb) : lower(ex, eb) ? ex : eb;
    return { id: b.id, target, events };
  }
  // A tally (or a legacy event mission counted as a tally, as `trackTally` converts it)
  return { id: b.id, target, count: Math.min(target, Math.max(missionProgress(x), missionProgress(b))) };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function parseMissionsContent(raw: Record<string, unknown>): MissionsContent | undefined {
  if (typeof raw.date !== 'string') return undefined;
  return {
    date: raw.date,
    daily: parseMissionArray(raw.daily),
    rerolls: typeof raw.rerolls === 'number' ? Math.max(0, Math.floor(raw.rerolls)) : 0,
  };
}

/** @internal Exported for use by parseEvolutionContent */
function parseMissionArray(raw: unknown): Mission[] {
  if (!Array.isArray(raw)) return [];
  const result: Mission[] = [];
  for (const entry of raw) {
    const m = parseSingleMission(entry);
    if (m) result.push(m);
  }
  return result;
}

function parseSingleMission(raw: unknown): Mission | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.target !== 'number') return undefined;

  // Event-based mission
  if (Array.isArray(obj.events)) {
    return {
      id: obj.id,
      target: Math.max(1, Math.floor(obj.target)),
      events: obj.events.filter((e): e is string => typeof e === 'string'),
    };
  }

  // Tally-based mission
  if (typeof obj.count === 'number') {
    return {
      id: obj.id,
      target: Math.max(1, Math.floor(obj.target)),
      count: Math.max(0, Math.floor(obj.count)),
    };
  }

  return undefined;
}
