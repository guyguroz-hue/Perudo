import { useEffect, useRef, useState } from 'react'
import './Countdown.css'

/**
 * The moment between the lobby and the table.
 *
 * Every client reaches this the same way — the room's status changed — so
 * everyone counts down together without anyone coordinating it. It is short on
 * purpose: anticipation, not a loading screen.
 *
 * Reduced motion is honoured by the tokens, and the number is the signal
 * anyway, so nothing is lost when the animation is off.
 */
export function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3)

  /*
   * The clock does not restart because the room moved.
   *
   * `onDone` is written at the call site as an arrow, so it is a new function
   * on every render — and this sits inside a live room, which re-renders on
   * every Realtime event and on every heartbeat any of six clients sends. With
   * the callback in the dependencies, each of those cleared the running timer
   * and started a fresh one, so a busy room could hold the count on three
   * indefinitely and never reach the table.
   *
   * Held in a ref so the effect depends on the number alone. Fixing it at the
   * call site would work until the next caller wrote an arrow, which is the
   * obvious way to write it.
   */
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    if (n === 0) {
      const finish = setTimeout(() => done.current(), 500)
      return () => clearTimeout(finish)
    }
    const tick = setTimeout(() => setN((value) => value - 1), 700)
    return () => clearTimeout(tick)
  }, [n])

  return (
    <div className="countdown" role="status" aria-live="polite">
      <p className="countdown__label">Everyone ready</p>
      <div className="countdown__stage">
        <span className="countdown__ring" key={`ring-${n}`} aria-hidden="true" />
        <p className="countdown__number" key={n}>
          {n === 0 ? 'Play' : n}
        </p>
      </div>
    </div>
  )
}
