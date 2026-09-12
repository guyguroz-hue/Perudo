import type { TableView } from './view'
import './Finish.css'

/**
 * How the game ended.
 *
 * `winnerName` is null when nobody won. That is a real outcome and not a
 * missing value: if the last players are eliminated in the same resolution the
 * game ends with no winner rather than one awarded on a tiebreak (R-004).
 */
export function Finish({ winnerName, view }: { winnerName: string | null; view: TableView }) {
  const you = view.players.find((player) => player.isYou)

  return (
    <div className="finish" role="status">
      <p className="finish__crown" aria-hidden="true">
        ✦
      </p>
      <h2 className="finish__who">
        {winnerName === null
          ? 'Nobody won'
          : you?.name === winnerName
            ? 'You won'
            : `${winnerName} won`}
      </h2>
      <p className="finish__note">
        {winnerName === null
          ? 'The last players went out together, so the game ends with no winner.'
          : 'Last one holding dice.'}
      </p>

      <ul className="finish__standings">
        {view.players.map((player) => (
          <li key={player.id} className={player.name === winnerName ? 'finish__winner' : ''}>
            <span>
              {player.name}
              {player.isYou && <span className="finish__you"> (you)</span>}
            </span>
            <span>{player.diceCount === 0 ? 'out' : `${player.diceCount} left`}</span>
          </li>
        ))}
      </ul>

      <p className="finish__next">The host can start another game from the room.</p>
    </div>
  )
}
