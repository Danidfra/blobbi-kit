/**
 * EYE COLOR across every shipped adult form: the regression the canonical
 * package must never acquire.
 *
 * The adult customizer colors pupils two ways. Four forms carry a
 * `{form}Pupil3D` / `{form}Pupil` gradient and get a rebuilt gradient; the
 * other twelve have flat pupil fills and are recolored by a fallback that is
 * SCOPED TO THE `<!-- Pupils ... -->` COMMENT BLOCK of the artwork, so that a
 * mouth or stroke sharing the same hex is left alone.
 *
 * That scoping is an artwork contract: the comment markers are load-bearing.
 * Ditto's copy of the same engine ships a minified data file with every
 * comment stripped, so its fallback regex can never match and `eyeColor` is a
 * silent no-op on 12 of 16 forms. This package's artwork keeps the markers.
 * These tests assert the SEMANTIC result (the requested color reaches the
 * pupils) for every form, and then reproduce the stripped-comment failure on
 * purpose, so the suite is known to be capable of catching that regression.
 */
import { describe, it, expect } from 'vitest';
import { loadBlobbiSvg } from './artwork/load-blobbi-svg';
import { getAdultBaseSvg, customizeAdultSvg } from './artwork/adult/v1';
import { ADULT_FORMS, type AdultForm } from './artwork/adult/v1/types/adult.types';

/** Distinctive, lower-case, and used nowhere in any shipped artwork. */
const EYE = '#12abef';

/**
 * Forms whose pupils are flat fills recolored through the comment-scoped
 * fallback. Mirrors the customizer's internal `HARDCODED_PUPIL_FILLS`; kept
 * as a literal here so a change to that table is a visible test edit.
 */
const FLAT_FILL_FORMS: readonly AdultForm[] = [
  'bloomi', 'breezy', 'cacti', 'cloudi', 'crysti', 'droppi',
  'flammi', 'leafy', 'mushie', 'rocky', 'rosey', 'starri',
];
/** Forms with a dedicated pupil gradient in the artwork. */
const GRADIENT_FORMS: readonly AdultForm[] = ['catti', 'froggi', 'owli', 'pandi'];

/** Does the requested eye color reach a PUPIL, as opposed to appearing anywhere? */
function pupilsCarry(svg: string, color: string): boolean {
  const lower = svg.toLowerCase();
  // Flat-fill path: the fallback tags each recolored pupil.
  const flat = new RegExp(`fill="${color}"\\s+data-blobbi-pupil="true"`, 'i');
  // Gradient path: a `{form}Pupil…` gradient whose outer stop is the color.
  const gradient = new RegExp(
    `<radialGradient[^>]*id="[^"]*Pupil[^"]*"[^>]*>[\\s\\S]*?stop-color:\\s*${color}`,
    'i',
  );
  return flat.test(lower) || gradient.test(svg);
}

describe('eyeColor reaches the pupils of every shipped adult form', () => {
  it('the artwork ships sixteen forms, all covered below', () => {
    expect([...ADULT_FORMS].sort()).toEqual([...FLAT_FILL_FORMS, ...GRADIENT_FORMS].sort());
    expect(ADULT_FORMS).toHaveLength(16);
  });

  it.each(ADULT_FORMS)('%s: the rendered SVG carries the requested eye color on its pupils', (form) => {
    const svg = loadBlobbiSvg('adult', form, '#ff9933', '#ffd9b3', EYE, false, `eye-${form}`);
    expect(svg.toLowerCase(), `${form} never mentions the eye color`).toContain(EYE);
    expect(pupilsCarry(svg, EYE), `${form}: eye color present but not on a pupil`).toBe(true);
  });

  it.each(FLAT_FILL_FORMS)('%s: the flat-fill fallback recolors both pupils and nothing else', (form) => {
    const svg = loadBlobbiSvg('adult', form, undefined, undefined, EYE, false, `flat-${form}`);
    const tagged = svg.toLowerCase().match(/data-blobbi-pupil="true"/g) ?? [];
    // Two eyes, two pupils. Highlights are white and are never recolored.
    expect(tagged.length, `${form}: expected exactly two recolored pupils`).toBe(2);
    // Every recolored element carries the requested color, and the color
    // appears ONLY on those elements: the block scoping did its job.
    const occurrences = svg.toLowerCase().match(new RegExp(EYE, 'g')) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it.each(GRADIENT_FORMS)('%s: the pupil gradient is rebuilt around the requested color', (form) => {
    const svg = loadBlobbiSvg('adult', form, undefined, undefined, EYE, false, `grad-${form}`);
    expect(svg).toMatch(new RegExp(`<radialGradient[^>]*id="b_grad-${form}_${form}Pupil`));
    expect(pupilsCarry(svg, EYE)).toBe(true);
  });

  it('the baby drawing takes an eye color too', () => {
    const svg = loadBlobbiSvg('baby', undefined, undefined, undefined, EYE, false, 'baby-eye');
    expect(svg.toLowerCase()).toContain(EYE);
  });

  it('closed eyes have no pupils, so sleeping artwork ignores eye color by design', () => {
    for (const form of ['bloomi', 'catti'] as const) {
      const svg = loadBlobbiSvg('adult', form, undefined, undefined, EYE, true, `sleep-${form}`);
      expect(svg.toLowerCase()).not.toContain(EYE);
    }
  });
});

describe('the comment markers the fallback depends on are present in the shipped artwork', () => {
  it.each(FLAT_FILL_FORMS)('%s: base artwork has a Pupils comment block', (form) => {
    expect(getAdultBaseSvg(form)).toMatch(/<!--\s*Pupils/i);
  });

  it.each(FLAT_FILL_FORMS)(
    '%s: stripping the comments (as Ditto\'s minified data does) silently loses the eye color',
    (form) => {
      // This is the regression this file exists to catch. It is asserted as
      // FAILING behavior on deliberately damaged input, proving the positive
      // tests above are not passing for an unrelated reason.
      const stripped = getAdultBaseSvg(form).replace(/<!--[\s\S]*?-->/g, '');
      expect(stripped).not.toMatch(/<!--/);
      const svg = customizeAdultSvg(stripped, form, { eyeColor: EYE }, false, `stripped-${form}`);
      expect(svg.toLowerCase()).not.toContain(EYE);
    },
  );

  it.each(GRADIENT_FORMS)('%s: the gradient path does not depend on comments', (form) => {
    const stripped = getAdultBaseSvg(form).replace(/<!--[\s\S]*?-->/g, '');
    const svg = customizeAdultSvg(stripped, form, { eyeColor: EYE }, false, `stripped-${form}`);
    expect(pupilsCarry(svg, EYE)).toBe(true);
  });
});
