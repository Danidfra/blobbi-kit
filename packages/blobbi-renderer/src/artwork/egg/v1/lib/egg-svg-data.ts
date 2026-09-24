// Authored artwork: the V1 egg. Hand-written to match the V1 baby's box and
// the Blobbi visual language (soft rounded shell, a lit highlight at the
// upper left, seed-coloured spots). One drawing; the crack overlay groups are
// kept or removed by the resolver according to the requested crack state.

/**
 * The egg shell, spots, highlight, shade and three cumulative crack groups.
 *
 * Contract for the customizer and the resolver:
 *  - `blobbiEggGradient` is the shell colouring (replaced from `baseColor`);
 *  - `blobbiEggSpotGradient` is the spot colouring (replaced from
 *    `secondaryColor`, or a lighter shell tint when there is none);
 *  - `data-part="egg-crack-1|2|3"` groups are cumulative: light shows 1,
 *    medium 1 and 2, heavy all three; `'none'` removes them all.
 * The egg has no face: no pupils, no mouth, nothing gaze or expression could
 * address, and no separate sleeping drawing.
 */
export const EGG_BASE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Shell gradient -->
    <radialGradient id="blobbiEggGradient" cx="0.36" cy="0.3" r="0.85">
      <stop offset="0%" style="stop-color:#fff8ec;stop-opacity:1" />
      <stop offset="55%" style="stop-color:#f3e1c3;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#d6b487;stop-opacity:1" />
    </radialGradient>

    <!-- Spot gradient -->
    <radialGradient id="blobbiEggSpotGradient" cx="0.4" cy="0.4">
      <stop offset="0%" style="stop-color:#c9a7ea;stop-opacity:0.95" />
      <stop offset="100%" style="stop-color:#a67cd0;stop-opacity:0.8" />
    </radialGradient>
  </defs>

  <!-- Shell -->
  <path data-part="egg-shell" d="M 50 10 C 68 10 82 34 82 57 C 82 78 68 91 50 91 C 32 91 18 78 18 57 C 18 34 32 10 50 10 Z" fill="url(#blobbiEggGradient)" />

  <!-- Spots -->
  <g data-part="egg-spots" fill="url(#blobbiEggSpotGradient)">
    <ellipse cx="38" cy="40" rx="5" ry="6" transform="rotate(-20 38 40)" />
    <ellipse cx="62" cy="54" rx="4.5" ry="5.5" transform="rotate(15 62 54)" />
    <ellipse cx="45" cy="72" rx="4" ry="4.8" transform="rotate(-10 45 72)" />
    <ellipse cx="60" cy="27" rx="2.6" ry="3.2" />
  </g>

  <!-- Highlight -->
  <ellipse data-part="egg-highlight" cx="38" cy="30" rx="7" ry="11" fill="#ffffff" opacity="0.38" transform="rotate(-18 38 30)" />

  <!-- Shade -->
  <path data-part="egg-shade" d="M 66 24 C 76 36 78 60 68 78 C 64 84 58 88 50 90 C 62 86 72 76 74 60 C 76 46 72 32 66 24 Z" fill="#000000" opacity="0.07" />

  <!-- Cracks: cumulative groups -->
  <g data-part="egg-crack-1" fill="none" stroke="#1f2937" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 30 50 L 36 47 L 41 52 L 47 48" />
  </g>
  <g data-part="egg-crack-2" fill="none" stroke="#1f2937" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 47 48 L 54 53 L 61 47 L 68 52" />
    <path d="M 41 52 L 39 59" stroke-width="1.1" />
  </g>
  <g data-part="egg-crack-3" fill="none" stroke="#1f2937" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 54 53 L 56 62 L 52 68" />
    <path d="M 61 47 L 64 40 L 62 34" stroke-width="1.1" />
    <path d="M 36 47 L 31 42" stroke-width="1.1" />
    <path d="M 68 52 L 73 58" stroke-width="1.1" />
    <path d="M 30 50 L 26 55" stroke-width="1.1" />
  </g>
</svg>`;
