import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Die } from '../../components/Die'
import { SoundToggle } from '../../components/SoundToggle'
import type { ActiveBid, ProposedBid } from '../../game'
import { diceOnTable } from '../../game'
import { INLAY_RADIUS, STAGE_ASPECT, centreAnchor, inlayWidth } from '../../three/layout'
import { BidRow, FaceRack, useBidDraft } from './BidBuilder'
import { ChallengeActions } from './ChallengeActions'
import { CurrentBid } from './CurrentBid'
import type { ClaimOwner } from './CurrentBid'
import { MoveLog } from './MoveLog'
import { PlayerSeat } from './PlayerSeat'
import { RevealPanel } from './RevealPanel'
import { TableScene } from './TableScene'
import { useBurst } from './burst'
import { SHAKE_MS, useDealShake } from './dealing'
import type { RevealClaim, RevealData } from './reveal'
import { PAY_AFTER_MS, useRevealStage } from './revealStage'
import { dueDice, placeSeats, sceneSeats } from './seating'
import { usePrefersReducedMotion } from '../../lib/motion'
import { useSound, useSoundEffect } from '../../lib/useSound'
import type { TablePlayer, TableView } from './view'
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
 *
 * A reveal does not take the screen either — it happens *on* this table. The
 * cups come off where they stand, on the same wood, in front of the same room,
 * and the controls give way to the count. Cutting to a separate screen for the
 * one moment the game has been building to threw away the table at exactly the
 * point it was worth the most.
 *
 * The end of the game is the same argument one step further on. It used to
 * replace this whole screen with a panel on a black field — the last thing
 * anybody saw, and the only screen in the product that still looked like a
 * different application. A game ends at the table it was played on, with the
 * winner's cup the one still standing.
 */
export function GameTable({
  view,
  busy = false,
  reveal = null,
  finish = null,
  layout = 'split',
  onBid,
  onLie,
  onBull,
}: {
  view: TableView
  busy?: boolean
  /**
   * A challenge being resolved, from the moment it is made.
   *
   * `data` is null until the server answers, and that is deliberate: the table
   * starts holding its breath before the answer exists, so the dramatic pause
   * and the network wait are the same moment.
   */
  reveal?: { claim: RevealClaim; data: RevealData | null; onDone?: () => void } | null
  /**
   * How the game ended, once it has.
   *
   * Takes the dock, exactly as a reveal does — and for the same reason. The
   * result of a game is not somewhere else: it is this table with one cup left
   * standing on it, and replacing the whole screen with a panel threw away the
   * only picture anybody wanted to be looking at.
   */
  finish?: ReactNode
  /**
   * Which way round the console goes. See `DockLayout`.
   *
   * Only `/preview` ever passes this; every real screen takes the default, so
   * the arrangement players see cannot change by accident while the two are
   * being compared.
   */
  layout?: DockLayout
  onBid: (bid: ProposedBid) => void
  onLie: () => void
  onBull: () => void
}) {
  const holder = turnHolder(view)
  const self = you(view)
  const burst = wouldBurst(view)
  const yourTurn = holder !== null && holder.isYou
  const canAct = self !== null && !self.isEliminated
  const bid = view.round.bid
  // Every bid is a claim about this number, so it belongs beside the bid rather
  // than being counted off the seats each time somebody wants to weigh one.
  const onTable = diceOnTable(view.players.map((p) => ({ diceCount: p.diceCount })))

  /*
   * The deal.
   *
   * Six cups shaken at once for a beat, whenever the round number moves. It is
   * the only announcement a new round gets: the dice under the cups are already
   * different, and a banner saying so would be a banner covering the table.
   */
  const shaking = useDealShake(view.roundNumber)
  /*
   * Somebody cut in.
   *
   * The move this game is built around, and until now the quietest thing on
   * the screen: a line in the log, in the corner, while the player was looking
   * at the middle of the table.
   */
  const jolting = useBurst(view.moves)
  const { stage, counted } = useRevealStage(reveal?.data ?? null)
  const lifting = reveal !== null && stage !== 'held'
  const mood = lifting ? 'revealing' : shaking ? 'dealing' : 'still'

  /*
   * The eye goes up for the reveal.
   *
   * A seat's view is the right one for playing and the wrong one for the one
   * moment the game is arithmetic: six hands lying flat, seen at thirty-five
   * degrees, are six huddles of foreshortened specks, and the player is asked
   * to take the count on trust. Straight down, every die is a die.
   *
   * It goes up with the cups rather than with the answer, so the move and the
   * lift are one gesture, and it comes back down the moment the reveal closes.
   */
  const [eye, setEye] = useState(0)
  const wantsOverhead = lifting ? 1 : 0
  const reducedMotion = usePrefersReducedMotion()


  /*
   * What the table sounds like.
   *
   * Sound follows the picture rather than the event that caused it: the cups
   * are heard rattling for exactly as long as they are seen rattling, and the
   * knock of a cup coming off lands on the frame it starts to move. Anything
   * else is a foley track playing next to a game.
   */
  const sound = useSound()
  const effect = useSoundEffect()
  useEffect(() => {
    if (shaking) effect('shake', SHAKE_MS / 1000)
  }, [shaking, effect])
  useEffect(() => {
    if (lifting) effect('lift')
  }, [lifting, effect])

  /*
   * Held across renders.
   *
   * Handing the renderer a new array is handing it a new table: it rebuilds
   * every cup, which throws away any animation in flight — so a shake that
   * happened to span an unrelated render restarted from the beginning. Seats
   * only actually change when somebody goes out.
   */
  // Deliberately not a function of where the eye is: this is who is sitting
  // where, which does not change while the camera moves. The badges place
  // themselves from `eye`; the scene must keep the table it already built.
  const seats = useMemo(() => placeSeats(view.players), [view.players])
  const cups = useMemo(
    () =>
      sceneSeats(
        seats,
        view.yourHand,
        mood,
        lifting ? (reveal?.data?.hands ?? null) : null,
        // The claim is known from the first frame of the reveal — it was public
        // before anybody challenged — so the dice can be marked the moment they
        // are on show, without waiting for the server's answer.
        lifting && reveal !== null
          ? { face: reveal.claim.face, roundType: reveal.data?.roundType ?? view.round.type }
          : null,
      ),
    [seats, view.yourHand, mood, lifting, reveal, view.round.type],
  )


  /*
   * The dice that change hands, once the count has been read out.
   *
   * Held as one memo so the renderer plays it once: it becomes a new object
   * exactly when a new resolution lands, and the same object on every other
   * render. A fresh array each render would send the dice off the table sixty
   * times a second.
   *
   * Timed to the verdict rather than to the lift. The answer to "how many"
   * comes first and the dice leave on the back of it; before the result there
   * is nothing to pay.
   */
  const settled = stage === 'result' ? (reveal?.data ?? null) : null

  /*
   * Nothing moves for a beat after the verdict.
   *
   * The answer lands and the count is marked out on the table, and that is the
   * moment a player actually reads what happened. A die leaving on the same
   * frame takes the answer away while they are still working it out — the
   * thing that mattered most is over before they look up.
   */
  const [paidFor, setPaidFor] = useState<RevealData | null>(null)
  useEffect(() => {
    if (settled === null) return
    const pays = setTimeout(() => setPaidFor(settled), PAY_AFTER_MS)
    return () => clearTimeout(pays)
  }, [settled])
  // Derived rather than cleared, so closing a reveal needs no second render to
  // undo the first: a resolution is due only while it is still the one on the
  // table, and the next one arrives as a different object.
  const dueNow = paidFor === settled ? settled : null

  const paying = useMemo(
    () => (dueNow === null ? null : dueDice(seats, dueNow.deltas)),
    [dueNow, seats],
  )

  return (
    <div
      className={`board${yourTurn ? ' board--yours' : ''}${shaking ? ' board--dealing' : ''}${
        jolting ? ' board--burst' : ''
      }`}
    >
      <div className="board__stage" style={{ aspectRatio: STAGE_ASPECT }}>
        <TableScene
          seats={cups}
          overhead={wantsOverhead}
          immediate={reducedMotion}
          paying={paying}
          onRise={setEye}
        />

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

        {/* The opposite corner from the round number, where nothing else is. */}
        <div className="board__sound">
          <SoundToggle on={sound.on} onToggle={sound.toggle} />
        </div>

        {/*
          * What has been said, under the round number.
          *
          * This used to be one line at the foot of the scene, and one line is
          * not enough in a game with Burst. Whose bid is on the table cannot be
          * read off turn order when anybody may speak at any moment, and the
          * line naming the challenger was overwritten by the reveal it caused —
          * so the one moment a player most needs to know who doubted them was
          * the one moment nothing said.
          *
          * It stays up through the reveal for exactly that reason, and it moved
          * to the top because the foot of the scene is where the cups end up
          * once the eye goes overhead.
          */}
        {holder === null && reveal === null && view.moves.length === 0 ? (
          <p className="board__dealing">Dealing</p>
        ) : (
          <MoveLog moves={view.moves} players={view.players} />
        )}

        {/* Never narrower than the brass ring it sits in, never clipped by it
            either: the bid reads across, and a long name is worth more than a
            tidy edge.

            It stays there through the reveal. It is the thing on trial, and
            moving the evidence at the moment of judgement would be an odd thing
            to do — the panel below carries it again because that is where the
            count happens, not because it left the table. */}
        {/* Nothing is on trial once the game is over. The middle said "open",
            which is true of a round waiting for its first bid and meaningless
            over a table nobody is going to bid at again. */}
        {finish === null && (
          <div
            className="board__centre"
            style={{ ...centreAnchor(eye), minWidth: `${inlayWidth(eye)}%` }}
            // Overhead the middle of the table is where the dice are, so the
            // bid gets out of their way rather than sitting on the evidence.
            data-overhead={eye > 0.5 ? 'true' : undefined}
          >
            {/* The claim's owner, which a Bull changes hands (§8.3). */}
            <CurrentBid bid={bid} owner={claimOwner(view, bid)} />
          </div>
        )}

        <ul className="board__seats">
          {seats.map((placement) => (
            <PlayerSeat
              key={placement.player.id}
              placement={placement}
              lifted={eye}
              overhead={eye}
            />
          ))}
        </ul>

      </div>

      <div className="board__dock">
        {reveal !== null ? (
          <RevealPanel
            claim={reveal.claim}
            data={reveal.data}
            stage={stage}
            counted={counted}
            onDone={reveal.onDone}
          />
        ) : finish !== null ? (
          finish
        ) : (
          <TableDock
            layout={layout}
            view={view}
            self={self}
            bid={bid}
            burst={burst}
            canAct={canAct}
            busy={busy}
            onTable={onTable}
            onBid={onBid}
            onLie={onLie}
            onBull={onBull}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Your hand, and everything you can say about the table.
 *
 * Stands down for a reveal: while the cups are coming off there is nothing to
 * bid on and nothing to challenge, and leaving the controls up would be
 * offering moves that would be refused.
 */
/**
 * Which way round the console goes.
 *
 * Two arrangements of the same four things, and the thing they disagree about
 * is where the rack of faces sits relative to the player's own dice. Those two
 * were a row of dice each, an inch apart, one secret and one a picker — and a
 * heading over each was nowhere near enough to tell them apart.
 *
 *   split    the hand beside the bid, sharing a line
 *   stacked  the hand on top, the rack at the very bottom, with everything
 *            you can press in between
 *
 * Both are here because which one is better is a question about how it feels
 * in a hand, and that is not a question source code answers. `/preview` shows
 * either; every real screen takes the default, so the one players get cannot
 * change while the two are being compared. Whichever wins, the other goes.
 */
export type DockLayout = 'split' | 'stacked'

function TableDock({
  view,
  self,
  bid,
  burst,
  canAct,
  busy,
  onTable,
  layout,
  onBid,
  onLie,
  onBull,
}: {
  view: TableView
  self: TablePlayer | null
  bid: ActiveBid | null
  burst: boolean
  canAct: boolean
  busy: boolean
  onTable: number
  layout: DockLayout
  onBid: (bid: ProposedBid) => void
  onLie: () => void
  onBull: () => void
}) {
  // Held here rather than inside the controls, so moving them around the screen
  // cannot leave two half-built bids that disagree.
  const draft = useBidDraft(view.round, onTable, view.yourHand ?? [])
  const playing = canAct && self !== null

  const hand = (
    <section className="board__hand" aria-label="Your dice">
      <h2 className="board__mine">Your dice</h2>
      <div className="board__hand-row">
        {view.yourHand === null ? (
          <p className="board__nohand">
            {self?.isEliminated === true ? 'You are out. Watching.' : 'Waiting for dice'}
          </p>
        ) : (
          view.yourHand.map((face, i) => (
            <Die key={i} face={face} size={layout === 'split' ? 34 : 38} />
          ))
        )}
      </div>
    </section>
  )

  const challenge =
    playing && bid !== null ? (
      <ChallengeActions
        bid={bid}
        burst={burst}
        ownDiceCount={self.diceCount}
        busy={busy}
        onLie={onLie}
        onBull={onBull}
      />
    ) : null

  /*
   * Stacked: what you hold, what you can do, and the faces last.
   *
   * Everything you can press sits between your own dice and the rack, so the
   * two rows of dice are never adjacent — which is the whole idea. The cost is
   * that the control choosing the face ends up *below* the button that sends
   * the bid, so the sentence is read out of order.
   */
  if (layout === 'stacked') {
    return (
      <>
        {hand}
        {playing && (
          <div className="builder">
            <p className="builder__label">Make your bid</p>
            <BidRow draft={draft} burst={burst} busy={busy} onBid={onBid} inline />
            {challenge}
          </div>
        )}
        {playing && (
          <div className="builder builder--rack">
            <FaceRack draft={draft} />
          </div>
        )}
      </>
    )
  }

  /*
   * Split: what you know beside what you can say.
   *
   * The hand and the rack are separated across the screen rather than along
   * it, and they are shaped differently as well — a column of dice on timber
   * against a grid of buttons on slate — so neither suggests the other.
   */
  return (
    <>
      <div className={`board__console${playing ? '' : ' board__console--watching'}`}>
        {hand}
        {playing && (
          <div className="builder">
            <p className="builder__label">Make your bid</p>
            <FaceRack draft={draft} />
            <BidRow draft={draft} burst={burst} busy={busy} onBid={onBid} />
          </div>
        )}
      </div>
      {challenge}
    </>
  )
}

/**
 * Whoever the claim on the table belongs to.
 *
 * The bidder, until somebody Bulls it — a Bull takes the claim over, and after
 * that it is the caller's to defend and the bidder's to doubt (§8.3). Which
 * makes it the one name the middle of the table should carry.
 */
function claimOwner(view: TableView, bid: ActiveBid | null): ClaimOwner | null {
  if (bid === null) return null
  const ownerId = bid.bull?.callerId ?? bid.bidderId
  const player = view.players.find((p) => p.id === ownerId)
  return player === undefined ? null : { name: player.name, seatIndex: player.seatIndex }
}

export { INLAY_RADIUS }
