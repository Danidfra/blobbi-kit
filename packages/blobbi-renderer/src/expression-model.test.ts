/**
 * The expression contract: a closed vocabulary, total normalization, and a
 * preset table whose every entry is drawable. Nothing a caller sends can
 * reach the artwork as geometry; only these names can.
 */
import { describe, it, expect } from 'vitest';
import {
  BLOBBI_EMOTIONS,
  BLOBBI_EMOTION_PRESETS,
  BLOBBI_EYE_STATES,
  BLOBBI_MOUTH_STATES,
  BLOBBI_BROW_STATES,
  BLOBBI_BLUSH_STATES,
  NEUTRAL_EXPRESSION,
  isBlobbiEmotion,
  isNeutral,
  normalizeBlobbiExpression,
} from './expression-model';

const HOSTILE: unknown[] = [
  undefined, null, 0, 1, NaN, true, '', 'HAPPY', 'happy ', '<svg>', 'constructor', '__proto__',
  [], ['happy'], {}, { eyes: '<script>' }, { mouth: 'M 0 0 L 9 9' }, { brows: 42 }, { blush: null },
  { eyes: 'open', extra: 'ignored' }, Object.create(null), () => 'happy', Symbol('happy'), 10n,
];

describe('the preset table', () => {
  it('names every documented emotion, each built only from the primitive vocabularies', () => {
    expect([...BLOBBI_EMOTIONS].sort()).toEqual(
      ['excited', 'happy', 'neutral', 'sad', 'sleepy', 'surprised', 'upset'],
    );
    for (const emotion of BLOBBI_EMOTIONS) {
      const preset = BLOBBI_EMOTION_PRESETS[emotion];
      expect(BLOBBI_EYE_STATES).toContain(preset.eyes);
      expect(BLOBBI_MOUTH_STATES).toContain(preset.mouth);
      expect(BLOBBI_BROW_STATES).toContain(preset.brows);
      expect(BLOBBI_BLUSH_STATES).toContain(preset.blush);
      expect(Object.isFrozen(preset)).toBe(true);
    }
  });

  it('pins the preset → primitive mapping', () => {
    expect(BLOBBI_EMOTION_PRESETS).toEqual({
      neutral:   { eyes: 'open', mouth: 'neutral', brows: 'neutral',  blush: 'soft' },
      happy:     { eyes: 'open', mouth: 'smile',   brows: 'raised',   blush: 'soft' },
      excited:   { eyes: 'wide', mouth: 'grin',    brows: 'raised',   blush: 'strong' },
      sad:       { eyes: 'half', mouth: 'frown',   brows: 'inner-up', blush: 'none' },
      sleepy:    { eyes: 'half', mouth: 'flat',    brows: 'lowered',  blush: 'soft' },
      surprised: { eyes: 'wide', mouth: 'open',    brows: 'raised',   blush: 'soft' },
      upset:     { eyes: 'open', mouth: 'flat',    brows: 'lowered',  blush: 'none' },
    });
    expect(NEUTRAL_EXPRESSION).toBe(BLOBBI_EMOTION_PRESETS.neutral);
    expect(isNeutral(NEUTRAL_EXPRESSION)).toBe(true);
  });
});

describe('normalizeBlobbiExpression', () => {
  it.each(BLOBBI_EMOTIONS)('resolves the %s preset to its table row', (emotion) => {
    expect(normalizeBlobbiExpression(emotion)).toBe(BLOBBI_EMOTION_PRESETS[emotion]);
    expect(isBlobbiEmotion(emotion)).toBe(true);
  });

  it('resolves explicit parts, filling absent parts with neutral', () => {
    expect(normalizeBlobbiExpression({ mouth: 'grin' })).toEqual({
      eyes: 'open', mouth: 'grin', brows: 'neutral', blush: 'soft',
    });
    expect(normalizeBlobbiExpression({ eyes: 'wide', brows: 'inner-up', blush: 'strong' })).toEqual({
      eyes: 'wide', mouth: 'neutral', brows: 'inner-up', blush: 'strong',
    });
  });

  it('drops unknown part values to neutral, field by field', () => {
    expect(normalizeBlobbiExpression({ eyes: 'squint', mouth: 'smile', brows: 'angry' })).toEqual({
      eyes: 'open', mouth: 'smile', brows: 'neutral', blush: 'soft',
    });
  });

  it.each(HOSTILE.map((v) => [typeof v === 'symbol' || typeof v === 'bigint' ? String(v) : JSON.stringify(v) ?? String(v), v]))(
    'never throws and stays inside the vocabulary for %s',
    (_label, value) => {
      const resolved = normalizeBlobbiExpression(value);
      expect(BLOBBI_EYE_STATES).toContain(resolved.eyes);
      expect(BLOBBI_MOUTH_STATES).toContain(resolved.mouth);
      expect(BLOBBI_BROW_STATES).toContain(resolved.brows);
      expect(BLOBBI_BLUSH_STATES).toContain(resolved.blush);
      expect(Object.keys(resolved).sort()).toEqual(['blush', 'brows', 'eyes', 'mouth']);
    },
  );

  it('returns the shared neutral instance for anything that means "no expression"', () => {
    for (const value of [undefined, null, 'neutral', 'nope', {}, { eyes: 'open' }, { eyes: 'x' }, 5, []]) {
      expect(normalizeBlobbiExpression(value)).toBe(NEUTRAL_EXPRESSION);
    }
  });

  it('is deterministic, returns frozen objects and never mutates its input', () => {
    const input = { eyes: 'half', mouth: 'frown' } as const;
    const before = JSON.stringify(input);
    const a = normalizeBlobbiExpression(input);
    const b = normalizeBlobbiExpression(input);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('isBlobbiEmotion rejects prototype names and non-strings', () => {
    for (const value of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 1, null, {}]) {
      expect(isBlobbiEmotion(value)).toBe(false);
    }
  });
});
