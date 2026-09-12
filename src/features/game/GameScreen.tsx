import { useEffect, useRef, useState } from 'react'
import { ConnectionDot } from '../../components/ConnectionDot'
import { GameTable } from './GameTable'
import { Finish } from './Finish'
import { Reveal } from './Reveal'
import { PERUDO } from '../../game'
import { openRound } from './api'
import { toGameError } from './errors'
import { claimFor, standingsFor } from './reveal'
import type { RevealClaim } from './reveal'
import { useGame } from './useGame'
import type { TableView } from './view'
import './GameScreen.css'

/**
 * A game in progress.
 *
 * Two screens, and which one is showing is the whole state machine: the table,
 * or the reveal over it. A reveal is not a dialog — it takes the screen,
 * because while the cups are coming off there is nothing else to look at and
 * nothing else to do.
 */
export function GameScreen({ gameId, youId }: { gameId: string; youId: string }) {
  const game = useGame(gameId, youId)
  const [opening, setOpening] = useState<string | null>(null)

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
    asked.current = true

    openRound(gameId)
      .then(() => game.refresh())
      .catch((caught: unknown) => {
        const failure = toGameError(caught)
        // Another player opened it first, which is the race working.
        if (failure.code === 'ROUND_ALREADY_OPEN') return void game.refresh()
        setOpening(failure.message)
      })
  }, [gameId, game])

  if (game.view === null) {
    return <p className="game__waiting">Setting the table…</p>
  }

  // The reveal still plays over a finished game: the hand that ended it is the
  // one most worth seeing, and cutting to a result screen would skip it.
  if (game.over !== null && game.reveal === null) {
    return <Finish winnerName={game.over.winnerName} view={game.view} />
  }

  if (game.reveal !== null) {
    return (
      <Reveal
        standings={
          game.reveal.data === null
            ? game.view.players.map((player) => ({
                id: player.id,
                name: player.name,
                diceCount: player.diceCount,
              }))
            : standingsFor(game.reveal.data)
        }
        claim={
          game.reveal.data === null
            ? claimFromTable(game.view)
            : claimFor(game.reveal.data)
        }
        data={game.reveal.data}
        onDone={game.dismissReveal}
      />
    )
  }

  return (
    <div className="game">
      <div className="game__bar">
        <ConnectionDot connection={game.connection} />
      </div>

      {opening !== null && (
        <p className="game__blocked" role="alert">
          {opening}
        </p>
      )}
      {game.error !== null && (
        <p className="game__error" role="alert">
          {game.error}
        </p>
      )}

      <GameTable
        view={game.view}
        busy={game.busy}
        onBid={(bid) => void game.bid(bid)}
        onDudo={() => void game.doubt()}
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
