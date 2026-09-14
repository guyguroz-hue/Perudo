import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Crown } from '../../components/Crown'
import { Die } from '../../components/Die'
import { useSoundEffect } from '../../lib/useSound'
import { toneForSeat } from './colors'
import type { TableView } from './view'
import './Finish.css'

/**
 * How the game ended.
 *
 * The last thing anybody sees, and until now the one screen that still looked
 * like a different application: a bullet glyph and a list. It gets the game's
 * own crown, the players in their own colours, and the standing they finished
 * on — because the question a table asks at the end is never only who won, it
 * is how close the rest of them came.
 *
 * `winnerName` is null when nobody won. That is a real outcome and not a
 * missing value: if the last players are eliminated in the same resolution the
 * game ends with no winner rather than one awarded on a tiebreak (R-004).
 */
export function Finish({ winnerName, view }: { winnerName: string | null; view: TableView }) {
  const you = view.players.find((player) => player.isYou)
  const youWon = winnerName !== null && you?.name === winnerName
  const effect = useSoundEffect()

  // Once, on arrival. A result that announced itself again on every render
  // would be a result that never stops being announced.
  useEffect(() => {
    effect(winnerName === null ? 'tap' : 'win')
  }, [effect, winnerName])

  // Whoever held the most dice at the end sits at the top. The winner is there
  // by arithmetic rather than by being moved there.
  const standings = [...view.players].sort((a, b) => b.diceCount - a.diceCount)

  return (
    <div className={`finish${youWon ? ' finish--yours' : ''}`} role="status">
      <p className="finish__mark" aria-hidden="true">
        <Crown />
      </p>

      <h2 className="finish__who">
        {winnerName === null ? 'Nobody won' : youWon ? 'You won' : `${winnerName} won`}
      </h2>
      <p className="finish__note">
        {winnerName === null
          ? 'The last players went out together, so the game ends with no winner.'
          : 'Last one holding dice.'}
      </p>

      <ul className="finish__standings">
        {standings.map((player, place) => {
          const tone = toneForSeat(player.seatIndex)
          const won = winnerName !== null && player.name === winnerName
          return (
            <li
              key={player.id}
              className={`finish__place${won ? ' finish__place--won' : ''}`}
              // Counted from the bottom, so the rows land worst first and the
              // winner's arrives last — which is the order a table reads a
              // finish out loud in.
              style={
                {
                  '--seat-tone': tone,
                  '--place': standings.length - 1 - place,
                } as CSSProperties
              }
            >
              <span className="finish__name">
                <span className="finish__dot" aria-hidden="true" />
                {player.name}
                {player.isYou && <span className="finish__you">you</span>}
              </span>

              {player.diceCount === 0 ? (
                <span className="finish__out">out</span>
              ) : (
                <span className="finish__left" aria-label={`${player.diceCount} dice left`}>
                  {Array.from({ length: player.diceCount }, (_, i) => (
                    <Die key={i} hidden tone={tone} size={13} label="" />
                  ))}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <p className="finish__next">The host can start another game from the room.</p>
    </div>
  )
}
