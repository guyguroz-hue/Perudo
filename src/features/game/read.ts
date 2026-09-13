import { supabase } from '../../lib/supabaseClient'
import type { Face, PlayerId, RoundType } from '../../game'
import { GameActionError } from './errors'
import { describeEvent } from './events'
import type { RevealData } from './reveal'
import type { TableMove, TablePlayer, TableView } from './view'

/**
 * Reading the table.
 *
 * Realtime says *that* something changed; what renders is always a fresh read
 * through RLS. A table holds six people and one round — refetching costs
 * nothing, and drift between a local model and the truth costs a great deal.
 *
 * Nothing here can read a hand but your own: `player_dice` is fetched by round
 * and player id in `api.ts`, and the policy on it permits exactly that row.
 */

export interface RoundRead {
  readonly id: string
  readonly round_number: number
  readonly type: RoundType
  readonly locked_face: Face | null
  readonly bid_quantity: number | null
  readonly bid_face: Face | null
  readonly bid_player_id: PlayerId | null
  readonly bull_player_id: PlayerId | null
  readonly turn_player_id: PlayerId | null
}

export async function fetchRound(gameId: string): Promise<RoundRead | null> {
  const { data, error } = await supabase
    .from('rounds')
    .select('id, round_number, type, locked_face, bid_quantity, bid_face, bid_player_id, bull_player_id, turn_player_id')
    .eq('game_id', gameId)
    .neq('status', 'resolved')
    .maybeSingle()

  if (error !== null) throw new GameActionError('UNKNOWN', error.message, false)
  return (data as RoundRead | null) ?? null
}

export async function fetchPlayers(
  gameId: string,
  youId: PlayerId,
): Promise<TablePlayer[]> {
  const { data, error } = await supabase
    .from('game_players')
    // The foreign key is named rather than inferred, and the whole select is
    // one literal: supabase-js parses this string at type level, and a
    // concatenation it cannot read statically comes back as an error type.
    .select('user_id, seat, dice_count, is_eliminated, profiles!game_players_user_id_fkey(display_name)')
    .eq('game_id', gameId)
    .order('seat')

  if (error !== null) throw new GameActionError('UNKNOWN', error.message, false)

  type Row = {
    user_id: PlayerId
    seat: number
    dice_count: number
    is_eliminated: boolean
    profiles: { display_name: string } | { display_name: string }[] | null
  }

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.user_id,
    name: nameOf(row.profiles),
    seatIndex: row.seat,
    diceCount: row.dice_count,
    isYou: row.user_id === youId,
    isEliminated: row.is_eliminated,
    // Filled in by toTableView, once the round says whose turn it is.
    hasTurn: false,
  }))
}

/**
 * The table as the screen renders it.
 *
 * Between rounds there is no round row at all, which is a real state and not an
 * error: the previous one resolved and the next has not been dealt. The screen
 * shows the standings and no bid.
 */
export function toTableView(
  round: RoundRead | null,
  players: readonly TablePlayer[],
  yourHand: readonly Face[] | null,
  moves: readonly TableMove[],
): TableView {
  return {
    round: {
      type: round?.type ?? 'normal',
      lockedFace: round?.locked_face ?? null,
      bid:
        round == null ||
        round.bid_quantity === null ||
        round.bid_face === null ||
        round.bid_player_id === null
          ? null
          : {
              quantity: round.bid_quantity,
              face: round.bid_face,
              bidderId: round.bid_player_id,
              bull:
                round.bull_player_id === null
                  ? null
                  : { callerId: round.bull_player_id },
            },
    },
    roundNumber: round?.round_number ?? 0,
    players: players.map((player) => ({
      ...player,
      hasTurn: round !== null && round.turn_player_id === player.id,
    })),
    yourHand,
    moves,
  }
}

function nameOf(profiles: unknown): string {
  // PostgREST returns an embed as an object or, for some shapes, a one-element
  // array. Both have been seen from this exact query.
  const row = Array.isArray(profiles) ? profiles[0] : profiles
  const name = (row as { display_name?: unknown } | null)?.display_name
  return typeof name === 'string' ? name : 'Player'
}

/**
 * The reveal, rebuilt for everybody who did not press the button.
 *
 * The challenger gets it as the answer to their own request. Everyone else has
 * to be told, and the telling is all public: the resolved round holds the bid,
 * `dice_reveals` holds the hands a resolution opened, and the challenge event
 * holds the count, the verdict and the die changes. No part of it reads
 * `player_dice`.
 *
 * Returns null when the round was not resolved by a challenge — which today
 * cannot happen, but a round that ends some other way should produce no reveal
 * rather than a half-built one.
 */
export async function fetchReveal(roundId: string): Promise<RevealData | null> {
  const [round, reveals, event] = await Promise.all([
    resolvedRound(roundId),
    revealedHands(roundId),
    challengeEvent(roundId),
  ])

  if (round === null || event === null) return null
  if (round.bid_quantity === null || round.bid_face === null) return null

  const names = new Map(reveals.map((row) => [row.player_id, row.name]))
  const nameOfId = (id: PlayerId | null) => (id === null ? 'Player' : (names.get(id) ?? 'Player'))

  return {
    roundType: round.type,
    quantity: round.bid_quantity,
    face: round.bid_face,
    bidderName: nameOfId(round.bid_player_id),
    bullCallerName: round.bull_player_id === null ? null : nameOfId(round.bull_player_id),
    challengerName: nameOfId(event.actor_id),
    challengeKind: event.kind,
    hands: reveals.map((row) => ({ id: row.player_id, name: row.name, dice: row.dice })),
    actualCount: event.actual_count,
    claimHolds: event.claim_holds,
    deltas: event.deltas,
    eliminated: event.eliminated,
  }
}

async function resolvedRound(roundId: string) {
  const { data, error } = await supabase
    .from('rounds')
    .select('type, bid_quantity, bid_face, bid_player_id, bull_player_id')
    .eq('id', roundId)
    .maybeSingle()
  if (error !== null) throw new GameActionError('UNKNOWN', error.message, false)
  return data as {
    type: RoundType
    bid_quantity: number | null
    bid_face: Face | null
    bid_player_id: PlayerId | null
    bull_player_id: PlayerId | null
  } | null
}

/** The hands a resolution opened, with the names to put under them. */
async function revealedHands(roundId: string) {
  const { data, error } = await supabase
    .from('dice_reveals')
    .select('player_id, dice, profiles!dice_reveals_player_id_fkey(display_name)')
    .eq('round_id', roundId)
  if (error !== null) throw new GameActionError('UNKNOWN', error.message, false)

  const rows = (data ?? []) as {
    player_id: PlayerId
    dice: Face[]
    profiles: { display_name: string } | { display_name: string }[] | null
  }[]
  return rows.map((row) => ({
    player_id: row.player_id,
    dice: row.dice,
    name: nameOf(row.profiles),
  }))
}

async function challengeEvent(roundId: string) {
  const { data, error } = await supabase
    .from('game_events')
    .select('actor_id, kind, payload')
    .eq('round_id', roundId)
    .in('kind', ['lie', 'burst_lie'])
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error !== null) throw new GameActionError('UNKNOWN', error.message, false)
  if (data === null) return null

  const row = data as { actor_id: PlayerId | null; kind: string; payload: Record<string, unknown> }
  return {
    actor_id: row.actor_id,
    kind: row.kind === 'burst_lie' ? ('burst_lie' as const) : ('lie' as const),
    actual_count: Number(row.payload.actual_count ?? 0),
    claim_holds: row.payload.claim_holds === true,
    deltas: (row.payload.deltas ?? {}) as Record<PlayerId, number>,
    eliminated: (row.payload.eliminated ?? []) as PlayerId[],
  }
}

/** Whether the game is still running, and who won if it is not. */
export interface GameStanding {
  readonly status: string
  readonly winnerId: PlayerId | null
}

export async function fetchGameStanding(gameId: string): Promise<GameStanding> {
  const { data, error } = await supabase
    .from('games')
    .select('status, winner_id')
    .eq('id', gameId)
    .maybeSingle()
  if (error !== null) throw new GameActionError('UNKNOWN', error.message, false)

  const row = data as { status: string; winner_id: PlayerId | null } | null
  return { status: row?.status ?? 'abandoned', winnerId: row?.winner_id ?? null }
}

/** One row of the log, as it comes back from Postgres. */
export interface EventRow {
  readonly id: number
  readonly round_id: string | null
  readonly actor_id: PlayerId | null
  readonly kind: string
  readonly payload: Record<string, unknown>
}

/**
 * The log rows, turned into the round's moves, oldest first.
 *
 * Trimmed to the round in play rather than to a count. Moves from the round
 * before are not context, they are a different game state: the dice have been
 * re-rolled, and nothing said then is a claim about anything now. The newest
 * row names the round, so this needs no round id of its own — which also makes
 * it right between rounds, where there is no open round at all and the last
 * thing said still belongs to the one that just finished.
 *
 * Pure, and separate from the fetching, because the fiddly parts are all here:
 * newest-first out of Postgres and oldest-first on the screen, a round boundary
 * that is not a fixed number of rows back, and an event kind this build cannot
 * say out loud, which is left out rather than printed raw at a player.
 */
export function movesFromEvents(
  rows: readonly EventRow[],
  names: ReadonlyMap<PlayerId, string>,
): TableMove[] {
  if (rows.length === 0) return []

  const thisRound = rows[0].round_id
  const moves: TableMove[] = []
  for (const row of rows) {
    if (row.round_id !== thisRound) break
    const quantity = row.payload.quantity
    const face = row.payload.face
    const text = describeEvent({
      kind: row.kind,
      actorName: (row.actor_id === null ? null : names.get(row.actor_id)) ?? 'Someone',
      quantity: typeof quantity === 'number' ? quantity : undefined,
      face: typeof face === 'number' ? (face as Face) : undefined,
    })
    if (text === null) continue
    moves.unshift({
      id: String(row.id),
      actorId: row.actor_id,
      text,
      burst: row.kind.startsWith('burst_'),
    })
  }
  return moves
}

/**
 * What has been said this round, oldest first.
 *
 * One line was not enough. Burst means anybody may act at any moment, so turn
 * order tells a player nothing about whose bid is on the table, and the single
 * line that said so was overwritten by the next move — including by the
 * challenge itself, which is precisely the moment "who doubted this?" matters
 * most.
 *
 * Asks for more rows than it will show. The log is per game and the moves
 * wanted are per round, so the round boundary has to be found rather than
 * assumed; a dozen rows covers any round a table of six could actually play
 * through, and is still one small query.
 */
export async function fetchRecentMoves(
  gameId: string,
  names: ReadonlyMap<PlayerId, string>,
  limit = 12,
): Promise<TableMove[]> {
  const { data, error } = await supabase
    .from('game_events')
    .select('id, round_id, actor_id, kind, payload')
    .eq('game_id', gameId)
    .order('id', { ascending: false })
    .limit(limit)
  if (error !== null) throw new GameActionError('UNKNOWN', error.message, false)

  return movesFromEvents((data ?? []) as EventRow[], names)
}
