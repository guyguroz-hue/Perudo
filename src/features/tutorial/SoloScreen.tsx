import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameTable } from '../game/GameTable'
import { claimFor } from '../game/reveal'
import { useBotTable } from './useBotTable'
import './TutorialScreen.css'

/**
 * A practice game.
 *
 * The tutorial without the tutoring: the same table, the same bots, nobody
 * talking over it. It exists because learning the rules and getting a feel for
 * them are different things, and the second one takes more than ten cards —
 * and because sometimes there is nobody else around.
 *
 * Like the tutorial it runs entirely in this tab and reaches nothing, so it
 * needs no room and no sign-in. It is a real game: the bots are handed their
 * own dice and the public state and nothing else, so they are playing the same
 * game the player is, with the same information a person in that seat would
 * have.
 */
export function SoloScreen() {
  const navigate = useNavigate()
  const names = useMemo(() => ['You', 'Ada', 'Bo', 'Cy'], [])
  const game = useBotTable({ names })
  const you = game.state.seats.find((s) => s.isYou)
  const won = game.state.over && game.state.winnerId === 'you'

  return (
    <div className="learn">
      <GameTable
        view={game.view}
        reveal={
          game.reveal === null
            ? null
            : { claim: claimFor(game.reveal), data: game.reveal, onDone: game.dismissReveal }
        }
        onBid={game.place}
        onLie={game.doubt}
        onBull={game.callBull}
      />

      {game.refused !== null && (
        <p className="learn__refused" role="status">
          {game.refused}
        </p>
      )}

      {game.state.over && (
        <aside className="coach coach--done" role="status">
          <h2 className="coach__title">{won ? 'You won' : 'Out of dice'}</h2>
          <p className="coach__body">
            {won
              ? 'Last one holding dice, against three of them.'
              : `${game.state.seats.find((s) => s.id === game.state.winnerId)?.name ?? 'Nobody'} took it. The table only has to be wrong about you once.`}
          </p>
          <div className="coach__ends">
            <button type="button" className="coach__next" onClick={game.restart}>
              Again
            </button>
            <button type="button" className="coach__leave" onClick={() => navigate('/')}>
              Done
            </button>
          </div>
        </aside>
      )}

      {!game.state.over && you !== undefined && (
        <button type="button" className="learn__leave" onClick={() => navigate('/')}>
          Leave the practice table
        </button>
      )}
    </div>
  )
}
