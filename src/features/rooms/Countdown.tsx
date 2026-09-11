import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (n === 0) {
      const finish = setTimeout(onDone, 500)
      return () => clearTimeout(finish)
    }
    const tick = setTimeout(() => setN((value) => value - 1), 700)
    return () => clearTimeout(tick)
  }, [n, onDone])

  return (
    <div className="countdown" role="status" aria-live="polite">
      <p className="countdown__label">Everyone ready</p>
      <p className="countdown__number" key={n}>
        {n === 0 ? 'Play' : n}
      </p>
    </div>
  )
}
