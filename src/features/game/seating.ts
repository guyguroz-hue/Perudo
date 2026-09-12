import type { TablePlayer } from './view'

/**
 * Where everybody sits.
 *
 * You are always at the bottom of the screen, nearest the reader, and the rest
 * of the table runs away from you around an ellipse. That is not decoration:
 * it puts your own cup under your thumb, keeps the seat you look at most in the
 * place you look at least often, and makes "across the table" mean something.
 *
 * Seats keep their order around the ring, so the player clockwise from you is
 * clockwise from you on screen. Turn order is something a player should be able
 * to see rather than work out.
 */
export interface SeatPlacement {
  readonly player: TablePlayer
  /** Fractions of the ellipse's radii, from its centre. -1…1 on each axis. */
  readonly x: number
  readonly y: number
  /**
   * How large this seat's cup is drawn.
   *
   * Nearer the bottom of the screen is nearer the viewer, so it is bigger. One
   * cheap cue does more for the illusion of a table than any amount of texture.
   */
  readonly scale: number
  /** Which side of the table this seat is on, for laying its label out. */
  readonly side: 'left' | 'right' | 'near' | 'far'
}

const TAU = Math.PI * 2

/** How much the back of the table is foreshortened. */
const FAR_COMPRESSION = 0.74

export function placeSeats(players: readonly TablePlayer[]): SeatPlacement[] {
  if (players.length === 0) return []

  // Rotate the table so you are at the bottom, keeping everyone's order.
  const youIndex = Math.max(
    0,
    players.findIndex((player) => player.isYou),
  )
  const ordered = [...players.slice(youIndex), ...players.slice(0, youIndex)]

  return ordered.map((player, i) => {
    // A quarter turn puts index 0 at the bottom; from there the ring runs the
    // way seats are numbered.
    const angle = TAU * 0.25 + (i / ordered.length) * TAU
    const x = Math.cos(angle)
    const y = Math.sin(angle)

    return {
      player,
      x,
      // The far half of the ring is pulled in, because a round table seen from
      // slightly above is an ellipse and its back edge is nearer the middle
      // than its front edge. Without it the far cups stand off the table.
      y: y < 0 ? y * FAR_COMPRESSION : y,
      // 0.7 at the far edge, 1 at the near one.
      scale: 0.7 + 0.3 * ((y + 1) / 2),
      side: sideOf(x, y),
    }
  })
}

function sideOf(x: number, y: number): SeatPlacement['side'] {
  if (Math.abs(x) < 0.35) return y > 0 ? 'near' : 'far'
  return x < 0 ? 'left' : 'right'
}
