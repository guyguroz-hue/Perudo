import { useMemo, useState } from 'react'
import { Die } from '../../components/Die'
import {
  checkBid,
  initialBid,
  legalFacesAt,
  quantityBounds,
  withFace,
} from '../../game'
import type { Face, ProposedBid, RoundState } from '../../game'
import { FACES } from '../../game'
import './BidBuilder.css'

/**
 * Making a bid: which face, how many, and say it.
 *
 * One slab, and everything in it is a control. That matters more than it
 * sounds: the slab beside it holds the player's own dice, which are the one
 * thing on the screen nobody else can see and the one thing here that must
 * never be pressed. Two rows of dice an inch apart, one secret and one a
 * picker, was the arrangement this replaced — a heading over each was not
 * nearly enough, and the rack is a grid where a hand is a column so they do
 * not even share a shape now.
 *
 * A bid is a quantity and a face, and both are reachable at once: no typing,
 * no dropdown, no second screen. The builder opens holding the smallest legal
 * raise, so the commonest move in the game — nudging the bid in front of you —
 * costs a single tap on Bid.
 *
 * Illegal options are disabled rather than hidden. The shape of the rule stays
 * visible that way: a player can see that the Joker is unavailable at this
 * quantity and learn why, where a vanishing button teaches nothing.
 *
 * Everything it knows about legality comes from `src/game`, which is the module
 * the server runs. It is a convenience, never an authority — the server checks
 * the bid again and is entitled to refuse it.
 */
export function BidBuilder({
  round,
  diceOnTable,
  ownHand,
  burst,
  busy = false,
  onBid,
}: {
  round: RoundState
  diceOnTable: number
  /** The player's own dice. Read only to choose where an opening bid starts. */
  ownHand: readonly Face[]
  /** True when this would be a Burst: a bid made out of turn (GAME_RULES §9.1). */
  burst: boolean
  busy?: boolean
  onBid: (bid: ProposedBid) => void
}) {
  // Keyed on the bid being raised, so a new bid from another player resets the
  // builder to the fresh minimum instead of stranding it on a stale quantity.
  const anchor = round.bid === null ? 'open' : `${round.bid.quantity}x${round.bid.face}`
  const [draft, setDraft] = useState<ProposedBid | null>(null)
  const [anchoredTo, setAnchoredTo] = useState(anchor)

  const opening = useMemo(
    () => initialBid(round, diceOnTable, ownHand),
    [round, diceOnTable, ownHand],
  )
  const bounds = useMemo(() => quantityBounds(round, diceOnTable), [round, diceOnTable])

  let bid = draft ?? opening
  if (anchoredTo !== anchor) {
    // Render the reset immediately rather than a frame late.
    bid = opening
    setDraft(null)
    setAnchoredTo(anchor)
  }

  const faces = legalFacesAt(round, bid.quantity)
  const verdict = checkBid(round, bid)

  function setQuantity(quantity: number) {
    if (quantity < bounds.min || quantity > bounds.max) return
    const kept = checkBid(round, { quantity, face: bid.face }).legal
    // Dragging the quantity under a face that no longer works moves the face to
    // the nearest one that does, so the builder is never sitting on a refusal.
    setDraft({ quantity, face: kept ? bid.face : legalFacesAt(round, quantity)[0] })
  }

  return (
    <div className="builder">
      <p className="builder__label">Make your bid</p>

      {/* Dice, never the words "one, two, three": the rack, a hand and the
          reveal all speak the same visual language, so choosing a face is
          picking up a die. Laid out as a grid, which is the shape a keypad
          has and a hand does not. */}
      <div className="builder__deck" role="group" aria-label="Face">
        {FACES.map((face) => {
          const legal = faces.includes(face)
          return (
            <button
              key={face}
              type="button"
              className="builder__face"
              aria-pressed={face === bid.face}
              aria-label={face === 1 ? 'Joker' : `${face}`}
              disabled={!legal}
              onClick={() => setDraft(withFace(round, bid, face))}
            >
              <Die face={face} size={30} />
            </button>
          )
        })}
      </div>

      {/* The count, between the two controls that change it, so the number is
          plainly the thing between them rather than a label beside them. */}
      <div className="builder__stepper">
        <button
          type="button"
          className="builder__step"
          onClick={() => setQuantity(bid.quantity - 1)}
          disabled={bid.quantity <= bounds.min}
          aria-label="One fewer"
        >
          &minus;
        </button>

        <p className="builder__preview">
          <span className="builder__quantity" aria-hidden="true">
            {bid.quantity}
          </span>
          <Die face={bid.face} size={30} />
          <span className="visually-hidden">
            {bid.quantity} {bid.face === 1 ? 'Joker' : bid.face}
          </span>
        </p>

        <button
          type="button"
          className="builder__step"
          onClick={() => setQuantity(bid.quantity + 1)}
          disabled={bid.quantity >= bounds.max}
          aria-label="One more"
        >
          +
        </button>
      </div>

      {/* Full width under the stepper, where it used to share a line with it.
          Sharing this panel with the hand beside it, a Bid button squeezed in
          next to a stepper is a target nobody wants to aim at — and down here
          it is the easiest thing on the screen to press, which suits the move
          it sends. */}
      <button
        type="button"
        className={`builder__submit${burst ? ' builder__submit--burst' : ''}`}
        disabled={busy || !verdict.legal}
        onClick={() => onBid(bid)}
        /* Short on the button, whole in the name it is announced by: the dock
           has room for one word and a screen reader has room for the sense. */
        aria-label={burst ? 'Burst bid' : 'Bid'}
      >
        {burst ? 'Burst' : 'Bid'}
      </button>

      {!verdict.legal && <p className="builder__why">{verdict.detail}</p>}
    </div>
  )
}
