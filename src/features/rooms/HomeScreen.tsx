import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Cup } from '../../components/Cup'
import { Die } from '../../components/Die'
import { useAuth } from '../auth/useAuth'
import { createRoom, fetchMyRoom, joinRoom } from './api'
import { toRoomError } from './errors'
import { JoinChoice } from './JoinChoice'
import './HomeScreen.css'

/**
 * The front door. Two actions, both immediately obvious — this is the entrance
 * to a game with friends, not an account dashboard.
 */
export function HomeScreen({ name }: { name: string }) {
  const navigate = useNavigate()
  const { state } = useAuth()
  const youId = state.status === 'ready' ? state.userId : null
  const [openTable, setOpenTable] = useState<{ roomId: string; code: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  // A room that has started, or is full, is not a room you cannot enter — it is
  // a room you cannot sit down in. See `JoinChoice`.
  const [choice, setChoice] = useState<'started' | 'full' | null>(null)

  // Coming back should not mean typing a code you no longer have in front of
  // you. If a seat is still held somewhere, offer the way back to it.
  useEffect(() => {
    if (youId === null) return
    let stale = false
    fetchMyRoom(youId)
      .then((found) => {
        if (!stale && found !== null) setOpenTable({ roomId: found.roomId, code: found.code })
      })
      .catch(() => {
        // Not being able to find a previous table is not a failure worth
        // reporting: creating or joining still works perfectly well.
      })
    return () => {
      stale = true
    }
  }, [youId])

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
      const failure = toRoomError(caught)
      setBusy(null)
      if (failure.code === 'GAME_ALREADY_STARTED' || failure.code === 'ROOM_FULL') {
        setChoice(failure.code === 'ROOM_FULL' ? 'full' : 'started')
        return
      }
      setError(failure.message)
    }
  }

  if (choice !== null) {
    return (
      <JoinChoice
        code={code}
        reason={choice}
        onEntered={(roomId) => navigate(`/room/${roomId}`)}
        onBack={() => setChoice(null)}
      />
    )
  }

  return (
    <div className="home">
      <div className="home__dice" aria-hidden="true">
        {/* The game in three marks: the wildcard, a number, and one nobody
            can see. The third was a blank die, which reads as a missing image
            rather than as a hidden one — a cup says it without explaining. */}
        <Die face={1} size={36} />
        <Die face={5} size={36} />
        <Cup tone="var(--p6)" size={34} />
      </div>
      <h1 className="home__title">Perudo</h1>
      <p className="home__greeting">Playing as {name}</p>

      {openTable !== null && (
        <button
          type="button"
          className="home__resume"
          onClick={() => navigate(`/room/${openTable.roomId}`)}
        >
          <span className="home__resume-label">Back to your table</span>
          <span className="home__resume-code">{openTable.code}</span>
        </button>
      )}

      <Button onClick={() => void onCreate()} busy={busy === 'create'}>
        {busy === 'create' ? 'Setting the table…' : 'Create room'}
      </Button>

      <div className="home__divider">
        <span>or join one</span>
      </div>

      <form className="home__join" onSubmit={onJoin}>
        {/* Six characters now, and five still accepted: codes minted before
            the sixth was added are in links being passed around this minute,
            and rooms are short-lived enough that they age out within a day. */}
        <input
          className="home__code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ROOM CODE"
          maxLength={6}
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

      {/* Offered last and quietly: most people opening this have been handed a
          code by a friend and want to be at the table, not in a lesson. The
          one who needs it is the one who has just been invited to a game they
          have never heard of, and they will read the whole screen. */}
      <div className="home__alone">
        <button type="button" className="home__learn" onClick={() => navigate('/learn')}>
          Never played? Learn in two minutes
        </button>
        {/* Nobody around, or a hand to warm up on. The same table and the same
            bots as the tutorial, with nobody talking over it. */}
        <button type="button" className="home__learn" onClick={() => navigate('/solo')}>
          Play against bots
        </button>
      </div>
    </div>
  )
}
