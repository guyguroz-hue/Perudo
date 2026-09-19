import { useEffect, useState } from 'react'

/**
 * A control that has only just become usable does not take the press that was
 * already on its way.
 *
 * Reported from a real table, by everybody at it: "we all pressed Bull by
 * accident." Bull is the most expensive move in the game and it cannot be taken
 * back — a false one costs the caller a die (§8.4) and a correct one costs
 * everybody else (§8.3) — so a Bull nobody meant to make changes the game for
 * five other people.
 *
 * The first cause was layout: the two challenge tiles were not on the screen at
 * all until somebody bid, so the moment a bid landed the dock grew by a row and
 * everything above it jumped, putting Bull under a thumb that had been aiming
 * at Bid. That is fixed by the tiles always being there.
 *
 * This is the second cause, and it survives the first. A thumb takes about a
 * fifth of a second to travel and a press is committed before it lands: a bid
 * arriving in that window turns a dead tile into a live one underneath a finger
 * that was never deciding about it. Nothing on screen moved; the meaning of the
 * thing being pressed did.
 *
 * So a control that has just come alive stays inert for a moment longer than a
 * thumb takes. The cost is that a player who was genuinely waiting to pounce
 * has to wait a beat; the alternative is a move they did not make.
 */
export const ARM_MS = 400

/**
 * False for a beat after `key` changes, true the rest of the time.
 *
 * The general form of the rule above, because the danger is not only a dead
 * control coming alive. A control whose *meaning* changed under a thumb is the
 * same accident wearing different clothes, and that is what a table full of
 * people bursting at each other produces several times a round: the button
 * that said Burst a moment ago now says Bid and raises a different claim, and
 * the press already on its way lands on it.
 *
 * So callers hand over whatever identifies what the control would do right
 * now, and get back whether that has been true long enough to be what the
 * player is answering.
 */
export function useSettled(key: unknown, delay = ARM_MS): boolean {
  const [settled, setSettled] = useState(true)
  /*
   * What it was last render, so that only a *change* unsettles it.
   *
   * The table re-renders on every event at it; without this the clock would
   * restart constantly and the control would arm late or never. Held as state
   * rather than a ref because this is React's own way of adjusting state when
   * an input changes, and it belongs in render: the frame on which a control
   * changes meaning has to be the frame on which it is already inert. An
   * effect runs after that frame is painted, which is after it can be pressed.
   */
  const [was, setWas] = useState(key)
  if (key !== was) {
    setWas(key)
    setSettled(false)
  }

  useEffect(() => {
    if (settled) return
    const settles = setTimeout(() => setSettled(true), delay)
    return () => clearTimeout(settles)
  }, [settled, delay])

  return settled
}

export function useArmed(ready: boolean, delay = ARM_MS): boolean {
  const settled = useSettled(ready, delay)
  // Already usable on arrival is already armed: nothing changed under anybody.
  return ready && settled
}
