import type { CSSProperties } from 'react'
import { Cup } from '../../components/Cup'
import type { CupState } from '../../components/Cup'
import { Die } from '../../components/Die'
// A player's colour follows the seat they took in the room, not their place in
// whatever order this list happens to be in, so it never changes when somebody
// is eliminated and the list shortens.
import { toneForSeat } from './colors'
import type { SeatPlacement } from './seating'
import './PlayerSeat.css'

/**
 * One player, at their place on the table.
 *
 * Their cup and their name are one object, not a card floating beside the
 * table — the point of seating people is that identity is attached to a
 * position, and a player recognises Dana by the purple cup in the upper left
 * before they read the word "Dana".
 *
 * The dice beside the name are a count, in the player's colour. They are blanks
 * because the values were never sent to this browser.
 */
export function PlayerSeat({
  placement,
  cup,
}: {
  placement: SeatPlacement
  cup: CupState
}) {
  const { player, left, top, scale, depth, side } = placement
  const tone = toneForSeat(player.seatIndex)

  // The cup stands on this point, so the seat is anchored at its own bottom
  // centre rather than at its middle.
  const style = {
    left,
    top,
    zIndex: depth,
    '--pseat-scale': scale.toFixed(3),
  } as CSSProperties

  return (
    <li
      className={[
        'pseat',
        `pseat--${side}`,
        player.hasTurn && !player.isEliminated ? 'pseat--turn' : '',
        player.isEliminated ? 'pseat--out' : '',
        player.isYou ? 'pseat--you' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <span className="pseat__cup">
        {player.isEliminated ? (
          <span className="pseat__empty" aria-hidden="true" />
        ) : (
          <Cup tone={tone} state={cup} active={player.hasTurn} size="var(--pseat-cup)" label="" />
        )}
      </span>

      <span className="pseat__tag" style={{ '--pseat-tone': tone } as CSSProperties}>
        <span className="pseat__name">{player.name}</span>
        {player.isEliminated ? (
          <span className="pseat__gone">out</span>
        ) : (
          <span className="pseat__count" aria-label={`${player.diceCount} dice`}>
            <span className="pseat__number">{player.diceCount}</span>
            <span className="pseat__pips" aria-hidden="true">
              {Array.from({ length: player.diceCount }, (_, i) => (
                <Die key={i} hidden tone={tone} size={9} label="" />
              ))}
            </span>
          </span>
        )}
      </span>
    </li>
  )
}
