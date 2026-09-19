import { Die } from '../../components/Die'
import type { ActiveBid } from '../../game'
import { MAX_DICE } from '../../game'
import { useArmed } from './armed'
import type { PendingAction } from './useGame'
import './ChallengeActions.css'

/**
 * Lie and Bull.
 *
 * Both challenge the current bid and they mean opposite things about it, so
 * they are not two buttons with different words on them. They differ in
 * iconography (an angular cross against a circular target), in composition (a
 * wide bar against a centred token), in colour, and in the one line of copy
 * that carries the actual claim — AT LEAST against EXACTLY.
 *
 * Neither looks like a bid. They are actions taken *against* one.
 */
export function ChallengeActions({
  bid,
  burst,
  ownDiceCount,
  busy = false,
  pending = null,
  onLie,
  onBull,
}: {
  /**
   * The claim on the table, or null when there is not one yet.
   *
   * Null is a state these two are *shown* in rather than absent from. They used
   * to appear the moment somebody bid, which grew the dock by a row and jumped
   * everything above it upward — putting Bull under a thumb that had been
   * aiming at Bid. Everybody at one table pressed Bull by accident, on the most
   * expensive move in the game and the one that cannot be taken back.
   *
   * So the slot is always the same size and the tiles are always in it. Before
   * a bid they are plainly spent rather than missing, which also says what they
   * are for before the first time they can be used.
   */
  bid: ActiveBid | null
  /** True when this would be made out of turn (GAME_RULES §9.2, §8.5). */
  burst: boolean
  ownDiceCount: number
  busy?: boolean
  /**
   * Which action is on its way.
   *
   * A pressed button that only dims looks exactly like a button that has been
   * refused, and a player who cannot tell presses it again — which is most of
   * what a table full of double presses actually is.
   */
  pending?: PendingAction
  onLie: () => void
  onBull: () => void
}) {
  /*
   * What this press is worth, which is not the same question all game.
   *
   * Only a Burst Lie can ever hand a die back, and never above five (§9.3,
   * R-007) — so a player watches the +1 appear, disappear the moment they are
   * full, and come back when they lose one. Left as an empty slot that reads
   * as something breaking rather than as a rule: the prize was there a minute
   * ago and now it is not, and nothing on the screen says the ceiling is why.
   *
   * So the slot always says something when a Burst is on the table. There is
   * nothing to win, or there is nowhere to put it.
   */
  const prize = bid === null || !burst ? null : ownDiceCount < MAX_DICE ? 'win' : 'full'

  /*
   * And a beat before they answer to anything.
   *
   * A thumb is already travelling when a bid lands, and a press is committed
   * before it arrives. See `armed.ts`: nothing moves on the screen any more,
   * but a tile can still change from spent to live underneath a finger that was
   * never deciding about it.
   */
  const live = useArmed(bid !== null)

  /*
   * A bid can only be Bulled once.
   *
   * What a second Bull on the same bid would mean is not decided, and it
   * decides who pays (R-010) — so the server refuses one. Offered anyway, the
   * button was a move that could only ever come back as an error, which is a
   * worse way to learn a rule than a control that is plainly spent.
   */
  const bulled = bid !== null && bid.bull !== null

  /*
   * What Lie is actually doubting.
   *
   * A Bull re-reads the claim on the table from "at least seven" to "exactly
   * seven" (GAME_RULES §8.1), and Lie doubts whatever is on the table — so
   * against a Bulled bid it wins on eight as readily as on six. This button
   * went on saying "at least", which is not a wording problem: it described a
   * claim that was no longer there, and a player weighing whether to doubt was
   * being shown the wrong bet. The bid above it already read "exactly", so the
   * screen disagreed with itself.
   */
  const reading = bulled ? 'exactly' : 'at least'
  const doubting =
    bid === null
      ? 'nothing to doubt yet'
      : bulled
        ? `I say it is not exactly ${bid.quantity}`
        : `I say there are fewer than ${bid.quantity}`

  return (
    <div className="challenge">
      <button
        type="button"
        className={`challenge__lie${pending === 'lie' ? ' challenge--sending' : ''}`}
        disabled={busy || !live}
        onClick={onLie}
        aria-label={`${burst ? 'Burst Lie' : 'Lie'}: ${doubting}${
          prize === 'win'
            ? ', and win a die if I am right'
            : prize === 'full'
              ? ', with no die to win — already holding five'
              : ''
        }`}
      >
        {/* The mark beside the word rather than over it. Stacked, these two
            were a third line in a tile that only ever had two things to say,
            and three stacked lines in a button is most of a row of table. */}
        <span className="challenge__head">
          <CrossMark />
          <span className="challenge__name">
            {pending === 'lie' ? 'Sending' : burst ? 'Burst Lie' : 'Lie'}
          </span>
          {prize !== null && (
            <b
              className={`challenge__prize${prize === 'full' ? ' challenge__prize--full' : ''}`}
              aria-hidden="true"
            >
              {prize === 'win' ? '+1' : 'full'}
            </b>
          )}
        </span>
        <Claim reading={reading} bid={bid} />
      </button>

      <button
        type="button"
        className={`challenge__bull${pending === 'bull' ? ' challenge--sending' : ''}`}
        disabled={busy || bulled || !live}
        onClick={onBull}
        aria-label={
          bid === null
            ? 'Bull: nothing to doubt yet'
            : bulled
              ? 'Bull has already been called on this bid'
              : `Bull: I say there are exactly ${bid.quantity}`
        }
      >
        <span className="challenge__head">
          <Bullseye />
          <span className="challenge__name">
            {pending === 'bull' ? 'Sending' : bulled ? 'Bulled' : 'Bull'}
          </span>
        </span>
        <Claim reading="exactly" bid={bid} />
      </button>
    </div>
  )
}

/**
 * What the button claims, in the same three lines whether or not there is a
 * claim to make. The height must not change when a bid lands: that jump is what
 * put Bull under somebody's thumb in the first place.
 */
function Claim({ reading, bid }: { reading: string; bid: ActiveBid | null }) {
  return (
    <span className="challenge__claim">
      <span className="challenge__reading">{reading}</span>
      <span className="challenge__count">{bid === null ? '–' : bid.quantity}</span>
      {bid === null ? <span className="challenge__blank" aria-hidden="true" /> : <Die face={bid.face} size={18} />}
    </span>
  )
}

/** Angular, and it cuts. Nothing else on the table is drawn from straight lines. */
function CrossMark() {
  return (
    <svg className="challenge__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 5 L19 19 M19 5 L5 19"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

/** Concentric and closed: a claim that lands on the number, not past it. */
function Bullseye() {
  return (
    <svg className="challenge__icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}
