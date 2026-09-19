import { useEffect } from 'react'
import './Notice.css'

/**
 * The one thing the table says to you that is not the game itself.
 *
 * Two kinds arrive here and they want different weights. Being beaten to a bid
 * is the game working — with Burst in the rules it happens several times a
 * round — so it is said the way anything uninteresting is said, and it goes
 * almost as soon as it has been read. A refusal is something the player has to
 * act on, so it is given longer and carries its own name for whoever has to fix
 * it. Neither of them stays.
 *
 * It did stay, and that was the report: "you cannot get it off the screen and
 * it does not move until you bid again" — a red bar across the top of the
 * table, on a table where what it had just said was that the bid did not take.
 *
 * One component rather than two call sites, and the clock lives in it, so the
 * preview cannot drift from the game: what is looked at on a phone is the same
 * element with the same timing as the thing a player gets.
 */

/** How long a notice stays. News goes quickly; a refusal is read twice. */
export const NEWS_MS = 3200
export const REFUSAL_MS = 7000

export interface NoticeText {
  readonly message: string
  /** Stable identifier: 'BULL_ALREADY_CALLED', 'NOT_DEPLOYED', … */
  readonly code: string
  /** True for news — somebody acted first — rather than a refusal. */
  readonly stale: boolean
}

export function Notice({
  notice,
  onDismiss,
}: {
  notice: NoticeText
  onDismiss: () => void
}) {
  /*
   * It takes itself away, and a tap takes it away sooner.
   *
   * Keyed on the notice itself, so a second one replaces the first with a full
   * clock rather than inheriting whatever was left of it.
   */
  useEffect(() => {
    const fades = setTimeout(onDismiss, notice.stale ? NEWS_MS : REFUSAL_MS)
    return () => clearTimeout(fades)
  }, [notice, onDismiss])

  return (
    <button
      type="button"
      className={`note${notice.stale ? '' : ' note--refused'}`}
      onClick={onDismiss}
      /* Announced politely rather than interrupting: a screen reader saying
         ALERT several times a round, for correct play, is its own kind of
         noise. */
      aria-live="polite"
    >
      {notice.message}
      {!notice.stale && <b className="note__code">{notice.code}</b>}
    </button>
  )
}
