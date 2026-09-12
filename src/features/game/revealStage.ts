import { useEffect, useRef, useState } from 'react'
import { countsToward } from '../../game'
import type { Face } from '../../game'
import { usePrefersReducedMotion } from '../../lib/motion'
import type { RevealData } from './reveal'

/**
 * The reveal, as a sequence.
 *
 *   challenge → pause → cups lift → dice settle → count → result
 *
 * The pause is not a loading state and must never show a spinner. It is the
 * beat where a player wonders whether they were right, and it is also exactly
 * the window the challenge request needs. When the network is slow the pause
 * extends rather than breaking: the table holds its breath for longer. That
 * degrades honestly.
 *
 * Kept apart from anything that draws, because two things now watch it: the
 * cups on the table, which lift, and the panel underneath, which counts.
 */
export type RevealStage = 'held' | 'lifting' | 'settled' | 'counting' | 'result'

/** Long enough to feel deliberate, short enough never to read as loading. */
const HELD_MS = 750

/**
 * A frame between the answer landing and the cups moving.
 *
 * The render that brings the dice in and the one that lifts the cups must not
 * be the same tick, or the browser has nothing to transition from and jumps
 * them. When the network has already spent the whole pause this is the entire
 * remaining beat, and ninety milliseconds does not read as one.
 */
const MIN_BEAT_MS = 90
const LIFT_MS = 620
const SETTLE_MS = 340
const PER_DIE_MS = 150

export interface Revealing {
  readonly stage: RevealStage
  /** How many counted dice have been shown so far. */
  readonly counted: number
}

export function useRevealStage(data: RevealData | null): Revealing {
  const [timedStage, setTimedStage] = useState<RevealStage>('held')
  const [timedCount, setTimedCount] = useState(0)
  const startedAt = useRef(0)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    startedAt.current = Date.now()
  }, [])

  useEffect(() => {
    if (data === null || reduced) return

    // The pause already spent waiting for the server counts toward the beat,
    // so a fast answer still gets a pause and a slow one does not get two.
    const remaining = Math.max(MIN_BEAT_MS, HELD_MS - (Date.now() - startedAt.current))
    const timers: number[] = []
    const at = (delay: number, run: () => void) => timers.push(window.setTimeout(run, delay))

    at(remaining, () => setTimedStage('lifting'))
    at(remaining + LIFT_MS, () => setTimedStage('settled'))

    const countFrom = remaining + LIFT_MS + SETTLE_MS
    at(countFrom, () => setTimedStage('counting'))
    for (let n = 1; n <= data.actualCount; n += 1) {
      at(countFrom + n * PER_DIE_MS, () => setTimedCount(n))
    }
    at(countFrom + (data.actualCount + 1) * PER_DIE_MS, () => setTimedStage('result'))

    return () => timers.forEach(window.clearTimeout)
  }, [data, reduced])

  // With motion switched off there is no sequence to run: the reveal is simply
  // at its result. Derived rather than set, so nothing renders twice to get
  // there.
  return {
    stage: data === null ? 'held' : reduced ? 'result' : timedStage,
    counted: data !== null && reduced ? data.actualCount : timedCount,
  }
}

/**
 * Every die on the table that counts toward the claim, in seat order.
 *
 * This is the arithmetic the reveal exists to show. On the table the dice are
 * lying flat under a camera at thirty-five degrees and a die is twenty pixels
 * across — you can see that they are dice, and that is all. So the ones that
 * count are pulled out and shown again at a size a person can read, which is
 * the one thing a picture of a table cannot do for you.
 */
export function countedDice(data: RevealData): Face[] {
  return data.hands.flatMap((hand) =>
    hand.dice.filter((die) => countsToward(die, data.face, data.roundType)),
  )
}
