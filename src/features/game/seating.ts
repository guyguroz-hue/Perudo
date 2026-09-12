import { project, toPercent } from './camera'
import { SEAT_RADIUS } from './TableSurface'
import type { TablePlayer } from './view'

/**
 * Where everybody sits.
 *
 * You are always at the near edge of the table, because that is the edge you
 * are sitting at. Everyone else runs away from you around the rim in their
 * true order, so the player clockwise from you is clockwise from you on
 * screen — turn order is something to see rather than to work out.
 *
 * Nothing here decides how big a cup is drawn or how far up the screen it
 * goes. Those come out of the camera, which is the only thing in the product
 * that knows where the table is.
 */
export interface SeatPlacement {
  readonly player: TablePlayer
  /** Where the cup stands, as CSS percentages of the scene. */
  readonly left: string
  readonly top: string
  /** Perspective scale for the cup. Near is bigger; the camera decides. */
  readonly scale: number
  /** Near seats must draw over far ones. */
  readonly depth: number
  /** Which side of the table this seat is on, for laying out its label. */
  readonly side: 'left' | 'right' | 'near' | 'far'
}

const TAU = Math.PI * 2

export function placeSeats(players: readonly TablePlayer[]): SeatPlacement[] {
  if (players.length === 0) return []

  // Rotate the table so you are at the near edge, keeping everyone's order.
  const youIndex = Math.max(
    0,
    players.findIndex((player) => player.isYou),
  )
  const ordered = [...players.slice(youIndex), ...players.slice(0, youIndex)]

  return ordered.map((player, i) => {
    // A quarter turn puts index 0 nearest the viewer; from there the ring runs
    // the way seats are numbered.
    const angle = TAU * 0.25 + (i / ordered.length) * TAU
    const x = Math.cos(angle) * SEAT_RADIUS
    const z = Math.sin(angle) * SEAT_RADIUS
    const p = project(x, z)

    return {
      player,
      ...toPercent(p),
      scale: p.scale,
      depth: Math.round((z + 1) * 500),
      side: sideOf(x, z),
    }
  })
}

function sideOf(x: number, z: number): SeatPlacement['side'] {
  if (Math.abs(x) < SEAT_RADIUS * 0.4) return z > 0 ? 'near' : 'far'
  return x < 0 ? 'left' : 'right'
}
