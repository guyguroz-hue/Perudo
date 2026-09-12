import { Die } from '../../components/Die'
import type { ProposedBid } from '../../game'
import { diceOnTable } from '../../game'
import { BidBuilder } from './BidBuilder'
import { ChallengeActions } from './ChallengeActions'
import { CurrentBid } from './CurrentBid'
import { PlayerSeat } from './PlayerSeat'
import { placeSeats } from './seating'
import type { TableView } from './view'
import { turnHolder, wouldBurst, you } from './view'
import './GameTable.css'

/**
 * The table, and the screen a player spends most of the game looking at.
 *
 * The board is the product. Everything else on the screen is either sitting on
 * it — cups, names, the bid in the middle — or is a control docked beneath it,
 * where a thumb can reach. There is no panel of game state off to one side,
 * because a game of Perudo is a table with people around it and that is the
 * whole information design.
 *
 * There is no "waiting for your turn" curtain. Covering the table to announce
 * that nothing is happening removes the one thing worth looking at, and in this
 * game waiting is not even idle: a Burst lets any active player bid or
 * challenge out of turn, so the actions stay live and say what they would be.
 *
 * Nothing here moves on its own. The table comes alive through state changes —
 * a bid landing, a turn arriving — never through ambient motion, because a
 * screen that moves constantly is exhausting inside a minute and this one has
 * to be watchable for ten.
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

  return (
    <div className={`board${yourTurn ? ' board--yours' : ''}`}>
      <header className="board__strip">
        <span className="board__round">
          Round {view.roundNumber}
          {view.round.type === 'farewell' && <b className="board__farewell">Farewell</b>}
        </span>
        <span className="board__turn" aria-live="polite">
          {holder === null
            ? 'Dealing'
            : holder.isYou
              ? 'Your turn'
              : `${holder.name} is thinking`}
        </span>
      </header>

      <div className="board__stage">
        <div className="board__surface" aria-hidden="true" />
        <div className="board__centre">
          <CurrentBid
            bid={bid}
            bidderName={view.players.find((p) => p.id === bid?.bidderId)?.name ?? null}
            bullCallerName={
              view.players.find((p) => p.id === bid?.bull?.callerId)?.name ?? null
            }
          />
        </div>
        <ul className="board__seats">
          {seats.map((placement) => (
            <PlayerSeat key={placement.player.id} placement={placement} cup="covered" />
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
            diceOnTable={diceOnTable(
              view.players.map((player) => ({ diceCount: player.diceCount })),
            )}
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
