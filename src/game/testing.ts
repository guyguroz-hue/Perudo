import type { ActiveBid, ChallengeKind, Face, Hand, PlayerId, RoundState } from './types'
import { countAcrossTable } from './counting'
import { resolveChallenge } from './resolution'
import type { ChallengeOutcome } from './resolution'

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

/**
 * Resolve a challenge from full hands.
 *
 * Test-only. Hands are the natural way to state a scenario — "these three
 * players hold these dice" — but the engine is deliberately not given them in
 * production, so this conversion lives here rather than in the engine's own
 * surface. What crosses into the engine is what crosses in reality: a count.
 */
export function challengeWithHands(input: {
  round: RoundState
  hands: readonly Hand[]
  challengerId: PlayerId
  kind: ChallengeKind
}): ChallengeOutcome {
  const { round, hands, challengerId, kind } = input
  return resolveChallenge({
    round,
    players: hands.map((hand) => ({
      playerId: hand.playerId,
      diceCount: hand.dice.length,
    })),
    actualCount:
      round.bid === null ? 0 : countAcrossTable(hands, round.bid.face, round.type),
    challengerId,
    kind,
  })
}
