/**
 * Adult Blobbi Module Types
 *
 * The V1 adult-form vocabulary and the colour input the V1 adult customizer
 * takes. Declared here independently of `@blobbi-kit/core`'s identical
 * `ADULT_FORMS`: the two packages never import each other, and
 * `artwork/registry.test.ts` and the fingerprint suite pin this list.
 */

/**
 * All available adult evolution forms.
 * Each form corresponds to an entry in `adult-svg-data.ts`.
 */
export const ADULT_FORMS = [
  'bloomi',
  'breezy',
  'cacti',
  'catti',
  'cloudi',
  'crysti',
  'droppi',
  'flammi',
  'froggi',
  'leafy',
  'mushie',
  'owli',
  'pandi',
  'rocky',
  'rosey',
  'starri',
] as const;

export type AdultForm = typeof ADULT_FORMS[number];

/**
 * Adult SVG customization options
 */
export interface AdultSvgCustomization {
  /** Base body color */
  baseColor?: string;
  /** Secondary body color */
  secondaryColor?: string;
  /** Eye/pupil color */
  eyeColor?: string;
}

/**
 * Validates if a string is a valid adult form
 */
export function isValidAdultForm(form: string): form is AdultForm {
  return ADULT_FORMS.includes(form as AdultForm);
}

/**
 * Gets the default adult form (used as fallback)
 */
export function getDefaultAdultForm(): AdultForm {
  return 'catti';
}
