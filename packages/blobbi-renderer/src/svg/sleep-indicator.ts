/**
 * The baked-in "Zzz" of the V1 sleeping artwork, and how a host turns it off.
 *
 * The V1 baby and the sixteen V1 adult forms each ship a separately drawn
 * sleeping SVG. Besides the closed eyes and the calm mouth (the CREATURE
 * asleep, which is this package's to draw), those drawings carry a small
 * "Zzz" floating beside the head: an ENVIRONMENTAL sleep cue, the kind of
 * thing a host draws in its own world, animated, in its own style. A host
 * that does so ends up with two Zzz. `sleepIndicator: 'none'` removes the
 * artwork's Zzz block and nothing else; `'artwork'` (the default, so every
 * existing consumer draws exactly what it always drew) keeps it. V2 art has
 * no baked Zzz: sleeping there is the closed-eyes rule only.
 *
 * The block is found the way `rear-view.ts` finds face blocks: a comment
 * label, running to the next comment or `</svg>`. Only the label and the
 * `<text>` elements made of Zs inside it are removed, never the block as a
 * whole: in several adult forms the Zzz is the last labelled thing before
 * the `<defs>` that hold the body gradients, so removing "up to the next
 * comment" would take the gradients with it and leave an unfilled body.
 */
export type BlobbiSleepIndicator = 'artwork' | 'none';
export const BLOBBI_SLEEP_INDICATORS: readonly BlobbiSleepIndicator[] = ['artwork', 'none'];

/** The comment labels the V1 artwork uses for its Zzz (mixed English/Portuguese, like the face labels). */
export const SLEEP_INDICATOR_BLOCKS: readonly string[] = ["Z's for sleeping", '"Zzz" dormindo', '"Zzz" sleeping'];

const LABELS = new Set(SLEEP_INDICATOR_BLOCKS.map((l) => l.toLowerCase()));
const COMMENT_REGEX = /<!--([\s\S]*?)-->/g;
/** A floating "Z"/"z"/"Zzz" text element, the only thing a Zzz block draws. */
const Z_TEXT_REGEX = /<text\b[^>]*>\s*z+\s*<\/text>/gi;

export function normalizeBlobbiSleepIndicator(input: unknown): BlobbiSleepIndicator {
  return input === 'none' ? 'none' : 'artwork';
}

interface LabelledBlock {
  start: number;
  end: number;
}

/** Each Zzz block: from its label comment to the next comment or `</svg>`. */
function findSleepIndicatorBlocks(svgText: string): LabelledBlock[] {
  const comments: Array<{ label: string; start: number }> = [];
  COMMENT_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMMENT_REGEX.exec(svgText)) !== null) comments.push({ label: m[1].trim().toLowerCase(), start: m.index });
  const svgClose = svgText.search(/<\/svg>/i);
  const hardEnd = svgClose === -1 ? svgText.length : svgClose;
  return comments
    .map((c, i) => ({ label: c.label, start: c.start, end: Math.min(comments[i + 1]?.start ?? svgText.length, Math.max(hardEnd, c.start)) }))
    .filter((b) => LABELS.has(b.label))
    .map(({ start, end }) => ({ start, end }));
}

/** Whether this markup still carries a baked Zzz block. */
export function hasSleepIndicator(svgText: string): boolean {
  return findSleepIndicatorBlocks(svgText).length > 0;
}

/**
 * Remove the artwork's Zzz: the label comment and the Z text elements in its
 * block, nothing else. Pure and idempotent; markup without a Zzz is returned
 * as is (the same string), so awake drawings never change.
 */
export function removeSleepIndicator(svgText: string): string {
  const blocks = findSleepIndicatorBlocks(svgText);
  if (blocks.length === 0) return svgText;
  let out = '';
  let cursor = 0;
  for (const block of blocks) {
    out += svgText.slice(cursor, block.start);
    const fragment = svgText.slice(block.start, block.end);
    out += fragment.replace(/^<!--[\s\S]*?-->/, '').replace(Z_TEXT_REGEX, '');
    cursor = block.end;
  }
  return out + svgText.slice(cursor);
}
