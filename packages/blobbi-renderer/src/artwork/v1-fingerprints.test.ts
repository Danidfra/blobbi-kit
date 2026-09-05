/**
 * V1 ZERO-REGRESSION FINGERPRINTS.
 *
 * The exact markup `loadBlobbiSvg` produced for the original generation of
 * artwork (the baby and all sixteen adult forms, awake and sleeping, front and
 * rear, with and without colors), recorded as SHA-256 digests in
 * `v1-fingerprints.json` BEFORE the artwork registry was introduced.
 *
 * Every later change to the artwork architecture must leave these digests
 * untouched: a V2 generation, a new view or a new registry is only acceptable
 * if V1 Blobbis look byte-for-byte the way they always did. A digest change is
 * therefore a deliberate, reviewed decision, never a side effect; regenerate
 * with `BLOBBI_UPDATE_FINGERPRINTS=1 npx vitest run v1-fingerprints` only when
 * V1 artwork itself is meant to change.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBlobbiSvg } from './load-blobbi-svg';
import { ADULT_FORMS } from './adult/v1/types/adult.types';

const FIXTURE = join(__dirname, 'v1-fingerprints.json');
const COLORS = { base: '#f2a0c0', secondary: '#fad4e4', eye: '#3a2a1a' };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Every V1 drawing the package can produce, keyed by a stable label. */
function renderAll(): Record<string, string> {
  const out: Record<string, string> = {};
  const record = (label: string, svg: string) => {
    out[label] = sha(svg);
  };

  for (const sleeping of [false, true]) {
    for (const view of ['front', 'rear'] as const) {
      const suffix = `${sleeping ? 'sleeping' : 'awake'}:${view}`;
      record(`baby:colored:${suffix}`, loadBlobbiSvg('baby', undefined, COLORS.base, COLORS.secondary, COLORS.eye, sleeping, 'fp', view));
      record(`baby:plain:${suffix}`, loadBlobbiSvg('baby', undefined, undefined, undefined, undefined, sleeping, 'fp', view));
      record(`egg-as-baby:colored:${suffix}`, loadBlobbiSvg('egg', undefined, COLORS.base, COLORS.secondary, COLORS.eye, sleeping, 'fp', view));
      for (const form of ADULT_FORMS) {
        record(`adult:${form}:colored:${suffix}`, loadBlobbiSvg('adult', form, COLORS.base, COLORS.secondary, COLORS.eye, sleeping, 'fp', view));
        record(`adult:${form}:plain:${suffix}`, loadBlobbiSvg('adult', form, undefined, undefined, undefined, sleeping, 'fp', view));
      }
    }
  }
  // The unknown-form fallback and the no-instance-id path are contract too.
  record('adult:unknown-form:colored:awake:front', loadBlobbiSvg('adult', 'not-a-form', COLORS.base, COLORS.secondary, COLORS.eye, false, 'fp'));
  record('adult:bloomi:no-id', loadBlobbiSvg('adult', 'bloomi', COLORS.base, COLORS.secondary, COLORS.eye, false, undefined));
  return out;
}

describe('V1 artwork output is byte-identical to the recorded fingerprints', () => {
  const actual = renderAll();

  if (process.env.BLOBBI_UPDATE_FINGERPRINTS) {
    writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + '\n');
  }

  const expected: Record<string, string> = JSON.parse(readFileSync(FIXTURE, 'utf8'));

  it('covers the same set of drawings', () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    // 16 forms x 2 colorings x 2 sleep x 2 views + baby/egg (3 x 2 x 2) + 2.
    expect(Object.keys(actual)).toHaveLength(16 * 2 * 2 * 2 + 3 * 2 * 2 + 2);
  });

  it.each(Object.keys(expected).sort())('%s', (label) => {
    expect(actual[label]).toBe(expected[label]);
  });
});
