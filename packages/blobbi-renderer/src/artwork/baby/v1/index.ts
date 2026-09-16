/**
 * Baby Blobbi Module
 *
 * Self-contained module for baby stage Blobbi visuals and customization:
 * - Baby SVG assets (awake and sleeping)
 * - SVG lookup
 * - Color customization
 *
 * Consumed only by the artwork registry; nothing here is public API.
 */

// Types
export type { BabySvgCustomization } from './types/baby.types';

// SVG Resolution
export { getBabyBaseSvg, getBabySleepingSvg } from './lib/baby-svg-resolver';

// SVG Customization
export { customizeBabySvg } from './lib/baby-svg-customizer';
