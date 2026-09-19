import type { CSSProperties } from 'react'
import { toneForSeat } from './colors'
import type { TablePlayer } from './view'
import './TurnLine.css'

/**
 * Whose turn it is, said in words.
 *
 * The table has always known: the cup whose turn it is stands in a ring of
 * light and its badge wears the same blue. But a glow is something you have to
 * find, and finding it means reading six cups to see which one is lit — at the
 * exact moment a player is trying to work out whether the bid in front of them
 * is a lie. "You cannot follow turns in any way" was the report, and it was
 * fair: nothing on this screen ever said it.
 *
 * So it is said, once, in the one place the eye is already resting: the top of
 * the dock, directly above the player's own dice. It is always present, even
 * between rounds, because a line that comes and goes is a line that moves
 * everything under it — and everything under it is what a thumb is aiming at.
 *
 * The second half is the part a new player never works out alone. Burst means
 * anybody may bid or doubt at any moment (GAME_RULES §9.1), so somebody else's
 * turn is not a turn to sit out; it is an invitation. A rule nobody is told is
 * a rule that only the people who already know the game get to use.
 *
 * And it is where a Burst gets announced, for a couple of seconds, in the
 * colour of whoever made it. The flash across the timber says that somebody cut
 * in; it cannot say who, or what they said, and a player who looked up a moment
 * late has missed it. "The cup lights up a little and then suddenly jumps, and
 * the log is not convenient to follow" was the report. The line gives itself
 * over to the interruption, which is the right trade: whose turn it is matters
 * least at the moment somebody has just ignored it.
 */
export function TurnLine({
  holder,
  /** True while the player still holds dice and may act at all. */
  canAct,
  /**
   * Somebody cutting in, for the couple of seconds after they do.
   *
   * The line gives itself over to it. That is the point: whose turn it is
   * matters least at the exact moment somebody has just ignored it, and this
   * is the one line on the screen a player is already looking at.
   */
  cutIn = null,
}: {
  holder: TablePlayer | null
  canAct: boolean
  cutIn?: { readonly text: string; readonly seatIndex: number | null } | null
}) {
  const yours = holder !== null && holder.isYou
  const tone =
    cutIn !== null
      ? cutIn.seatIndex === null
        ? 'var(--brass-bright)'
        : toneForSeat(cutIn.seatIndex)
      : holder === null
        ? 'var(--ink-faint)'
        : toneForSeat(holder.seatIndex)

  return (
    <p
      className={`turn${cutIn !== null ? ' turn--cutting' : yours ? ' turn--yours' : ''}`}
      style={{ '--seat-tone': tone } as CSSProperties}
      // Announced, because it is the one fact a player cannot see for
      // themselves and the whole reason this exists.
      aria-live="polite"
    >
      <span className="turn__dot" aria-hidden="true" />
      <span className="turn__who">
        {cutIn !== null
          ? cutIn.text
          : holder === null
            ? 'Between rounds'
            : yours
              ? 'Your turn'
              : `${holder.name} to speak`}
      </span>
      {/* Only when it is worth knowing: it is not an invitation to cut in on
          yourself, and it is not one for a player who is out. */}
      {cutIn === null && !yours && holder !== null && canAct && (
        <span className="turn__cut">you may cut in</span>
      )}
    </p>
  )
}
