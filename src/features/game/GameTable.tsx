import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ConnectionDot } from '../../components/ConnectionDot'
import { Die } from '../../components/Die'
import { SoundToggle } from '../../components/SoundToggle'
import type { Connection } from '../rooms/useRoom'
import type { ActiveBid, ProposedBid } from '../../game'
import { diceOnTable } from '../../game'
import { INLAY_RADIUS, STAGE_ASPECT, centreAnchor, inlayWidth } from '../../three/layout'
import { BidRow, FaceRack } from './BidBuilder'
import { useBidDraft } from './bidDraft'
import { ChallengeActions } from './ChallengeActions'
import { FarewellFanfare } from './Fanfare'
import { useFanfare } from './fanfare'
import { CurrentBid } from './CurrentBid'
import type { ClaimOwner } from './CurrentBid'
import { MoveLog } from './MoveLog'
import { TurnLine } from './TurnLine'
import { PlayerSeat } from './PlayerSeat'
import { RevealPanel } from './RevealPanel'
import { TableScene } from './TableScene'
import { useBurst } from './burst'
import type { PendingAction } from './useGame'
import { SHAKE_MS, useDealShake } from './dealing'
import type { RevealClaim, RevealData } from './reveal'
import { PAY_AFTER_MS, useRevealStage } from './revealStage'
import { dueDice, placeSeats, sceneSeats } from './seating'
import { usePrefersReducedMotion } from '../../lib/motion'
import { useSound, useSoundEffect } from '../../lib/useSound'
import type { TablePlayer, TableView } from './view'
import { burstBarred, turnHolder, wouldBurst, you } from './view'
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
  pending = null,
  reveal = null,
  finish = null,
  connection = 'live',
  roomMenu = null,
  onBid,
  onLie,
  onBull,
}: {
  view: TableView
  busy?: boolean
  /**
   * Which action the player has sent and is waiting on.
   *
   * `busy` says "not now" to every control at once, which is right for the ones
   * they did not touch and wrong for the one they did: a dimmed button is
   * indistinguishable from a refused one, and a player who cannot tell whether
   * their press landed presses again. That is most of what "lots of double
   * presses that did not count" was.
   */
  pending?: PendingAction
  /**
   * Whether changes are still arriving.
   *
   * It lives on the table rather than in a bar above it. A row of its own cost
   * a line of height on every screen for something that says nothing at all
   * while the connection is healthy, and this screen has no height to spend on
   * a row that is usually empty. Over the timber it costs none, and it is where
   * a player is already looking.
   */
  connection?: Connection
  /**
   * Leaving the room, in the corner of the table.
   *
   * It lives here rather than in a row under the game because a row under the
   * game is a row of table nobody gets to see. Ending a room is a once-a-session
   * act and it was taking seventy-two points on every screen, which on a small
   * phone is a seventh of the display spent on the one control a player hopes
   * never to press — taken, of course, out of the table.
   */
  roomMenu?: ReactNode
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
  onBid: (bid: ProposedBid) => void
  onLie: () => void
  onBull: () => void
}) {
  const holder = turnHolder(view)
  const self = you(view)
  const burst = wouldBurst(view)
  /*
   * The one moment cutting in is barred (R-013).
   *
   * A Farewell Round's opening bid chooses the face for everybody, so it
   * belongs to the player the round is owed to. Asked here rather than left to
   * the server, so the button says what will happen instead of producing a
   * refusal after the fact.
   */
  const barred = burstBarred(view)
  const yourTurn = holder !== null && holder.isYou

  /*
   * A Farewell Round, said out loud once.
   *
   * It changes every rule at the table for one round and it was announced by a
   * small word in the corner, which is where this screen keeps facts nobody
   * acts on. A table that had played several of them reported never noticing
   * one. The name is captured when the round arrives rather than read live: the
   * turn moves off the player it is owed to the instant they bid, and a banner
   * that renamed itself halfway through being read would be worse than none.
   */
  const [fanfare, hushFanfare] = useFanfare(
    view.roundNumber,
    view.round.type === 'farewell'
      ? { name: holder?.name ?? null, yours: holder?.isYou === true }
      : null,
  )
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
  const { stage, counted } = useRevealStage(reveal?.data ?? null, reveal !== null)
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
  /*
   * The deal is heard only when the deal is what is being shown.
   *
   * The next round is dealt by the resolution that ended the last one, so the
   * shake starts while the reveal is still counting — and `mood` already knows
   * that, which is why the table does not *look* like it is dealing. The sound
   * did not know, so a round ended to the rattle of the next one being shaken
   * over the top of its own verdict.
   */
  useEffect(() => {
    if (shaking && !lifting) effect('shake', SHAKE_MS / 1000)
  }, [shaking, lifting, effect])
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

  /*
   * One payment per resolution, however often the table is re-read.
   *
   * This is the one place on the screen where an array's identity is
   * behaviour: `TableScene` fires the payment whenever it is handed a new
   * object, and says so. `seats` is rebuilt from scratch by every refetch — a
   * bid by anybody, a Realtime event, the heartbeat — so any of those landing
   * during the pause after the verdict threw the dice off the table a second
   * time, mid-reveal, which is exactly the kind of thing a player reports as
   * the game not running smoothly.
   *
   * What this actually needs from the seats is the map from player to chair,
   * and that cannot change while one resolution is being paid. So the memo is
   * keyed on that map rather than on the array holding it.
   */
  /*
   * One payment per resolution, and `seats` is what makes that true.
   *
   * This is the one place on the screen where an array's identity is behaviour:
   * `TableScene` fires the payment whenever it is handed a new object, and says
   * so. That holds only because a re-read which changes nothing now hands back
   * the view it already had — see `useGame`. Before that, every refetch during
   * the pause after a verdict threw the dice off the table a second time.
   */
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
      {/* The camera's aspect ratio, given to the stylesheet as well as to the
          box: the height the stage wants is its width over this, and CSS has to
          be able to work that out for itself so it can shrink the stage on a
          screen with no room for the full-width one. */}
      <div
        className="board__stage"
        style={{ aspectRatio: STAGE_ASPECT, '--stage-aspect': STAGE_ASPECT } as CSSProperties}
      >
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

        {/* The opposite corner from the round number, where nothing else is.
            The connection joins it there on the rare occasions it has anything
            to say, and takes no room on the screen when it does not. */}
        <div className="board__sound">
          <ConnectionDot connection={connection} />
          <SoundToggle on={sound.on} onToggle={sound.toggle} />
          {roomMenu}
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

        {/* Over the table and never over the dock: this arrives without
            warning, and a panel that can land on Bid or Bull is a panel that
            can take a press meant for one of them. */}
        {fanfare !== null && (
          <FarewellFanfare name={fanfare.name} yours={fanfare.yours} onDismiss={hushFanfare} />
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
            view={view}
            self={self}
            holder={holder}
            bid={bid}
            burst={burst}
            barred={barred}
            canAct={canAct}
            busy={busy}
            pending={pending}
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
  holder,
  bid,
  burst,
  barred,
  canAct,
  busy,
  pending,
  onTable,
  onBid,
  onLie,
  onBull,
}: {
  view: TableView
  self: TablePlayer | null
  /** Whose turn it is, which is the one fact the table could only glow about. */
  holder: TablePlayer | null
  bid: ActiveBid | null
  burst: boolean
  /** True while the opening bid of a Farewell Round is owed to somebody else. */
  barred: boolean
  canAct: boolean
  busy: boolean
  /** Which action is in flight, so the control that sent it can say so. */
  pending: PendingAction
  onTable: number
  onBid: (bid: ProposedBid) => void
  onLie: () => void
  onBull: () => void
}) {
  // Held here rather than inside the controls: the rack and the count row are
  // two components, and neither can own state the other reads.
  const draft = useBidDraft(view.round, onTable, view.yourHand ?? [])
  const playing = canAct && self !== null

  return (
    <>
      {/*
        * Your own dice, on the table rather than in the panel.
        *
        * Directly under this is the rack of faces, which is also a row of
        * dice — one secret, one a control, and for a long time nothing but a
        * heading told them apart. A player reaching for "I want to bid sixes"
        * was as likely to reach into their own hand.
        *
        * Being a different material is what fixes it. Everything below this is
        * moulded slate with buttons set into it; this is timber with objects
        * lying on it, the same timber the cups are standing on a few
        * centimetres above. Nothing about it suggests pressing it.
        */}
      {/* Said before anything else in the dock, because it is what decides
          whether the rest of the dock is for you to use right now. */}
      <TurnLine holder={holder} canAct={canAct} />

      <section className="board__hand" aria-label="Your dice">
        {/*
          * Said to a screen reader and not to the screen.
          *
          * It was a caption over the dice, and it cost a row of the table to
          * name the one thing on this screen nobody has ever been confused
          * about: five dice lying on timber, directly under the table, in front
          * of you. The separation it was helping with — your hand against the
          * rack you press — is carried by the material, which is what the two
          * slabs were given different surfaces for in the first place.
          */}
        <h2 className="visually-hidden">Your dice</h2>
        <div className="board__hand-row">
          {view.yourHand === null ? (
            <p className="board__nohand">
              {self?.isEliminated === true ? 'You are out. Watching.' : 'Waiting for dice'}
            </p>
          ) : (
            view.yourHand.map((face, i) => <Die key={i} className="board__die" face={face} />)
          )}
        </div>
      </section>

      {/*
        * Everything you can press, in one slab.
        *
        * Two slabs was two lots of padding and a gap between them for no
        * argument — they are all the same kind of thing, and the only
        * distinction that earns its height on this screen is the one above:
        * timber is yours, slate is the game's. Inside the slate the order is
        * the sentence a bid is made in: pick a face, set how many, say it, or
        * doubt the one already on the table.
        */}
      {playing && (
        <div className="builder">
          {/* The other half of that pair, and hidden for the same reason. A slab
              of slate with a rack of faces, a stepper and a Bid button on it
              does not need to be told what it is. */}
          <p className="visually-hidden">Your bid</p>
          <FaceRack draft={draft} />
          <BidRow
            draft={draft}
            claim={bid}
            burst={burst}
            barred={barred}
            busy={busy}
            pending={pending}
            onBid={onBid}
            inline
          />
          {/*
            * Always here, spent until there is something to doubt.
            *
            * These used to arrive with the first bid, which grew the dock by a
            * row and jumped everything above it — the hand, the rack and the
            * Bid button all moved up about seventy points, and Bull landed
            * exactly where a thumb had been heading. Everybody at one table
            * pressed it by accident, on the one move in the game that cannot be
            * taken back.
            */}
          <ChallengeActions
            bid={bid}
            burst={burst}
            ownDiceCount={self.diceCount}
            busy={busy}
            pending={pending}
            onLie={onLie}
            onBull={onBull}
          />
        </div>
      )}
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
