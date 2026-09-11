import type { Face, Hand, RoundType } from './types'
import { PERUDO } from './types'

/**
 * How many dice in one hand count toward `face`.
 *
 * Normal round (GAME_RULES §3): ones are wild, so a bid on a normal face is
 * satisfied by that face *plus* every one. A bid on Perudo itself counts only
 * actual ones — the wildcard cannot double-count itself.
 *
 * Farewell round (GAME_RULES §10): ones are NOT wild. Only exact matches count,
 * including when the locked face is Perudo.
 */
export function countInHand(
  dice: readonly Face[],
  face: Face,
  roundType: RoundType,
): number {
  if (roundType === 'farewell' || face === PERUDO) {
    return dice.filter((die) => die === face).length
  }
  return dice.filter((die) => die === face || die === PERUDO).length
}

/** The same count across every hand still in play. */
export function countAcrossTable(
  hands: readonly Hand[],
  face: Face,
  roundType: RoundType,
): number {
  return hands.reduce((total, hand) => total + countInHand(hand.dice, face, roundType), 0)
}
