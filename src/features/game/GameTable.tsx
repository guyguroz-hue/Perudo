import { useMemo } from 'react'
import { Die } from '../../components/Die'
import type { ProposedBid } from '../../game'
import { diceOnTable } from '../../game'
import { INLAY_RADIUS, STAGE_ASPECT, centreAnchor, inlayWidth } from '../../three/layout'
import { BidBuilder } from './BidBuilder'
import { ChallengeActions } from './ChallengeActions'
import { CurrentBid } from './CurrentBid'
import { PlayerSeat } from './PlayerSeat'
import { TableScene } from './TableScene'
import { hexForSeat } from './colors'
import { placeSeats } from './seating'
import type { TableView } from './view'
import { turnHolder, wouldBurst, you } from './view'
import './GameTable.css'

/**
 * The table, and the screen a player spends most of the game looking at.
 *
 * A rendered table with the interface standing on top of it. The cups, the
 * dice and the timber are geometry; the names, the bid and the controls are
 * ordinary DOM, projected through the same camera the renderer uses. That
 * division is the whole design: the table gets perspective and material, and
 * the writing stays crisp, selectable and the size it needs to be.
 *
 * There is no "waiting for your turn" curtain. Covering the table to announce
 * that nothing is happening removes the one thing worth looking at, and in this
 * game waiting is not even idle: a Burst lets any active player bid or
 * challenge out of turn, so the actions stay live and say what they would be.
 */
export function GameTable({
  view,
  busy = false,
  onBid,
  onDudo,
  onBull,
}: {
  view: TableView
  busy?: boolean
  onBid: (bid: ProposedBid) => void
  onDudo: () => void
  onBull: () => void
}) {
  const holder = turnHolder(view)
  const self = you(view)
  const burst = wouldBurst(view)
  const yourTurn = holder !== null && holder.isYou
  const canAct = self !== null && !self.isEliminated
  const seats = placeSeats(view.players)
  const bid = view.round.bid
  // Every bid is a claim about this number, so it belongs beside the bid rather
  // than being counted off the seats each time somebody wants to weigh one.
  const onTable = diceOnTable(view.players.map((p) => ({ diceCount: p.diceCount })))

  /*
   * What the renderer is told.
   *
   * Only the players still holding dice get a cup, and only your own hand ever
   * carries values — the scene is handed exactly what this browser is entitled
   * to know, so there is nothing in it to leak.
   */
  const sceneSeats = useMemo(
    () =>
      seats
        .filter((seat) => !seat.player.isEliminated)
        .map((seat) => ({
          id: seat.player.id,
          index: seat.index,
          count: seat.count,
          colour: hexForSeat(seat.player.seatIndex),
          dice: seat.player.isYou ? (view.yourHand ?? undefined) : undefined,
        })),
    [seats, view.yourHand],
  )

  return (
    <div className={`board${yourTurn ? ' board--yours' : ''}`}>
      <header className="board__strip">
        <span className="board__round">
          Round {view.roundNumber}
          <span className="board__count" aria-label={`${onTable} dice in play`}>
            <Die hidden size={11} tone="var(--brass)" label="" />
            <b>{onTable}</b>
          </span>
          {view.round.type === 'farewell' && <b className="board__farewell">Farewell</b>}
        </span>
        {/* Whose turn it is lives at the seat, where a table puts it. This
            says it in words only when the seat is somebody else's — your own
            badge already carries "Your turn", and saying it twice on one screen
            is one announcement too many. */}
        <span className="board__turn" aria-live="polite">
          {holder === null ? 'Dealing' : holder.isYou ? '' : `${holder.name} is thinking`}
        </span>
      </header>

      <div className="board__stage" style={{ aspectRatio: STAGE_ASPECT }}>
        <TableScene seats={sceneSeats} />

        {/* Never narrower than the brass ring it sits in, never clipped by it
            either: the bid reads across, and a long name is worth more than a
            tidy edge. */}
        <div className="board__centre" style={{ ...centreAnchor(), minWidth: `${inlayWidth()}%` }}>
          <CurrentBid
            bid={bid}
            bullCallerName={
              view.players.find((p) => p.id === bid?.bull?.callerId)?.name ?? null
            }
          />
        </div>

        <ul className="board__seats">
          {seats.map((placement) => (
            <PlayerSeat key={placement.player.id} placement={placement} />
          ))}
        </ul>
      </div>

      {view.lastEvent !== null && <p className="board__log">{view.lastEvent}</p>}

      <section className="board__hand" aria-label="Your dice">
        {view.yourHand === null ? (
          <p className="board__nohand">
            {self?.isEliminated === true ? 'You are out. Watching.' : 'Waiting for dice'}
          </p>
        ) : (
          view.yourHand.map((face, i) => <Die key={i} face={face} size={46} />)
        )}
      </section>

      {canAct && (
        <div className="board__console">
          {bid !== null && (
            <ChallengeActions
              bid={bid}
              burst={burst}
              ownDiceCount={self.diceCount}
              busy={busy}
              onDudo={onDudo}
              onBull={onBull}
            />
          )}
          <BidBuilder
            round={view.round}
            diceOnTable={onTable}
            ownHand={view.yourHand ?? []}
            burst={burst}
            busy={busy}
            onBid={onBid}
          />
        </div>
      )}
    </div>
  )
}

export { INLAY_RADIUS }
