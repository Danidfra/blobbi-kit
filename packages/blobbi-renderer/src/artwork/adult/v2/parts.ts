/**
 * The SEMANTIC PART CONTRACT of Adult V2 artwork.
 *
 * Every meaningful element in a V2 drawing carries a `data-part` attribute
 * from this vocabulary. Code (this package's gaze markup, a future emote or
 * clothing system, a host's anchor logic) selects parts by `data-part`, never
 * by `id`: ids are namespaced per instance by `uniquifySvgIds` and are an
 * authoring convenience, and Inkscape-generated group names (`g19`, `g25`)
 * are not part of any contract.
 *
 * Front-view parts are sided from the VIEWER's point of view, matching the
 * source artwork's own labels (`left-eye` is on screen-left). The back view
 * shows the same body from behind, so screen-left is the character's right
 * limb and is labeled `right-*`. The side view is a single profile: it has one
 * visible eye, cheek and eyebrow (unsided names) and a near/far pair of arms
 * and feet.
 */

/** Every part the front view carries. */
export const ADULT_V2_FRONT_PARTS = [
  'character',
  'body-shadow',
  'ground-shadow',
  'left-foot-shadow',
  'right-foot-shadow',
  'left-foot',
  'right-foot',
  'body-base',
  'tuft-main',
  'tuft-secondary',
  'left-arm',
  'right-arm',
  'left-eye',
  'left-eye-white',
  'left-eye-inner',
  'left-iris',
  'left-pupil',
  'left-eye-highlight-primary',
  'left-eye-highlight-secondary',
  'right-eye',
  'right-eye-white',
  'right-eye-inner',
  'right-iris',
  'right-pupil',
  'right-eye-highlight-primary',
  'right-eye-highlight-secondary',
  'left-eyebrow',
  'right-eyebrow',
  'tuft-detail-left',
  'tuft-detail-right',
  'left-cheek',
  'left-cheek-base',
  'left-cheek-highlight',
  'right-cheek',
  'right-cheek-base',
  'right-cheek-highlight',
  'mouth',
  'side-pattern',
  'side-pattern-mark',
  'body-shine',
] as const;

/** Every part the side (profile) view carries. */
export const ADULT_V2_SIDE_PARTS = [
  'character',
  'body-shadow',
  'ground-shadow',
  'far-foot',
  'far-arm',
  'body-base',
  'tuft-main',
  'tuft-secondary',
  'near-arm',
  'near-foot',
  'cheek',
  'cheek-highlight',
  'side-pattern',
  'side-pattern-mark',
  'body-shine',
  'eye',
  'eye-white',
  'eye-inner',
  'iris',
  'pupil',
  'eye-highlight-primary',
  'eye-highlight-secondary',
  'eyebrow',
  'mouth',
  'tuft-detail-left',
  'tuft-detail-right',
] as const;

/** Every part the back view carries: the front anatomy with no face. */
export const ADULT_V2_BACK_PARTS = [
  'character',
  'body-shadow',
  'ground-shadow',
  'left-foot-shadow',
  'right-foot-shadow',
  'left-foot',
  'right-foot',
  'left-arm',
  'right-arm',
  'tuft-main',
  'tuft-secondary',
  'body-base',
  'tuft-detail-left',
  'tuft-detail-right',
  'side-pattern',
  'side-pattern-mark',
  'body-shine',
] as const;

/** The face parts: present on front and side, deliberately absent on back. */
export const ADULT_V2_FACE_PARTS = [
  'left-eye', 'left-eye-white', 'left-eye-inner', 'left-iris', 'left-pupil',
  'left-eye-highlight-primary', 'left-eye-highlight-secondary',
  'right-eye', 'right-eye-white', 'right-eye-inner', 'right-iris', 'right-pupil',
  'right-eye-highlight-primary', 'right-eye-highlight-secondary',
  'left-eyebrow', 'right-eyebrow',
  'left-cheek', 'left-cheek-base', 'left-cheek-highlight',
  'right-cheek', 'right-cheek-base', 'right-cheek-highlight',
  'mouth',
  'eye', 'eye-white', 'eye-inner', 'iris', 'pupil',
  'eye-highlight-primary', 'eye-highlight-secondary', 'eyebrow', 'cheek', 'cheek-highlight',
] as const;

/** Parts marked movable for gaze: the iris/pupil/highlight group inside each eye. */
export const ADULT_V2_GAZE_PARTS = ['left-eye-inner', 'right-eye-inner', 'eye-inner'] as const;

/** The union of every V2 part name across views. */
export const ADULT_V2_PARTS = [
  ...new Set<string>([...ADULT_V2_FRONT_PARTS, ...ADULT_V2_SIDE_PARTS, ...ADULT_V2_BACK_PARTS]),
] as readonly string[];

export type AdultV2Part =
  | (typeof ADULT_V2_FRONT_PARTS)[number]
  | (typeof ADULT_V2_SIDE_PARTS)[number]
  | (typeof ADULT_V2_BACK_PARTS)[number];
