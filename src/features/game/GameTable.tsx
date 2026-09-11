import { Die } from '../../components/Die'
import type { ProposedBid } from '../../game'
import { diceOnTable } from '../../game'
import { BidBuilder } from './BidBuilder'
import { ChallengeActions } from './ChallengeActions'
import type { TableView } from './view'
import { turnHolder, wouldBurst, you } from './view'
import './GameTable.css'

/**
 * The table, and the screen a player spends most of the game looking at.
 *
 * There is no "waiting for your turn" curtain. Covering the table to announce
 * that nothing is happening removes the one thing worth looking at, and in this
 * game waiting is not even idle: a Burst lets any player bid or challenge out
 * of turn, so the actions stay live and say what they would be.
 *
 * Nothing here moves on its own. The table comes alive through state changes —
 * a bid landing, a turn arriving — never through ambient motion, because a
 * screen that moves constantly is exhausting inside a minute and this one has
 * to be watchable for ten.
 *
 * The order down the screen is the order of the questions a player asks:
 * whose turn, what is the bid, what do I hold, who else is here, what just
 * happened.
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

  return (
    <div className={`table${yourTurn ? ' table--yours' : ''}`}>
      <header className="table__round">
        <span>Round {view.roundNumber}</span>
        {view.round.type === 'farewell' && (
          <span className="table__farewell">
            Farewell Round — ones are not wild
            {view.round.lockedFace !== null && <> · face locked</>}
          </span>
        )}
      </header>

      <p className="table__turn" aria-live="polite">
        {holder === null
          ? 'Waiting for the next round'
          : holder.isYou
            ? 'Your turn'
            : `${holder.name} is thinking`}
      </p>

      <Bid view={view} />

      <ul className="table__players">
        {view.players.map((player) => (
          <li
            key={player.id}
            className={[
              'table__player',
              player.hasTurn && !player.isEliminated ? 'table__player--turn' : '',
              player.isEliminated ? 'table__player--out' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="table__name">
              {player.name}
              {player.isYou && <span className="table__you"> (you)</span>}
            </span>
            <span className="table__cups" aria-label={`${player.diceCount} dice`}>
              {player.isEliminated ? (
                <span className="table__gone">out</span>
              ) : (
                Array.from({ length: player.diceCount }, (_, i) => (
                  <Die key={i} hidden size={18} label="Hidden die" />
                ))
              )}
            </span>
          </li>
        ))}
      </ul>

      {view.lastEvent !== null && <p className="table__log">{view.lastEvent}</p>}

      <section className="table__hand" aria-label="Your dice">
        {view.yourHand === null ? (
          <p className="table__nohand">
            {self?.isEliminated === true ? 'You are out. Watching.' : 'Waiting for dice'}
          </p>
        ) : (
          view.yourHand.map((face, i) => <Die key={i} face={face} size={44} />)
        )}
      </section>

      {canAct && (
        <div className="table__actions">
          {view.round.bid !== null && (
            <ChallengeActions
              bid={view.round.bid}
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

/**
 * The bid on the table.
 *
 * A Bull does not replace the bid — it re-reads it as "exactly" instead of
 * "at least" (GAME_RULES §8.1) — so it is shown as a change of reading on the
 * same numbers rather than as a separate thing.
 */
function Bid({ view }: { view: TableView }) {
  const bid = view.round.bid
  const bidder = view.players.find((player) => player.id === bid?.bidderId)
  const bullCaller = view.players.find((player) => player.id === bid?.bull?.callerId)

  if (bid === null) {
    return (
      <p className="table__bid table__bid--none">
        No bid yet
        <span className="table__bidder">the round is open</span>
      </p>
    )
  }

  return (
    <p className={`table__bid${bid.bull !== null ? ' table__bid--bulled' : ''}`}>
      <span className="table__reading">{bid.bull !== null ? 'exactly' : 'at least'}</span>
      <span className="table__quantity">{bid.quantity}</span>
      <Die face={bid.face} size={40} />
      <span className="table__bidder">
        {bidder?.name ?? 'someone'}
        {bullCaller !== undefined && <> · Bull by {bullCaller.name}</>}
      </span>
    </p>
  )
}
