import {
  UnresolvedRuleError,
  checkBid,
  isBurst,
  nextActive,
  resolveChallenge,
} from '../../../src/game'
import type { ChallengeKind, Face, PlayerId, RoundState, RoundType } from '../../../src/game'
import { GameError } from './errors'
import type { GameStore, PlayerRow, RoundRow } from './store'

/**
 * The authoritative game actions.
 *
 * Every rule these apply comes from `src/game` — the same module the browser
 * imports to grey out an illegal button. That is the point of D-002: the
 * client's copy is a convenience and this one is the authority, and they
 * cannot disagree, because they are the same code.
 *
 * What lives here instead is everything the engine is deliberately not given:
 * who is calling, whose turn it is, what is in the database, and what to write
 * when the engine has decided.
 */

export interface Actor {
  readonly id: PlayerId
}

/**
 * Who opens the very first round of a game.
 *
 * UNRESOLVED (R-011). The house rules say who opens every round *after* a
 * resolution (R-002) and say nothing about the first, and the two obvious
 * answers — the host, or the lowest seat — name different players whenever the
 * host has migrated.
 *
 * Deliberately not guessed: this throws rather than picking one. It is a
 * one-line change once the answer exists, which is why it is a function.
 */
function firstStarter(_players: readonly PlayerRow[]): PlayerId {
  throw new UnresolvedRuleError(
    'R-011',
    'who opens the first round of a game — the host, or the lowest seat',
  )
}

export async function openRound(
  store: GameStore,
  actor: Actor,
  gameId: string,
): Promise<{ roundId: string }> {
  const game = await store.game(gameId)
  requireActive(game.status)
  const players = await store.players(gameId)
  requirePlayer(players, actor.id)

  const live = await store.liveRound(gameId)
  if (live !== null) return { roundId: live.id }

  const roundId = await store.openRound(gameId, 'normal', firstStarter(players))
  return { roundId }
}

export async function placeBid(
  store: GameStore,
  actor: Actor,
  gameId: string,
  quantity: number,
  face: Face,
): Promise<{ version: number }> {
  const { game, round, seated } = await liveState(store, gameId, actor)
  requireStartRule(game.round_start_rule)

  const state = roundState(round)
  const verdict = checkBid(state, { quantity, face })
  if (!verdict.legal) {
    throw new GameError('ILLEGAL_BID', verdict.detail)
  }

  const burst = isBurst(round.turn_player_id, actor.id)

  await store.applyBid({
    roundId: round.id,
    version: round.version,
    player: actor.id,
    quantity,
    face,
    burst,
    // Play continues clockwise from whoever acted, in turn or not. That single
    // rule is all of GAME_RULES §9.1 — see src/game/turns.ts.
    nextTurn: nextActive(seated, actor.id),
    // A Farewell Round's opening bid fixes the face for the rest of it
    // (GAME_RULES §10). Any face, Perudo included.
    lockFace: round.type === 'farewell',
  })

  return { version: round.version + 1 }
}

export async function callBull(
  store: GameStore,
  actor: Actor,
  gameId: string,
): Promise<{ version: number }> {
  const { round, seated } = await liveState(store, gameId, actor)

  if (round.bid_quantity === null) {
    throw new GameError('BULL_NEEDS_BID', 'There is no bid to call exact.')
  }
  // What a second Bull on the same bid would mean is not decided, and it
  // decides who pays (R-010). Refused rather than guessed.
  if (round.bull_player_id !== null) {
    throw new GameError('BULL_ALREADY_CALLED', 'This bid has already been Bulled.')
  }

  await store.applyBull({
    roundId: round.id,
    version: round.version,
    player: actor.id,
    // A Bull is a bet like any other, so it may be a Burst (R-005) and it moves
    // the turn on from whoever declared it, exactly as a bid does.
    burst: isBurst(round.turn_player_id, actor.id),
    nextTurn: nextActive(seated, actor.id),
  })

  return { version: round.version + 1 }
}

export interface ChallengeResult {
  readonly roundType: RoundType
  readonly quantity: number
  readonly face: Face
  readonly bidderName: string
  readonly bullCallerName: string | null
  readonly challengerName: string
  readonly challengeKind: ChallengeKind
  readonly hands: readonly { id: PlayerId; name: string; dice: readonly Face[] }[]
  readonly actualCount: number
  readonly claimHolds: boolean
  readonly deltas: Readonly<Record<PlayerId, number>>
  readonly eliminated: readonly PlayerId[]
  readonly gameOver: boolean
  readonly winnerId: PlayerId | null
  readonly newRoundId: string | null
}

/**
 * A challenge, resolved and applied.
 *
 * One request, one response, carrying the whole reveal. The client cannot hold
 * anybody's dice in advance — that is what `player_dice` exists to prevent — so
 * a round trip here is unavoidable, and the answer arriving in one piece is
 * what lets the dramatic pause and the network wait be the same moment
 * (docs/GAME_UI.md §5.1).
 */
export async function challenge(
  store: GameStore,
  actor: Actor,
  gameId: string,
): Promise<ChallengeResult> {
  const { game, players, round, seated } = await liveState(store, gameId, actor)
  requireStartRule(game.round_start_rule)

  const state = roundState(round)
  if (state.bid === null) {
    throw new GameError('NO_BID_TO_CHALLENGE', 'There is nothing on the table to doubt.')
  }

  // You may not challenge your own claim. With a Bull on the table the claim
  // belongs to the Bull caller, so the bidder challenging it is an ordinary
  // move — it is the caller who cannot.
  const claimOwnerId = state.bid.bull?.callerId ?? state.bid.bidderId
  if (claimOwnerId === actor.id) {
    throw new GameError('SELF_CHALLENGE', 'That claim is yours.')
  }

  // Derived, never sent by the client: a Burst is by definition acting out of
  // turn, and only a Burst Dudo can win a die back (GAME_RULES §9.2).
  const kind: ChallengeKind = isBurst(round.turn_player_id, actor.id)
    ? 'burst_dudo'
    : 'dudo'

  const actualCount = await store.countFace(round.id, state.bid.face)

  const outcome = resolveChallenge({
    round: state,
    players: seated.map((player) => ({
      playerId: player.playerId,
      diceCount: player.diceCount,
    })),
    actualCount,
    challengerId: actor.id,
    kind,
  })

  // Who opens next, and under what. A Farewell Round takes precedence over the
  // player who was proved right (GAME_RULES §11, R-002, R-003), and the queue
  // carries across rounds because a correct Bull can owe several at once.
  const survivors = new Set(
    seated
      .filter((player) => player.diceCount + (outcome.dieDeltas.get(player.playerId) ?? 0) > 0)
      .map((player) => player.playerId),
  )
  const queue = [...round.farewell_queue, ...outcome.farewellQueue].filter((id) =>
    survivors.has(id),
  )
  const nextStarter = queue.length > 0 ? queue[0] : outcome.nextStarterId
  const nextType: RoundType = queue.length > 0 ? 'farewell' : 'normal'
  const nextQueue = queue.length > 0 ? queue.slice(1) : []

  const applied = await store.applyChallenge({
    p_round_id: round.id,
    p_version: round.version,
    p_challenger: actor.id,
    p_kind: kind,
    p_actual_count: actualCount,
    p_claim_holds: outcome.claimHolds,
    p_deltas: Object.fromEntries(outcome.dieDeltas),
    p_eliminated: outcome.eliminated,
    p_game_over: outcome.gameOver,
    p_winner: outcome.winnerId,
    p_next_starter: outcome.gameOver ? null : nextStarter,
    p_next_type: nextType,
    p_next_queue: nextQueue,
  })

  const nameOf = (id: PlayerId | null) =>
    players.find((player) => player.user_id === id)?.display_name ?? 'Player'

  const reveals = (applied.reveals ?? []) as { player_id: PlayerId; dice: Face[] }[]

  return {
    roundType: round.type,
    quantity: state.bid.quantity,
    face: state.bid.face,
    bidderName: nameOf(state.bid.bidderId),
    bullCallerName: state.bid.bull === null ? null : nameOf(state.bid.bull.callerId),
    challengerName: nameOf(actor.id),
    challengeKind: kind,
    hands: reveals.map((row) => ({
      id: row.player_id,
      name: nameOf(row.player_id),
      dice: row.dice,
    })),
    actualCount,
    claimHolds: outcome.claimHolds,
    deltas: Object.fromEntries(outcome.dieDeltas),
    eliminated: outcome.eliminated,
    gameOver: outcome.gameOver,
    winnerId: outcome.winnerId,
    newRoundId: (applied.new_round_id as string | null) ?? null,
  }
}

// -----------------------------------------------------------------------------

async function liveState(store: GameStore, gameId: string, actor: Actor) {
  const game = await store.game(gameId)
  requireActive(game.status)

  const players = await store.players(gameId)
  requirePlayer(players, actor.id)

  const round = await store.liveRound(gameId)
  if (round === null) {
    throw new GameError('NO_ROUND', 'No round is open.', 409)
  }

  const seated = players.map((player) => ({
    playerId: player.user_id,
    seat: player.seat,
    diceCount: player.dice_count,
  }))

  return { game, players, round, seated }
}

function roundState(round: RoundRow): RoundState {
  return {
    type: round.type,
    lockedFace: round.locked_face,
    bid:
      round.bid_quantity === null || round.bid_face === null || round.bid_player_id === null
        ? null
        : {
            quantity: round.bid_quantity,
            face: round.bid_face,
            bidderId: round.bid_player_id,
            bull: round.bull_player_id === null ? null : { callerId: round.bull_player_id },
          },
  }
}

function requireActive(status: string): void {
  if (status !== 'active') {
    throw new GameError('GAME_NOT_ACTIVE', 'This game is not running.', 409)
  }
}

function requirePlayer(players: readonly PlayerRow[], id: PlayerId): PlayerRow {
  const player = players.find((row) => row.user_id === id)
  if (player === undefined) {
    throw new GameError('NOT_A_PLAYER', 'You are not in this game.', 403)
  }
  if (player.dice_count <= 0) {
    throw new GameError('ELIMINATED', 'You are out of this game.', 403)
  }
  return player
}

/**
 * Two alternative round-start rules are stored as a room setting and are
 * explicitly not implemented (R-002). A game created under one of them is
 * refused rather than quietly played under a different rule.
 */
function requireStartRule(rule: string): void {
  if (rule !== 'winner_starts') {
    throw new UnresolvedRuleError('R-002', `round_start_rule '${rule}' is not implemented`)
  }
}
