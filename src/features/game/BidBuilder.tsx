import { Die } from '../../components/Die'
import type { ActiveBid, ProposedBid } from '../../game'
import { FACES } from '../../game'
import { useSettled } from './armed'
import type { BidDraft } from './bidDraft'
import type { PendingAction } from './useGame'
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
 * The bid being built lives in `bidDraft`, not here: these are two pieces and
 * the dock decides where each goes, so neither can own the state they share.
 */

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
  claim = null,
  burst,
  barred = false,
  busy = false,
  pending = null,
  onBid,
  /** True when the button sits beside the stepper rather than under it. */
  inline = false,
}: {
  draft: BidDraft
  /**
   * The claim on the table, read only to know when it changed.
   *
   * Not to render anything — the bid being built is what this row shows. This
   * is what the button is raising, and when it becomes a different claim the
   * button becomes a different button.
   */
  claim?: ActiveBid | null
  /** True when this would be a Burst: a bid made out of turn (GAME_RULES §9.1). */
  burst: boolean
  /**
   * True while the opening bid of a Farewell Round is owed to somebody else.
   *
   * The one moment in this game when turn order is binding rather than a
   * suggestion (GAME_RULES §10, R-013): that bid chooses the face for everybody,
   * so it belongs to the player the round was called for. Shown as a spent
   * button with the reason on it rather than left to come back as a refusal —
   * a rule is better learned from a control than from an error.
   */
  barred?: boolean
  busy?: boolean
  /** Which action is on its way, if any. */
  pending?: PendingAction
  onBid: (bid: ProposedBid) => void
  inline?: boolean
}) {
  const { bid, bounds, verdict } = draft

  /*
   * A beat after the claim under this button changes.
   *
   * The same rule the challenge tiles follow, and it is here for the case that
   * made a table of six people ask for it: two players burst at once, the bid
   * moves twice in a second, and the second burster's finger is already on its
   * way to a button that said Burst and now says Bid — raising a claim they
   * never read. Nothing on screen moved; what the press means did.
   *
   * Keyed on the claim and on whether this would be a Burst, so it costs
   * nothing at an ordinary table: a player whose turn comes round to them finds
   * the button live, because nothing about it changed while they were reaching.
   */
  const settled = useSettled(`${claim === null ? 'open' : `${claim.quantity}x${claim.face}`}|${burst}`)

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
          className={`builder__submit${burst ? ' builder__submit--burst' : ''}${
            pending === 'bid' ? ' builder__submit--sending' : ''
          }`}
          disabled={busy || barred || !verdict.legal || !settled}
          onClick={() => onBid(bid)}
          /* Short on the button, whole in the name it is announced by: the dock
             has room for one word and a screen reader has room for the sense. */
          aria-label={
            barred
              ? 'You cannot cut in until this round has been opened'
              : burst
                ? 'Burst bid'
                : 'Bid'
          }
        >
          {pending === 'bid' ? 'Sending' : barred ? 'Theirs' : burst ? 'Burst' : 'Bid'}
        </button>
      </div>

      {/* One reason at a time, and this one outranks a bid's own legality: the
          bid may be perfectly legal and still not yours to make yet. */}
      {barred ? (
        <p className="builder__why builder__why--waiting">
          This round opens with their bid. You can cut in once the face is set.
        </p>
      ) : (
        !verdict.legal && <p className="builder__why">{verdict.detail}</p>
      )}
    </>
  )
}
