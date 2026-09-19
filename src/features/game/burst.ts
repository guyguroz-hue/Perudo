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
/**
 * How long the flash of light across the timber lasts.
 *
 * Long enough to catch an eye that was looking elsewhere, short enough that a
 * table where everybody bursts is not a table that strobes.
 */
const JOLT_MS = 420

/**
 * And how long the line above the dock says who it was.
 *
 * The flash says *that* somebody cut in. It cannot say who, or what they said,
 * and a player who looked up a moment late has missed it entirely — which is
 * the report: "the cup lights up a little and then suddenly jumps, and the log
 * is not convenient to follow." So the flash keeps its job and the line takes
 * the other one.
 *
 * Long enough to read a name and a bid without hurrying, short enough to be
 * gone before the next move wants the line back.
 */
export const CUT_IN_MS = 2600

export interface Cutting {
  /** The flash across the table, for a fifth of a second. */
  readonly jolting: boolean
  /** The move itself, for as long as the line above the dock is saying it. */
  readonly cutIn: TableMove | null
}

export function useBurst(moves: readonly TableMove[]): Cutting {
  const [jolting, setJolting] = useState(false)
  const [cutIn, setCutIn] = useState<TableMove | null>(null)
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

  /*
   * The clocks live here, not in the effect's cleanup, and that is a fix
   * rather than a style.
   *
   * They were cleared by the cleanup of an effect that depends on `moves` — so
   * any move arriving inside the flash cancelled the timer that ends it, and
   * the next run returned early without setting a new one. The board kept the
   * class for good, and because the flash is a one-shot animation on that
   * class, no later Burst ever flashed again. The window is a fifth of a
   * second, which sounds unreachable until you remember what this feature is
   * for: two people cutting in at once is exactly the case it exists to show.
   */
  const stopJolt = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stopLine = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      clearTimeout(stopJolt.current)
      clearTimeout(stopLine.current)
    },
    [],
  )

  useEffect(() => {
    const last = moves.length === 0 ? null : moves[moves.length - 1]
    const first = !arrived.current
    arrived.current = true

    if (last === null || last.id === seen.current) return
    seen.current = last.id
    if (first || !last.burst) return

    setJolting(true)
    setCutIn(last)
    effect('burst')

    clearTimeout(stopJolt.current)
    clearTimeout(stopLine.current)
    stopJolt.current = setTimeout(() => setJolting(false), JOLT_MS)
    stopLine.current = setTimeout(() => setCutIn(null), CUT_IN_MS)
  }, [moves, effect])

  return { jolting, cutIn }
}
