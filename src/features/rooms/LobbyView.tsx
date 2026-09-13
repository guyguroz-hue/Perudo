import { Button } from '../../components/Button'
import { ConnectionDot } from '../../components/ConnectionDot'
import { RoomCode } from './RoomCode'
import { RoomTable } from './RoomTable'
import { MIN_PLAYERS, SEAT_COUNT } from './types'
import type { RoomStatus, Seat } from './types'
import type { Connection } from './useRoom'
import type { ReactNode } from 'react'
import './RoomScreen.css'

/**
 * The lobby, with nothing behind it.
 *
 * Split out from `RoomScreen` so the screen people spend the longest looking
 * at — waiting for a fourth friend to join — can be looked at without a room,
 * a session or a network. `RoomScreen` keeps the state, the effects and the
 * confirmations; everything here is what that state looks like.
 *
 * The split is not decoration. A lobby rendered only through a live room can
 * be reviewed at exactly one table size, on whatever the database happens to
 * hold, and the five-people-and-one-empty-chair case — the one that decides
 * whether a badge collides with a cup — is the hardest to arrange and the most
 * likely to be wrong.
 */
export interface LobbyViewProps {
  readonly code: string
  readonly status: RoomStatus
  readonly seats: readonly Seat[]
  readonly connection: Connection
  readonly youAreHost: boolean
  readonly busy: boolean
  readonly error: string | null
  onStart: () => void
  onPlayAgain: () => void
  onManage: (seat: Seat) => void
  onEnd: () => void
  onLeave: () => void
  /** The game, once there is one. The lobby does not know how to make one. */
  readonly children?: ReactNode
}

export function LobbyView({
  code,
  status,
  seats,
  connection,
  youAreHost,
  busy,
  error,
  onStart,
  onPlayAgain,
  onManage,
  onEnd,
  onLeave,
  children,
}: LobbyViewProps) {
  const inLobby = status === 'lobby'
  const short = MIN_PLAYERS - seats.length

  return (
    <div className="lobby">
      <div className="lobby__head">
        {inLobby && <RoomCode code={code} />}

        <div className="lobby__status">
          {inLobby ? (
            <>
              {/* The seats taken, drawn as well as counted. Six pips is the
                  whole table, so how close the room is to a game is legible
                  without reading the number beside them. */}
              <span className="lobby__pips" aria-hidden="true">
                {Array.from({ length: SEAT_COUNT }, (_, index) => (
                  <span
                    key={index}
                    className={`lobby__pip${index < seats.length ? ' lobby__pip--taken' : ''}`}
                  />
                ))}
              </span>
              <p className="lobby__count">
                {seats.length} / {SEAT_COUNT} players
              </p>
            </>
          ) : (
            <p className="lobby__count">
              {status === 'finished' ? 'Game over' : 'Game in progress'}
            </p>
          )}
          <ConnectionDot connection={connection} />
        </div>
      </div>

      {inLobby ? (
        <RoomTable seats={[...seats]} canManage={youAreHost} onManage={onManage} />
      ) : (
        children
      )}

      {error !== null && (
        <p className="lobby__error" role="alert">
          {error}
        </p>
      )}

      <div className="lobby__controls">
        {youAreHost && inLobby && (
          <>
            <Button disabled={short > 0} busy={busy} onClick={onStart}>
              Start game
            </Button>
            {short > 0 && (
              <p className="lobby__muted">
                {short} more {short === 1 ? 'player' : 'players'} to start
              </p>
            )}
          </>
        )}

        {youAreHost && status === 'finished' && (
          <Button busy={busy} onClick={onPlayAgain}>
            Play again
          </Button>
        )}

        {!youAreHost && inLobby && <p className="lobby__muted">Waiting for the host to start</p>}
        {!youAreHost && status === 'finished' && (
          <p className="lobby__muted">Waiting for the host to set up another game</p>
        )}

        {youAreHost && status !== 'closed' && (
          <button type="button" className="lobby__leave" onClick={onEnd}>
            End room
          </button>
        )}
        {!youAreHost && (
          <button type="button" className="lobby__leave" onClick={onLeave}>
            Leave room
          </button>
        )}
      </div>
    </div>
  )
}
