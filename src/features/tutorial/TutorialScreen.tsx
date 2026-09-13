import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Face, ProposedBid } from '../../game'
import { GameTable } from '../game/GameTable'
import { claimFor } from '../game/reveal'
import type { RevealData } from '../game/reveal'
import type { TableView } from '../game/view'
import { botToAct, decide } from './bots'
import { LESSON } from './lesson'
import type { Step } from './lesson'
import { bid, bull, challenge, deal, faceWord, fairRoll, seat, seatOf } from './table'
import type { Roll, TableState } from './table'
import './TutorialScreen.css'

/**
 * Learning the game by playing it.
 *
 * The whole thing runs in this tab. It has to: the server exists to stop a
 * client seeing dice it should not and claiming results the rules do not
 * support, and a table of bots has nobody to hide from. Paying a round trip per
 * move to learn the rules would be absurd.
 *
 * What it does not do is re-implement them. The table underneath is driven by
 * `src/game` — the same module the Edge Function imports — and the screen is
 * the real `GameTable`, the same component a real game renders. So this cannot
 * teach a rule the game does not have, or a screen the player will not meet
 * again five minutes from now.
 */

/** The hand the lesson is written against. Two fours and a wildcard is three. */
const SCRIPTED: Record<string, Face[]> = {
  you: [4, 4, 1, 2, 6],
  ada: [4, 5, 5, 3, 2],
  bo: [6, 6, 1, 3, 5],
  cy: [2, 3, 4, 6, 6],
}

const scriptedRoll: Roll = (playerId, count) =>
  (SCRIPTED[playerId] ?? fairRoll(playerId, count)).slice(0, count)

function freshTable(): TableState {
  return {
    seats: [
      seat('you', 'You', 0, true),
      seat('ada', 'Ada', 1),
      seat('bo', 'Bo', 2),
      seat('cy', 'Cy', 3),
    ],
    round: { type: 'normal', lockedFace: null, bid: null },
    roundNumber: 0,
    turnId: 'you',
    farewellQueue: [],
    lastEvent: null,
    winnerId: null,
    over: false,
  }
}

export function TutorialScreen() {
  const navigate = useNavigate()
  const table = useRef<TableState>(freshTable())
  /*
   * The table is mutated in place — it is a game, not a value — so renders are
   * driven by a counter rather than by replacing it.
   *
   * The counter itself has to be read, not just written: depending on the
   * setter is depending on nothing, because React keeps that stable for the
   * life of the component. Written that way the view below was computed once,
   * before the first deal, and the player's own hand never appeared.
   */
  const [tick, bump] = useState(0)
  const redraw = useCallback(() => bump((n) => n + 1), [])

  const [stepIndex, setStepIndex] = useState(0)
  const [teaching, setTeaching] = useState(true)
  const [reveal, setReveal] = useState<RevealData | null>(null)
  const [nudge, setNudge] = useState<string | null>(null)

  const step: Step | undefined = teaching ? LESSON[stepIndex] : undefined

  useEffect(() => {
    deal(table.current, scriptedRoll)
    redraw()
  }, [redraw])

  // A wrong move during the lesson is a chance to say the rule again, not an
  // error. It is cleared as soon as anything else happens.
  useEffect(() => {
    if (nudge === null) return
    const clear = setTimeout(() => setNudge(null), 3200)
    return () => clearTimeout(clear)
  }, [nudge])

  const next = useCallback(() => {
    setNudge(null)
    setStepIndex((i) => {
      if (i + 1 >= LESSON.length) {
        setTeaching(false)
        return i
      }
      return i + 1
    })
  }, [])

  /*
   * The bots take their turns.
   *
   * Paused while a card is up that the player has to read or act on: a table
   * moving under an explanation is a table nobody reads the explanation of.
   * They are also slowed right down — a bot could answer instantly, and a
   * game where three opponents move between blinks teaches nothing about a
   * game played at the speed of people talking.
   */
  /*
   * A step that asks for a challenge needs something to challenge.
   *
   * The bots are paused while a card is up, but a bot may have ended the round
   * a moment earlier — and then the card says "call Lie" over a table with no
   * claim on it, the button refuses, and the lesson is stuck with no way
   * forward. When that happens the table is allowed to keep playing until
   * there is a claim to doubt.
   */
  const needsClaim =
    (step?.advance.kind === 'lie' || step?.advance.kind === 'bull') &&
    table.current.round.bid === null
  const waiting = step !== undefined && step.advance.kind !== 'watch' && !needsClaim

  /*
   * The scripted cut-in.
   *
   * Played by the lesson rather than by the bot policy, because the bots never
   * Burst: at a table where three opponents may act at any moment, a beginner
   * cannot tell a rule from chaos. This is the one Burst in the tutorial, at a
   * moment the card has just told the player to watch for.
   */
  useEffect(() => {
    const want = step?.advance
    if (want === undefined || want.kind !== 'burst') return
    const cut = setTimeout(() => {
      const done = bid(table.current, want.actor, want.quantity, want.face)
      // If the script has drifted past what the rules allow, say so here rather
      // than stranding the player on a card that never resolves.
      if (!done.ok) setNudge(done.why)
      redraw()
      next()
    }, 1700)
    return () => clearTimeout(cut)
  }, [step, redraw, next])
  useEffect(() => {
    if (waiting || reveal !== null) return
    const state = table.current
    if (state.over) return
    const bot = botToAct(state)
    if (bot === null) return

    const act = setTimeout(() => {
      const move = decide(state, bot.id)
      if (move.kind === 'bid') bid(state, bot.id, move.quantity, move.face)
      else if (move.kind === 'bull') bull(state, bot.id)
      else {
        const done = challenge(state, bot.id)
        if (done.ok) setReveal(done.reveal)
      }
      redraw()
      // The step that asks the player to watch ends when the table comes back
      // round to them.
      if (step?.advance.kind === 'watch' && state.turnId === 'you') next()
    }, 1400)
    return () => clearTimeout(act)
    // `tick` is load-bearing: it is what makes this run again after each move.
    // Without it one bot acts, the table is redrawn, and nothing re-triggers —
    // the round stops dead with two players still to speak.
  }, [waiting, reveal, redraw, step, next, stepIndex, tick, needsClaim])

  const view: TableView = useMemo(() => {
    const state = table.current
    return {
      round: state.round,
      roundNumber: Math.max(1, state.roundNumber),
      players: state.seats.map((s) => ({
        id: s.id,
        name: s.name,
        seatIndex: s.seatIndex,
        diceCount: s.diceCount,
        isYou: s.isYou,
        isEliminated: s.diceCount === 0,
        hasTurn: state.turnId === s.id,
      })),
      yourHand: seatOf(state, 'you').diceCount > 0 ? seatOf(state, 'you').dice : null,
      lastEvent: state.lastEvent,
    }
    // Rebuilt on every redraw, which is the point: the table is mutable.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  /** A move the player made. During the lesson, only the asked-for one lands. */
  const attempt = useCallback(
    (kind: 'bid' | 'lie' | 'bull', proposed?: ProposedBid) => {
      const state = table.current
      const want = step?.advance

      if (want !== undefined && want.kind !== 'read' && want.kind !== 'watch') {
        if (want.kind !== kind) {
          setNudge(
            kind === 'bid'
              ? 'Not this time — the card above says what to do.'
              : `Try what the card asks for first.`,
          )
          return
        }
        if (want.kind === 'bid' && proposed !== undefined) {
          if (proposed.quantity !== want.quantity || proposed.face !== want.face) {
            // Name the bid being asked for. "The face beside it" is no help to
            // somebody who does not yet know which control the face is.
            setNudge(
              `Not yet — make it ${want.quantity} ${faceWord(want.face, want.quantity)}. ` +
                `Use − and + for the number, and the row of dice for the face.`,
            )
            return
          }
        }
      }

      if (kind === 'lie') {
        const done = challenge(state, 'you')
        if (!done.ok) {
          setNudge(done.why)
          return
        }
        setReveal(done.reveal)
      } else {
        const done =
          kind === 'bid' && proposed !== undefined
            ? bid(state, 'you', proposed.quantity, proposed.face)
            : bull(state, 'you')
        if (!done.ok) {
          setNudge(done.why)
          return
        }
      }
      redraw()
      if (want !== undefined && want.kind === kind) next()
    },
    [step, next, redraw],
  )

  const closeReveal = useCallback(() => {
    setReveal(null)
    const state = table.current
    if (!state.over) {
      deal(state, fairRoll)
      redraw()
    } else {
      redraw()
    }
  }, [redraw])

  const state = table.current
  const won = state.over && state.winnerId === 'you'

  return (
    <div className="learn">
      <GameTable
        view={view}
        reveal={
          reveal === null
            ? null
            : { claim: claimFor(reveal), data: reveal, onDone: closeReveal }
        }
        onBid={(proposed) => attempt('bid', proposed)}
        onLie={() => attempt('lie')}
        onBull={() => attempt('bull')}
      />

      {step !== undefined && (
        <aside className={`coach coach--${step.point ?? 'none'}`} role="status">
          <p className="coach__step">
            {stepIndex + 1} of {LESSON.length}
          </p>
          <h2 className="coach__title">{step.title}</h2>
          <p className="coach__body">{step.body}</p>
          {nudge !== null && <p className="coach__nudge">{nudge}</p>}
          {step.advance.kind === 'read' && (
            <button type="button" className="coach__next" onClick={next}>
              {stepIndex + 1 === LESSON.length ? 'Play' : 'Next'}
            </button>
          )}
        </aside>
      )}

      {state.over && (
        <aside className="coach coach--done" role="status">
          <h2 className="coach__title">{won ? 'You won' : 'That is a game'}</h2>
          <p className="coach__body">
            {won
              ? 'Last one holding dice. That is all there is to it — go and take somebody’s money.'
              : 'Out of dice. It happens; the table only has to be wrong about you once.'}
          </p>
          <div className="coach__ends">
            <button
              type="button"
              className="coach__next"
              onClick={() => {
                table.current = freshTable()
                deal(table.current, fairRoll)
                setReveal(null)
                setTeaching(false)
                redraw()
              }}
            >
              Again
            </button>
            <button type="button" className="coach__leave" onClick={() => navigate('/')}>
              Done
            </button>
          </div>
        </aside>
      )}

      {!teaching && !state.over && (
        <button type="button" className="learn__leave" onClick={() => navigate('/')}>
          Leave the practice table
        </button>
      )}
    </div>
  )
}
