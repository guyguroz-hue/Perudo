import type { SupabaseClient } from './deps'
import { GameError, fromPostgres } from './errors'
import type { Face, PlayerId, RoundType } from '../../../src/game'

/**
 * Everything that talks to the database, and nothing that decides anything.
 *
 * Keeping it in one file is what makes the claim "the action layer never
 * receives a hand" checkable: there is exactly one place where dice could
 * enter this function, and it is `reveal`, which runs after a resolution. No
 * query here selects from `player_dice`.
 */

export interface GameRow {
  readonly id: string
  readonly status: string
  readonly round_start_rule: string
  readonly room_id: string
}

export interface PlayerRow {
  readonly user_id: PlayerId
  readonly seat: number
  readonly dice_count: number
  readonly display_name: string
}

export interface RoundRow {
  readonly id: string
  readonly round_number: number
  readonly type: RoundType
  readonly locked_face: Face | null
  readonly status: string
  readonly bid_quantity: number | null
  readonly bid_face: Face | null
  readonly bid_player_id: PlayerId | null
  readonly bull_player_id: PlayerId | null
  readonly turn_player_id: PlayerId | null
  readonly farewell_queue: readonly PlayerId[]
  readonly version: number
}

/**
 * What the actions need from storage.
 *
 * An interface rather than the class, so the action layer can be exercised
 * against a table held in memory. The rules meeting real state is exactly where
 * mistakes live — a bid judged against the wrong round, a turn advanced past
 * the wrong player — and none of that needs a database to get wrong.
 */
export interface GameStore {
  game(gameId: string): Promise<GameRow>
  players(gameId: string): Promise<PlayerRow[]>
  liveRound(gameId: string): Promise<RoundRow | null>
  countFace(roundId: string, face: Face): Promise<number>
  openRound(gameId: string, type: RoundType, starter: PlayerId): Promise<string>
  applyBid(args: BidWrite): Promise<void>
  applyBull(args: BullWrite): Promise<void>
  applyChallenge(args: Record<string, unknown>): Promise<Record<string, unknown>>
}

export interface BidWrite {
  readonly roundId: string
  readonly version: number
  readonly player: PlayerId
  readonly quantity: number
  readonly face: Face
  readonly burst: boolean
  readonly nextTurn: PlayerId
  readonly lockFace: boolean
}

export interface BullWrite {
  readonly roundId: string
  readonly version: number
  readonly player: PlayerId
  readonly burst: boolean
  readonly nextTurn: PlayerId
}

export class Store implements GameStore {
  readonly #db: SupabaseClient

  constructor(db: SupabaseClient) {
    this.#db = db
  }

  async game(gameId: string): Promise<GameRow> {
    const { data, error } = await this.#db
      .from('games')
      .select('id, status, round_start_rule, room_id')
      .eq('id', gameId)
      .maybeSingle()
    if (error !== null) throw lift(error)
    if (data === null) throw new GameError('GAME_NOT_ACTIVE', 'No such game.', 404)
    return data as GameRow
  }

  async players(gameId: string): Promise<PlayerRow[]> {
    const { data, error } = await this.#db
      .from('game_players')
      .select('user_id, seat, dice_count, profiles!game_players_user_id_fkey(display_name)')
      .eq('game_id', gameId)
      .order('seat')
    if (error !== null) throw lift(error)

    return (data ?? []).map((row: Record<string, unknown>) => ({
      user_id: row.user_id as PlayerId,
      seat: row.seat as number,
      dice_count: row.dice_count as number,
      display_name: nameOf(row.profiles),
    }))
  }

  /** The round still being played, or null between rounds. */
  async liveRound(gameId: string): Promise<RoundRow | null> {
    const { data, error } = await this.#db
      .from('rounds')
      // One literal on purpose: supabase-js parses this string at type level,
      // and a concatenation it cannot read statically degrades to an error type.
      .select('id, round_number, type, locked_face, status, bid_quantity, bid_face, bid_player_id, bull_player_id, turn_player_id, farewell_queue, version')
      .eq('game_id', gameId)
      .neq('status', 'resolved')
      .maybeSingle()
    if (error !== null) throw lift(error)
    return (data as RoundRow | null) ?? null
  }

  /**
   * How many dice on the table count toward a face.
   *
   * The only thing about anybody's dice this function can learn, and it is a
   * number. Counting happens where the dice already live.
   */
  async countFace(roundId: string, face: Face): Promise<number> {
    const { data, error } = await this.#db.rpc('count_face', {
      p_round_id: roundId,
      p_face: face,
    })
    if (error !== null) throw lift(error)
    return data as number
  }

  async openRound(
    gameId: string,
    type: RoundType,
    starter: PlayerId,
  ): Promise<string> {
    const { data, error } = await this.#db.rpc('deal_round', {
      p_game_id: gameId,
      p_type: type,
      p_turn_player: starter,
    })
    if (error !== null) throw lift(error)
    return data as string
  }

  async applyBid(args: BidWrite): Promise<void> {
    const { error } = await this.#db.rpc('apply_bid', {
      p_round_id: args.roundId,
      p_version: args.version,
      p_player: args.player,
      p_quantity: args.quantity,
      p_face: args.face,
      p_burst: args.burst,
      p_next_turn: args.nextTurn,
      p_lock_face: args.lockFace,
    })
    if (error !== null) throw lift(error)
  }

  async applyBull(args: BullWrite): Promise<void> {
    const { error } = await this.#db.rpc('apply_bull', {
      p_round_id: args.roundId,
      p_version: args.version,
      p_player: args.player,
      p_burst: args.burst,
      p_next_turn: args.nextTurn,
    })
    if (error !== null) throw lift(error)
  }

  async applyChallenge(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await this.#db.rpc('apply_challenge', args)
    if (error !== null) throw lift(error)
    return data as Record<string, unknown>
  }
}

function nameOf(profiles: unknown): string {
  // PostgREST returns an embed as an object or, for some shapes, a one-element
  // array. Both have been seen from this exact query.
  const row = Array.isArray(profiles) ? profiles[0] : profiles
  const name = (row as { display_name?: unknown } | null)?.display_name
  return typeof name === 'string' ? name : 'Player'
}

function lift(error: { message: string }): Error {
  return fromPostgres(error.message) ?? new Error(error.message)
}
