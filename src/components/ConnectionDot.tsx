import type { Connection } from '../features/rooms/useRoom'
import './ConnectionDot.css'

/**
 * Connection state, shown only when it matters.
 *
 * A healthy connection says nothing — a permanent green light is noise, and
 * players should be thinking about the game, not the transport. It appears when
 * changes have stopped arriving, because that is when a still table stops
 * meaning "nobody has moved" and starts meaning "you are not being told".
 */
export function ConnectionDot({ connection }: { connection: Connection }) {
  if (connection === 'live' || connection === 'connecting') return null

  const label = connection === 'offline' ? 'Offline' : 'Reconnecting…'

  return (
    <p className={`conn conn--${connection}`} role="status">
      <span className="conn__dot" aria-hidden="true" />
      {label}
    </p>
  )
}
