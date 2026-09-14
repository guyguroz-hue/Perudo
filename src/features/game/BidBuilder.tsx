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
 * Building a bid on a phone.
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
 *
 * The draft is a hook and the controls are three separate pieces, because where
 * they go on the screen is still an open question — the rack of faces and the
 * player's own dice look alike enough to be confused for one another, and the
 * two candidate arrangements put the rack in different places. A single
 * component holding both the state and the layout would have meant two copies
 * of the same half-built bid to compare them.
 */

/** A bid being built, and everything the controls need to change it. */
export interface BidDraft {
  readonly bid: ProposedBid
  /** Which faces are legal at the quantity currently held. */
  readonly faces: readonly Face[]
  readonly bounds: { readonly min: number; readonly max: number }
  readonly verdict: ReturnType<typeof checkBid>
  setFace: (face: Face) => void
  setQuantity: (quantity: number) => void
}

export function useBidDraft(
  round: RoundState,
  diceOnTable: number,
  /** The player's own dice. Read only to choose where an opening bid starts. */
  ownHand: readonly Face[],
): BidDraft {
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

  const held = bid
  return {
    bid: held,
    faces: legalFacesAt(round, held.quantity),
    bounds,
    verdict: checkBid(round, held),
    setFace: (face) => setDraft(withFace(round, held, face)),
    setQuantity: (quantity) => {
      if (quantity < bounds.min || quantity > bounds.max) return
      const kept = checkBid(round, { quantity, face: held.face }).legal
      // Dragging the quantity under a face that no longer works moves the face
      // to the nearest one that does, so the builder is never sitting on a
      // refusal.
      setDraft({ quantity, face: kept ? held.face : legalFacesAt(round, quantity)[0] })
    },
  }
}

/**
 * The faces, as dice.
 *
 * Never the words "one, two, three": the rack, a hand and the reveal all speak
 * the same visual language, so choosing a face is picking up a die. Which is
 * also the problem it has — it looks like the player's own hand, and where it
 * goes on the screen is what the two arrangements disagree about.
 */
export function FaceRack({ draft }: { draft: BidDraft }) {
  return (
    <div className="builder__deck" role="group" aria-label="Face">
      {FACES.map((face) => (
        <button
          key={face}
          type="button"
          className="builder__face"
          aria-pressed={face === draft.bid.face}
          aria-label={face === 1 ? 'Joker' : `${face}`}
          disabled={!draft.faces.includes(face)}
          onClick={() => draft.setFace(face)}
        >
          <Die face={face} size={30} />
        </button>
      ))}
    </div>
  )
}

/** How many, and the button that says it. */
export function BidRow({
  draft,
  burst,
  busy = false,
  onBid,
  /** True when the button sits beside the stepper rather than under it. */
  inline = false,
}: {
  draft: BidDraft
  /** True when this would be a Burst: a bid made out of turn (GAME_RULES §9.1). */
  burst: boolean
  busy?: boolean
  onBid: (bid: ProposedBid) => void
  inline?: boolean
}) {
  const { bid, bounds, verdict } = draft

  return (
    <>
      <div className={`builder__row${inline ? ' builder__row--inline' : ''}`}>
        {/* The count, between the two controls that change it, so the number is
            plainly the thing between them rather than a label beside them. */}
        <div className="builder__stepper">
          <button
            type="button"
            className="builder__step"
            onClick={() => draft.setQuantity(bid.quantity - 1)}
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
            onClick={() => draft.setQuantity(bid.quantity + 1)}
            disabled={bid.quantity >= bounds.max}
            aria-label="One more"
          >
            +
          </button>
        </div>

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
      </div>

      {!verdict.legal && <p className="builder__why">{verdict.detail}</p>}
    </>
  )
}
