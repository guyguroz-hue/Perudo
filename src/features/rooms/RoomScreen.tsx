import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Die } from '../../components/Die'
import { useAuth } from '../auth/useAuth'
import {
  answerSeatRequest,
  askForSeat,
  endRoom,
  fetchGame,
  kickPlayer,
  leaveRoom,
  returnToLobby,
  startGame,
} from './api'
import { Button } from '../../components/Button'
import { Countdown } from './Countdown'
import { toRoomError } from './errors'
import { GameScreen } from '../game/GameScreen'
import { LobbyView } from './LobbyView'
import { SeatRequest } from './SeatRequest'
import { useRoom } from './useRoom'
import { SEAT_COUNT } from './types'
import type { Seat } from './types'
import './RoomScreen.css'

/**
 * One room, whatever it happens to be doing.
 *
 * The room's status is the only thing that decides which view appears, and it
 * comes from the database — so every client switches at the same moment,
 * without anyone telling them to.
 */
/**
 * The longest this waits between asking which game is being played here.
 *
 * Long enough not to hammer a server that is having a moment, short enough
 * that a player who hit one is back in the game within a round.
 */
const FIND_GAME_MAX_WAIT_MS = 5000

export function RoomScreen() {
  const { roomId = null } = useParams()
  const navigate = useNavigate()
  const { state } = useAuth()
  const youId = state.status === 'ready' ? state.userId : null

  const { view, connection, refresh } = useRoom(roomId, youId)
  const [gameId, setGameId] = useState<string | null>(null)
  const [pendingKick, setPendingKick] = useState<Seat | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [counting, setCounting] = useState(false)

  const status = view.status === 'ready' ? view.room.status : null
  const sawGame = useRef(false)

  // Which game is being played here. The room view does not carry it, and the
  // game screen reads everything else for itself.
  useEffect(() => {
    if (roomId === null || youId === null) return
    if (status !== 'in_game' && status !== 'finished') return

    /*
     * Keep asking until the answer comes.
     *
     * This ran once and swallowed everything it did not like — a request that
     * failed, and equally an answer of `null`, which is what a room that has
     * only just gone `in_game` returns while its game row is still on its way.
     * Either left `gameId` unset, and nothing would ever set it: the effect
     * depends on the room, the player and the status, and none of those is
     * going to change again. That client sat on "Finding the game…" for the
     * rest of the evening while everybody else played.
     *
     * Backing off rather than hammering, because whatever went wrong is more
     * likely to be a moment than a fault, and giving up is the one response
     * that cannot be recovered from.
     */
    let stale = false
    let attempt = 0
    let retry: ReturnType<typeof setTimeout> | undefined

    const find = () => {
      fetchGame(roomId, youId)
        .then((result) => {
          if (stale) return
          if (result !== null) {
            setGameId(result.game.id)
            return
          }
          again()
        })
        .catch(() => {
          // Not reported: the room view already says whatever matters about
          // this room, and a second error about the same moment helps nobody.
          if (!stale) again()
        })
    }

    const again = () => {
      attempt += 1
      retry = setTimeout(find, Math.min(1000 * 2 ** (attempt - 1), FIND_GAME_MAX_WAIT_MS))
    }

    find()
    return () => {
      stale = true
      clearTimeout(retry)
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

  const { room, seats, watchers } = view
  const youAreHost = room.host_id === youId

  /*
   * Whoever has been waiting longest, and only one of them.
   *
   * Two friends turning up at once is a real thing at a party and a stack of
   * cards over the table is not an answer to it: the host deals with one
   * person, and the next card is the next question.
   */
  const asking = youAreHost
    ? (watchers
        .filter((watcher) => watcher.asked_at !== null)
        .sort((a, b) => (a.asked_at ?? '').localeCompare(b.asked_at ?? ''))[0] ?? null)
    : null

  const youAreWatching = watchers.some((watcher) => watcher.is_you)
  // A full table has no seat to give, so there is nothing to ask for. Saying so
  // with a button that cannot work would be worse than not offering it.
  const seatFree = seats.length < SEAT_COUNT

  if (counting) {
    return (
      <div className="lobby__centered">
        <Countdown onDone={() => setCounting(false)} />
      </div>
    )
  }

  // One way out of a room, asked for from two places now: the lobby's own row
  // and, during a game, the handle in the corner of the table.
  const leave = () =>
    void act(async () => {
      await leaveRoom(room.id)
      navigate('/')
    })

  return (
    <>
      <LobbyView
      code={room.code}
      status={room.status}
      seats={seats}
      connection={connection}
      youAreHost={youAreHost}
      busy={busy}
      error={error}
      onStart={() => void act(() => startGame(room.id))}
      onPlayAgain={() => void act(() => returnToLobby(room.id))}
      onManage={setPendingKick}
      onEnd={() => setConfirmEnd(true)}
      onLeave={leave}
      watchers={watchers}
      onAskForSeat={youAreWatching && seatFree ? () => void act(() => askForSeat(room.id)) : null}
    >
        {gameId === null ? (
          <p className="lobby__muted">Finding the game…</p>
        ) : (
          <GameScreen
            gameId={gameId}
            youId={youId as string}
            /* The room's one mid-game control, in the corner of the table
               rather than in a row underneath it. Same confirmation sheets
               either way — only where the handle sits has changed. */
            roomMenu={
              <button
                type="button"
                className="board__exit"
                onClick={() => (youAreHost ? setConfirmEnd(true) : leave())}
                aria-label={youAreHost ? 'End this room' : 'Leave this room'}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {/* A door with a way out of it: the one shape that cannot be
                      mistaken for a setting. */}
                  <path
                    d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13 12h7m0 0-2.8-2.8M20 12l-2.8 2.8"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            }
          />
        )}
      </LobbyView>

      {/*
        * A request reaches the host wherever they are.
        *
        * Outside `LobbyView` on purpose: during a game that component renders
        * the table and nothing else, and a row added above it would push the
        * whole board down — the table shrinking by a fifth to deliver a
        * question is the same fault the refusal notice was moved out of the
        * flow to avoid.
        */}
      {asking !== null && (
        <SeatRequest
          asker={asking}
          busy={busy}
          onApprove={() => void act(() => answerSeatRequest(room.id, asking.user_id, true))}
          onDecline={() => void act(() => answerSeatRequest(room.id, asking.user_id, false))}
        />
      )}

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
    </>
  )
}
