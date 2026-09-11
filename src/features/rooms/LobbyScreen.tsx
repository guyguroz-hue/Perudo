import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '../../components/Button'
import { Die } from '../../components/Die'
import { useAuth } from '../auth/useAuth'
import { kickPlayer, leaveRoom } from './api'
import { toRoomError } from './errors'
import { RoomCode } from './RoomCode'
import { RoomTable } from './RoomTable'
import { useRoom } from './useRoom'
import { MIN_PLAYERS, SEAT_COUNT } from './types'
import type { Seat } from './types'
import './LobbyScreen.css'

export function LobbyScreen() {
  const { roomId = null } = useParams()
  const navigate = useNavigate()
  const { state } = useAuth()
  const youId = state.status === 'ready' ? state.userId : null

  const { view, refresh } = useRoom(roomId, youId)
  const [pendingKick, setPendingKick] = useState<Seat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (view.status === 'loading') {
    return (
      <div className="lobby__centered">
        <div className="lobby__dice" aria-hidden="true">
          <Die face={2} size={32} />
          <Die face={4} size={32} />
        </div>
        <p>Pulling up a chair…</p>
      </div>
    )
  }

  if (view.status === 'gone') {
    return (
      <div className="lobby__centered" role="alert">
        {/* A network blip is not a room ending, and saying so would be a lie. */}
        <h2>{view.retryable ? 'Could not load the room' : 'That room is closed'}</h2>
        <p className="lobby__muted">{view.message}</p>
        {view.detail !== null && <p className="lobby__detail">{view.detail}</p>}
        {view.retryable && <Button onClick={() => void refresh()}>Try again</Button>}
        <button type="button" className="lobby__leave" onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    )
  }

  const { room, seats } = view
  const youAreHost = room.host_id === youId
  const enough = seats.length >= MIN_PLAYERS

  async function onLeave() {
    if (roomId === null) return
    try {
      await leaveRoom(roomId)
    } catch (caught) {
      setError(toRoomError(caught).message)
      return
    }
    navigate('/')
  }

  async function onKick() {
    if (roomId === null || pendingKick === null) return
    try {
      await kickPlayer(roomId, pendingKick.user_id)
      // Do not wait for Realtime to tell us what we just did.
      await refresh()
    } catch (caught) {
      setError(toRoomError(caught).message)
    }
    setPendingKick(null)
  }

  return (
    <div className="lobby">
      <RoomCode code={room.code} />

      <p className="lobby__count">
        {seats.length} / {SEAT_COUNT} players
      </p>

      <RoomTable seats={seats} canManage={youAreHost} onManage={setPendingKick} />

      {error !== null && (
        <p className="lobby__error" role="alert">
          {error}
        </p>
      )}
      {notice !== null && <p className="lobby__muted">{notice}</p>}

      <div className="lobby__controls">
        {youAreHost ? (
          <>
            <Button
              disabled={!enough}
              // TEMPORARY (TODO T-28): starting a game is milestone 6. The
              // button's enablement is real; the action behind it is not yet.
              onClick={() => setNotice('Starting a game arrives in the next step.')}
            >
              Start game
            </Button>
            {!enough && (
              <p className="lobby__muted">
                {MIN_PLAYERS - seats.length} more{' '}
                {MIN_PLAYERS - seats.length === 1 ? 'player' : 'players'} to start
              </p>
            )}
          </>
        ) : (
          <p className="lobby__muted">Waiting for the host to start</p>
        )}

        <button type="button" className="lobby__leave" onClick={() => void onLeave()}>
          Leave room
        </button>
      </div>

      <Dialog.Root
        open={pendingKick !== null}
        onOpenChange={(open) => !open && setPendingKick(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="sheet__overlay" />
          <Dialog.Content className="sheet">
            <Dialog.Title className="sheet__title">
              Remove {pendingKick?.display_name}?
            </Dialog.Title>
            <Dialog.Description className="sheet__body">
              They will lose their seat and cannot rejoin this room.
            </Dialog.Description>
            <div className="sheet__actions">
              <Dialog.Close asChild>
                <button type="button" className="sheet__cancel">
                  Cancel
                </button>
              </Dialog.Close>
              <button type="button" className="sheet__danger" onClick={() => void onKick()}>
                Remove
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
