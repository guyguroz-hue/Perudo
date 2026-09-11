import { checkBid } from './bids'
import { countInHand } from './counting'
import type { Face, ProposedBid, RoundState } from './types'
import { FACES } from './types'

/**
 * What a bid builder is allowed to offer.
 *
 * Every answer here is derived by asking `checkBid`, never by reimplementing
 * it. The search space is a few hundred pairs, so brute force costs nothing —
 * and it buys the one property that matters: the options a player can reach
 * and the rules the server enforces cannot drift apart, because they are the
 * same function.
 */

export interface QuantityBounds {
  readonly min: number
  readonly max: number
}

/**
 * How far up to look for a legal quantity.
 *
 * Leaving Perudo demands double the quantity plus one, so on a table of thirty
 * dice the lowest legal normal bid can reach the low sixties. This is
 * comfortably past all of it.
 */
const SEARCH_CEILING = 200

/** Every face that may be bid at this quantity. Possibly empty. */
export function legalFacesAt(round: RoundState, quantity: number): readonly Face[] {
  return FACES.filter((face) => checkBid(round, { quantity, face }).legal)
}

/**
 * The quantity range a builder should offer.
 *
 * There is always a legal bid: nothing in the rules caps a quantity, so it can
 * always rise. The range therefore always exists, and the search failing would
 * mean a rule had changed underneath this — which is worth a crash rather than
 * a UI that quietly offers nothing.
 *
 * The ceiling is normally the number of dice on the table. Bidding beyond that
 * is legal and this does not forbid it: where the lowest legal quantity is
 * already above the table total, the range opens to reach it. What the range
 * will not do is run on to arbitrarily large quantities, because every bid
 * above the table total is certainly false and therefore identical in play.
 * Capping there removes no strategic option, only unusable travel in a control
 * held with one thumb (D-007).
 */
export function quantityBounds(round: RoundState, diceOnTable: number): QuantityBounds {
  for (let quantity = 1; quantity <= SEARCH_CEILING; quantity += 1) {
    if (legalFacesAt(round, quantity).length > 0) {
      return { min: quantity, max: Math.max(diceOnTable, quantity) }
    }
  }
  throw new Error(
    `No legal bid found below ${SEARCH_CEILING}. A quantity can always rise, so ` +
      `this means the bid rules changed and this search did not follow.`,
  )
}

/**
 * The lowest bid this round will accept, in quantity-then-face order.
 *
 * Often surprising, and deliberately so: against four fives this is two
 * Perudos, because switching to the wildcard lets the quantity fall
 * (GAME_RULES §5). It is the floor of the quantity control, not a suggestion —
 * for what the builder should open holding, see `minimalRaise`.
 */
export function lowestLegalBid(round: RoundState, diceOnTable: number): ProposedBid {
  const bounds = quantityBounds(round, diceOnTable)
  return { quantity: bounds.min, face: legalFacesAt(round, bounds.min)[0] }
}

/**
 * The smallest raise on the bid in front of you.
 *
 * Not the lowest legal bid, which is usually a jump to Perudo. This is the
 * move players actually make: nudge the face up if it can go up, and otherwise
 * ask for one more of the same face.
 *
 * Raising the face is preferred over raising the quantity because it commits
 * less — four sixes claims four dice where five fives claims five. And when
 * the quantity does have to rise, the face stays put: dropping the face is
 * legal once the quantity climbs (R-009), but it is a strategic choice, never
 * a default.
 */
export function minimalRaise(round: RoundState, diceOnTable: number): ProposedBid {
  const current = round.bid
  if (current === null) return lowestLegalBid(round, diceOnTable)

  for (let face = current.face + 1; face <= 6; face += 1) {
    const next = { quantity: current.quantity, face: face as Face }
    if (checkBid(round, next).legal) return next
  }
  for (let quantity = current.quantity + 1; quantity <= SEARCH_CEILING; quantity += 1) {
    const next = { quantity, face: current.face }
    if (checkBid(round, next).legal) return next
  }
  return lowestLegalBid(round, diceOnTable)
}

/**
 * Where the builder opens.
 *
 * Facing a bid it opens on the smallest raise, because that is what players
 * overwhelmingly do — which turns the commonest move in the game into a single
 * tap.
 *
 * Opening the round there is nothing to raise, so it opens on the face the
 * player holds most of, counted under this round's rules. That is a starting
 * position, not advice: it reads only the player's own hand, which they are
 * already looking at, and every other bid is one tap away. The alternative was
 * to open on one of the lowest face, which nobody has ever wanted to bid.
 */
export function initialBid(
  round: RoundState,
  diceOnTable: number,
  ownHand: readonly Face[],
): ProposedBid {
  if (round.bid !== null) {
    return minimalRaise(round, diceOnTable)
  }

  const bounds = quantityBounds(round, diceOnTable)
  let best = lowestLegalBid(round, diceOnTable)
  let bestCount = -1
  for (const face of legalFacesAt(round, bounds.min)) {
    const count = countInHand(ownHand, face, round.type)
    // Strictly greater, so ties go to the lower face: it leaves the most room
    // to raise afterwards.
    if (count > bestCount) {
      bestCount = count
      best = { quantity: clamp(Math.max(count, bounds.min), bounds), face }
    }
  }
  return best
}

/**
 * Change the face, keeping the bid legal.
 *
 * Changing a face alone can strand the quantity — switching to Perudo halves
 * what is required, switching away from it more than doubles — so the quantity
 * follows to the lowest value that keeps the pair legal, rather than the
 * builder sitting on a bid the server would refuse.
 */
export function withFace(round: RoundState, current: ProposedBid, face: Face): ProposedBid {
  if (checkBid(round, { quantity: current.quantity, face }).legal) {
    return { quantity: current.quantity, face }
  }
  for (let quantity = 1; quantity <= SEARCH_CEILING; quantity += 1) {
    if (checkBid(round, { quantity, face }).legal) {
      return { quantity, face }
    }
  }
  return current
}

function clamp(value: number, bounds: QuantityBounds): number {
  return Math.min(Math.max(value, bounds.min), bounds.max)
}

/** Dice on the table right now. Public information: counts, never faces. */
export function diceOnTable(players: readonly { readonly diceCount: number }[]): number {
  return players.reduce((total, player) => total + player.diceCount, 0)
}
