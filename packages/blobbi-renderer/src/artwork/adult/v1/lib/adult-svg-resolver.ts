/**
 * Adult Blobbi SVG Resolver
 *
 * Handles loading and resolving adult stage SVG assets.
 * Each adult form has a base and a sleeping variant.
 */

import type { AdultForm } from '../types/adult.types';
import { ADULT_SVG_MAP } from './adult-svg-data';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get adult base SVG content for a specific form
 */
export function getAdultBaseSvg(form: AdultForm): string {
  return ADULT_SVG_MAP[form]?.base ?? getFallbackAdultSvg(form);
}

/**
 * Get adult sleeping SVG content for a specific form
 */
export function getAdultSleepingSvg(form: AdultForm): string {
  return ADULT_SVG_MAP[form]?.sleeping ?? getFallbackAdultSvg(form);
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

/**
 * Get fallback adult SVG content.
 * Used when the expected asset is not found.
 */
function getFallbackAdultSvg(form: AdultForm): string {
  // Simple placeholder SVG that indicates the form name
  return `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="fallbackAdultGradient" cx="0.3" cy="0.25">
          <stop offset="0%" style="stop-color:#a78bfa"/>
          <stop offset="60%" style="stop-color:#8b5cf6"/>
          <stop offset="100%" style="stop-color:#7c3aed"/>
        </radialGradient>
      </defs>
      <!-- Body -->
      <ellipse cx="100" cy="110" rx="50" ry="60" fill="url(#fallbackAdultGradient)" />
      <!-- Eyes -->
      <ellipse cx="82" cy="95" rx="10" ry="12" fill="#fff" />
      <ellipse cx="118" cy="95" rx="10" ry="12" fill="#fff" />
      <circle cx="82" cy="96" r="7" fill="#374151" />
      <circle cx="118" cy="96" r="7" fill="#374151" />
      <circle cx="84" cy="94" r="2.5" fill="white" />
      <circle cx="120" cy="94" r="2.5" fill="white" />
      <!-- Mouth -->
      <path d="M 88 120 Q 100 130 112 120" stroke="#374151" stroke-width="3" fill="none" stroke-linecap="round" />
      <!-- Form label (dev only) -->
      <text x="100" y="180" text-anchor="middle" font-size="12" fill="#666">${form}</text>
    </svg>
  `;
}
