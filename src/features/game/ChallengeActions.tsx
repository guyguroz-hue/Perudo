import { Die } from '../../components/Die'
import type { ActiveBid } from '../../game'
import { MAX_DICE } from '../../game'
import './ChallengeActions.css'

/**
 * Dudo and Bull.
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
  onDudo,
  onBull,
}: {
  bid: ActiveBid
  /** True when this would be made out of turn (GAME_RULES §9.2, §8.5). */
  burst: boolean
  ownDiceCount: number
  busy?: boolean
  onDudo: () => void
  onBull: () => void
}) {
  // Only a Burst Dudo can ever hand a die back, and never above five (§9.3).
  const canWinADie = burst && ownDiceCount < MAX_DICE

  return (
    <div className="challenge">
      <button
        type="button"
        className="challenge__dudo"
        disabled={busy}
        onClick={onDudo}
        aria-label={`${burst ? 'Burst Dudo' : 'Dudo'}: I say there are fewer than ${bid.quantity}`}
      >
        <CrossMark />
        <span className="challenge__body">
          <span className="challenge__name">{burst ? 'Burst Dudo' : 'Dudo'}</span>
          <span className="challenge__claim">
            <span className="challenge__reading">at least</span>
            <span className="challenge__count">{bid.quantity}</span>
            <Die face={bid.face} size={20} />
          </span>
          <span className="challenge__gloss">
            {canWinADie ? 'I say fewer — win a die if I am right' : 'I say there are fewer'}
          </span>
        </span>
      </button>

      <button
        type="button"
        className="challenge__bull"
        disabled={busy}
        onClick={onBull}
        aria-label={`Bull: I say there are exactly ${bid.quantity}`}
      >
        <Bullseye />
        <span className="challenge__name">Bull</span>
        <span className="challenge__claim">
          <span className="challenge__reading">exactly</span>
          <span className="challenge__count">{bid.quantity}</span>
          <Die face={bid.face} size={20} />
        </span>
        <span className="challenge__gloss">Precisely right</span>
      </button>
    </div>
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
