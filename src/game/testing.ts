import type { ActiveBid, Face, Hand, PlayerId, RoundState } from './types'

/** Test helpers. Kept out of the test files so the cases stay readable. */

export function hand(playerId: PlayerId, ...dice: Face[]): Hand {
  return { playerId, dice }
}

export function bid(
  quantity: number,
  face: Face,
  bidderId: PlayerId = 'alice',
  bull: PlayerId | null = null,
): ActiveBid {
  return { quantity, face, bidderId, bull: bull === null ? null : { callerId: bull } }
}

export function normalRound(active: ActiveBid | null = null): RoundState {
  return { type: 'normal', lockedFace: null, bid: active }
}

export function farewellRound(
  active: ActiveBid | null = null,
  lockedFace: Face | null = null,
): RoundState {
  return { type: 'farewell', lockedFace, bid: active }
}

/** A hand of `n` dice that contributes nothing to any bid under test. */
export function blanks(playerId: PlayerId, n: number): Hand {
  return { playerId, dice: Array.from({ length: n }, () => 3 as Face) }
}
