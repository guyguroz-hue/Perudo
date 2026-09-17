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
const PER_DIE_MS = 185

/**
 * The beat between the verdict and the dice moving.
 *
 * The verdict lands and the count is on the table marked out — and that is the
 * moment a player actually reads what happened. A die leaving on the same
 * frame takes the answer away while they are still working it out: the thing
 * that mattered most was over before they looked up.
 *
 * So nothing moves for a moment. The count is there to be read, the sentence
 * under it says who pays, and only then is anybody's die taken.
 */
export const PAY_AFTER_MS = 2100

/**
 * How long a die takes to leave the table, or to arrive on it.
 *
 * Slow enough to follow from across the table — this is the only thing that
 * ever changes what a player holds, and a player who missed it has missed the
 * result. Kept here beside the rest of the reveal's timing rather than in the
 * renderer, because it is the reveal's pacing and not a rendering detail.
 */
export const PAY_MS = 1000

/**
 * How long the result stands before the table moves on by itself.
 *
 * The next round is dealt by the resolution that ended the last one, so by the
 * time this panel is on screen every player is already in it — the button only
 * ever took this client's curtain down. Six people each taking their own curtain
 * down is six people waiting on each other for no reason, and one of them
 * putting their phone in a pocket stops the game.
 *
 * A deadline rather than a host's tap, for the same reason the lobby counts
 * down instead of asking the host to press again: there is nothing here for a
 * host to decide, and anybody who is slow would be deciding for everybody else.
 *
 * It scales with what there is to read. "Alice was wrong" is one line; a
 * correct Bull that takes a die from five people and knocks two of them out is
 * the longest thing this panel ever says.
 */
/*
 * Lengthened once, from a real table.
 *
 * "The reveal is too fast and there is not enough time between rounds" — six
 * people around a phone each, where the round that just ended is the thing
 * everybody wants to talk about for a moment before the next one is dealt. The
 * count runs slower by a third and the settled table stays up about a second
 * and a half longer.
 *
 * It can afford to: the panel carries a button that takes this client's curtain
 * down early, so a long hold costs an impatient player one tap and buys
 * everybody else the beat they asked for.
 */
export function resultHoldMs(changedPlayers: number): number {
  // Everything before the table settles, and then time to look at it settled.
  // Written as a sum rather than as one number so the pause before the dice
  // move and the hold can never drift apart: lengthen one and the other
  // follows, instead of the table advancing over a die still in the air.
  const settling = PAY_AFTER_MS + PAY_MS
  return Math.min(settling + 3200 + changedPlayers * 780, 9000 + settling)
}

export interface Revealing {
  readonly stage: RevealStage
  /** How many counted dice have been shown so far. */
  readonly counted: number
}

export function useRevealStage(data: RevealData | null, open: boolean): Revealing {
  const [timedStage, setTimedStage] = useState<RevealStage>('held')
  const [timedCount, setTimedCount] = useState(0)
  const startedAt = useRef(0)
  const reduced = usePrefersReducedMotion()

  /*
   * Back to the start whenever a new answer arrives.
   *
   * This hook lives in `GameTable`, which is mounted for the whole game, so its
   * state outlives the reveal that set it. It was left at `result` — and the
   * next reveal therefore opened *on its verdict*, held it for the length of
   * the first beat, and only then rewound to the cups lifting. Every reveal
   * after the first in a game showed the answer before the question.
   *
   * Reset during render rather than in an effect, so the frame that first
   * carries the new resolution already has the stage to go with it. Nothing is
   * painted in between.
   */
  const [shown, setShown] = useState(data)
  if (data !== shown) {
    setShown(data)
    setTimedStage('held')
    setTimedCount(0)
  }

  /*
   * When the curtain went up — not when this component mounted.
   *
   * The beat below is meant to absorb the wait for the server: a fast answer
   * still gets its pause and a slow one does not get two. That needs the moment
   * the player pressed, and this was reading the moment the *table* was built,
   * which on any real game is minutes earlier. `HELD_MS - minutes` is negative,
   * so the pause collapsed to its floor of ninety milliseconds and the held
   * beat this file is built around never once happened.
   */
  useEffect(() => {
    if (open) startedAt.current = Date.now()
  }, [open])

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
