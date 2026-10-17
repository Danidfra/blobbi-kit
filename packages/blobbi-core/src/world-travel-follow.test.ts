import { describe, expect, it } from 'vitest';
import { FOLLOW_GAP_MS, FOLLOW_INTERACTIONS, FOLLOW_WINDOW_MS, createFollowCounter } from './world-travel-follow';

describe('createFollowCounter', () => {
  it('the first and second interactions are counted, the third makes it ready', () => {
    const c = createFollowCounter();
    expect(FOLLOW_INTERACTIONS).toBe(3);
    expect(c.note(0)).toBe(true);
    expect(c.ready(0)).toBe(false);
    expect(c.note(1_500)).toBe(true);
    expect(c.ready(1_500)).toBe(false);
    expect(c.note(3_000)).toBe(true);
    expect(c.ready(3_000)).toBe(true);
  });

  it('a burst of one gesture counts once: inputs closer than the gap to the last counted one are the same', () => {
    const c = createFollowCounter();
    for (let t = 0; t < FOLLOW_GAP_MS; t += 50) c.note(t);
    expect(c.count(FOLLOW_GAP_MS - 1)).toBe(1);
    // Many presses in quick succession still take at least two gaps to make three
    for (let t = FOLLOW_GAP_MS; t < 2 * FOLLOW_GAP_MS; t += 100) c.note(t);
    expect(c.ready(2 * FOLLOW_GAP_MS - 1)).toBe(false);
    c.note(2 * FOLLOW_GAP_MS);
    expect(c.ready(2 * FOLLOW_GAP_MS)).toBe(true);
  });

  it('the window rolls: interactions older than it no longer count, and a long pause starts over', () => {
    const c = createFollowCounter();
    c.note(0);
    c.note(5_000);
    expect(c.expiresIn(5_000)).toBe(FOLLOW_WINDOW_MS - 5_000);
    expect(c.count(FOLLOW_WINDOW_MS)).toBe(1); // the first left the window
    c.note(FOLLOW_WINDOW_MS + 1);
    expect(c.ready(FOLLOW_WINDOW_MS + 1)).toBe(false);
    expect(c.count(FOLLOW_WINDOW_MS * 3)).toBe(0);
    expect(c.expiresIn(FOLLOW_WINDOW_MS * 3)).toBe(0);
  });

  it('reset starts over; the threshold, window and gap are configurable and sanitised', () => {
    const c = createFollowCounter({ needed: 2, windowMs: 1_000, gapMs: 0 });
    c.note(0);
    c.reset();
    expect(c.count(0)).toBe(0);
    c.note(10);
    c.note(20);
    expect(c.ready(20)).toBe(true);
    expect(createFollowCounter({ needed: 0 }).needed).toBe(1);
    expect(createFollowCounter({ needed: Number.NaN }).needed).toBe(FOLLOW_INTERACTIONS);
  });

  it('time going backwards (a clock change) never counts the future', () => {
    const c = createFollowCounter();
    c.note(10_000);
    expect(c.count(5_000)).toBe(0);
  });
});
