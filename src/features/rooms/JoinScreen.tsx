import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Die } from '../../components/Die'
import { joinRoom } from './api'
import { toRoomError } from './errors'

/**
 * What an invite link lands on.
 *
 * The whole screen is a formality: take the code out of the URL, join, and get
 * out of the way. A player who tapped a link from a friend should be looking at
 * the table, not at a form.
 */
export function JoinScreen() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    // StrictMode mounts effects twice in development. Joining is idempotent so
    // a second call would be harmless, but there is no reason to make it.
    if (attempted.current) return
    attempted.current = true

    joinRoom(code)
      .then(({ roomId }) => navigate(`/room/${roomId}`, { replace: true }))
      .catch((caught: unknown) => setError(toRoomError(caught).message))
  }, [code, navigate])

  if (error !== null) {
    return (
      <div className="lobby__centered" role="alert">
        <h2>Could not join</h2>
        <p className="lobby__muted">{error}</p>
        <Button onClick={() => navigate('/', { replace: true })}>Back</Button>
      </div>
    )
  }

  return (
    <div className="lobby__centered">
      <div className="lobby__dice" aria-hidden="true">
        <Die face={6} size={32} />
        <Die face={3} size={32} />
      </div>
      <p>Joining room {code}…</p>
    </div>
  )
}
