import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Cup } from '../../components/Cup'
import { Die } from '../../components/Die'
import { countsToward } from '../../game'
import { usePrefersReducedMotion } from '../../lib/motion'
import { toneForSeat } from './colors'
import type { RevealClaim, RevealData } from './reveal'
import { claimOwner, reading } from './reveal'
import './Reveal.css'

/**
 * The reveal — the only place in the game that earns strong motion design.
 *
 *   challenge → pause → cups lift → dice settle → count → result
 *
 * The pause is not a loading state and must never show a spinner. It is the
 * beat where a player wonders whether they were right, and it is also exactly
 * the window the challenge request needs. When the network is slow the pause
 * extends rather than breaking: the table holds its breath for longer. That
 * degrades honestly.
 *
 * `data` is null until the server answers. The component starts the moment the
 * challenge is made, so the drama begins before the answer exists.
 */
export type RevealStage = 'held' | 'lifting' | 'settled' | 'counting' | 'result'

/** Long enough to feel deliberate, short enough never to read as loading. */
const HELD_MS = 750

/**
 * A frame between the answer landing and the cups moving.
 *
 * The render that brings the dice in and the one that lifts the cups must not
 * be the same tick, or the browser has nothing to transition from and jumps
 * them. When the network has already spent the whole pause this is the entire
 * remaining beat, and ninety milliseconds does not read as one.
 */
const MIN_BEAT_MS = 90
const LIFT_MS = 520
const SETTLE_MS = 360
const PER_DIE_MS = 90

export function Reveal({
  standings,
  claim,
  data,
  onDone,
}: {
  /**
   * Who is at the table and how many dice each holds — public information,
   * known the instant the challenge is made. It is what puts the cups on the
   * table during the pause, so the held beat is the table holding its breath
   * rather than an empty screen with an ellipsis on it.
   */
  standings: readonly { readonly id: string; readonly name: string; readonly diceCount: number }[]
  /** The bid being challenged. Public, so it is on screen from the first frame. */
  claim: RevealClaim
  data: RevealData | null
  onDone?: () => void
}) {
  const [timedStage, setTimedStage] = useState<RevealStage>('held')
  const [timedCount, setTimedCount] = useState(0)
  const startedAt = useRef(0)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    startedAt.current = Date.now()
  }, [])

  // With motion switched off there is no sequence to run: the reveal is simply
  // at its result. Derived rather than set, so nothing renders twice to get
  // there.
  const stage: RevealStage = data === null ? 'held' : reduced ? 'result' : timedStage
  const counted = data !== null && reduced ? data.actualCount : timedCount

  useEffect(() => {
    if (data === null || reduced) return

    // The pause already spent waiting for the server counts toward the beat,
    // so a fast answer still gets a pause and a slow one does not get two.
    const remaining = Math.max(MIN_BEAT_MS, HELD_MS - (Date.now() - startedAt.current))
    const timers: number[] = []
    const at = (delay: number, run: () => void) => timers.push(window.setTimeout(run, delay))

    at(remaining, () => setTimedStage('lifting'))
    at(remaining + LIFT_MS, () => setTimedStage('settled'))

    const countFrom = remaining + LIFT_MS + SETTLE_MS
    at(countFrom, () => setTimedStage('counting'))
    for (let n = 1; n <= data.actualCount; n += 1) {
      at(countFrom + n * PER_DIE_MS, () => setTimedCount(n))
    }
    at(countFrom + (data.actualCount + 1) * PER_DIE_MS, () => setTimedStage('result'))

    return () => timers.forEach(window.clearTimeout)
  }, [data, reduced])

  // Nobody with an empty cup is at this reveal.
  const seated = standings.filter((player) => player.diceCount > 0)
  const lifted = stage !== 'held'
  // The dice are already there while the cup is still on top of them, so the
  // lift uncovers them instead of the cup rising off an empty patch of felt.
  const showDice = stage !== 'held'
  // The rings light up while the number climbs, which is the moment they mean
  // something: this is the count happening, not a diagram of it.
  const marked = stage === 'counting' || stage === 'result'

  return (
    <div className="reveal" data-stage={stage}>
      <p className="reveal__claim">
        <span className="reveal__reading">{claim.reading}</span>
        <span className="reveal__quantity">{claim.quantity}</span>
        <Die face={claim.face} size={36} />
      </p>

      <ul className="reveal__hands">
        {seated.map((player) => {
          const dice = data?.hands.find((hand) => hand.id === player.id)?.dice ?? null
          return (
            <li
              key={player.id}
              className="reveal__hand"
              style={{ '--stack-width': `${stackWidth(player.diceCount)}px` } as CSSProperties}
            >
              <span className="reveal__stack">
                {dice !== null && data !== null && showDice && (
                  <span className="reveal__dice">
                    {dice.map((die, i) => (
                      // Ringing the dice that counted is what makes the result
                      // readable without arithmetic: a player sees the six that
                      // beat their bid, they do not add up five small pictures.
                      <span
                        key={i}
                        className={
                          marked && countsToward(die, data.face, data.roundType)
                            ? 'reveal__die reveal__die--counts'
                            : 'reveal__die'
                        }
                      >
                        <Die face={die} size={22} />
                      </span>
                    ))}
                  </span>
                )}
                <span className="reveal__cup">
                  <Cup
                    tone={toneForSeat(seated.indexOf(player))}
                    state={lifted ? 'lifted' : 'covered'}
                    size={cupWidth(player.diceCount)}
                    label=""
                  />
                </span>
              </span>
              <span className="reveal__who">{player.name}</span>
            </li>
          )
        })}
      </ul>

      <p className="reveal__count" aria-live="polite">
        <span className="reveal__total">{stage === 'held' ? '·' : counted}</span>
        <span className="reveal__on">on the table</span>
      </p>

      {stage === 'result' && data !== null && <Result data={data} onDone={onDone} />}
    </div>
  )
}

/**
 * A cup wide enough to cover the cluster it sits on.
 *
 * The dice underneath wrap at three across, so five dice are a 3-by-2 block
 * rather than a row long enough to need a cup the width of the screen.
 */
function cupWidth(diceCount: number): number {
  return Math.min(3, Math.max(1, diceCount)) * 26 + 14
}

/**
 * How wide one player's column is, set before anything is in it.
 *
 * The cup is positioned absolutely and the dice do not exist yet, so until this
 * was given a width the box measured four pixels across — and it clips, so for
 * the whole held beat and the whole lift there was a four-pixel sliver of cup
 * on screen. The drama of the reveal is the cup coming off; it has to be wide
 * enough to hold the cup from the first frame, and it must not change width
 * when the dice arrive, because everything below it would jump.
 *
 * A die's cell is its 22px face plus the padding and the ring that goes round
 * it when it counts — the three numbers are in `.reveal__die`, and this is the
 * only place outside that rule that needs to know them.
 */
const DIE_CELL = 22 + 3 * 2 + 2 * 2
const DIE_GAP = 2

function stackWidth(diceCount: number): number {
  const across = Math.min(3, Math.max(1, diceCount))
  return Math.max(cupWidth(diceCount), across * DIE_CELL + (across - 1) * DIE_GAP)
}

function Result({ data, onDone }: { data: RevealData; onDone?: () => void }) {
  const changed = data.hands.filter((hand) => (data.deltas[hand.id] ?? 0) !== 0)

  return (
    <div className="reveal__result" role="status">
      <p className={`reveal__verdict${data.claimHolds ? '' : ' reveal__verdict--broken'}`}>
        {claimOwner(data)} was {data.claimHolds ? 'right' : 'wrong'}
      </p>
      <p className="reveal__because">
        {data.challengerName} called{' '}
        {data.challengeKind === 'burst_lie' ? 'Burst Lie' : 'Lie'} on {reading(data)}{' '}
        {data.quantity} — there {data.actualCount === 1 ? 'was' : 'were'}
        {'\u00a0'}
        {data.actualCount}
      </p>

      <ul className="reveal__consequences">
        {changed.map((hand) => {
          const delta = data.deltas[hand.id] ?? 0
          const out = data.eliminated.includes(hand.id)
          return (
            <li
              key={hand.id}
              className={`reveal__change${delta > 0 ? ' reveal__change--gain' : ''}`}
            >
              <span>{hand.name}</span>
              <span className="reveal__delta">
                {delta > 0 ? `+${delta}` : delta}
                {out && <span className="reveal__eliminated"> out</span>}
              </span>
            </li>
          )
        })}
      </ul>

      {onDone !== undefined && (
        <button type="button" className="reveal__next" onClick={onDone}>
          Next round
        </button>
      )}
    </div>
  )
}

/**
 * Motion here is dramatic, never load-bearing: with it switched off the reveal
 * arrives at its result immediately and says exactly the same thing.
 */
