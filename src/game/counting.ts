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
  return dice.filter((die) => countsToward(die, face, roundType)).length
}

/**
 * Whether one die counts toward a bid on `face`.
 *
 * The same rule as `countInHand`, asked one die at a time — which is what the
 * reveal needs to mark the dice that mattered. Lifted out rather than restated
 * so the two can never disagree about which dice were counted.
 */
export function countsToward(die: Face, face: Face, roundType: RoundType): boolean {
  if (die === face) return true
  return roundType === 'normal' && face !== PERUDO && die === PERUDO
}

/** The same count across every hand still in play. */
export function countAcrossTable(
  hands: readonly Hand[],
  face: Face,
  roundType: RoundType,
): number {
  return hands.reduce((total, hand) => total + countInHand(hand.dice, face, roundType), 0)
}
