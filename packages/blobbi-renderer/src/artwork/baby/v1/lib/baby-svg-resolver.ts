/**
 * Baby Blobbi SVG Resolver
 *
 * Handles loading and resolving baby stage SVG assets
 */

import { BABY_BASE_SVG, BABY_SLEEPING_SVG } from './baby-svg-data';

/**
 * Get baby base SVG content
 */
export function getBabyBaseSvg(): string {
  return BABY_BASE_SVG;
}

/**
 * Get baby sleeping SVG content
 */
export function getBabySleepingSvg(): string {
  return BABY_SLEEPING_SVG;
}
