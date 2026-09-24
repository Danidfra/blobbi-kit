/**
 * Egg Blobbi Module (V1)
 *
 * Self-contained module for the egg stage: one authored shell with cumulative
 * crack overlays, colour customization from the seed identity, and no face.
 * Consumed only by the artwork registry; nothing here is public API.
 */

export type { EggSvgCustomization } from './lib/egg-svg-customizer';
export { getEggSvg } from './lib/egg-svg-resolver';
export { customizeEggSvg } from './lib/egg-svg-customizer';
