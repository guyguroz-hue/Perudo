import type { BidCheck, BidRejection, Face, ProposedBid, RoundState } from './types'
import { PERUDO } from './types'

/**
 * Minimum Perudo quantity when switching from a normal face (GAME_RULES §5).
 * 4 -> 2, 5 -> 3, 6 -> 3, 7 -> 4, 8 -> 4, 9 -> 5.
 */
export function minPerudoQuantity(previousQuantity: number): number {
  return Math.ceil(previousQuantity / 2)
}

/**
 * Minimum quantity when switching from Perudo back to a normal face
 * (GAME_RULES §6). 4 -> 9, 5 -> 11, 6 -> 13.
 */
export function minQuantityAfterPerudo(previousPerudoQuantity: number): number {
  return previousPerudoQuantity * 2 + 1
}

const ok: BidCheck = { legal: true }

function no(reason: BidRejection, detail: string): BidCheck {
  return { legal: false, reason, detail }
}

function isFace(value: number): value is Face {
  return Number.isInteger(value) && value >= 1 && value <= 6
}

/**
 * Judge a proposed bid against the current round state.
 *
 * Returns a verdict rather than throwing, because the client needs the same
 * answer to drive the bid builder. The client's copy is a convenience only —
 * the authoritative check is this function running server-side (PART 46).
 */
export function checkBid(round: RoundState, next: ProposedBid): BidCheck {
  if (!Number.isInteger(next.quantity) || next.quantity < 1) {
    return no('INVALID_QUANTITY', `quantity must be a whole number of at least 1, got ${next.quantity}`)
  }
  if (!isFace(next.face)) {
    return no('INVALID_FACE', `face must be 1-6, got ${next.face}`)
  }

  return round.type === 'farewell' ? checkFarewellBid(round, next) : checkNormalBid(round, next)
}

/**
 * Farewell Round (GAME_RULES §10). The opening bid may pick any face, Perudo
 * included, and that face is then locked for the rest of the round. Only the
 * quantity may rise.
 */
function checkFarewellBid(round: RoundState, next: ProposedBid): BidCheck {
  const current = round.bid
  if (current === null) {
    return ok
  }

  const locked = round.lockedFace ?? current.face
  if (next.face !== locked) {
    return no('FACE_LOCKED', `the face is locked to ${locked} for this Farewell Round`)
  }
  if (next.quantity <= current.quantity) {
    return no(
      'QUANTITY_MUST_INCREASE',
      `quantity must exceed ${current.quantity}, got ${next.quantity}`,
    )
  }
  return ok
}

function checkNormalBid(round: RoundState, next: ProposedBid): BidCheck {
  const current = round.bid

  // Opening bid of a normal round: anything except Perudo (GAME_RULES §5).
  if (current === null) {
    return next.face === PERUDO
      ? no('CANNOT_OPEN_WITH_PERUDO', 'a normal round cannot open on Perudo')
      : ok
  }

  const fromPerudo = current.face === PERUDO
  const toPerudo = next.face === PERUDO

  if (fromPerudo && toPerudo) {
    // Perudo to Perudo is an ordinary raise on quantity alone.
    return next.quantity > current.quantity
      ? ok
      : no(
          'QUANTITY_MUST_INCREASE',
          `Perudo quantity must exceed ${current.quantity}, got ${next.quantity}`,
        )
  }

  if (fromPerudo) {
    const minimum = minQuantityAfterPerudo(current.quantity)
    return next.quantity >= minimum
      ? ok
      : no(
          'BELOW_MIN_AFTER_PERUDO',
          `leaving ${current.quantity} Perudos requires at least ${minimum}, got ${next.quantity}`,
        )
  }

  if (toPerudo) {
    const minimum = minPerudoQuantity(current.quantity)
    return next.quantity >= minimum
      ? ok
      : no(
          'BELOW_MIN_PERUDO',
          `switching to Perudo from ${current.quantity} requires at least ${minimum}, got ${next.quantity}`,
        )
  }

  // Normal face to normal face (GAME_RULES §4, resolved by R-009).
  //
  // The quantity is the anchor: it may never fall. Raise it and the face is
  // free to go anywhere, so 4 fives -> 5 fours is a legitimate raise. Hold the
  // quantity and the face must climb instead.
  if (next.quantity < current.quantity) {
    return no(
      'MUST_NOT_DECREASE',
      `the quantity may never fall: ${current.quantity}x${current.face} -> ${next.quantity}x${next.face}`,
    )
  }
  if (next.quantity === current.quantity && next.face <= current.face) {
    return no(
      'FACE_MUST_INCREASE',
      `holding the quantity at ${current.quantity} means the face must rise above ${current.face}`,
    )
  }
  return ok
}
