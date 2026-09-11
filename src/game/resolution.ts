import type { ChallengeKind, Hand, PlayerId, RoundState } from './types'
import { countAcrossTable } from './counting'
import { UnresolvedRuleError } from './errors'

export interface ChallengeInput {
  /** Must carry an active bid; challenging nothing is not a move. */
  readonly round: RoundState
  /** Hands of every player still in the game. Dice counts are derived from these. */
  readonly hands: readonly Hand[]
  readonly challengerId: PlayerId
  readonly kind: ChallengeKind
}

export interface ChallengeOutcome {
  /** Relevant dice actually on the table, counted under this round's rules. */
  readonly actualCount: number
  /**
   * Whether the claim as currently read held. For an ordinary bid that means
   * "at least"; once Bulled it means "exactly" (GAME_RULES §8.1).
   */
  readonly claimHolds: boolean
  /** Die changes to apply, keyed by player. Negative loses, positive gains. */
  readonly dieDeltas: ReadonlyMap<PlayerId, number>
  /** Players reduced to zero dice by this resolution. */
  readonly eliminated: readonly PlayerId[]
  /** Player reduced to exactly one die, who therefore opens a Farewell Round. */
  readonly farewellPlayerId: PlayerId | null
  /** Set when exactly one player remains with dice. */
  readonly winnerId: PlayerId | null
}

/**
 * Resolve a challenge against the current bid.
 *
 * Everything here is server-authoritative: the count, the verdict and the die
 * movements. The client is never told the result it should expect (PART 76).
 *
 * Throws `UnresolvedRuleError` on any branch the house rules leave open, rather
 * than inventing an outcome.
 */
export function resolveChallenge(input: ChallengeInput): ChallengeOutcome {
  const { round, hands, challengerId, kind } = input
  const bid = round.bid
  if (bid === null) {
    throw new Error('resolveChallenge called with no active bid')
  }

  const actualCount = countAcrossTable(hands, bid.face, round.type)
  const isBull = bid.bull !== null

  const dieDeltas = isBull
    ? resolveBull(bid.bull!.callerId, bid.quantity, actualCount, hands, kind)
    : resolvePlainBid(bid.bidderId, bid.quantity, actualCount, challengerId, kind)

  const claimHolds = isBull ? actualCount === bid.quantity : actualCount >= bid.quantity

  return buildOutcome(actualCount, claimHolds, dieDeltas, hands)
}

/**
 * Ordinary bid, read as "at least" (GAME_RULES §7 and §9.2).
 *
 * Normal Dudo never grants a die. Burst Dudo is the only move in the game that
 * can, and only when the bid it challenged was false.
 */
function resolvePlainBid(
  bidderId: PlayerId,
  quantity: number,
  actualCount: number,
  challengerId: PlayerId,
  kind: ChallengeKind,
): Map<PlayerId, number> {
  const deltas = new Map<PlayerId, number>()
  const bidHolds = actualCount >= quantity

  if (bidHolds) {
    deltas.set(challengerId, -1)
    return deltas
  }

  deltas.set(bidderId, -1)
  if (kind === 'burst_dudo') {
    deltas.set(challengerId, (deltas.get(challengerId) ?? 0) + 1)
  }
  return deltas
}

/**
 * Bull, read as "exactly" (GAME_RULES §8.3).
 *
 * A correct Bull costs every other active player a die and costs the caller
 * nothing — the challenger included, since they are among "every participant
 * except the Bull caller".
 */
function resolveBull(
  bullCallerId: PlayerId,
  quantity: number,
  actualCount: number,
  hands: readonly Hand[],
  kind: ChallengeKind,
): Map<PlayerId, number> {
  // Burst Dudo grants a die on a false bid, while a Bull resolution moves dice
  // by a different rule entirely. Which one governs a Burst Dudo aimed at a Bull
  // is not specified, and the two readings disagree about the challenger.
  if (kind === 'burst_dudo') {
    throw new UnresolvedRuleError(
      'R-006',
      'a Burst Dudo was aimed at a Bulled bid, where the Burst die-gain rule and ' +
        'the Bull resolution rule both claim to govern the challenger',
    )
  }

  if (actualCount !== quantity) {
    throw new UnresolvedRuleError(
      'R-001',
      `a Bull declaring exactly ${quantity} was challenged and proved false ` +
        `(${actualCount} on the table); the consequence of a false Bull is undefined`,
    )
  }

  const deltas = new Map<PlayerId, number>()
  for (const hand of hands) {
    if (hand.playerId !== bullCallerId) {
      deltas.set(hand.playerId, -1)
    }
  }
  return deltas
}

function buildOutcome(
  actualCount: number,
  claimHolds: boolean,
  dieDeltas: Map<PlayerId, number>,
  hands: readonly Hand[],
): ChallengeOutcome {
  const eliminated: PlayerId[] = []
  const reachedOneDie: PlayerId[] = []
  let survivors = 0
  let lastSurvivor: PlayerId | null = null

  for (const hand of hands) {
    const delta = dieDeltas.get(hand.playerId) ?? 0
    const after = hand.dice.length + delta

    if (after <= 0) {
      eliminated.push(hand.playerId)
      continue
    }

    survivors += 1
    lastSurvivor = hand.playerId

    // A Farewell Round is triggered by *losing* a die down to exactly one
    // (GAME_RULES §10) — not by already sitting on one, and never by gaining.
    if (after === 1 && delta < 0) {
      reachedOneDie.push(hand.playerId)
    }
  }

  if (eliminated.length > 1) {
    throw new UnresolvedRuleError(
      'R-004',
      `this resolution eliminates ${eliminated.length} players at once ` +
        `(${eliminated.join(', ')}); ordering and the winner are undefined`,
    )
  }

  if (reachedOneDie.length > 1) {
    throw new UnresolvedRuleError(
      'R-003',
      `${reachedOneDie.length} players reached exactly one die simultaneously ` +
        `(${reachedOneDie.join(', ')}); the Farewell Round starter is undefined`,
    )
  }

  return {
    actualCount,
    claimHolds,
    dieDeltas,
    eliminated,
    farewellPlayerId: reachedOneDie[0] ?? null,
    winnerId: survivors === 1 ? lastSurvivor : null,
  }
}
