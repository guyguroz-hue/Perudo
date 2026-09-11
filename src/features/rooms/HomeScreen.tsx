import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Die } from '../../components/Die'
import { createRoom, joinRoom } from './api'
import { toRoomError } from './errors'
import './HomeScreen.css'

/**
 * The front door. Two actions, both immediately obvious — this is the entrance
 * to a game with friends, not an account dashboard.
 */
export function HomeScreen({ name }: { name: string }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)

  async function onCreate() {
    setBusy('create')
    setError(null)
    try {
      const { roomId } = await createRoom()
      navigate(`/room/${roomId}`)
    } catch (caught) {
      setError(toRoomError(caught).message)
      setBusy(null)
    }
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault()
    setBusy('join')
    setError(null)
    try {
      const { roomId } = await joinRoom(code)
      navigate(`/room/${roomId}`)
    } catch (caught) {
      setError(toRoomError(caught).message)
      setBusy(null)
    }
  }

  return (
    <div className="home">
      <div className="home__dice" aria-hidden="true">
        <Die face={1} size={36} />
        <Die face={5} size={36} />
        <Die hidden size={36} />
      </div>
      <h1 className="home__title">Perudo</h1>
      <p className="home__greeting">Playing as {name}</p>

      <Button onClick={() => void onCreate()} busy={busy === 'create'}>
        {busy === 'create' ? 'Setting the table…' : 'Create room'}
      </Button>

      <div className="home__divider">
        <span>or join one</span>
      </div>

      <form className="home__join" onSubmit={onJoin}>
        <input
          className="home__code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ROOM CODE"
          maxLength={5}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          aria-label="Room code"
          aria-invalid={error !== null}
        />
        <Button type="submit" variant="quiet" busy={busy === 'join'} disabled={code.length < 5}>
          Join
        </Button>
      </form>

      {error !== null && (
        <p className="home__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
