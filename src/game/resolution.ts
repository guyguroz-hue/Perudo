import type { ChallengeKind, PlayerId, RoundState } from './types'
import { MAX_DICE } from './types'

/** A player at the table, and how many dice they hold. Public information. */
export interface PlayerStanding {
  readonly playerId: PlayerId
  readonly diceCount: number
}

export interface ChallengeInput {
  /** Must carry an active bid; challenging nothing is not a move. */
  readonly round: RoundState
  /** Every player still in the game. Counts only — never faces. */
  readonly players: readonly PlayerStanding[]
  /**
   * Relevant dice actually on the table, counted under this round's rules.
   *
   * Passed in rather than derived, because the engine is deliberately not
   * given anybody's dice. Counting happens where the dice already live, and
   * only the total travels. The engine could not leak a hand if it tried —
   * including into a log line or an error report, which is the realistic way
   * hidden information escapes.
   */
  readonly actualCount: number
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
  /**
   * The player who was proved right, and who therefore opens the next round
   * (R-002).
   *
   * A Farewell Round takes precedence: when `farewellQueue` is non-empty its
   * first entry opens instead, and this player's turn comes after. Whoever was
   * right never loses a die in the same resolution, so they are always still
   * holding dice here.
   */
  readonly nextStarterId: PlayerId
}

/**
 * Resolve a challenge against the current bid.
 *
 * Everything here is server-authoritative: the count, the verdict and the die
 * movements. The client is never told the result it should expect (PART 76).
 *
 * Every branch below is a decided rule. Where the house rules once left a gap,
 * the gap is closed rather than guessed: see docs/DECISIONS.md for what each
 * outcome was decided to be and why.
 */
export function resolveChallenge(input: ChallengeInput): ChallengeOutcome {
  const { round, players, actualCount, challengerId, kind } = input
  const bid = round.bid
  if (bid === null) {
    throw new Error('resolveChallenge called with no active bid')
  }

  const isBull = bid.bull !== null

  const claimHolds = isBull ? actualCount === bid.quantity : actualCount >= bid.quantity

  const dieDeltas = isBull
    ? resolveBull(bid.bull!.callerId, claimHolds, players)
    : resolvePlainBid(bid.bidderId, claimHolds, challengerId, kind)

  // A Bull is an ordinary bet, so Burst Lie behaves against it exactly as it
  // does against any other bid: being right about a false claim wins a die back
  // (R-006). The two rules compose without conflict — when the Bull is correct,
  // "everyone except the caller loses one" already charges the mistaken
  // challenger their die, so only the gain needs adding here.
  if (isBull && kind === 'burst_lie' && !claimHolds) {
    dieDeltas.set(challengerId, (dieDeltas.get(challengerId) ?? 0) + 1)
  }

  // Whoever was proved right. For an ordinary bid that is the bidder if the
  // claim stood and the challenger if it did not; for a Bull it is the caller
  // when the count was exact and the challenger when it was not.
  const provedRight = isBull
    ? claimHolds
      ? bid.bull!.callerId
      : challengerId
    : claimHolds
      ? bid.bidderId
      : challengerId

  return buildOutcome(actualCount, claimHolds, dieDeltas, players, provedRight)
}

/**
 * Ordinary bid, read as "at least" (GAME_RULES §7 and §9.2).
 *
 * Normal Lie never grants a die. Burst Lie is the only move in the game that
 * can, and only when the bid it challenged was false.
 */
function resolvePlainBid(
  bidderId: PlayerId,
  bidHolds: boolean,
  challengerId: PlayerId,
  kind: ChallengeKind,
): Map<PlayerId, number> {
  const deltas = new Map<PlayerId, number>()

  if (bidHolds) {
    deltas.set(challengerId, -1)
    return deltas
  }

  deltas.set(bidderId, -1)
  if (kind === 'burst_lie') {
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
  bullIsExact: boolean,
  players: readonly PlayerStanding[],
): Map<PlayerId, number> {
  const deltas = new Map<PlayerId, number>()

  if (!bullIsExact) {
    deltas.set(bullCallerId, -1)
    return deltas
  }

  for (const player of players) {
    if (player.playerId !== bullCallerId) {
      deltas.set(player.playerId, -1)
    }
  }
  return deltas
}

function buildOutcome(
  actualCount: number,
  claimHolds: boolean,
  dieDeltas: Map<PlayerId, number>,
  players: readonly PlayerStanding[],
  provedRight: PlayerId,
): ChallengeOutcome {
  const eliminated: PlayerId[] = []
  const farewellQueue: PlayerId[] = []
  let survivors = 0
  let lastSurvivor: PlayerId | null = null

  // Gains are capped before anything else is decided, so every number that
  // follows — eliminations, the Farewell queue, the survivor count — is computed
  // from dice a player can actually hold (R-007).
  const capped = new Map<PlayerId, number>()

  for (const player of players) {
    const raw = dieDeltas.get(player.playerId) ?? 0
    const delta =
      raw > 0 ? Math.min(raw, Math.max(0, MAX_DICE - player.diceCount)) : raw
    if (delta !== 0) capped.set(player.playerId, delta)

    const after = player.diceCount + delta

    if (after <= 0) {
      eliminated.push(player.playerId)
      continue
    }

    survivors += 1
    lastSurvivor = player.playerId

    // A Farewell Round is triggered by *losing* a die down to exactly one
    // (GAME_RULES §10) — never by already sitting on one, and never by gaining.
    //
    // Keying on the transition rather than on "holds one die" gives the rest of
    // the rule for free: a player parked on one die does not keep earning
    // rounds, while one who wins a die back with Burst Lie and is later knocked
    // down again crosses the boundary afresh and is owed another (R-003).
    if (after === 1 && delta < 0) {
      farewellQueue.push(player.playerId)
    }
  }

  return {
    actualCount,
    claimHolds,
    dieDeltas: capped,
    eliminated,
    // Order among simultaneous claimants is explicitly arbitrary by rule, so
    // this keeps seat order: deterministic, replayable, and identical on every
    // machine that resolves the same round.
    farewellQueue,
    winnerId: survivors === 1 ? lastSurvivor : null,
    gameOver: survivors <= 1,
    nextStarterId: provedRight,
  }
}
