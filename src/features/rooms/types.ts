/** A room as the client is allowed to see it. */
export interface Room {
  readonly id: string
  readonly code: string
  readonly host_id: string | null
  readonly status: RoomStatus
  readonly expires_at: string
}

export type RoomStatus = 'lobby' | 'starting' | 'in_game' | 'finished' | 'closed'

/** One seat at the table. `profile` is null only if a name has not loaded yet. */
export interface Seat {
  readonly user_id: string
  readonly seat: number
  readonly display_name: string
  readonly is_host: boolean
  readonly is_you: boolean
}

/**
 * Somebody in the room who is not playing.
 *
 * Kept apart from `Seat` rather than folded into it with a nullable seat. Every
 * count, every pip and every badge position on this screen is derived from the
 * seat list, and a list that sometimes contains people without seats would have
 * to be filtered at each of those places — which is the kind of thing that is
 * right in five of them and wrong in the sixth.
 */
export interface Watcher {
  readonly user_id: string
  readonly display_name: string
  readonly is_you: boolean
  /** Set while they are waiting on the host for a seat. */
  readonly asked_at: string | null
}

/** Every seat position the table has, occupied or not. */
export const SEAT_COUNT = 6

/**
 * Below this the host cannot start.
 *
 * Never a rule of the game — GAME_RULES says nothing about how many people are
 * needed. Three was a judgement about what makes a good table, and two is a
 * worse game: with one opponent every bid is a claim about one hand you cannot
 * see plus your own, and there is no table to read. It is playable, and it is
 * the only way to sit down and try a change without finding a third person
 * first.
 *
 * The database is the authority (`start_game` refuses fewer). This is what the
 * lobby greys the button out with, and the two have to agree.
 */
export const MIN_PLAYERS = 2

/** A game as the room layer sees it. Play itself belongs to the engine. */
export interface Game {
  readonly id: string
  readonly status: 'starting' | 'active' | 'completed' | 'abandoned'
  readonly winner_id: string | null
  readonly starting_dice: number
}

/** A player in a game: how many dice they hold, and whether they are out. */
export interface GamePlayer {
  readonly user_id: string
  readonly seat: number
  readonly dice_count: number
  readonly is_eliminated: boolean
  readonly display_name: string
  readonly is_you: boolean
}
