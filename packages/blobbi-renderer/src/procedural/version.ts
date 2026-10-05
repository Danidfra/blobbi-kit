/**
 * WHICH DRAWINGS THESE ARE, AND WHICH RULES MADE THEM.
 *
 * Two different things, kept apart on purpose:
 *
 *  - {@link PROCEDURAL_GENERATION} is the public VISUAL GENERATION these
 *    drawings belong to: what a Blobbi's event names (`visual_generation`).
 *    It says "this Blobbi is drawn procedurally, from a genome". It is
 *    identity semantics and is meant to stay put.
 *
 *  - {@link PROCEDURAL_ALGORITHM_VERSION} is the version of the RULES that
 *    turn an identity into a Blobbi: what an event names as
 *    `visual_algorithm`.
 *
 * THE CONTRACT OF A VERSION
 *
 * ```
 *   the same V3 identity + the same visual_algorithm  ─►  the same Blobbi
 * ```
 *
 * The same BLOBBI: the same shapes, in the same places, painted the same
 * way. Not necessarily the same SVG, and not necessarily the same pixels.
 *
 * WHAT `visual_algorithm = 1` FREEZES
 *
 *   1. THE SEED'S READING. A seed is 32 bytes written as 64 lower-case
 *      hexadecimal digits. Upper-case digits read as lower-case; nothing
 *      else is a seed, and nothing is repaired into one
 *      (`canonicalBlobbiV3Seed`). The algorithm reads those 64 characters.
 *   2. THE RANDOM STREAMS. cyrb128 over `seed + U+0000 + key` seeds sfc32,
 *      twelve draws are discarded; one stream per key, and each key's name
 *      (`rng.ts`).
 *   3. THE GENOME. Which genes exist, the key each is drawn from, and how:
 *      a gene is `u1 + u2 - 1`, a roll is its stream's first draw
 *      (`genome.ts`).
 *   4. WHAT A SEED IS GIVEN. The odds of each trait kind, and the rules
 *      that thin a crowded head. They decide a new identity's kinds, and
 *      fill any kind an incomplete identity fails to state.
 *   5. MORPHOLOGY. How genes become artwork numbers: every range, how each
 *      trait develops from baby to adult, and the rules between traits
 *      (antennae behind crown horns, which regions a mark may use, how far
 *      a band reaches) (`morphology.ts`).
 *   6. THE STAGE PLANS. The canonical egg, baby and adult: body, face,
 *      limbs, and the regions of the skin (`plan/`, `egg.ts`).
 *   7. GEOMETRY. The silhouette, face, limbs and each trait's shape and
 *      anchoring, from the front, the side and behind: what is drawn where,
 *      and what a view does not show (`silhouette.ts`, `face.ts`,
 *      `limbs.ts`, `traits/`, `views/`).
 *   8. PATTERNS AND THE SPECIAL MARK. Spots, bands, the gradient's span and
 *      strength; the four mark shapes, and a mark's size, turn,
 *      foreshortening and place.
 *   9. THE ART STRUCTURE THAT DECIDES LOOKS. Paint order (what is in front
 *      of what, the crown's depth order), what is clipped to the body, the
 *      fixed opacities, and which colour paints which part (`svg.ts`, the
 *      views' `draw*`).
 *  10. THE PALETTE. Every colour role derived from the identity's four
 *      colours (`derivePalette`, `deriveEggPalette`).
 *
 * WHAT IT DOES NOT FREEZE, AND DOES NOT PROMISE
 *
 *  - The SVG: its bytes, DOM structure, grouping, element kinds, ids,
 *    attribute order, whitespace and number formatting; its CSS and
 *    keyframes; how a blur or a clip is implemented.
 *  - The backend: that it is SVG at all.
 *  - The pixels: browser rendering, anti-aliasing, pixel-identical output.
 *  - STATE, which is not identity: expression, gaze, sleep, motion, egg
 *    crack. How a Blobbi moves and emotes may be improved under the same
 *    version; who it is may not.
 *  - The colour GENERATOR: which four colours a new seed is given. Colours
 *    are explicit identity for exactly this reason, so it can be retuned
 *    for new Blobbis without repainting one that exists. (An identity that
 *    fails to state its colours is painted from the generator as it stands,
 *    and is promised nothing.)
 *
 * WHERE IT IS HELD
 *
 * ```
 *   1        the adapter's and core's seed tests ("the seed has one spelling")
 *   2, 3     vectors.json: hash, draws, genes, rolls and genomes of fixed seeds
 *   4        reference.test.ts: the odds, as a table
 *   5, 6     artwork/v3/reference/morphology.json   (exact)
 *   10       artwork/v3/reference/palette.json      (exact in JavaScript)
 *   6 to 9   artwork/v3/reference/paint.json: what twelve reference Blobbis
 *            paint as egg, baby and adult, from front, side and behind,
 *            compared as shapes and paint, never as markup
 *   9        artwork/v3/reference/art-structure.test.ts: the same, in words
 * ```
 *
 * Changing any frozen thing for creatures that already exist is not a
 * tuning pass: it is a new algorithm version, added beside this one and
 * selected by the version an identity carries. Version 1 must keep drawing
 * every version 1 Blobbi as it does today, and those files are how that is
 * known.
 */
export const PROCEDURAL_GENERATION = 'v3' as const;

/** The algorithm version this engine implements. See the note above before changing anything it pins. */
export const PROCEDURAL_ALGORITHM_VERSION = 1 as const;
