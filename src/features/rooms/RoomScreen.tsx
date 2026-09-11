import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '../../components/Button'
import { ConnectionDot } from '../../components/ConnectionDot'
import { Die } from '../../components/Die'
import { useAuth } from '../auth/useAuth'
import { endRoom, fetchGame, kickPlayer, leaveRoom, returnToLobby, startGame } from './api'
import { Countdown } from './Countdown'
import { toRoomError } from './errors'
import { GameView } from './GameView'
import { RoomCode } from './RoomCode'
import { RoomTable } from './RoomTable'
import { useRoom } from './useRoom'
import { MIN_PLAYERS, SEAT_COUNT } from './types'
import type { GamePlayer, Seat } from './types'
import './RoomScreen.css'

/**
 * One room, whatever it happens to be doing.
 *
 * The room's status is the only thing that decides which view appears, and it
 * comes from the database — so every client switches at the same moment,
 * without anyone telling them to.
 */
export function RoomScreen() {
  const { roomId = null } = useParams()
  const navigate = useNavigate()
  const { state } = useAuth()
  const youId = state.status === 'ready' ? state.userId : null

  const { view, connection, refresh } = useRoom(roomId, youId)
  const [players, setPlayers] = useState<GamePlayer[]>([])
  const [pendingKick, setPendingKick] = useState<Seat | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [counting, setCounting] = useState(false)

  const status = view.status === 'ready' ? view.room.status : null
  const sawGame = useRef(false)

  // The game's own roster, which the room view does not carry.
  useEffect(() => {
    if (roomId === null || youId === null) return
    if (status !== 'in_game' && status !== 'finished') return

    let stale = false
    fetchGame(roomId, youId)
      .then((result) => {
        if (!stale && result !== null) setPlayers(result.players)
      })
      .catch(() => {
        // The room view already reports anything that matters; a roster that
        // fails to load is not worth a second error on the same screen.
      })
    return () => {
      stale = true
    }
  }, [roomId, youId, status])

  // The countdown runs on the *transition* into a game, not on its presence —
  // otherwise refreshing mid-game would replay it.
  useEffect(() => {
    if (status === 'in_game' && !sawGame.current) {
      sawGame.current = true
      setCounting(true)
    }
    if (status === 'lobby') sawGame.current = false
  }, [status])

  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true)
      setError(null)
      try {
        await action()
        await refresh()
      } catch (caught) {
        setError(toRoomError(caught).message)
      }
      setBusy(false)
    },
    [refresh],
  )

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

  if (counting) {
    return (
      <div className="lobby__centered">
        <Countdown onDone={() => setCounting(false)} />
      </div>
    )
  }

  return (
    <div className="lobby">
      {room.status === 'lobby' && <RoomCode code={room.code} />}

      <div className="lobby__status">
        <p className="lobby__count">
          {room.status === 'lobby'
            ? `${seats.length} / ${SEAT_COUNT} players`
            : room.status === 'finished'
              ? 'Game over'
              : 'Game in progress'}
        </p>
        <ConnectionDot connection={connection} />
      </div>

      {room.status === 'lobby' ? (
        <RoomTable seats={seats} canManage={youAreHost} onManage={setPendingKick} />
      ) : (
        <GameView players={players} />
      )}

      {error !== null && (
        <p className="lobby__error" role="alert">
          {error}
        </p>
      )}

      <div className="lobby__controls">
        {youAreHost && room.status === 'lobby' && (
          <>
            <Button
              disabled={!enough}
              busy={busy}
              onClick={() => void act(() => startGame(room.id))}
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
        )}

        {youAreHost && room.status === 'finished' && (
          <Button busy={busy} onClick={() => void act(() => returnToLobby(room.id))}>
            Play again
          </Button>
        )}

        {!youAreHost && room.status === 'lobby' && (
          <p className="lobby__muted">Waiting for the host to start</p>
        )}
        {!youAreHost && room.status === 'finished' && (
          <p className="lobby__muted">Waiting for the host to set up another game</p>
        )}

        {youAreHost && room.status !== 'closed' && (
          <button type="button" className="lobby__leave" onClick={() => setConfirmEnd(true)}>
            End room
          </button>
        )}
        {!youAreHost && (
          <button
            type="button"
            className="lobby__leave"
            onClick={() =>
              void act(async () => {
                await leaveRoom(room.id)
                navigate('/')
              })
            }
          >
            Leave room
          </button>
        )}
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
              <button
                type="button"
                className="sheet__danger"
                onClick={() => {
                  const target = pendingKick
                  setPendingKick(null)
                  if (target !== null) void act(() => kickPlayer(room.id, target.user_id))
                }}
              >
                Remove
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={confirmEnd} onOpenChange={setConfirmEnd}>
        <Dialog.Portal>
          <Dialog.Overlay className="sheet__overlay" />
          <Dialog.Content className="sheet">
            <Dialog.Title className="sheet__title">End this room?</Dialog.Title>
            <Dialog.Description className="sheet__body">
              Everyone leaves the table and the room closes for good. Any game
              still running is abandoned.
            </Dialog.Description>
            <div className="sheet__actions">
              <Dialog.Close asChild>
                <button type="button" className="sheet__cancel">
                  Keep playing
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="sheet__danger"
                onClick={() => {
                  setConfirmEnd(false)
                  void act(async () => {
                    await endRoom(room.id)
                    navigate('/')
                  })
                }}
              >
                End room
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
