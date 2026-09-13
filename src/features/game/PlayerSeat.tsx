import type { CSSProperties } from 'react'
import { Die } from '../../components/Die'
// A player's colour follows the seat they took in the room, not their place in
// whatever order this list happens to be in, so it never changes when somebody
// is eliminated and the list shortens.
import { toneForSeat } from './colors'
import { badgeAnchor } from '../../three/layout'
import type { SeatPlacement } from './seating'
import '../../components/TableBadge.css'
import './PlayerSeat.css'

/**
 * A player, at their place around the table.
 *
 * Ordinary DOM standing outside the table's rim, projected to exactly where
 * that person would be sitting. It is not drawn into the scene, because a name
 * that shrank with distance would be unreadable at the far side and a name
 * that did not would look pasted on — this way the table has perspective and
 * the writing does not.
 *
 * The dice beside the name are a count, in the player's colour. They are blanks
 * because the values were never sent to this browser.
 */
export function PlayerSeat({
  placement,
  lifted = 0,
  overhead = 0,
}: {
  placement: SeatPlacement
  /** How far the cups are off the table, 0 to 1, which the badges follow. */
  lifted?: number
  /**
   * Where the eye is this frame, 0 at a seat and 1 straight overhead.
   *
   * Placed here rather than baked into the placement on purpose. The camera
   * rises during a reveal, so a badge's position changes sixty times a second
   * while the placement itself — who is sitting where — does not, and handing
   * the renderer a freshly computed seat list at that rate makes it rebuild
   * every cup on the table each frame.
   */
  overhead?: number
}) {
  const { player, index, count } = placement
  const tone = toneForSeat(player.seatIndex)
  const style = {
    ...badgeAnchor(index, count, lifted, overhead),
    '--seat-tone': tone,
  } as CSSProperties
  /*
   * Overhead, the dice are on the table.
   *
   * The blanks beside a name are a stand-in for a hand nobody can see. Once
   * the eye is above the table every die is there to be looked at, so the
   * stand-in is not just redundant, it is six extra objects competing with the
   * thing it was standing in for.
   */
  const aerial = overhead > 0.5

  // You are not a face across the table from yourself. Your seat says what the
  // table is waiting for; your dice are in your hand below.
  if (player.isYou) {
    return (
      <li
        className={`badge badge--you${player.hasTurn ? ' badge--turn' : ''}${aerial ? ' badge--aerial' : ''}`}
        style={style}
      >
        <span className="badge__status">
          {player.isEliminated ? 'Out' : player.hasTurn ? 'Your turn' : 'You'}
        </span>
      </li>
    )
  }

  return (
    <li
      className={[
        'badge',
        player.hasTurn && !player.isEliminated ? 'badge--turn' : '',
        player.isEliminated ? 'badge--out' : '',
        aerial ? 'badge--aerial' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <span className="badge__avatar" aria-hidden="true">
        {initials(player.name)}
      </span>
      <span className="badge__tag">
        <span className="badge__name">{player.name}</span>
        {player.isEliminated ? (
          <span className="badge__gone">out</span>
        ) : (
          <span className="badge__dice" aria-label={`${player.diceCount} dice`}>
            {Array.from({ length: player.diceCount }, (_, i) => (
              <Die key={i} hidden tone={tone} size={10} label="" />
            ))}
          </span>
        )}
      </span>
    </li>
  )
}

/**
 * Up to two letters, taken the way a person would say a name.
 *
 * Players type their own display name, so this has to cope with one word, three
 * words, an emoji, or a script with no capitals at all — `Intl.Segmenter` takes
 * the first character of a word rather than the first code unit, which is the
 * difference between "אב" and half a surrogate pair.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'

  const first = firstCharacter(words[0])
  if (words.length === 1) return first.toUpperCase()
  return (first + firstCharacter(words[words.length - 1])).toUpperCase()
}

function firstCharacter(word: string): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter()
    for (const { segment } of segmenter.segment(word)) return segment
  }
  return [...word][0] ?? ''
}
