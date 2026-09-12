import { badgeAnchor } from '../../three/layout'
import type { BadgeAnchor } from '../../three/layout'
import type { TablePlayer } from './view'

/**
 * Who sits where.
 *
 * The arithmetic of the ring is the camera's, in `three/layout`. What is left
 * here is the only part that is about the game: you sit at the near edge
 * whatever seat the room gave you, and everybody else keeps their order round
 * the table, so the player clockwise from you is clockwise from you on screen.
 */
export interface SeatPlacement {
  readonly player: TablePlayer
  /** Index around the ring, counted from you. */
  readonly index: number
  readonly count: number
  /** Where this player's badge goes, floating clear of their cup. */
  readonly badge: BadgeAnchor
}

export function placeSeats(players: readonly TablePlayer[]): SeatPlacement[] {
  if (players.length === 0) return []

  const youIndex = Math.max(
    0,
    players.findIndex((player) => player.isYou),
  )
  const ordered = [...players.slice(youIndex), ...players.slice(0, youIndex)]

  return ordered.map((player, index) => ({
    player,
    index,
    count: ordered.length,
    badge: badgeAnchor(index, ordered.length),
  }))
}
