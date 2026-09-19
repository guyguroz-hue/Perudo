import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { GameTable } from './GameTable'
import { Finish } from './Finish'
import { PERUDO } from '../../game'
import { openRound } from './api'
import { toGameError } from './errors'
import { Notice } from './Notice'
import { claimFor } from './reveal'
import type { RevealClaim } from './reveal'
import { useGame } from './useGame'
import type { TableView } from './view'
import './GameScreen.css'

/**
 * A game in progress.
 *
 * One screen: the table, from the first deal to the last die. A reveal is not
 * another screen and not a dialog — it happens on this table, the cups coming
 * off where they stand, with the controls giving way to the count underneath.
 * Nor is the end of the game: the standings take the same place the controls
 * had, and the table stays where it is with one cup still standing on it.
 */
export function GameScreen({
  gameId,
  youId,
  roomMenu = null,
}: {
  gameId: string
  youId: string
  /** Leaving the room, handed down to the table's own corner. */
  roomMenu?: ReactNode
}) {
  const game = useGame(gameId, youId)
  /*
   * Why the table never arrived.
   *
   * The code travels with the message because the two failures that land here
   * want opposite things from the player. A rule the house has not decided
   * (R-002) will refuse identically forever, and offering a retry for it is a
   * lie. Anything else — a dropped request, a function cold-starting past its
   * timeout — is worth pressing again, and without something to press the
   * player is left watching a game that never began.
   */
  const [opening, setOpening] = useState<{ code: string; message: string } | null>(null)

  // The only moment a running game has no round is immediately after it starts:
  // every later round is dealt by the resolution that ended the previous one.
  // So this runs once, and the unique index on live rounds settles the race if
  // several clients arrive at the same instant.
  //
  // A finished game also has no round, and asking to open one there would be a
  // request the server can only refuse.
  const asked = useRef(false)
  useEffect(() => {
    if (game.view === null || game.view.roundNumber !== 0) return
    if (game.over !== null || asked.current) return
    /*
     * And not if you are only watching.
     *
     * Opening a round is a player's request and the server refuses it from
     * anybody else — rightly. Asked by a spectator it would come back as
     * NOT_A_PLAYER and be put on screen as a game that would not start, which
     * is a confusing thing to tell somebody who is not trying to start one.
     */
    if (!game.view.players.some((player) => player.isYou)) return
    asked.current = true

    openRound(gameId)
      .then(() => game.refresh())
      .catch((caught: unknown) => {
        const failure = toGameError(caught)
        // Another player opened it first, which is the race working.
        if (failure.code === 'ROUND_ALREADY_OPEN') return void game.refresh()
        // Anything else has not opened a round, so the game has not started
        // and nobody else will start it for this client. The ask stays spent —
        // this effect re-runs on every render, so releasing it here would
        // retry in a loop — and the player is given the retry instead.
        setOpening({ code: failure.code, message: failure.message })
      })
  }, [gameId, game])

  if (game.view === null) {
    return <p className="game__waiting">Setting the table…</p>
  }

  return (
    <div className="game">
      {opening !== null && (
        <div className="game__blocked" role="alert">
          <p>{opening.message}</p>
          {opening.code !== 'UNRESOLVED_RULE' && (
            <button
              type="button"
              className="game__retry"
              onClick={() => {
                setOpening(null)
                asked.current = false
                void game.refresh()
              }}
            >
              Try again
            </button>
          )}
        </div>
      )}
      {game.error !== null && (
        /*
         * One small thing that goes away by itself.
         *
         * This was two: a red slab across the table for a refusal, which stayed
         * until the player's next move, and a quieter one for news. Both were
         * the width of the screen, and the red one was reported as the worst of
         * it — "you cannot get it off the screen and it does not move until you
         * bid again", on a table where what it had just said was that the bid
         * did not take.
         *
         * The clock lives inside `Notice`, so the preview shows the same
         * element behaving the same way rather than a picture of it.
         */
        <Notice notice={game.error} onDismiss={game.dismissError} />
      )}

      <GameTable
        connection={game.connection}
        roomMenu={roomMenu}
        view={game.view}
        busy={game.busy}
        pending={game.pending}
        /*
         * The reveal still plays over a finished game: the hand that ended it
         * is the one most worth seeing, and cutting to a result would skip it.
         * Once it has, the standings take the dock and the table stays where
         * it is — a game ends at the table it was played on.
         */
        finish={
          game.over !== null && game.reveal === null ? (
            <Finish
              winnerName={game.over.winnerName}
              winnerId={game.over.winnerId}
              view={game.view}
            />
          ) : null
        }
        reveal={
          game.reveal === null
            ? null
            : {
                // The claim comes off the table until the server answers: the
                // bid and any Bull on it are public and already on screen, so
                // the pause shows exactly what is being tested.
                claim:
                  game.reveal.data === null
                    ? claimFromTable(game.view)
                    : claimFor(game.reveal.data),
                data: game.reveal.data,
                onDone: game.dismissReveal,
              }
        }
        onBid={(bid) => void game.bid(bid)}
        onLie={() => void game.doubt()}
        onBull={() => void game.bull()}
      />
    </div>
  )
}

/**
 * The claim under trial, read off the table itself.
 *
 * Used only while a challenge is in flight. The bid and any Bull on it are
 * public and already on screen, so the pause can show exactly what is being
 * tested before the server has said anything about it.
 */
function claimFromTable(view: TableView): RevealClaim {
  const bid = view.round.bid
  return {
    quantity: bid?.quantity ?? 0,
    face: bid?.face ?? PERUDO,
    reading: bid?.bull == null ? 'at least' : 'exactly',
  }
}
