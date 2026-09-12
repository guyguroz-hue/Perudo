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
import { placeSeats, sceneSeats } from './seating'
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
 * The table is the screen. Everything that is not the table — the round, whose
 * turn it is, the last thing that happened — is laid over it rather than given
 * a band of its own, and the controls are a slim dock along the bottom edge
 * instead of a panel the table has to share the screen with. A player should
 * be looking at six cups, not at a form.
 *
 * There is no "waiting for your turn" curtain either. Covering the table to
 * announce that nothing is happening removes the one thing worth looking at,
 * and in this game waiting is not even idle: a Burst lets any active player bid
 * or challenge out of turn, so the actions stay live and say what they would be.
 */
export function GameTable({
  view,
  busy = false,
  onBid,
  onLie,
  onBull,
}: {
  view: TableView
  busy?: boolean
  onBid: (bid: ProposedBid) => void
  onLie: () => void
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

  const cups = useMemo(() => sceneSeats(seats, view.yourHand), [seats, view.yourHand])

  return (
    <div className={`board${yourTurn ? ' board--yours' : ''}`}>
      <div className="board__stage" style={{ aspectRatio: STAGE_ASPECT }}>
        <TableScene seats={cups} />

        {/* Over the table's far corner, the way a table number is. It is a
            standing fact about the game, not a thing anybody acts on. */}
        <header className="board__strip">
          <span className="board__round">Round {view.roundNumber}</span>
          <span className="board__count" aria-label={`${onTable} dice in play`}>
            <Die hidden size={11} tone="var(--brass)" label="" />
            <b>{onTable}</b>
          </span>
          {view.round.type === 'farewell' && <b className="board__farewell">Farewell</b>}
        </header>

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

        {/* Whose turn it is lives at the seat, where a table puts it. This says
            it in words only when the seat is somebody else's — your own badge
            already carries "Your turn", and saying it twice is one announcement
            too many. It shares the bottom of the table with the log, because
            both are commentary on a move rather than a move. */}
        <p className="board__say" aria-live="polite">
          {holder === null
            ? 'Dealing'
            : holder.isYou
              ? (view.lastEvent ?? '')
              : `${holder.name} is thinking`}
        </p>
      </div>

      <div className="board__dock">
        <section className="board__hand" aria-label="Your dice">
          {view.yourHand === null ? (
            <p className="board__nohand">
              {self?.isEliminated === true ? 'You are out. Watching.' : 'Waiting for dice'}
            </p>
          ) : (
            view.yourHand.map((face, i) => <Die key={i} face={face} size={38} />)
          )}
        </section>

        {canAct && (
          <div className="board__console">
            <BidBuilder
              round={view.round}
              diceOnTable={onTable}
              ownHand={view.yourHand ?? []}
              burst={burst}
              busy={busy}
              onBid={onBid}
            />
            {bid !== null && (
              <ChallengeActions
                bid={bid}
                burst={burst}
                ownDiceCount={self.diceCount}
                busy={busy}
                onLie={onLie}
                onBull={onBull}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export { INLAY_RADIUS }
