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
  cutIn = false,
  talking = false,
  unheard = false,
}: {
  placement: SeatPlacement
  /**
   * True for the couple of seconds after this player cut in.
   *
   * The flash of light across the timber says somebody did; the line above the
   * dock says who. This is the third thing, and the one that answers "where" —
   * a player reading the line should be able to look up and find them without
   * matching a colour to six cups.
   */
  cutIn?: boolean
  /**
   * True while their voice is coming through.
   *
   * The reason voice belongs inside the game rather than beside it: a bid is a
   * performance, and knowing who is making it while they make it is most of
   * what reading a table is.
   */
  talking?: boolean
  /**
   * In the voice call, and their audio never arrived.
   *
   * Said out loud rather than left as quiet. Without a relay, two ends that are
   * both behind carrier-grade NAT cannot reach each other at all — ordinary on
   * mobile data — and the failure is indistinguishable from somebody choosing
   * not to talk.
   */
  unheard?: boolean
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
  /*
   * The projection places the badge; the stylesheet keeps it in the picture.
   *
   * `top` is handed over as a custom property rather than set directly, because
   * the badge has to be held off the edge of the frame by its own height — a
   * number of pixels the camera has no idea about and CSS knows exactly. The
   * `badge--near` class says which edge: a near chair hangs its badge below the
   * anchor, a far one holds it above.
   */
  const { top, near, ...anchor } = badgeAnchor(index, count, lifted, overhead)
  const style = {
    ...anchor,
    '--seat-top': top,
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

  /*
   * You are not a face across the table from yourself.
   *
   * It used to say "Your turn" here as well, which put the same two words on
   * the screen twice a few centimetres apart — the badge on your own cup and
   * the line at the head of the dock, which exists to say exactly that. The
   * ring of light around your cup already marks the turn, and saying it twice
   * in words is most of what "the screen is busy" means. Your dice are in your
   * hand below; this is just where you are sitting.
   */
  if (player.isYou) {
    return (
      <li
        className={`badge badge--you ${near ? 'badge--near' : 'badge--far'}${player.hasTurn ? ' badge--turn' : ''}${aerial ? ' badge--aerial' : ''}${cutIn ? ' badge--cut' : ''}${talking ? ' badge--talking' : ''}${unheard ? ' badge--unheard' : ''}`}
        style={style}
      >
        <span className="badge__status">
          {player.isEliminated ? 'Out' : 'You'}
        </span>
      </li>
    )
  }

  return (
    <li
      className={[
        'badge',
        near ? 'badge--near' : 'badge--far',
        player.hasTurn && !player.isEliminated ? 'badge--turn' : '',
        player.isEliminated ? 'badge--out' : '',
        aerial ? 'badge--aerial' : '',
        cutIn ? 'badge--cut' : '',
        talking ? 'badge--talking' : '',
        unheard ? 'badge--unheard' : '',
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
