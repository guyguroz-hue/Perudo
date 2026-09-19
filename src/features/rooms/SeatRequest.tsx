import type { Watcher } from './types'
import './SeatRequest.css'

/**
 * Somebody watching has asked to play.
 *
 * Two pieces, and the split is the whole point of them.
 *
 * The first version was one piece: a card over the middle of the screen that
 * stayed until it was answered. Put in front of a host who is mid-round — three
 * bids in, working out whether the six on the table is a lie — that is not a
 * notification, it is somebody taking the controls away. "Make sure the request
 * does not ruin the host's round" was the note, and it was right.
 *
 * So during a game nothing opens by itself. `SeatRequestChip` sits in the
 * corner the room already owns, beside the sound toggle and the way out, and
 * says how many people are waiting. It covers nothing, it interrupts nothing,
 * and the host opens it when the round is over — or never, which is also an
 * answer the table can live with, because the next round will still be there.
 *
 * In a lobby there is nothing to interrupt, so the card opens on its own.
 */

/** Quiet, in the corner, until the host has a moment. */
export function SeatRequestChip({
  waiting,
  onOpen,
}: {
  waiting: number
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="askchip"
      onClick={onOpen}
      aria-label={`${waiting} ${waiting === 1 ? 'person wants' : 'people want'} to play`}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* A person and a plus: the one shape that cannot be read as a setting
            or as a warning. */}
        <circle cx="10" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.9" />
        <path
          d="M4.2 19.2c0-3 2.6-4.8 5.8-4.8 1.1 0 2.2.2 3.1.6"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M17.5 13.6v5.6M14.7 16.4h5.6"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
      {waiting > 1 && <b className="askchip__count">{waiting}</b>}
    </button>
  )
}

/** The question itself, once the host has asked to see it. */
export function SeatRequest({
  asker,
  busy,
  onApprove,
  onDecline,
  onLater = null,
}: {
  asker: Watcher
  busy: boolean
  onApprove: () => void
  onDecline: () => void
  /** Put it away without answering. Absent in a lobby, where there is no round
      to get back to. */
  onLater?: (() => void) | null
}) {
  return (
    <div className="ask" role="dialog" aria-live="polite" aria-label="Someone wants to play">
      <p className="ask__kicker">Wants to play</p>
      <p className="ask__who">{asker.display_name}</p>
      {/*
        * Said before the host answers, not after.
        *
        * This is the whole of R-014 in one line, and the host is the person it
        * is aimed at: five dice arriving in round nine is a commanding position,
        * and what keeps that fair is somebody deciding it is. A host who found
        * out afterwards would reasonably feel the game had been changed behind
        * them.
        */}
      <p className="ask__note">They join at the start of the next round, with five dice.</p>
      <div className="ask__answers">
        <button type="button" className="ask__no" disabled={busy} onClick={onDecline}>
          Not now
        </button>
        <button type="button" className="ask__yes" disabled={busy} onClick={onApprove}>
          Deal them in
        </button>
      </div>
      {/* Neither answer, and back to the round. The chip in the corner keeps
          the question; nothing about it expires. */}
      {onLater !== null && (
        <button type="button" className="ask__later" onClick={onLater}>
          Later
        </button>
      )}
    </div>
  )
}
