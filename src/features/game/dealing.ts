import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '../../lib/motion'

/**
 * How long the table shakes when a round is dealt.
 *
 * Long enough to be a deal and not a twitch, short enough that nobody is
 * waiting on it: the bid controls are live underneath the whole time, so a
 * player who already knows what they want to say is never held up by the
 * theatre.
 */
export const SHAKE_MS = 1100

/**
 * Whether the cups are being shaken.
 *
 * True for a beat whenever the round number changes, which is the only signal a
 * client gets that dice have been dealt — the values themselves are private and
 * arrive separately. Never true on arrival: opening the app into round seven
 * should not look like round seven was just dealt, and reloading mid-round
 * should not either.
 *
 * The round it is showing is state and the comparison happens during the
 * render, rather than a ref written inside an effect. Written the other way it
 * worked once and then never again: the effect records the round it has seen,
 * so when React runs an effect twice — which it does on mount in development,
 * and is free to do at any time — the second run finds the round already
 * recorded, takes the early exit, and the timer the first run's cleanup just
 * cancelled is never replaced. The cups then shake for the rest of the game.
 */
export function useDealShake(roundNumber: number): boolean {
  const reduced = usePrefersReducedMotion()
  const [showing, setShowing] = useState(roundNumber)
  // Which round is being announced, rather than when it arrived: round numbers
  // only ever go up, so this changes on every deal without the render having to
  // read a clock.
  const [dealt, setDealt] = useState<number | null>(null)

  if (showing !== roundNumber) {
    // Render the deal on this pass rather than a frame late.
    setShowing(roundNumber)
    setDealt(reduced ? null : roundNumber)
  }

  useEffect(() => {
    if (dealt === null) return
    const timer = window.setTimeout(() => setDealt(null), SHAKE_MS)
    return () => window.clearTimeout(timer)
  }, [dealt])

  return dealt !== null
}
