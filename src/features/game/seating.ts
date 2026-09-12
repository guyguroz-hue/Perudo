import { badgeAnchor } from '../../three/layout'
import type { BadgeAnchor } from '../../three/layout'
import type { SceneSeat } from '../../three/scene'
import { hexForSeat } from './colors'
import type { Face } from '../../game'
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

/**
 * What the renderer is told.
 *
 * Only players still holding dice get a cup — but they keep the chair they were
 * sitting in, which is why the seat's own index and the size of the whole table
 * travel with it rather than being counted off this list. Read from the list, a
 * table of four with one player out would put the last player in the empty
 * chair, and the cup under a name would be somebody else's.
 *
 * Faces are passed for one hand only: yours. Nobody else's values are in this
 * browser to pass, so there is nothing here to leak.
 */
export function sceneSeats(
  seats: readonly SeatPlacement[],
  yourHand: readonly Face[] | null,
  shaking = false,
): SceneSeat[] {
  return seats
    .filter((seat) => !seat.player.isEliminated)
    .map((seat) => ({
      id: seat.player.id,
      index: seat.index,
      count: seat.count,
      colour: hexForSeat(seat.player.seatIndex),
      dice: seat.player.isYou ? (yourHand ?? undefined) : undefined,
      // Every cup at once, because every cup was dealt at once. Shaking them
      // one after another would say the deal is going round the table, and it
      // is not — the server deals the whole round in one write.
      state: shaking ? ('shaking' as const) : ('covered' as const),
    }))
}
