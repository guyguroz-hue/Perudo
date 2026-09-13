import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Face, ProposedBid } from '../../game'
import { GameTable } from '../game/GameTable'
import { claimFor } from '../game/reveal'
import { LESSON } from './lesson'
import type { Step } from './lesson'
import { faceWord, fairRoll } from './table'
import type { Roll } from './table'
import { useBotTable } from './useBotTable'
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

export function TutorialScreen() {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [teaching, setTeaching] = useState(true)
  const step: Step | undefined = teaching ? LESSON[stepIndex] : undefined
  /*
   * The step, readable from a callback without making that callback depend on
   * it.
   *
   * `allow` runs inside the table's own move handler, which the hook memoises —
   * so it must not change identity every time the card does, or every move
   * would rebuild the table's handlers. Written in an effect rather than
   * during render: a ref assigned while rendering is a render with a side
   * effect, and the callbacks that read it all fire well after this lands.
   */
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  }, [step])

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= LESSON.length) {
        setTeaching(false)
        return i
      }
      return i + 1
    })
  }, [])

  /*
   * The lesson holds the player to the move the card is asking for.
   *
   * Checked before the move reaches the table rather than after, or the table
   * has already moved on by the time anybody objects. A wrong move is a chance
   * to say the rule again, not an error.
   */
  const allow = useCallback((kind: 'bid' | 'lie' | 'bull', proposed?: ProposedBid) => {
    const want = stepRef.current?.advance
    if (want === undefined || want.kind === 'read' || want.kind === 'watch') return null
    if (want.kind === 'burst') return null
    if (want.kind !== kind) {
      return kind === 'bid'
        ? 'Not this time — the card above says what to do.'
        : 'Try what the card asks for first.'
    }
    if (want.kind === 'bid' && proposed !== undefined) {
      if (proposed.quantity !== want.quantity || proposed.face !== want.face) {
        // Name the bid being asked for. "The face beside it" is no help to
        // somebody who does not yet know which control the face is.
        return (
          `Not yet — make it ${want.quantity} ${faceWord(want.face, want.quantity)}. ` +
          `Use − and + for the number, and the row of dice for the face.`
        )
      }
    }
    return null
  }, [])

  const onPlayerMove = useCallback((kind: 'bid' | 'lie' | 'bull') => {
    if (stepRef.current?.advance.kind === kind) next()
  }, [next])

  const onBackToPlayer = useCallback(() => {
    if (stepRef.current?.advance.kind === 'watch') next()
  }, [next])

  const names = useMemo(() => ['You', 'Ada', 'Bo', 'Cy'], [])
  const game = useBotTable({
    names,
    firstRoll: scriptedRoll,
    allow,
    onPlayerMove,
    onBackToPlayer,
  })

  /*
   * The bots are held while a card is up that the player has to read or act on:
   * a table moving under an explanation is a table nobody reads the
   * explanation of.
   *
   * The exception is a card asking for a challenge when there is nothing on the
   * table to challenge — a bot may have just ended the round — where the card
   * would sit over a refusing button with no way forward. Then the table plays
   * on until there is a claim to doubt.
   */
  const kind = step?.advance.kind
  const needsClaim = (kind === 'lie' || kind === 'bull') && game.state.round.bid === null
  useEffect(() => {
    game.setPaused(step !== undefined && kind !== 'watch' && !needsClaim)
  }, [game, step, kind, needsClaim])

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
      game.cutIn(want.actor, want.quantity, want.face)
      next()
    }, 1700)
    return () => clearTimeout(cut)
  }, [step, game, next])

  const won = game.state.over && game.state.winnerId === 'you'

  return (
    <div className="learn">
      <GameTable
        view={game.view}
        reveal={
          game.reveal === null
            ? null
            : { claim: claimFor(game.reveal), data: game.reveal, onDone: game.dismissReveal }
        }
        onBid={game.place}
        onLie={game.doubt}
        onBull={game.callBull}
      />

      {step !== undefined && (
        <aside className={`coach coach--${step.point ?? 'none'}`} role="status">
          <p className="coach__step">
            {stepIndex + 1} of {LESSON.length}
          </p>
          <h2 className="coach__title">{step.title}</h2>
          <p className="coach__body">{step.body}</p>
          {game.refused !== null && <p className="coach__nudge">{game.refused}</p>}
          {step.advance.kind === 'read' && (
            <button type="button" className="coach__next" onClick={next}>
              {stepIndex + 1 === LESSON.length ? 'Play' : 'Next'}
            </button>
          )}
        </aside>
      )}

      {game.state.over && (
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
                setTeaching(false)
                game.restart()
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

      {!teaching && !game.state.over && (
        <button type="button" className="learn__leave" onClick={() => navigate('/')}>
          Leave the practice table
        </button>
      )}
    </div>
  )
}
