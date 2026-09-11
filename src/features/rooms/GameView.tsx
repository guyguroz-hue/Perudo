import { Die } from '../../components/Die'
import type { GamePlayer } from './types'
import './GameView.css'

/**
 * The table during a game.
 *
 * PLACEHOLDER (TODO T-29). It shows who is playing and how many dice each of
 * them holds — which is public information and genuinely useful — but there is
 * no play here yet.
 *
 * The screens that replace it are built and can be seen at /preview:
 * `features/game/GameTable` for play and `features/game/Reveal` for the
 * resolution. What is missing is not the UI but the round state to drive it —
 * whose turn, the current bid, your own dice — none of which a client may
 * invent. That arrives with the action layer (D-002).
 *
 * Note what it deliberately does NOT show: anybody's dice faces. Other players'
 * cups are drawn face down because the client has never been told what is in
 * them, not because the faces are hidden in the markup.
 */
export function GameView({ players }: { players: GamePlayer[] }) {
  return (
    <div className="game">
      <p className="game__note">The table is set. Play arrives with the next phase.</p>

      <ul className="game__players">
        {players.map((player) => (
          <li
            key={player.user_id}
            className={`game__player${player.is_eliminated ? ' game__player--out' : ''}`}
          >
            <span className="game__name">
              {player.display_name}
              {player.is_you && <span className="game__you"> (you)</span>}
            </span>
            <span className="game__dice" aria-label={`${player.dice_count} dice`}>
              {Array.from({ length: player.dice_count }, (_, i) => (
                <Die key={i} hidden size={22} label="Hidden die" />
              ))}
              {player.is_eliminated && <span className="game__out">out</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
