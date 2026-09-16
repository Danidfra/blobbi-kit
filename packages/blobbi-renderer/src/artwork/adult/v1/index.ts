/**
 * Adult Blobbi Module
 *
 * Self-contained module for adult stage Blobbi visuals and customization:
 * - Adult SVG assets (awake and sleeping variants for each form)
 * - SVG lookup by form
 * - Color customization
 * - The adult-form vocabulary
 *
 * Consumed only by the artwork registry; nothing here is public API.
 */

// Types
export type { AdultForm, AdultSvgCustomization } from './types/adult.types';

export { ADULT_FORMS, isValidAdultForm, getDefaultAdultForm } from './types/adult.types';

// SVG Resolution
export { getAdultBaseSvg, getAdultSleepingSvg } from './lib/adult-svg-resolver';

// SVG Customization
export { customizeAdultSvg } from './lib/adult-svg-customizer';
