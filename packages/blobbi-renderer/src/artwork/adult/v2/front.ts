/**
 * Adult V2, FRONT (diagonal) view. Canonical source artwork.
 *
 * Normalized from the authored Inkscape export with NO change to geometry,
 * transforms, colors, gradients, filters or dimensions:
 *  - the XML declaration, Inkscape comments, `<title>`/`<desc>`, `width` and
 *    `height` (the renderer sizes by viewBox) and the `xmlns:svg` alias were
 *    dropped;
 *  - the empty legacy `body-highlights` groups and the transform-less wrapper
 *    groups (`layer1`, `blobbi-side-right`) were removed; the two transforming
 *    wrappers (`g1`, `g7`) and the character root keep their exact transforms
 *    under semantic ids;
 *  - Inkscape suffixes were removed from ids (`body-base-6` -> `body-base`,
 *    `tuft-main-8` -> `tuft-main`, ...) and every part carries the `data-part`
 *    name from `parts.ts`. Code selects by `data-part`; ids are namespaced per
 *    instance at render time.
 *
 * The `<defs>` block is kept complete, including gradient variants that only
 * the source's original layers referenced: they paint nothing and removing
 * them is not this milestone's business.
 *
 * KNOWN SOURCE FACT, preserved rather than corrected: the `side-pattern` group
 * (`translate(383.61975,-265.28624)`, marks at x 589..619) projects to
 * x ~ 255..263 of the 211.67-unit viewBox, i.e. OUTSIDE the visible area. The
 * front view therefore shows no pattern marks as authored; `secondaryColor`
 * recolors them but the result is only visible on the profile. Moving the
 * group would be a redesign of the artwork and is left to the artist.
 */
export const ADULT_V2_FRONT_VIEWBOX = { width: 211.66666, height: 238.125 } as const;

export const ADULT_V2_FRONT_SVG = `<svg viewBox="0 0 211.66666 238.125" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" data-blobbi-generation="v2" data-blobbi-view="front">
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
    <clipPath id="bodyClip-3">
      <path d="m 330,133 c 72,-21 157,4 218,68 55,57 84,148 94,257 12,127 -35,235 -126,291 -48,29 -106,41 -172,30 C 244,762 170,686 151,584 132,481 151,372 198,282 232,216 274,151 330,133 Z" id="path11-9" />
    </clipPath>
    <radialGradient id="bodyGradient-4" cx="361.6647" cy="261.54892" r="486.10767" gradientTransform="matrix(0.89956637,0,0,1.0638529,8.6565698,16.210662)" fx="361.6647" fy="261.54892" gradientUnits="userSpaceOnUse">
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
      <path d="M400 126 C472 126 530 164 574 226 C621 292 650 387 664 493 C680 614 622 716 523 759 C486 775 445 783 400 785 C355 783 314 775 277 759 C178 716 120 614 136 493 C150 387 179 292 226 226 C270 164 328 126 400 126Z" id="path11-2" />
    </clipPath>
    <linearGradient xlink:href="#footGradient" id="linearGradient13" x1="192.81896" y1="808.78457" x2="192.81896" y2="942.99336" gradientTransform="matrix(1.1772701,0,0,0.84942274,-84.359624,32.801326)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#footGradient" id="linearGradient14" x1="352.51044" y1="808.78457" x2="352.51044" y2="942.99336" gradientTransform="matrix(1.1772701,0,0,0.84942274,95.580635,-66.804089)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient15" x1="449.18958" y1="54.144176" x2="528.38554" y2="133.34014" gradientTransform="matrix(0.80812204,0,0,1.2374369,28.081543,-120.149)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient16" x1="517.48422" y1="73.323976" x2="575.82802" y2="131.66778" gradientTransform="matrix(0.78842985,0,0,1.2683437,-49.373627,-389.773)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient17" x1="141.81025" y1="439.68556" x2="259.4172" y2="557.29252" gradientTransform="matrix(0.82492601,0,0,1.2122299,-0.78770654,-36.427923)" gradientUnits="userSpaceOnUse" />
    <linearGradient xlink:href="#limbGradient" id="linearGradient18" x1="710.36674" y1="439.68556" x2="827.9737" y2="557.29252" gradientTransform="matrix(0.82492601,0,0,1.2122299,18.100846,-35.078741)" gradientUnits="userSpaceOnUse" />
    <radialGradient xlink:href="#eyeGradient-1" id="radialGradient18" cx="328.40458" cy="316.38075" r="89.288706" gradientTransform="matrix(0.90851353,0,0,1.1006991,8.6565698,10.793459)" fx="328.40458" fy="316.38075" gradientUnits="userSpaceOnUse" />
    <radialGradient xlink:href="#eyeGradient-1" id="radialGradient19" cx="515.52342" cy="316.38075" r="89.288706" gradientTransform="matrix(0.90851353,0,0,1.1006991,8.6565698,10.793459)" fx="515.52342" fy="316.38075" gradientUnits="userSpaceOnUse" />
  </defs>
  <g id="v2-document-scale" transform="matrix(0.26458333,0,0,0.26458333,1.3647759,37.271946)">
    <g id="v2-character-position" transform="translate(65.217497,-422.67995)">
      <g id="blobbi-root" data-part="character" transform="translate(-79.03227,287.45075)">
        <path id="body-shadow" data-part="body-shadow" d="m 408,140 c 72,0 130,38 174,100 47,66 76,161 90,267 16,121 -42,223 -141,266 -37,16 -78,24 -123,26 C 363,797 322,789 285,773 186,730 128,628 144,507 158,401 187,306 234,240 278,178 336,140 408,140 Z" fill="#2d0d68" opacity="0.18" filter="url(#blur10)" style="filter:url(#blur10-8)" />
        <ellipse id="ground-shadow" data-part="ground-shadow" cx="408.65656" cy="830.79346" rx="205" ry="30" fill="#2f183f" opacity="0.18" filter="url(#blur18)" style="filter:url(#blur18-4)" />
        <ellipse id="left-foot-shadow" data-part="left-foot-shadow" cx="314.65656" cy="768.79346" rx="77" ry="55" fill="#2d0d68" opacity="0.22" filter="url(#blur10)" style="filter:url(#blur10-8)" />
        <ellipse id="right-foot-shadow" data-part="right-foot-shadow" cx="502.65656" cy="768.79346" rx="77" ry="55" fill="#2d0d68" opacity="0.22" filter="url(#blur10)" style="filter:url(#blur10-8)" />
        <ellipse id="left-foot" data-part="left-foot" cx="221.64038" cy="776.80133" rx="79" ry="57" fill="url(#footGradient)" transform="rotate(-7)" style="fill:url(#linearGradient13)" />
        <ellipse id="right-foot" data-part="right-foot" cx="589.58069" cy="677.19592" rx="79" ry="57" fill="url(#footGradient)" transform="rotate(7)" style="fill:url(#linearGradient14)" />
        <path id="body-base" data-part="body-base" d="m 408.65657,136.79346 c 72,0 130,36.36624 174,95.70063 47,63.16242 76,154.07802 90,255.52069 16,115.79777 -42,213.41241 -141,254.56369 -37,15.3121 -78,22.96815 -123,24.88216 -45,-1.91401 -86,-9.57006 -123,-24.88216 -99,-41.15128 -157,-138.76592 -141,-254.56369 14,-101.44267 43,-192.35827 90,-255.52069 44,-59.33439 102,-95.70063 174,-95.70063 z" fill="url(#bodyGradient)" style="fill:url(#bodyGradient-4);stroke-width:0.978267" />
        <ellipse id="tuft-main" data-part="tuft-main" cx="423.08154" cy="-4.1489954" rx="32" ry="49" fill="url(#limbGradient)" transform="rotate(18)" style="fill:url(#linearGradient15)" />
        <ellipse id="tuft-secondary" data-part="tuft-secondary" cx="381.62637" cy="-259.77301" rx="23" ry="37" fill="url(#limbGradient)" transform="rotate(52)" style="fill:url(#linearGradient16)" />
        <path id="left-arm" data-part="left-arm" d="m 148.21229,496.57208 c -44,24 -42,99 2,133 34,26 63,-5 63,-45 -1,-45 -21,-76 -65,-88 z" fill="url(#limbGradient)" style="fill:url(#linearGradient17)" />
        <path id="right-arm" data-part="right-arm" d="m 669.10084,497.92126 c 44,24 42,99 -2,133 -34,26 -63,-5 -63,-45 1,-45 21,-76 65,-88 z" fill="url(#limbGradient)" style="fill:url(#linearGradient18)" />
        <g id="left-eye" data-part="left-eye" transform="matrix(0.69877802,0,0,0.69877802,79.280551,152.15487)">
          <ellipse id="left-eye-white" data-part="left-eye-white" cx="319.65656" cy="383.79346" rx="77" ry="91" fill="#ffffff" />
          <g id="left-eye-inner" data-part="left-eye-inner" data-movable="true">
            <ellipse id="left-iris" data-part="left-iris" cx="323.65656" cy="391.79346" rx="52" ry="63" fill="url(#eyeGradient)" style="fill:url(#radialGradient18)" />
            <ellipse id="left-pupil" data-part="left-pupil" cx="329.65656" cy="402.79346" rx="32" ry="41" fill="#080711" />
            <ellipse id="left-eye-highlight-primary" data-part="left-eye-highlight-primary" cx="304.65656" cy="360.79346" rx="18" ry="23" fill="#ffffff" />
            <circle id="left-eye-highlight-secondary" data-part="left-eye-highlight-secondary" cx="345.65656" cy="418.79346" r="8.5" fill="#ffffff" opacity="0.76" />
          </g>
        </g>
        <g id="right-eye" data-part="right-eye" transform="matrix(0.69877802,0,0,0.69877802,163.09607,145.17025)">
          <ellipse id="right-eye-white" data-part="right-eye-white" cx="497.65656" cy="383.79346" rx="77" ry="91" fill="#ffffff" />
          <g id="right-eye-inner" data-part="right-eye-inner" data-movable="true">
            <ellipse id="right-iris" data-part="right-iris" cx="493.65656" cy="391.79346" rx="52" ry="63" fill="url(#eyeGradient)" style="fill:url(#radialGradient19)" />
            <ellipse id="right-pupil" data-part="right-pupil" cx="487.65656" cy="402.79346" rx="32" ry="41" fill="#080711" />
            <ellipse id="right-eye-highlight-primary" data-part="right-eye-highlight-primary" cx="468.65656" cy="360.79346" rx="18" ry="23" fill="#ffffff" />
            <circle id="right-eye-highlight-secondary" data-part="right-eye-highlight-secondary" cx="509.65656" cy="418.79346" r="8.5" fill="#ffffff" opacity="0.76" />
          </g>
        </g>
        <path id="left-eyebrow" data-part="left-eyebrow" d="m 266.25672,330.36951 q 38,-25 76,1" fill="none" stroke="#4f239e" stroke-width="11" stroke-linecap="round" opacity="0.72" />
        <path id="right-eyebrow" data-part="right-eyebrow" d="m 464.49446,330.02033 q 38,-26 76,-1" fill="none" stroke="#4f239e" stroke-width="11" stroke-linecap="round" opacity="0.72" />
        <path id="tuft-detail-left" data-part="tuft-detail-left" d="m 402.0793,168.45718 q -16.59766,-33.04105 7.98185,-61.26766" fill="none" stroke="#4f239e" stroke-width="8.94185" stroke-linecap="round" opacity="0.72" />
        <path id="tuft-detail-right" data-part="tuft-detail-right" d="m 422.30612,166.25276 q 6.58014,-26.71721 34.13093,-30.80669" fill="none" stroke="#4f239e" stroke-width="6.65413" stroke-linecap="round" opacity="0.72" />
        <g id="left-cheek" data-part="left-cheek" transform="translate(-7.3047614,-15.343688)">
          <ellipse id="left-cheek-base" data-part="left-cheek-base" cx="245.65657" cy="514.79346" rx="47" ry="30" fill="#ff7ab7" opacity="0.74" />
          <ellipse id="left-cheek-highlight" data-part="left-cheek-highlight" cx="231.65657" cy="505.79346" rx="18" ry="9" fill="#ffffff" opacity="0.17" />
        </g>
        <g id="right-cheek" data-part="right-cheek" transform="translate(-7.3047614,-15.343688)">
          <ellipse id="right-cheek-base" data-part="right-cheek-base" cx="571.65656" cy="514.79346" rx="47" ry="30" fill="#ff7ab7" opacity="0.74" />
          <ellipse id="right-cheek-highlight" data-part="right-cheek-highlight" cx="557.65656" cy="505.79346" rx="18" ry="9" fill="#ffffff" opacity="0.17" />
        </g>
        <path id="mouth" data-part="mouth" d="m 371.1973,494.83689 c 15.89586,30.56679 67.22108,31.06386 82.71435,0" fill="none" stroke="#21102e" stroke-width="14.0674" stroke-linecap="round" />
        <g id="side-pattern" data-part="side-pattern" opacity="0.56" transform="translate(383.61975,-265.28624)">
          <ellipse id="side-pattern-top" data-part="side-pattern-mark" cx="589" cy="344" rx="17" ry="24" fill="#481696" transform="rotate(-18,589,344)" />
          <ellipse id="side-pattern-middle" data-part="side-pattern-mark" cx="619" cy="391" rx="21" ry="27" fill="#481696" transform="rotate(18,619,391)" />
          <ellipse id="side-pattern-bottom" data-part="side-pattern-mark" cx="596" cy="434" rx="14" ry="20" fill="#481696" transform="rotate(-8,596,434)" />
        </g>
        <ellipse id="body-shine" data-part="body-shine" cx="166.76411" cy="360.46924" rx="23" ry="13" fill="#ffffff" opacity="0.3" transform="rotate(-30)" />
      </g>
    </g>
  </g>
</svg>`;
