import { CROWN_PATH } from './crown'

/**
 * The Perudo wildcard.
 *
 * The game's own crown, worn by the die that outranks every other. The face
 * that would carry a single pip never shows a "1" anywhere in this product:
 * the one is not a quantity, it is the die that counts as any face you like,
 * and a numeral says none of that.
 *
 * It is the crown rather than a mark of its own because this one already has
 * to work at the size a die is. It is pressed into all six cups and read at 14
 * pixels there; a jester's cap and a harlequin's mask were both tried and both
 * failed at exactly that size — the cap came out a sprouting plant and the mask
 * a black blot with two holes in it. A shape that is already proven small is
 * worth more here than a shape that is only more literal.
 *
 * Nothing else on a die is anything but pips, so there is no ambiguity to have:
 * on a cup the crown is the house mark, on a face it is the wild one.
 *
 * Drawn in a 32 by 22 box, like the crown it is.
 */
export const JOKER_PATHS: readonly string[] = CROWN_PATH

/** The box the paths are drawn in. */
export const JOKER_BOX = { width: 32, height: 22 } as const
