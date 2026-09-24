/**
 * Egg crack state: how far along an egg's shell is, as a closed vocabulary.
 *
 * Like expression and motion this is VISUAL state a host names, never a rule
 * the renderer decides: whether an egg is "one third of the way to hatching"
 * is lifecycle policy that lives with the host and the domain kit. The
 * renderer only knows four drawings of the shell.
 *
 *  - `'none'`    the intact shell (the default);
 *  - `'light'`   a first hairline crack;
 *  - `'medium'`  the crack has grown and branched;
 *  - `'heavy'`   the shell is about to give.
 *
 * Unknown or absent input draws the intact shell, so pre-existing callers
 * and pre-existing data are untouched. Ignored by every stage but the egg.
 */
export type BlobbiEggCrack = 'none' | 'light' | 'medium' | 'heavy';

export const BLOBBI_EGG_CRACKS: readonly BlobbiEggCrack[] = ['none', 'light', 'medium', 'heavy'];

const KNOWN: ReadonlySet<string> = new Set(BLOBBI_EGG_CRACKS);

/** Resolve any input to a crack state. Unknown or absent input is `'none'`. */
export function normalizeBlobbiEggCrack(input: unknown): BlobbiEggCrack {
  return typeof input === 'string' && KNOWN.has(input) ? (input as BlobbiEggCrack) : 'none';
}

/** Numeric rank of a crack state, for "at least this cracked" comparisons. */
export function eggCrackLevel(crack: BlobbiEggCrack): 0 | 1 | 2 | 3 {
  switch (crack) {
    case 'light':
      return 1;
    case 'medium':
      return 2;
    case 'heavy':
      return 3;
    default:
      return 0;
  }
}
