import { useEffect, useMemo, useState } from 'react'
import { Die } from '../../components/Die'
import { SoundToggle } from '../../components/SoundToggle'
import type { ActiveBid, ProposedBid } from '../../game'
import { diceOnTable } from '../../game'
import { INLAY_RADIUS, STAGE_ASPECT, centreAnchor, inlayWidth } from '../../three/layout'
import { BidBuilder } from './BidBuilder'
import { ChallengeActions } from './ChallengeActions'
import { CurrentBid } from './CurrentBid'
import { PlayerSeat } from './PlayerSeat'
import { RevealPanel } from './RevealPanel'
import { TableScene } from './TableScene'
import { SHAKE_MS, useDealShake } from './dealing'
import type { RevealClaim, RevealData } from './reveal'
import { useRevealStage } from './revealStage'
import { placeSeats, sceneSeats } from './seating'
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
 */
export function GameTable({
  view,
  busy = false,
  reveal = null,
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
  const seats = useMemo(() => placeSeats(view.players, lifting), [view.players, lifting])
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

  return (
    <div
      className={`board${yourTurn ? ' board--yours' : ''}${shaking ? ' board--dealing' : ''}`}
    >
      <div className="board__stage" style={{ aspectRatio: STAGE_ASPECT }}>
        <TableScene
          seats={cups}
          overhead={wantsOverhead}
          immediate={reducedMotion}
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

        {/* Never narrower than the brass ring it sits in, never clipped by it
            either: the bid reads across, and a long name is worth more than a
            tidy edge.

            It stays there through the reveal. It is the thing on trial, and
            moving the evidence at the moment of judgement would be an odd thing
            to do — the panel below carries it again because that is where the
            count happens, not because it left the table. */}
        <div
          className="board__centre"
          style={{ ...centreAnchor(eye), minWidth: `${inlayWidth(eye)}%` }}
          // Overhead the middle of the table is where the dice are, so the bid
          // gets out of their way rather than sitting on the evidence.
          data-overhead={eye > 0.5 ? 'true' : undefined}
        >
          <CurrentBid
            bid={bid}
            bullCallerName={
              view.players.find((p) => p.id === bid?.bull?.callerId)?.name ?? null
            }
          />
        </div>

        <ul className="board__seats">
          {seats.map((placement) => (
            <PlayerSeat
              key={placement.player.id}
              placement={placement}
              lifted={lifting}
              overhead={eye}
            />
          ))}
        </ul>

        {/*
          * What just happened. Always.
          *
          * This used to give way to "so-and-so is thinking" whenever the turn
          * was not yours, which meant the one person guaranteed not to see a
          * move announced was the person who had just made it — the turn moves
          * on the instant you act. A Bull is where that became a bug rather
          * than a slight: it leaves the numbers exactly as they were, so with
          * no line saying so, calling one is indistinguishable from nothing
          * happening at all.
          *
          * Whose turn it is does not need words here. It is at the seat, where
          * a table puts it: the badge lights, and your own says "Your turn".
          */}
        <p className="board__say" aria-live="polite">
          {reveal !== null ? '' : holder === null ? 'Dealing' : (view.lastEvent ?? '')}
        </p>
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
        ) : (
          <TableDock
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
function TableDock({
  view,
  self,
  bid,
  burst,
  canAct,
  busy,
  onTable,
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
  onBid: (bid: ProposedBid) => void
  onLie: () => void
  onBull: () => void
}) {
  return (
    <>
      <section className="board__hand" aria-label="Your dice">
          {view.yourHand === null ? (
            <p className="board__nohand">
              {self?.isEliminated === true ? 'You are out. Watching.' : 'Waiting for dice'}
            </p>
          ) : (
            view.yourHand.map((face, i) => <Die key={i} face={face} size={38} />)
          )}
        </section>

      {canAct && self !== null && (
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
    </>
  )
}

export { INLAY_RADIUS }
