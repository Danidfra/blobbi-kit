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
 *    turn a seed into a Blobbi: Algorithm 1. V3 IS Algorithm 1, forever:
 *    the generation fixes the rules, and no tag on an event names others
 *    (`@blobbi-kit/core` retired the pre-release `visual_algorithm` tag, so
 *    a replacement event cannot redraw a Blobbi by naming another version).
 *
 * THE CONTRACT
 *
 * ```
 *   the same V3 seed  ─►  the same Blobbi, for as long as V3 is drawn
 * ```
 *
 * The same BLOBBI: the same shapes, in the same places, painted the same
 * way. Not necessarily the same SVG, and not necessarily the same pixels.
 *
 * WHAT ALGORITHM 1 (V3) FREEZES
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
 *  11. THE COLOUR GENERATOR. Which four colours, and which colour scheme,
 *      a seed is given (`generateColors`). A V3 event states no colour: its
 *      seed is its address (`@blobbi-kit/core`, `deriveBlobbiV3Seed`) and
 *      everything it looks like is this algorithm's function of that seed,
 *      so the colours are as frozen as the shapes.
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

 * WHERE IT IS HELD
 *
 * ```
 *   1        the adapter's and core's seed tests ("the seed has one spelling")
 *   2, 3     vectors.json: hash, draws, genes, rolls and genomes of fixed seeds
 *   4, 11    vectors.json (colours) and core's blobbi-v3-identity.vectors.json:
 *            address -> seed -> colours and trait kinds
 *            (artwork/v3/reference/address-identity.test.ts)
 *   4        reference.test.ts: the odds, as a table
 *   5, 6     artwork/v3/reference/morphology.json   (exact)
 *   10       artwork/v3/reference/palette.json      (exact in JavaScript)
 *   6 to 9   artwork/v3/reference/paint.json: what twelve reference Blobbis
 *            paint as egg, baby and adult, from front, side and behind,
 *            compared as shapes and paint, never as markup
 *   9        artwork/v3/reference/art-structure.test.ts: the same, in words
 * ```
 *
 * WHEN A CHANGE NEEDS A NEW GENERATION
 *
 *  - No version at all: a renderer or backend optimization, another backend
 *    (canvas, 3D), animation, motion, expressions, gaze, sleep and egg-crack
 *    state, cosmetic layers drawn over the Blobbi (clothing, accessories,
 *    effects), and SVG structure, ids or number formatting. None of them is
 *    who the Blobbi is.
 *  - A fix, still no version: when the implementation has drifted from what
 *    the files above pin, bringing it back to them is a fix. The pinned
 *    reference IS Algorithm 1; it is never "fixed" toward something else.
 *  - A new visual generation (`v4`, its own rules, its own reference files):
 *    any change to a frozen thing above, so new trait odds, new morphology,
 *    a new palette or colour generator, a new genome or a new seed reading.
 *    It applies to Blobbis BORN into it. Every V3 Blobbi stays V3 and keeps
 *    being drawn by Algorithm 1; a V3 drawing never silently changes.
 *
 * Version 1 must keep drawing every V3 Blobbi as it does today, and those
 * files are how that is known.
 */
export const PROCEDURAL_GENERATION = 'v3' as const;

/** The algorithm version this engine implements. See the note above before changing anything it pins. */
export const PROCEDURAL_ALGORITHM_VERSION = 1 as const;
