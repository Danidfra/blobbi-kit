/**
 * Adult V2, SIDE view: the canonical RIGHT-facing profile.
 *
 * The visible eye, cheek, mouth and near limbs sit on screen-right of the
 * body in the source, so this drawing faces right; the left-facing profile is
 * this artwork mirrored horizontally (`mirror.ts`), never a second file.
 *
 * Normalized from the authored Inkscape export with NO change to the geometry,
 * transforms, colors, gradients or filters of anything visible:
 *  - the XML declaration, `width`/`height`, `xml:space` and `xmlns:svg` were
 *    dropped; the `<defs>` block is kept complete;
 *  - two Inkscape leftovers that lie ENTIRELY OUTSIDE the viewBox and paint
 *    nothing were removed: `g27` (a translated copy of the diagonal character
 *    at x < 0) and `g24` (a stray eye assembly at x > 370), plus the empty
 *    `body-highlights-7` group;
 *  - the visible character group (`g28`, `translate(-2.8116293)`) is the root;
 *    its anonymous Inkscape groups and suffixed ids got semantic names from
 *    `parts.ts`: `g19-9` -> `eye`, `g25` -> `eye-inner` (marked movable),
 *    `right-eye-white-9` -> `eye-white`, `right-iris-3` -> `iris`,
 *    `right-pupil-3` -> `pupil`, `ellipse16-7`/`circle17-7` -> the two eye
 *    highlights, `path12` -> `body-shadow`, `path18` -> `eyebrow`,
 *    `path17-5-4`/`path17-5-5-7` -> the two tuft details, and both tufts
 *    (`data-part="top-tuft"` in the source) became `tuft-main` /
 *    `tuft-secondary`.
 */
export const ADULT_V2_SIDE_VIEWBOX = { width: 211.66666, height: 238.125 } as const;

export const ADULT_V2_SIDE_SVG = `<svg viewBox="0 0 211.66666 238.125" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" data-blobbi-generation="v2" data-blobbi-view="side" data-blobbi-side-facing="right">
  <defs id="defs1">
    <radialGradient id="bodyGradient" cx="361.6647" cy="261.54892" r="486.10767" gradientTransform="scale(0.89956637,1.1116467)" fx="361.6647" fy="261.54892" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#c792ff" id="stop1" />
      <stop offset="44%" stop-color="#8749ef" id="stop2" />
      <stop offset="100%" stop-color="#5420c8" id="stop3" />
    </radialGradient>
    <linearGradient id="limbGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#9c61f4" id="stop4" />
      <stop offset="100%" stop-color="#5422bc" id="stop5" />
    </linearGradient>
    <linearGradient id="footGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8248e8" id="stop6" />
      <stop offset="100%" stop-color="#46199f" id="stop7" />
    </linearGradient>
    <radialGradient id="eyeGradient" cx="0.34" cy="0.23999999" r="0.77999997">
      <stop offset="0%" stop-color="#54308d" id="stop8" />
      <stop offset="55%" stop-color="#201538" id="stop9" />
      <stop offset="100%" stop-color="#090711" id="stop10" />
    </radialGradient>
    <filter id="blur18" x="-0.10536585" y="-0.72000003" width="1.2107317" height="2.4400001">
      <feGaussianBlur stdDeviation="18" id="feGaussianBlur10" />
    </filter>
    <filter id="blur10" x="-0.15584417" y="-0.21818182" width="1.3116883" height="1.4363636">
      <feGaussianBlur stdDeviation="10" id="feGaussianBlur11" />
    </filter>
    <clipPath id="bodyClip">
      <path d="m 400,126 c 72,0 130,38 174,100 47,66 76,161 90,267 16,121 -42,223 -141,266 -37,16 -78,24 -123,26 C 355,783 314,775 277,759 178,716 120,614 136,493 150,387 179,292 226,226 270,164 328,126 400,126 Z" id="path11" />
    </clipPath>
    <radialGradient id="bodyGradient-0" cx="359.69409" cy="247.27448" r="481.6235" gradientTransform="matrix(0.87228782,0,0,1.1464106,-72.505214,362.52607)" fx="359.69409" fy="247.27448" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#c792ff" id="stop1-2" />
      <stop offset="45%" stop-color="#8749ef" id="stop2-4" />
      <stop offset="100%" stop-color="#5420c8" id="stop3-8" />
    </radialGradient>
    <radialGradient id="eyeGradient-2" cx="573.34424" cy="318.45767" r="93.274429" gradientTransform="matrix(0.91986621,0,0,1.0871146,-72.505214,362.52607)" fx="573.34424" fy="318.45767" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#54308d" id="stop8-2" />
      <stop offset="55%" stop-color="#201538" id="stop9-7" />
      <stop offset="100%" stop-color="#090711" id="stop10-3" />
    </radialGradient>
    <filter id="blur18-7" x="-0.10536585" y="-0.72" width="1.2107317" height="2.44">
      <feGaussianBlur stdDeviation="18" id="feGaussianBlur10-9" />
    </filter>
    <filter id="blur10-0" x="-0.047986937" y="-0.036512589" width="1.0959739" height="1.0730252">
      <feGaussianBlur stdDeviation="10" id="feGaussianBlur11-2" />
    </filter>
    <radialGradient id="bodyGradient-4" cx="361.6647" cy="261.54892" r="486.10767" gradientTransform="matrix(0.23801027,0,0,0.28147774,8.6406143e-7,5.7816245)" fx="361.6647" fy="261.54892" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#c792ff" id="stop1-3" />
      <stop offset="44%" stop-color="#8749ef" id="stop2-6" />
      <stop offset="100%" stop-color="#5420c8" id="stop3-5" />
    </radialGradient>
    <radialGradient id="eyeGradient-1" cx="34%" cy="24%" r="78%">
      <stop offset="0%" stop-color="#54308d" id="stop8-7" />
      <stop offset="55%" stop-color="#201538" id="stop9-5" />
      <stop offset="100%" stop-color="#090711" id="stop10-5" />
    </radialGradient>
    <filter id="blur18-4" x="-0.10536585" y="-0.72" width="1.2107317" height="2.44">
      <feGaussianBlur stdDeviation="18" id="feGaussianBlur10-1" />
    </filter>
    <filter id="blur10-8" x="-0.15584416" y="-0.21818182" width="1.3116883" height="1.4363636">
      <feGaussianBlur stdDeviation="10" id="feGaussianBlur11-8" />
    </filter>
    <clipPath id="bodyClip-35">
      <path d="M400 126                C472 126 530 164 574 226                C621 292 650 387 664 493                C680 614 622 716 523 759                C486 775 445 783 400 785                C355 783 314 775 277 759                C178 716 120 614 136 493                C150 387 179 292 226 226                C270 164 328 126 400 126Z" id="path11-2" />
    </clipPath>
    <linearGradient xlink:href="#footGradient" id="linearGradient13" x1="192.81896" y1="808.78457" x2="192.81896" y2="942.99336" gradientTransform="matrix(0.31148605,0,0,0.2247431,-24.775358,9.880985)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#footGradient" id="linearGradient14" x1="352.51044" y1="808.78457" x2="352.51044" y2="942.99336" gradientTransform="matrix(0.31148605,0,0,0.2247431,23.197629,-15.914693)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient15" x1="449.18958" y1="54.144176" x2="528.38554" y2="133.34014" gradientTransform="matrix(0.21381562,0,0,0.32740518,5.7128488,-29.662152)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient16" x1="517.48422" y1="73.323976" x2="575.82802" y2="131.66778" gradientTransform="matrix(0.20860539,0,0,0.3355826,-13.297391,-100.40368)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient17" x1="141.81025" y1="439.68556" x2="259.4172" y2="557.29252" gradientTransform="matrix(0.21826167,0,0,0.32073582,-2.4987972,-8.1456676)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient18" x1="710.36674" y1="439.68556" x2="827.9737" y2="557.29252" gradientTransform="matrix(0.21826167,0,0,0.32073582,2.4987989,-7.7886965)" gradientUnits="userSpaceOnUse" />
    <radialGradient xlink:href="#eyeGradient-1" id="radialGradient18" cx="328.40458" cy="316.38075" r="89.288706" gradientTransform="matrix(0.90851353,0,0,1.1006991,8.6565698,10.793459)" fx="328.40458" fy="316.38075" gradientUnits="userSpaceOnUse" />
    <radialGradient xlink:href="#eyeGradient-1" id="radialGradient19" cx="515.52342" cy="316.38075" r="89.288706" gradientTransform="matrix(0.90851353,0,0,1.1006991,8.6565698,10.793459)" fx="515.52342" fy="316.38075" gradientUnits="userSpaceOnUse" />
    <radialGradient id="bodyGradient-2" cx="361.6647" cy="261.54892" r="486.10767" gradientTransform="scale(0.89956637,1.1116467)" fx="361.6647" fy="261.54892" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#c792ff" id="stop1-5" />
      <stop offset="44%" stop-color="#8749ef" id="stop2-1" />
      <stop offset="100%" stop-color="#5420c8" id="stop3-3" />
    </radialGradient>
    <radialGradient id="eyeGradient-5" cx="0.34" cy="0.23999999" r="0.77999997">
      <stop offset="0%" stop-color="#54308d" id="stop8-0" />
      <stop offset="55%" stop-color="#201538" id="stop9-2" />
      <stop offset="100%" stop-color="#090711" id="stop10-1" />
    </radialGradient>
    <filter id="blur18-8" x="-0.10536585" y="-0.72000003" width="1.2107317" height="2.4400001">
      <feGaussianBlur stdDeviation="18" id="feGaussianBlur10-7" />
    </filter>
    <filter id="blur10-1" x="-0.15584417" y="-0.21818182" width="1.3116883" height="1.4363636">
      <feGaussianBlur stdDeviation="10" id="feGaussianBlur11-5" />
    </filter>
    <clipPath id="bodyClip-5">
      <path d="m 400,126 c 72,0 130,38 174,100 47,66 76,161 90,267 16,121 -42,223 -141,266 -37,16 -78,24 -123,26 C 355,783 314,775 277,759 178,716 120,614 136,493 150,387 179,292 226,226 270,164 328,126 400,126 Z" id="path11-8" />
    </clipPath>
    <radialGradient id="bodyGradient-0-5" cx="359.69409" cy="247.27448" r="481.6235" gradientTransform="matrix(0.22435741,0,0,0.29486335,4.2763996,1.9398017)" fx="359.69409" fy="247.27448" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#c792ff" id="stop1-2-6" />
      <stop offset="45%" stop-color="#8749ef" id="stop2-4-7" />
      <stop offset="100%" stop-color="#5420c8" id="stop3-8-9" />
    </radialGradient>
    <radialGradient id="eyeGradient-2-4" cx="573.34424" cy="318.45767" r="93.274429" gradientTransform="matrix(0.91986621,0,0,1.0871146,-72.505214,362.52607)" fx="573.34424" fy="318.45767" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#54308d" id="stop8-2-1" />
      <stop offset="55%" stop-color="#201538" id="stop9-7-6" />
      <stop offset="100%" stop-color="#090711" id="stop10-3-1" />
    </radialGradient>
    <filter id="blur18-7-2" x="-0.10536585" y="-0.72" width="1.2107317" height="2.44">
      <feGaussianBlur stdDeviation="18" id="feGaussianBlur10-9-0" />
    </filter>
    <filter id="blur10-0-4" x="-0.047986937" y="-0.036512589" width="1.0959739" height="1.0730252">
      <feGaussianBlur stdDeviation="10" id="feGaussianBlur11-2-4" />
    </filter>
    <linearGradient xlink:href="#footGradient" id="linearGradient7" x1="193.57384" y1="828.15942" x2="193.57384" y2="949.35345" gradientTransform="matrix(0.30560593,0,0,0.21647086,5.0458232,19.440041)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient8" x1="196.52808" y1="409.65555" x2="294.34973" y2="507.4772" gradientTransform="matrix(0.20185008,0,0,0.32774214,4.2763996,1.9398017)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient9" x1="412.37378" y1="55.677643" x2="490.32248" y2="133.62634" gradientTransform="matrix(0.20458011,0,0,0.32336856,9.1619254,-40.170209)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient10" x1="477.14319" y1="74.264915" x2="533.42816" y2="130.54991" gradientTransform="matrix(0.20106695,0,0,0.32901865,-14.048895,-103.0787)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient11" x1="647.94922" y1="422.02795" x2="754.26709" y2="528.34576" gradientTransform="matrix(0.20289346,0,0,0.32605672,-26.01947,-6.1811805)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#footGradient" id="linearGradient12" x1="331.82843" y1="833.59344" x2="331.82843" y2="970.32678" gradientTransform="matrix(0.30849641,0,0,0.21444262,3.8345074,-11.5523)" gradientUnits="userSpaceOnUse" />
    <radialGradient xlink:href="#eyeGradient-1-4" id="radialGradient19-7" cx="515.52344" cy="316.38074" r="89.288704" gradientTransform="matrix(0.90851353,0,0,1.1006991,33.231308,14.206617)" fx="515.52344" fy="316.38074" gradientUnits="userSpaceOnUse" />
    <radialGradient id="eyeGradient-1-4" cx="0.34" cy="0.23999999" r="0.77999997">
      <stop offset="0%" stop-color="#54308d" id="stop8-7-1" />
      <stop offset="55%" stop-color="#201538" id="stop9-5-8" />
      <stop offset="100%" stop-color="#090711" id="stop10-5-5" />
    </radialGradient>
  </defs>
  <g id="blobbi-root" data-part="character" transform="translate(-2.8116293)">
    <ellipse id="ground-shadow" data-part="ground-shadow" cx="327.49478" cy="1182.5261" rx="205" ry="30" fill="#2f183f" opacity="0.18" filter="url(#blur18)" style="filter:url(#blur18-7-2)" transform="matrix(0.25720571,0,0,0.25720571,22.92516,-91.303974)" />
    <path id="body-shadow" data-part="body-shadow" d="m 269.49479,510.52607 c 72,-21 157,4 218,68 55,57 84,148 94,257 12,127 -35,235.00003 -126,291.00003 -48,29 -106,41 -172,30 -100,-17 -174,-93 -193.000004,-195.00003 -19,-103 0,-212 47.000004,-302 34,-66 76,-131 132,-149 z" fill="#2d0d68" opacity="0.18" filter="url(#blur10)" style="filter:url(#blur10-0-4)" transform="matrix(0.25720571,0,0,0.25720571,22.92516,-91.303974)" />
    <ellipse id="far-foot" data-part="far-foot" cx="82.721947" cy="211.82988" rx="18.51881" ry="13.117491" fill="url(#footGradient)" opacity="0.78" transform="rotate(-8.0000009)" style="fill:url(#linearGradient7);stroke-width:0.257206" />
    <path id="far-arm" data-part="far-arm" d="m 52.63108,136.20118 c -10.80264,4.88691 -11.57426,22.11969 -2.05765,29.83587 6.94456,5.65853 13.11749,-0.25721 13.11749,-9.0022 -0.2572,-9.77382 -3.34367,-17.48999 -11.05984,-20.83367 z" fill="url(#limbGradient)" opacity="0.76" style="fill:url(#linearGradient8);stroke-width:0.257206" />
    <path id="body-base" data-part="body-base" d="m 89.15429,36.148161 c 18.51881,-5.40132 40.3813,1.028822 56.07085,17.489988 14.14631,14.660725 21.60527,38.066445 24.17733,66.101871 3.08647,32.66512 -9.0022,60.44335 -32.40792,74.84687 -12.34587,7.45896 -27.2638,10.54543 -44.23938,7.71617 -25.72057,-4.3725 -44.75379,-23.92013 -49.6407,-50.15512 -4.88691,-26.49219 0,-54.527612 12.08867,-77.676129 8.74499,-16.975576 19.54763,-33.693948 33.95115,-38.32365 z" fill="url(#bodyGradient)" style="fill:url(#bodyGradient-0-5);stroke-width:0.257206" />
    <ellipse id="tuft-main" data-part="tuft-main" cx="101.49877" cy="-9.5627279" rx="7.9733772" ry="12.60308" fill="url(#limbGradient)" transform="rotate(24)" style="fill:url(#linearGradient9);stroke-width:0.257206" />
    <ellipse id="tuft-secondary" data-part="tuft-secondary" cx="87.547356" cy="-69.384743" rx="5.6585255" ry="9.2594051" fill="url(#limbGradient)" transform="rotate(57)" style="fill:url(#linearGradient10);stroke-width:0.257206" />
    <path id="near-arm" data-part="near-arm" d="m 115.95808,131.42388 c 11.05984,4.11529 14.66072,21.09086 6.94455,30.60748 -6.17293,7.71612 -14.66072,3.60083 -16.71837,-5.40132 -2.31485,-10.28823 0.77162,-21.09087 9.77382,-25.20616 z" fill="url(#limbGradient)" style="fill:url(#linearGradient11);stroke-width:0.257206" />
    <ellipse id="near-foot" data-part="near-foot" cx="127.29324" cy="181.86639" rx="21.090868" ry="14.660726" fill="url(#footGradient)" transform="rotate(8.0000009)" style="fill:url(#linearGradient12);stroke-width:0.257206" />
    <ellipse id="cheek" data-part="cheek" cx="130.26022" cy="129.90445" rx="10.561018" ry="7.4589658" fill="#ff7ab7" opacity="0.74" style="stroke-width:0.237888" />
    <ellipse id="cheek-highlight" data-part="cheek-highlight" cx="127.61996" cy="127.84681" rx="3.9603817" ry="2.3148513" fill="#ffffff" opacity="0.17" style="stroke-width:0.237888" />
    <g id="side-pattern" data-part="side-pattern" opacity="0.56" transform="matrix(0.25720571,0,0,0.25720571,4.2763996,1.9398017)">
      <ellipse id="side-pattern-top" data-part="side-pattern-mark" cx="248" cy="341" rx="17" ry="24" fill="#481696" transform="rotate(-18,248,341)" />
      <ellipse id="side-pattern-middle" data-part="side-pattern-mark" cx="218" cy="389" rx="21" ry="27" fill="#481696" transform="rotate(18,218,389)" />
      <ellipse id="side-pattern-bottom" data-part="side-pattern-mark" cx="242" cy="434" rx="14" ry="20" fill="#481696" transform="rotate(-8,242,434)" />
    </g>
    <ellipse id="body-shine" data-part="body-shine" cx="58.20293" cy="99.103424" rx="5.9157314" ry="3.3436742" fill="#ffffff" opacity="0.3" transform="rotate(-29.999999)" style="stroke-width:0.257206" />
    <g id="eye" data-part="eye" transform="matrix(0.18488502,0,0,0.18488502,50.52122,36.568003)">
      <ellipse id="eye-white" data-part="eye-white" cx="497.65656" cy="383.79346" rx="77" ry="91" fill="#ffffff" />
      <g id="eye-inner" data-part="eye-inner" data-movable="true">
        <ellipse id="iris" data-part="iris" cx="518.23132" cy="395.2066" rx="52" ry="63" fill="url(#eyeGradient)" style="fill:url(#radialGradient19-7)" />
        <ellipse id="pupil" data-part="pupil" cx="512.23132" cy="406.2066" rx="32" ry="41" fill="#080711" />
        <ellipse id="eye-highlight-primary" data-part="eye-highlight-primary" cx="493.23129" cy="364.2066" rx="18" ry="23" fill="#ffffff" />
        <circle id="eye-highlight-secondary" data-part="eye-highlight-secondary" cx="534.23132" cy="422.2066" r="8.5" fill="#ffffff" opacity="0.76" />
      </g>
    </g>
    <path id="eyebrow" data-part="eyebrow" d="m 132.12368,87.673724 q 10.05417,-6.879167 20.10834,-0.264583" fill="none" stroke="#4f239e" stroke-width="2.91042" stroke-linecap="round" opacity="0.72" />
    <path id="mouth" data-part="mouth" d="m 152.94609,130.89676 c 2.94194,4.76972 8.31491,6.5639 14.44294,4.98862" fill="none" stroke="#21102e" stroke-width="3.722" stroke-linecap="round" />
    <path id="tuft-detail-left" data-part="tuft-detail-left" d="m 97.36033,41.580535 q -4.39146,-8.742111 2.11187,-16.2104" fill="none" stroke="#4f239e" stroke-width="2.36586" stroke-linecap="round" opacity="0.72" />
    <path id="tuft-detail-right" data-part="tuft-detail-right" d="m 102.71201,40.997283 q 1.741,-7.068929 9.03048,-8.150937" fill="none" stroke="#4f239e" stroke-width="1.76057" stroke-linecap="round" opacity="0.72" />
  </g>
</svg>`;
