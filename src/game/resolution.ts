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
  /**
   * Players reduced to zero dice by this resolution. A correct Bull can empty
   * several cups at once, so this is a list rather than a single player.
   */
  readonly eliminated: readonly PlayerId[]
  /**
   * Players owed a Farewell Round, in the order they will take them.
   *
   * Usually empty or one. A correct Bull can drive several players down to a
   * single die at once, and each is owed their own Farewell Round: the first
   * opens the next round, the next follows after that (R-003). The caller is
   * responsible for carrying this queue across rounds.
   */
  readonly farewellQueue: readonly PlayerId[]
  /**
   * The winner, when exactly one player is left holding dice.
   *
   * Null when the game is over with nobody standing: if the last players are
   * eliminated in the same resolution there is no winner, rather than one being
   * awarded on a tiebreak (R-004).
   */
  readonly winnerId: PlayerId | null
  /** True once fewer than two players hold dice, however that came about. */
  readonly gameOver: boolean
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
 * Bull, read as "exactly" (GAME_RULES §8.3, §8.4).
 *
 * Correct: every other active player loses a die and the caller loses nothing —
 * the challenger included, since they are among "every participant except the
 * Bull caller".
 *
 * False: the caller alone pays. Declaring an exact count is a strong claim, and
 * being wrong costs only the player who made it.
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

  const deltas = new Map<PlayerId, number>()

  if (actualCount !== quantity) {
    deltas.set(bullCallerId, -1)
    return deltas
  }

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
  const farewellQueue: PlayerId[] = []
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
    // (GAME_RULES §10) — never by already sitting on one, and never by gaining.
    //
    // Keying on the transition rather than on "holds one die" gives the rest of
    // the rule for free: a player parked on one die does not keep earning
    // rounds, while one who wins a die back with Burst Dudo and is later knocked
    // down again crosses the boundary afresh and is owed another (R-003).
    if (after === 1 && delta < 0) {
      farewellQueue.push(hand.playerId)
    }
  }

  return {
    actualCount,
    claimHolds,
    dieDeltas,
    eliminated,
    // Order among simultaneous claimants is explicitly arbitrary by rule, so
    // this keeps seat order: deterministic, replayable, and identical on every
    // machine that resolves the same round.
    farewellQueue,
    winnerId: survivors === 1 ? lastSurvivor : null,
    gameOver: survivors <= 1,
  }
}
