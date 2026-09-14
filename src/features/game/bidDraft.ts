import { useMemo, useState } from 'react'
import { checkBid, initialBid, legalFacesAt, quantityBounds, withFace } from '../../game'
import type { Face, ProposedBid, RoundState } from '../../game'

/**
 * The bid a player is part way through building.
 *
 * Held apart from the controls that change it, because where those controls go
 * on the screen is an open question — the rack of faces and the player's own
 * dice look alike enough to be mistaken for one another, and the two candidate
 * arrangements put the rack in different places. A component owning both the
 * state and the layout would mean two half-built bids to compare them with.
 *
 * Everything it knows about legality comes from `src/game`, which is the module
 * the server runs. It is a convenience, never an authority — the server checks
 * the bid again and is entitled to refuse it.
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

