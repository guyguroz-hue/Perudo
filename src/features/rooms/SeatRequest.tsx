import type { Watcher } from './types'
import './SeatRequest.css'

/**
 * Somebody watching has asked to play.
 *
 * Put in front of the host wherever they are, because that is the whole point
 * of it: a request that only appeared in the lobby would be invisible for the
 * forty minutes the host is actually at the table, which is exactly when
 * friends turn up.
 *
 * Over the middle of the screen rather than in a row at the top or the bottom.
 * The top of the table carries the round number and the sound toggle, the
 * bottom is every control a thumb aims at under time pressure, and a card that
 * lands on either is a card that takes a press meant for something else. The
 * middle of the table is the one part of this screen nobody is pressing.
 *
 * It does not go away on its own. A person asked, and the two answers are both
 * one tap — it is not news, it is a question.
 */
export function SeatRequest({
  asker,
  busy,
  onApprove,
  onDecline,
}: {
  asker: Watcher
  busy: boolean
  onApprove: () => void
  onDecline: () => void
}) {
  return (
    <div className="ask" role="dialog" aria-live="polite" aria-label="Someone wants to play">
      <p className="ask__kicker">Wants to play</p>
      <p className="ask__who">{asker.display_name}</p>
      {/*
        * Said before the host answers, not after.
        *
        * Players and their dice are fixed when a game starts, and there is no
        * honest number of dice to hand somebody who arrives at round nine — so
        * approving takes a seat for the next game, and until then they watch.
        * A host who found that out afterwards would reasonably think the
        * approval had failed.
        */}
      <p className="ask__note">They take a seat for the next game, and watch this one.</p>
      <div className="ask__answers">
        <button type="button" className="ask__no" disabled={busy} onClick={onDecline}>
          Not now
        </button>
        <button type="button" className="ask__yes" disabled={busy} onClick={onApprove}>
          Give them a seat
        </button>
      </div>
    </div>
  )
}
