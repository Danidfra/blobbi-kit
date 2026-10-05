import { describe, expect, it } from 'vitest';
import {
  EMOTIONS,
  KEY_POSES,
  NEUTRAL_POSE,
  blushOpacity,
  expressionOf,
  lidShape,
  normalizeWeights,
  resolveFacePose,
  type FacePose,
} from './expressions';

const flat = (pose: FacePose): number[] => [
  ...Object.values(pose.mouth),
  ...Object.values(pose.browLeft),
  ...Object.values(pose.browRight),
  pose.lid,
  pose.irisScale,
  pose.blush,
];

describe('expression weights', () => {
  it('treats no weights, zero weights and junk as neutral', () => {
    expect(resolveFacePose(undefined)).toBe(NEUTRAL_POSE);
    expect(resolveFacePose({})).toBe(NEUTRAL_POSE);
    expect(resolveFacePose({ happy: 0, sad: 0 })).toBe(NEUTRAL_POSE);
    expect(resolveFacePose({ happy: Number.NaN, sad: -3 })).toBe(NEUTRAL_POSE);
    expect(resolveFacePose(expressionOf('neutral'))).toBe(NEUTRAL_POSE);
  });

  it('clamps each weight to 0..1 and scales a sum past 1 back to 1', () => {
    expect(normalizeWeights({ happy: 2 }).happy).toBe(1);
    const w = normalizeWeights({ happy: 1, sad: 1, surprised: 2 });
    expect(w.happy + w.sad + w.surprised).toBeCloseTo(1, 12);
    expect(w.happy).toBeCloseTo(1 / 3, 12);
    // Under 1 they are left alone: half happy is half happy.
    expect(normalizeWeights({ happy: 0.5 }).happy).toBe(0.5);
  });
});

describe('resolveFacePose', () => {
  it('reaches each key pose exactly at weight 1', () => {
    for (const emotion of EMOTIONS) {
      const pose = resolveFacePose({ [emotion]: 1 });
      flat(pose).forEach((value, i) => expect(value).toBeCloseTo(flat(KEY_POSES[emotion])[i], 12));
    }
  });

  it('interpolates linearly between neutral and a key pose', () => {
    for (const emotion of EMOTIONS) {
      for (const t of [0.25, 0.5, 0.75]) {
        const pose = flat(resolveFacePose({ [emotion]: t }));
        const neutral = flat(NEUTRAL_POSE);
        const key = flat(KEY_POSES[emotion]);
        pose.forEach((value, i) => expect(value).toBeCloseTo(neutral[i] + (key[i] - neutral[i]) * t, 12));
      }
    }
  });

  it('deepens a smile steadily as happiness rises', () => {
    let previous = NEUTRAL_POSE.mouth.low;
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const low = resolveFacePose({ happy: t }).mouth.low;
      expect(low).toBeGreaterThan(previous);
      previous = low;
    }
  });

  it('stays inside the span of the key poses for any mix', () => {
    const all = [NEUTRAL_POSE, ...EMOTIONS.map((e) => KEY_POSES[e])].map(flat);
    const min = all[0].map((_, i) => Math.min(...all.map((p) => p[i])));
    const max = all[0].map((_, i) => Math.max(...all.map((p) => p[i])));
    const mixes = [
      { happy: 1, sad: 1 },
      { happy: 0.7, surprised: 0.9, sleepy: 0.4 },
      { excited: 5, upset: 5, sad: 5, sleepy: 5, surprised: 5, happy: 5 },
    ];
    for (const mix of mixes) {
      flat(resolveFacePose(mix)).forEach((value, i) => {
        expect(value).toBeGreaterThanOrEqual(min[i] - 1e-12);
        expect(value).toBeLessThanOrEqual(max[i] + 1e-12);
      });
    }
  });

  it('keeps a closed mouth closed: upper and lower lip coincide unless surprise opens it', () => {
    for (const emotion of ['happy', 'excited', 'sad', 'sleepy', 'upset'] as const) {
      const { mouth } = resolveFacePose({ [emotion]: 0.6 });
      expect(mouth.up).toBeCloseTo(mouth.low, 12);
    }
    const open = resolveFacePose({ surprised: 1 }).mouth;
    expect(open.low).toBeGreaterThan(0);
    expect(open.up).toBeLessThan(0);
  });

  it('mirrors the sad brows: each lifts the end nearest the nose', () => {
    const { browLeft, browRight } = KEY_POSES.sad;
    expect(browLeft.end).toBeLessThan(browLeft.start);
    expect(browRight.start).toBeLessThan(browRight.end);
    expect(browLeft.end).toBe(browRight.start);
    expect(browLeft.start).toBe(browRight.end);
  });
});

describe('lidShape', () => {
  it('has no lid when the eye is open', () => {
    expect(lidShape(0)).toBeNull();
    expect(lidShape(-1)).toBeNull();
  });

  it("is the kit's half lid at 0.5 and its closed eye at 1", () => {
    const half = lidShape(0.5)!;
    expect(half.chord).toBeCloseTo(-0.09, 12);
    expect(half.sag).toBeCloseTo(0.3, 12);
    expect(half.tint).toBe(1);
    const closed = lidShape(1)!;
    expect(closed.chord).toBeCloseTo(8 / 91, 12);
    expect(closed.sag).toBeCloseTo(44 / 91, 12);
    expect(closed.lineWidth).toBeCloseTo(17 / 77, 12);
    expect(closed.tint).toBe(0);
    expect(closed.lower).toBe(1);
  });

  it('lowers monotonically and has no jump at the half-closed seam', () => {
    let previous = -Infinity;
    for (let c = 0.02; c <= 1; c += 0.02) {
      const chord = lidShape(c)!.chord;
      expect(chord).toBeGreaterThan(previous);
      previous = chord;
    }
    const below = lidShape(0.4999)!;
    const above = lidShape(0.5001)!;
    expect(above.chord).toBeCloseTo(below.chord, 2);
    expect(above.sag).toBeCloseTo(below.sag, 2);
    expect(above.lineWidth).toBeCloseTo(below.lineWidth, 2);
  });
});

describe('blushOpacity', () => {
  it("matches the kit's three blush states at -1, 0 and 1, and clamps beyond", () => {
    expect(blushOpacity(0)).toEqual({ base: 0.74, highlight: 0.17 });
    expect(blushOpacity(-1)).toEqual({ base: 0, highlight: 0 });
    expect(blushOpacity(1).base).toBeCloseTo(0.96, 12);
    expect(blushOpacity(1).highlight).toBeCloseTo(0.28, 12);
    expect(blushOpacity(9)).toEqual(blushOpacity(1));
    expect(blushOpacity(-9)).toEqual(blushOpacity(-1));
  });
});
