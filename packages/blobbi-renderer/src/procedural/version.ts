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
 *    turn a seed into a genome and a genome into a body: the gene names, the
 *    keyed streams, the trait odds, the ranges, the stage plans. A Blobbi is
 *    one individual only for as long as those rules do not move, so they are
 *    FROZEN per version: `vectors.json` pins what every seed produces under
 *    this one, and `vectors.test.ts` holds the code to it.
 *
 * Changing any of it for creatures that already exist is not a tuning pass:
 * it is a new algorithm version, added beside this one, selected by the
 * version an identity carries. Version 1 must keep drawing every version 1
 * Blobbi exactly as it does today.
 *
 * What may still change WITHOUT a new version: anything that is not derived
 * from the seed for an existing Blobbi. Colours and trait kinds are stated
 * explicitly in a V3 identity for exactly that reason (the colour generator
 * can be retuned for NEW Blobbis without repainting old ones), and state
 * (expressions, motion, gaze) is not identity at all.
 */
export const PROCEDURAL_GENERATION = 'v3' as const;

/** The algorithm version this engine implements. See the note above before changing anything it pins. */
export const PROCEDURAL_ALGORITHM_VERSION = 1 as const;
