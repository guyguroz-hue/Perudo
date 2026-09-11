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

/** Every seat position the table has, occupied or not. */
export const SEAT_COUNT = 6

/** Below this the host cannot start (R-002 decisions, docs/ROOMS.md §11). */
export const MIN_PLAYERS = 3
