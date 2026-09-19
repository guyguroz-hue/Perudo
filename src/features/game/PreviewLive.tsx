import { useCallback, useEffect, useState } from 'react'
import { GameTable } from './GameTable'
import { Notice } from './Notice'
import type { NoticeText } from './Notice'
import { minimalRaise, nextActive } from '../../game'
import type { Face, ProposedBid } from '../../game'
import type { TableMove, TablePlayer, TableView } from './view'
import { faceWord } from './events'
import './PreviewLive.css'

/**
 * The table, moving.
 *
 * Every other preview scenario is a still: a fixture rendered once, which is
 * exactly right for asking what the screen looks like and useless for asking
 * what it does when it changes. The faults reported from real tables were all
 * of the second kind — a control that changed meaning under a thumb, a die that
 * moved on its own, a notice that would not leave — and none of them can be
 * seen in a still, or in a game of one.
 *
 * So this is the same `GameTable`, driven by a round held in this tab, with
 * buttons that do the things another player would do. Nothing here reaches a
 * network: the opponents are a button, and the refusals are a button. What is
 * real is everything below them — the bid builder, the challenge tiles, the
 * notice and its clock, and the dock's height.
 */

const PLAYERS: readonly TablePlayer[] = [
  { id: 'alice', name: 'Alice', seatIndex: 0, diceCount: 5, isYou: false, isEliminated: false, hasTurn: false },
  { id: 'you', name: 'Dana', seatIndex: 1, diceCount: 4, isYou: true, isEliminated: false, hasTurn: true },
  { id: 'carl', name: 'Carl', seatIndex: 2, diceCount: 3, isYou: false, isEliminated: false, hasTurn: false },
  { id: 'maya', name: 'Maya', seatIndex: 3, diceCount: 5, isYou: false, isEliminated: false, hasTurn: false },
]

const START: TableView = {
  round: { type: 'normal', lockedFace: null, bid: null },
  roundNumber: 3,
  players: PLAYERS,
  yourHand: [5, 1, 3, 6],
  moves: [],
}

const seating = (players: readonly TablePlayer[]) =>
  players.map((player) => ({
    playerId: player.id,
    seat: player.seatIndex,
    diceCount: player.diceCount,
  }))

const onTable = (players: readonly TablePlayer[]) =>
  players.reduce((total, player) => total + player.diceCount, 0)

const name = (id: string) => PLAYERS.find((player) => player.id === id)?.name ?? 'Someone'

function said(view: TableView, actorId: string, text: string, burst: boolean): TableMove[] {
  return [...view.moves, { id: `m${view.moves.length}`, actorId, text, burst }]
}

/** Apply a bid to the table, exactly as a resolution-free server would. */
function withBid(view: TableView, actorId: string, bid: ProposedBid): TableView {
  const holder = view.players.find((player) => player.hasTurn)
  const burst = holder !== undefined && holder.id !== actorId
  const turn = nextActive(seating(view.players), actorId)
  return {
    ...view,
    round: {
      ...view.round,
      lockedFace:
        view.round.type === 'farewell' && view.round.lockedFace === null
          ? bid.face
          : view.round.lockedFace,
      bid: { quantity: bid.quantity, face: bid.face, bidderId: actorId, bull: null },
    },
    players: view.players.map((player) => ({ ...player, hasTurn: player.id === turn })),
    moves: said(
      view,
      actorId,
      `${name(actorId)} bid ${bid.quantity} ${faceWord(bid.face as Face, bid.quantity)}`,
      burst,
    ),
  }
}

export function PreviewLive() {
  const [view, setView] = useState<TableView>(START)
  const [notice, setNotice] = useState<NoticeText | null>(null)
  const [pressed, setPressed] = useState<string | null>(null)
  // Who bids next when the button is pressed, so it reads like a table going
  // round rather than one opponent shouting.
  const [turnOfOpponent, setTurnOfOpponent] = useState(0)

  const dismiss = useCallback(() => setNotice(null), [])

  // What you just pressed, said quietly and briefly — this tab is poked at
  // quickly and an alert would stop the poking.
  useEffect(() => {
    if (pressed === null) return
    const fades = setTimeout(() => setPressed(null), 2200)
    return () => clearTimeout(fades)
  }, [pressed])

  const opponents = PLAYERS.filter((player) => !player.isYou)

  /** Somebody else raises. The one button this whole tab exists for. */
  const theyBid = () => {
    const actor = opponents[turnOfOpponent % opponents.length]
    setTurnOfOpponent((n) => n + 1)
    setView((current) => withBid(current, actor.id, minimalRaise(current.round, onTable(current.players))))
  }

  const theyBull = () => {
    setView((current) => {
      if (current.round.bid === null || current.round.bid.bull !== null) return current
      const actor = opponents[turnOfOpponent % opponents.length]
      setTurnOfOpponent((n) => n + 1)
      const turn = nextActive(seating(current.players), actor.id)
      return {
        ...current,
        round: {
          ...current.round,
          bid: { ...current.round.bid, bull: { callerId: actor.id } },
        },
        players: current.players.map((player) => ({ ...player, hasTurn: player.id === turn })),
        moves: said(current, actor.id, `${name(actor.id)} called Bull`, true),
      }
    })
  }

  const farewell = () =>
    setView({
      ...START,
      round: { type: 'farewell', lockedFace: null, bid: null },
      players: PLAYERS.map((player) => ({ ...player, hasTurn: player.id === 'carl' })),
      moves: [],
    })

  return (
    <>
      <div className="live__panel">
        <p className="live__lead">
          The real table, with the other players on a button. Watch the face you
          picked, the height of the dock, and what is pressable the instant a bid
          lands.
        </p>
        <div className="live__acts">
          <button type="button" className="live__act live__act--loud" onClick={theyBid}>
            Somebody bids
          </button>
          <button type="button" className="live__act" onClick={theyBull}>
            Somebody Bulls
          </button>
          <button
            type="button"
            className="live__act"
            onClick={() =>
              setNotice({
                message: 'Somebody else acted first. The table has moved on.',
                code: 'STALE_STATE',
                stale: true,
              })
            }
          >
            News
          </button>
          <button
            type="button"
            className="live__act"
            onClick={() =>
              setNotice({
                message: 'This bid has already been Bulled.',
                code: 'BULL_ALREADY_CALLED',
                stale: false,
              })
            }
          >
            Refusal
          </button>
          <button type="button" className="live__act" onClick={farewell}>
            Farewell Round
          </button>
          <button
            type="button"
            className="live__act"
            onClick={() => {
              setView(START)
              setNotice(null)
              setTurnOfOpponent(0)
            }}
          >
            New round
          </button>
        </div>
        {pressed !== null && (
          <p className="live__said" role="status">
            {pressed}
          </p>
        )}
      </div>

      <div className="preview__fit">
        {/* Wrapped the way the real screen wraps it: `.game` inside the room,
            with the notice laid over the scene rather than above it. */}
        <div className="game">
          {notice !== null && <Notice notice={notice} onDismiss={dismiss} />}
          <GameTable
            view={view}
            onBid={(bid) => {
              setPressed(`You bid ${bid.quantity} ${faceWord(bid.face, bid.quantity)}`)
              setView((current) => withBid(current, 'you', bid))
            }}
            onLie={() => setPressed('Lie — the reveal is on its own tab')}
            onBull={() => setPressed('Bull — the reveal is on its own tab')}
          />
        </div>
      </div>
    </>
  )
}
