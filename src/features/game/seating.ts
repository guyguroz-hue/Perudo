import { badgeAnchor } from '../../three/layout'
import type { BadgeAnchor } from '../../three/layout'
import type { SceneSeat } from '../../three/scene'
import { hexForSeat } from './colors'
import type { Face } from '../../game'
import type { RevealHand } from './reveal'
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

export function placeSeats(
  players: readonly TablePlayer[],
  /** True while the cups are off the table, which moves the badges up with them. */
  lifted = false,
): SeatPlacement[] {
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
    badge: badgeAnchor(index, ordered.length, lifted),
  }))
}

/** What the table is doing, which is the same thing for every cup on it. */
export type TableMood = 'still' | 'dealing' | 'revealing'

/**
 * What the renderer is told.
 *
 * Only players still holding dice get a cup — but they keep the chair they were
 * sitting in, which is why the seat's own index and the size of the whole table
 * travel with it rather than being counted off this list. Read from the list, a
 * table of four with one player out would put the last player in the empty
 * chair, and the cup under a name would be somebody else's.
 *
 * Faces are passed for one hand only: yours — until a challenge is resolved,
 * when the server releases every hand and `hands` carries them. Nobody else's
 * values are in this browser before that, so until then there is nothing here
 * to leak.
 */
export function sceneSeats(
  seats: readonly SeatPlacement[],
  yourHand: readonly Face[] | null,
  mood: TableMood = 'still',
  hands: readonly RevealHand[] | null = null,
): SceneSeat[] {
  return seats
    .filter((seat) => !seat.player.isEliminated)
    .map((seat) => ({
      id: seat.player.id,
      index: seat.index,
      count: seat.count,
      colour: hexForSeat(seat.player.seatIndex),
      dice:
        hands?.find((hand) => hand.id === seat.player.id)?.dice ??
        (seat.player.isYou ? (yourHand ?? undefined) : undefined),
      // One mood for the whole table. Every cup was dealt at once and every cup
      // is lifted at once, so shaking or lifting them in sequence would say the
      // table is going round when it is not — the server does both in a single
      // write.
      state: mood === 'dealing' ? ('shaking' as const) : mood === 'revealing' ? ('lifted' as const) : ('covered' as const),
    }))
}
