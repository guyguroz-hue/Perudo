import type { CSSProperties } from 'react'
import { Die } from '../../components/Die'
import type { ActiveBid } from '../../game'
import { toneForSeat } from './colors'
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
 * instead of "at least" (GAME_RULES §8.1) — so it changes the word beside the
 * quantity and the light around it, and leaves the numbers alone.
 *
 * It is signed, because a claim in this game belongs to somebody. Burst means
 * the bid on the table is not necessarily the last player's — anybody may have
 * put it there out of turn — so "whose is this?" cannot be answered by counting
 * round the seats, and it is the first thing a player weighs before doubting.
 * One name only: whoever owns the claim now, which a Bull changes (§8.3).
 */
/** The same mark the Bull button carries, so the two are one idea. */
function Bullseye() {
  return (
    <svg className="bid__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="4.4" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}

/** Whoever the claim on the table belongs to: its Bull caller, or its bidder. */
export interface ClaimOwner {
  readonly name: string
  /** Their colour, the one they wear at their seat and in the log. */
  readonly seatIndex: number
}

export function CurrentBid({ bid, owner }: { bid: ActiveBid | null; owner: ClaimOwner | null }) {
  if (bid === null) {
    return (
      <div className="bid bid--open">
        <span className="bid__reading">open</span>
      </div>
    )
  }

  const bulled = bid.bull !== null
  const tone = { '--seat-tone': toneForSeat(owner?.seatIndex ?? 0) } as CSSProperties

  return (
    <div className={`bid${bulled ? ' bid--bulled' : ''}`}>
      {/*
        * Signed, either way, in the one slot above the numbers.
        *
        * A Bull is the louder of the two, and has to be: it takes the claim
        * over (GAME_RULES §8.3) without touching a single number, so left as
        * quiet as a bid, calling one looks like nothing happened at all. A
        * plain bid gets the same slot, a size down — a dot in the bidder's
        * colour and their name — because the question it answers is the same
        * one, and under Burst it is a question the table cannot answer for
        * itself.
        */}
      {bulled ? (
        <span className="bid__bull">
          <Bullseye />
          Bull · {owner?.name ?? 'someone'}
        </span>
      ) : (
        owner !== null && (
          <span className="bid__by" style={tone}>
            <i className="bid__dot" aria-hidden="true" />
            {owner.name}
          </span>
        )
      )}
      {/* One line. The open timber between the far cup and your own is only so
          tall, and a bid stacked three high grew up into the cup across the
          table. Read across, it fits the gap and still reads as a sentence. */}
      <span className="bid__figure">
        <span className="bid__reading">{bulled ? 'exactly' : 'at least'}</span>
        <span className="bid__quantity">{bid.quantity}</span>
        <Die face={bid.face} size={24} />
      </span>
    </div>
  )
}
