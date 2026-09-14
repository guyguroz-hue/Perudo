import { useEffect, useRef, useState } from 'react'
import { useSoundEffect } from '../../lib/useSound'
import type { TableMove } from './view'

/**
 * Somebody cutting in.
 *
 * A Burst is the move this game is built around — anybody may bid or doubt at
 * any moment, so the turn is a suggestion — and it arrived more quietly than
 * an ordinary bid. The log grew a line with a small mark on it, in the corner
 * of the screen, while the thing a player was actually looking at was the
 * middle of the table. Half the time the first you knew of it was that the bid
 * had changed and it was somehow your turn again.
 *
 * It is a physical act at a real table: you knock to be heard over whoever was
 * about to speak. So it gets a knock and a flash of light across the timber,
 * and both last about a fifth of a second — long enough to catch the eye that
 * was looking elsewhere, short enough that a table where everybody bursts is
 * not a table that strobes.
 *
 * Light rather than colour, because in this product light means "look here"
 * and colour means "this is whose". A Burst is not a new player, it is a new
 * moment.
 */
const JOLT_MS = 420

export function useBurst(moves: readonly TableMove[]): boolean {
  const [jolting, setJolting] = useState(false)
  const effect = useSoundEffect()

  /*
   * The last move this screen has already reacted to.
   *
   * Identity, not contents: the view is refetched on every Realtime event, so
   * the same move arrives again and again as a new object. Keyed on the move's
   * own id, a bid nobody made cannot set this off, and the one that did cannot
   * set it off twice.
   */
  const seen = useRef<string | null>(null)
  /*
   * Nothing fires on arrival.
   *
   * Reloading mid-round, or opening the app to a table where the last thing
   * that happened was a Burst, would otherwise knock and flash at a player who
   * has not seen a single move yet — announcing as news something that is
   * simply the state they arrived in.
   */
  const arrived = useRef(false)

  useEffect(() => {
    const last = moves.length === 0 ? null : moves[moves.length - 1]
    const first = !arrived.current
    arrived.current = true

    if (last === null || last.id === seen.current) return
    seen.current = last.id
    if (first || !last.burst) return

    setJolting(true)
    effect('burst')
    const settles = setTimeout(() => setJolting(false), JOLT_MS)
    return () => clearTimeout(settles)
  }, [moves, effect])

  return jolting
}
