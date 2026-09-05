/**
 * Adult V2, BACK view. Derived from the FRONT source, not drawn anew.
 *
 * Construction (the exact rule this file implements):
 *  1. same silhouette and proportions: `body-base`, both feet, both arms, both
 *     tufts, the tuft detail strokes, the body shine and every shadow are the
 *     front view's elements with identical geometry and gradients;
 *  2. the arms are placed BEHIND the body in z-order (they come before
 *     `body-base` in document order), so only their outer edges show;
 *  3. the tufts are placed behind the head layer (also before `body-base`);
 *     their tops still rise above the silhouette;
 *  4. feet keep their front positions: from behind, the same two feet stand on
 *     the same ground line;
 *  5. every facial feature is ABSENT: eye whites, irises, pupils, highlights,
 *     eyebrows, cheeks and mouth. Nothing stands in for them;
 *  6. the optional side pattern sits on the flank that was screen-right from
 *     the front, so it appears on screen-left from behind: the same group,
 *     reflected about the body's vertical center (x = 408.65657 in root
 *     coordinates, hence `matrix(-1,0,0,1,817.31314,0)`). As in the authored
 *     front, the group lies outside the viewBox (see `front.ts`), so it is
 *     carried, not visible.
 *
 * Because the viewer now sees the character from behind, screen-left limbs are
 * the character's RIGHT limbs and are labeled accordingly: the geometry of
 * `right-foot`/`right-arm` here equals the front view's `left-foot`/`left-arm`.
 *
 * The `<defs>` are the front view's, unchanged.
 */
import { ADULT_V2_FRONT_SVG } from './front';

export const ADULT_V2_BACK_VIEWBOX = { width: 211.66666, height: 238.125 } as const;

/** The front view's `<defs>` block, reused verbatim so both views share one palette. */
const FRONT_DEFS = ADULT_V2_FRONT_SVG.slice(
  ADULT_V2_FRONT_SVG.indexOf('<defs'),
  ADULT_V2_FRONT_SVG.indexOf('</defs>') + '</defs>'.length,
);

export const ADULT_V2_BACK_SVG = `<svg viewBox="0 0 211.66666 238.125" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" data-blobbi-generation="v2" data-blobbi-view="back">
  ${FRONT_DEFS}
  <g id="v2-document-scale" transform="matrix(0.26458333,0,0,0.26458333,1.3647759,37.271946)">
    <g id="v2-character-position" transform="translate(65.217497,-422.67995)">
      <g id="blobbi-root" data-part="character" transform="translate(-79.03227,287.45075)">
        <path id="body-shadow" data-part="body-shadow" d="m 408,140 c 72,0 130,38 174,100 47,66 76,161 90,267 16,121 -42,223 -141,266 -37,16 -78,24 -123,26 C 363,797 322,789 285,773 186,730 128,628 144,507 158,401 187,306 234,240 278,178 336,140 408,140 Z" fill="#2d0d68" opacity="0.18" filter="url(#blur10)" style="filter:url(#blur10-8)" />
        <ellipse id="ground-shadow" data-part="ground-shadow" cx="408.65656" cy="830.79346" rx="205" ry="30" fill="#2f183f" opacity="0.18" filter="url(#blur18)" style="filter:url(#blur18-4)" />
        <ellipse id="right-foot-shadow" data-part="right-foot-shadow" cx="314.65656" cy="768.79346" rx="77" ry="55" fill="#2d0d68" opacity="0.22" filter="url(#blur10)" style="filter:url(#blur10-8)" />
        <ellipse id="left-foot-shadow" data-part="left-foot-shadow" cx="502.65656" cy="768.79346" rx="77" ry="55" fill="#2d0d68" opacity="0.22" filter="url(#blur10)" style="filter:url(#blur10-8)" />
        <ellipse id="right-foot" data-part="right-foot" cx="221.64038" cy="776.80133" rx="79" ry="57" fill="url(#footGradient)" transform="rotate(-7)" style="fill:url(#linearGradient13)" />
        <ellipse id="left-foot" data-part="left-foot" cx="589.58069" cy="677.19592" rx="79" ry="57" fill="url(#footGradient)" transform="rotate(7)" style="fill:url(#linearGradient14)" />
        <path id="right-arm" data-part="right-arm" d="m 148.21229,496.57208 c -44,24 -42,99 2,133 34,26 63,-5 63,-45 -1,-45 -21,-76 -65,-88 z" fill="url(#limbGradient)" style="fill:url(#linearGradient17)" />
        <path id="left-arm" data-part="left-arm" d="m 669.10084,497.92126 c 44,24 42,99 -2,133 -34,26 -63,-5 -63,-45 1,-45 21,-76 65,-88 z" fill="url(#limbGradient)" style="fill:url(#linearGradient18)" />
        <ellipse id="tuft-main" data-part="tuft-main" cx="423.08154" cy="-4.1489954" rx="32" ry="49" fill="url(#limbGradient)" transform="rotate(18)" style="fill:url(#linearGradient15)" />
        <ellipse id="tuft-secondary" data-part="tuft-secondary" cx="381.62637" cy="-259.77301" rx="23" ry="37" fill="url(#limbGradient)" transform="rotate(52)" style="fill:url(#linearGradient16)" />
        <path id="body-base" data-part="body-base" d="m 408.65657,136.79346 c 72,0 130,36.36624 174,95.70063 47,63.16242 76,154.07802 90,255.52069 16,115.79777 -42,213.41241 -141,254.56369 -37,15.3121 -78,22.96815 -123,24.88216 -45,-1.91401 -86,-9.57006 -123,-24.88216 -99,-41.15128 -157,-138.76592 -141,-254.56369 14,-101.44267 43,-192.35827 90,-255.52069 44,-59.33439 102,-95.70063 174,-95.70063 z" fill="url(#bodyGradient)" style="fill:url(#bodyGradient-4);stroke-width:0.978267" />
        <path id="tuft-detail-left" data-part="tuft-detail-left" d="m 402.0793,168.45718 q -16.59766,-33.04105 7.98185,-61.26766" fill="none" stroke="#4f239e" stroke-width="8.94185" stroke-linecap="round" opacity="0.72" />
        <path id="tuft-detail-right" data-part="tuft-detail-right" d="m 422.30612,166.25276 q 6.58014,-26.71721 34.13093,-30.80669" fill="none" stroke="#4f239e" stroke-width="6.65413" stroke-linecap="round" opacity="0.72" />
        <g id="side-pattern-flank" data-part="side-pattern" transform="matrix(-1,0,0,1,817.31314,0)">
          <g id="side-pattern" opacity="0.56" transform="translate(383.61975,-265.28624)">
            <ellipse id="side-pattern-top" data-part="side-pattern-mark" cx="589" cy="344" rx="17" ry="24" fill="#481696" transform="rotate(-18,589,344)" />
            <ellipse id="side-pattern-middle" data-part="side-pattern-mark" cx="619" cy="391" rx="21" ry="27" fill="#481696" transform="rotate(18,619,391)" />
            <ellipse id="side-pattern-bottom" data-part="side-pattern-mark" cx="596" cy="434" rx="14" ry="20" fill="#481696" transform="rotate(-8,596,434)" />
          </g>
        </g>
        <ellipse id="body-shine" data-part="body-shine" cx="166.76411" cy="360.46924" rx="23" ry="13" fill="#ffffff" opacity="0.3" transform="rotate(-30)" />
      </g>
    </g>
  </g>
</svg>`;
