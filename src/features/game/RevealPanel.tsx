import { Die } from '../../components/Die'
import type { RevealClaim, RevealData } from './reveal'
import { claimOwner, reading } from './reveal'
import { countedDice } from './revealStage'
import type { RevealStage } from './revealStage'
import './RevealPanel.css'

/**
 * The arithmetic of a reveal, under the table it is happening on.
 *
 * The drama is above this: the cups come off the real table, in the real room,
 * and every hand is there to see. What a rendered table cannot do is let you
 * read it — the dice lie flat under a camera at thirty-five degrees and a die
 * is twenty pixels across. So the dice that counted are pulled out here and
 * shown at a size that answers the only question anybody has: were there
 * enough?
 *
 * They arrive one at a time, in step with the number. That is the count
 * happening rather than a diagram of it, and it is the part players actually
 * watch — a total that simply appeared would have to be taken on trust.
 */
export function RevealPanel({
  claim,
  data,
  stage,
  counted,
  onDone,
}: {
  /** The bid on trial. Public from the first frame, so the panel is never blank. */
  claim: RevealClaim
  data: RevealData | null
  stage: RevealStage
  counted: number
  onDone?: () => void
}) {
  const dice = data === null ? [] : countedDice(data)
  const showing = stage === 'counting' || stage === 'result' ? counted : 0

  return (
    <section className="verdict" data-stage={stage} aria-live="polite">
      <p className="verdict__claim">
        <span className="verdict__reading">{claim.reading}</span>
        <span className="verdict__quantity">{claim.quantity}</span>
        <Die face={claim.face} size={26} />
      </p>

      {/* One slot per die that counts, so the row does not grow as it fills and
          nothing under it moves. Empty slots are the gap between the claim and
          what is actually on the table, and that gap is the whole story. */}
      <p className="verdict__tally">
        <span className="verdict__dice">
          {dice.map((face, i) => (
            <span
              key={i}
              className={i < showing ? 'verdict__die verdict__die--in' : 'verdict__die'}
            >
              <Die face={face} size={30} />
            </span>
          ))}
          {dice.length === 0 && stage !== 'held' && (
            <span className="verdict__none">not one</span>
          )}
        </span>
        <span className="verdict__total">{stage === 'held' ? '·' : showing}</span>
      </p>

      {stage === 'result' && data !== null && <Result data={data} onDone={onDone} />}
    </section>
  )
}

function Result({ data, onDone }: { data: RevealData; onDone?: () => void }) {
  const changed = data.hands.filter((hand) => (data.deltas[hand.id] ?? 0) !== 0)

  return (
    <div className="verdict__result" role="status">
      <p className={`verdict__says${data.claimHolds ? '' : ' verdict__says--broken'}`}>
        {claimOwner(data)} was {data.claimHolds ? 'right' : 'wrong'}
      </p>
      <p className="verdict__because">
        {data.challengerName} called {data.challengeKind === 'burst_lie' ? 'Burst Lie' : 'Lie'} on{' '}
        {reading(data)} {data.quantity} — there {data.actualCount === 1 ? 'was' : 'were'}
        {' '}
        {data.actualCount}
      </p>

      <ul className="verdict__changes">
        {changed.map((hand) => {
          const delta = data.deltas[hand.id] ?? 0
          const out = data.eliminated.includes(hand.id)
          return (
            <li
              key={hand.id}
              className={`verdict__change${delta > 0 ? ' verdict__change--gain' : ''}`}
            >
              <span>{hand.name}</span>
              <span className="verdict__delta">
                {delta > 0 ? `+${delta}` : delta}
                {out && <span className="verdict__out"> out</span>}
              </span>
            </li>
          )
        })}
      </ul>

      {onDone !== undefined && (
        <button type="button" className="verdict__next" onClick={onDone}>
          Next round
        </button>
      )}
    </div>
  )
}
