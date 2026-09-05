/**
 * Eye-gaze SVG post-processing for Blobbi.
 *
 * Marks the actual pupil + highlight shapes inside the generated SVG so they
 * can be translated independently of the body via CSS variables, producing
 * real eye movement (rather than nudging the whole sprite).
 *
 * Strategy (asset-agnostic, works for baby + every adult form/sleeping variant):
 * - Every Blobbi SVG places its pupils/highlights inside a `<!-- Pupils ... -->`
 *   comment block, terminated by the next comment or the closing `</svg>`.
 * - We add `class="blobbi-pupil"` to each `<circle>`/`<ellipse>` in that block.
 * - We inject a scoped `<style>` that translates `.blobbi-pupil` by
 *   `var(--blobbi-eye-x)` / `var(--blobbi-eye-y)` (set on the wrapper at runtime).
 *
 * This runs once per visual change (when the SVG string is generated), never
 * per animation frame. Runtime gaze only updates the CSS variables.
 */

const PUPIL_CLASS = 'blobbi-pupil';

/** Matches the Pupils comment block up to the next comment or end of string. */
const PUPILS_BLOCK_REGEX = /(<!--\s*Pupils[\s\S]*?)(?=<!--|<\/svg>|$)/i;

/** Adds the pupil marker class to circle/ellipse elements within a block. */
function markShapesInBlock(block: string): string {
  return block.replace(/<(circle|ellipse)\b((?:[^>]*?))(\/?)>/gi, (full, tag: string, attrs: string, selfClose: string) => {
    // Avoid double-marking if already processed.
    if (/\bclass\s*=/.test(attrs)) {
      if (attrs.includes(PUPIL_CLASS)) return full;
      const merged = attrs.replace(/class\s*=\s*(["'])(.*?)\1/i, (_m, q: string, val: string) => `class=${q}${val} ${PUPIL_CLASS}${q}`);
      return `<${tag}${merged}${selfClose}>`;
    }
    return `<${tag} class="${PUPIL_CLASS}"${attrs}${selfClose}>`;
  });
}

/**
 * Tag the pupil/highlight shapes and inject the gaze style into an SVG string.
 *
 * Idempotent: calling it again on an already-processed SVG is a no-op for the
 * style injection and won't double-add the class.
 *
 * @param svgText - The fully customized SVG markup (after the artwork pipeline).
 * @param generation - `'v1'` (default) marks the Pupils comment block; `'v2'`
 *   marks the semantic `*-eye-inner` groups. A number is the legacy V1 form of
 *   the argument: the pupil travel in px.
 * @returns SVG markup with marked pupils and an injected gaze `<style>`.
 */
/**
 * V2 artwork names its movable eye content explicitly:
 * `data-part="left-eye-inner"`, `right-eye-inner` (front) and `eye-inner`
 * (profile), each a `<g>` around iris, pupil and highlights. The eye white is a
 * sibling outside the group, so translating the group moves the gaze and
 * nothing else. No geometry heuristic and no comment convention is involved.
 */
const V2_MOVABLE_GROUP_REGEX = /<g\b([^>]*\bdata-part="(?:left-eye-inner|right-eye-inner|eye-inner)"[^>]*)>/gi;

/**
 * How far (in the marked element's own user units) a full gaze deflection
 * travels, per generation. V1 pupils are circles drawn directly in a 200-unit
 * viewBox; V2 inner-eye groups sit under document transforms that scale their
 * units to about 0.185 viewBox units, so a similar on-screen travel needs a
 * larger local number.
 */
const GAZE_TRAVEL_UNITS: Record<'v1' | 'v2', number> = { v1: 2, v2: 12 };

function markV2MovableGroups(svgText: string): { markup: string; marked: boolean } {
  let marked = false;
  const markup = svgText.replace(V2_MOVABLE_GROUP_REGEX, (full, attrs: string) => {
    marked = true;
    if (/\bclass\s*=/.test(attrs)) {
      if (attrs.includes(PUPIL_CLASS)) return full;
      const merged = attrs.replace(/class\s*=\s*(["'])(.*?)\1/i, (_m, q: string, val: string) => `class=${q}${val} ${PUPIL_CLASS}${q}`);
      return `<g${merged}>`;
    }
    return `<g class="${PUPIL_CLASS}"${attrs}>`;
  });
  return { markup, marked };
}

export function applyGazeMarkup(svgText: string, generation: 'v1' | 'v2' | number = 'v1'): string {
  // Already processed: avoid double-injecting the style.
  if (svgText.includes('data-blobbi-gaze-style')) {
    return svgText;
  }

  // Historical signature: a numeric second argument is the V1 travel in px.
  const gen: 'v1' | 'v2' = generation === 'v2' ? 'v2' : 'v1';
  const maxPx = typeof generation === 'number' ? generation : GAZE_TRAVEL_UNITS[gen];

  let modified = svgText;
  if (gen === 'v2') {
    // 1 (V2). Mark the semantic movable groups.
    const result = markV2MovableGroups(modified);
    if (!result.marked) return modified; // a view with no face (back)
    modified = result.markup;
  } else {
    // 1 (V1). Mark the pupil/highlight shapes within the Pupils block.
    const blockMatch = modified.match(PUPILS_BLOCK_REGEX);
    if (!blockMatch) {
      // No pupil block (e.g. sleeping variants with closed eyes): nothing to move.
      return modified;
    }
    const original = blockMatch[0];
    const marked = markShapesInBlock(original);
    modified = modified.replace(original, marked);
  }

  // 2. Inject a scoped style right after the opening <svg ...> tag.
  // The CSS vars are unitless and multiplied by `px`; they default to 0 so an
  // undefined gaze leaves pupils perfectly static.
  const px = Number.isFinite(maxPx) ? maxPx : 2;
  const style =
    `<style data-blobbi-gaze-style>.${PUPIL_CLASS}{` +
    `transform:translate(calc(var(--blobbi-eye-x,0) * ${px}px),calc(var(--blobbi-eye-y,0) * ${px}px));` +
    `transition:transform 250ms ease-out;}</style>`;

  modified = modified.replace(/(<svg\b[^>]*>)/i, `$1${style}`);

  return modified;
}
