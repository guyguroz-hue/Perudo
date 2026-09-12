import { Die } from '../../components/Die'
import type { ActiveBid } from '../../game'
import './CurrentBid.css'

/**
 * The bid on the table, in the middle of the table.
 *
 * First in the information hierarchy, so it gets the one place nobody has to
 * look for: the centre of the board, where a real game would have the pot. The
 * reference image puts a maker's mark there; a mark is worth less than the
 * number every decision in the game is made against.
 *
 * How many dice are in play is just as important — four fives out of sixteen is
 * an ordinary raise, out of six it is nearly a bluff — but it does not live
 * here. The near player's own cup stands in front of the lower half of the
 * inlay, and a number nobody can read is not emphasis. It sits in the strip
 * above the table instead, where it is always legible and never moves.
 *
 * A Bull does not replace a bid — it re-reads the same numbers as "exactly"
 * instead of "at least" (GAME_RULES §8.1) — so it changes the word above the
 * quantity and the metal around it, and leaves the numbers alone.
 */
export function CurrentBid({
  bid,
  bidderName,
  bullCallerName,
}: {
  bid: ActiveBid | null
  bidderName: string | null
  bullCallerName: string | null
}) {
  if (bid === null) {
    return (
      <div className="bid bid--open">
        <span className="bid__reading">open</span>
      </div>
    )
  }

  const bulled = bid.bull !== null

  return (
    <div className={`bid${bulled ? ' bid--bulled' : ''}`}>
      {/* Above the numbers, not below them: the near player's own cup stands in
          front of the lower half of the inlay. */}
      <span className="bid__by">
        {bulled ? `Bull · ${bullCallerName ?? 'someone'}` : (bidderName ?? 'someone')}
      </span>
      <span className="bid__reading">{bulled ? 'exactly' : 'at least'}</span>
      <span className="bid__figure">
        <span className="bid__quantity">{bid.quantity}</span>
        <Die face={bid.face} size={26} />
      </span>
    </div>
  )
}
