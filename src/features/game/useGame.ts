import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Face, ProposedBid } from '../../game'
import * as api from './api'
import { toGameError } from './errors'
import {
  fetchGameStanding,
  fetchRecentEvents,
  movesFromEvents,
  fetchPlayers,
  fetchReveal,
  fetchRound,
  toTableView,
} from './read'
import type { NoticeText } from './Notice'
import type { RevealData } from './reveal'
import type { Connection } from '../rooms/useRoom'
import type { TableView } from './view'

/**
 * Live view of one game, and the four things a player can do to it.
 *
 * Realtime says *that* something changed; what renders is always a fresh read
 * through RLS. Six players and one round — refetching costs nothing, and drift
 * between a local model and the truth costs a great deal.
 */
/**
 * The action a player has sent and is waiting on, if any.
 *
 * Named rather than a boolean because the button that was pressed wants to look
 * different from the ones that were not: one is working, the others are simply
 * unavailable while it does.
 */
export type PendingAction = 'bid' | 'bull' | 'lie' | null

/**
 * How long a burst of row changes is allowed to become one re-read.
 *
 * Long enough that the several writes of one move arrive together, short
 * enough to be invisible beside the request that caused them.
 */
const COALESCE_MS = 110

/**
 * How often the table re-reads itself when nothing has told it to.
 *
 * The floor under Realtime, for the failure that does not announce itself.
 * Long, because it is insurance and not the mechanism.
 */
const HEARTBEAT_MS = 15_000


/**
 * The view it already had, when the new one says the same thing.
 *
 * Every re-read builds the table from scratch, so it comes back as new objects
 * whether or not anything happened — and most re-reads are exactly that: the
 * heartbeat, the echo of your own move, the three events one resolution emits.
 * Handed downstream, a new object is news. It rebuilds every cup in the 3D
 * scene, re-runs every memo on the table, and re-fires the payment that throws
 * dice off it, which is what a player sees as the game stuttering for no
 * reason.
 *
 * So a re-read that found nothing new hands back what was already there, and
 * React stops at the first identical reference. Compared by value because that
 * is the question being asked: the view is a handful of small plain objects,
 * and stringifying it costs nothing beside the round trip that produced it.
 */
function steady<T>(previous: T, next: T): T {
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next
}

export interface GameHandle {
  readonly view: TableView | null
  readonly connection: Connection
  /** An action is in flight. The table stays visible; the buttons do not fire twice. */
  readonly busy: boolean
  /** Which of the three actions is in flight, for the control that sent it. */
  readonly pending: PendingAction
  /**
   * The reveal to play, or null.
   *
   * `pending` means a challenge has been made and the answer has not arrived.
   * The reveal starts then, not when the answer lands: the dramatic pause and
   * the network wait are the same moment (docs/GAME_UI.md §5.1).
   */
  readonly reveal: { readonly pending: boolean; readonly data: RevealData | null } | null
  /**
   * Set once the game is over. `winnerName` is null when nobody won, which is
   * a real outcome: if the last players are eliminated in the same resolution
   * there is no winner rather than one awarded on a tiebreak (R-004).
   */
  readonly over: {
    readonly winnerName: string | null
    /**
     * And who they are, which is not the same question as what they are called.
     *
     * Two players may hold the same display name — the name rules stop one
     * being dressed up as another, not two people choosing the same word — and
     * the screen that announces the winner was comparing names. A loser sharing
     * a name with the winner was told they had won.
     */
    readonly winnerId: string | null
  } | null
  /*
   * Why the last action did not take.
   *
   * `stale` separates the two kinds, and the difference is not cosmetic. With
   * Burst in the rules anybody may act at any time, so two players reaching
   * for the same bid is the game being played correctly, not a fault — it is
   * news, it has already been answered by refetching, and there is nothing for
   * the player to do about it. Everything else is a refusal they have to read
   * and act on.
   */
  /*
   * The last refusal, as something to put on screen.
   *
   * The code travels with the sentence. It used to be dropped here — the hook
   * kept the message and the stale flag and nothing else — and the cost showed
   * up the first time a player reported "I press Bull and get an error": the
   * screen knew which refusal it was, threw the name away, and left the
   * sentence, which is the half written for the player rather than the half
   * that says where to look.
   */
  readonly error: NoticeText | null
  bid: (bid: ProposedBid) => Promise<void>
  bull: () => Promise<void>
  doubt: () => Promise<void>
  dismissReveal: () => void
  /** Put the notice away now, rather than waiting for it to go. */
  dismissError: () => void
  refresh: () => Promise<void>
}

export function useGame(gameId: string | null, youId: string | null): GameHandle {
  const [view, setView] = useState<TableView | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [busy, setBusy] = useState(false)
  /*
   * Which action is on its way, for the button that was pressed.
   *
   * `busy` says "not now" to every control at once, which is right for the ones
   * the player did not touch and wrong for the one they did: dimming the button
   * somebody just pressed is indistinguishable from refusing it, and a player
   * who cannot tell presses again.
   */
  const [pending, setPending] = useState<PendingAction>(null)
  /*
   * The same fact, kept somewhere React cannot be late with it.
   *
   * State is applied on the next render; a double tap is two events in one
   * frame. This is the guard, and `pending` is only what it looks like.
   */
  const inFlight = useRef<PendingAction>(null)
  const [reveal, setReveal] = useState<GameHandle['reveal']>(null)
  const [over, setOver] = useState<GameHandle['over']>(null)
  const [error, setError] = useState<GameHandle['error']>(null)

  const generation = useRef(0)
  // The round we last rendered. A change in it is how every player who did not
  // press the button finds out a challenge was resolved.
  const seenRound = useRef<string | null>(null)
  const started = useRef(false)
  /*
   * The round whose reveal is already playing on this screen.
   *
   * Only the challenger ever has one before the refetch does: they were handed
   * the whole resolution as the answer to their own request. Without this the
   * refresh that follows saw the round had changed, decided somebody else must
   * have resolved it, rebuilt the same reveal from the log and set it — a new
   * object with identical contents, which restarts the sequence that is
   * already half-played. The cups stay up and the count starts again from
   * nothing, which reads as the table stuttering at the one moment it has the
   * player's whole attention.
   */
  const showing = useRef<string | null>(null)
  /*
   * Your own dice, and the round they were dealt for.
   *
   * Every re-read used to fetch them again, and every re-read pays for that
   * twice: the request itself, and the fact that it cannot start until the
   * round has come back, because it is keyed on the round's id. So the common
   * case — somebody bid, the round is the same one it was — spent two round
   * trips end to end where one would do, on every event, for every player.
   *
   * Dice are dealt once per round and never change inside it: `deal_round`
   * writes them and nothing else touches `player_dice`. So they are worth
   * exactly one fetch per round, and the second wave disappears from every
   * update that is not a new round.
   */
  const hand = useRef<{ round: string; dice: readonly Face[] } | null>(null)

  const refresh = useCallback(async () => {
    if (gameId === null || youId === null) return
    const mine = ++generation.current

    try {
      /*
       * Everything the table needs, asked for at once.
       *
       * The log used to wait for the players, because the function that fetched
       * it also turned "bid" into "Alice bid 4 fives" and needed their names to
       * do it. That made every re-read two round trips deep for a reason that
       * was about formatting rather than about data — and a re-read happens on
       * every event, for every player at the table.
       */
      const [round, players, standing, events] = await Promise.all([
        fetchRound(gameId),
        fetchPlayers(gameId, youId),
        fetchGameStanding(gameId),
        fetchRecentEvents(gameId),
      ])
      if (generation.current !== mine) return

      const previous = seenRound.current
      const resolvedElsewhere =
        started.current && previous !== null && round?.id !== previous

      const names = new Map(players.map((player) => [player.id, player.name]))

      /*
       * Only ask for the dice when they can have changed.
       *
       * Which is once a round. Everything else — a bid, a Bull, the heartbeat,
       * the echo of your own move — already has them, and asking again costs a
       * whole extra round trip that cannot even begin until the round has come
       * back.
       */
      const dealt = round === null ? null : hand.current
      const yours =
        round === null
          ? null
          : dealt !== null && dealt.round === round.id
            ? dealt.dice
            : await api.fetchOwnHand(round.id, youId)
      if (generation.current !== mine) return
      if (round !== null && yours !== null) hand.current = { round: round.id, dice: yours }

      const moves = movesFromEvents(events, names)

      seenRound.current = round?.id ?? null
      started.current = true
      setView((previous) => steady(previous, toTableView(round, players, yours, moves)))
      setOver(
        standing.status === 'completed'
          ? {
              winnerName:
                standing.winnerId === null ? null : (names.get(standing.winnerId) ?? null),
              winnerId: standing.winnerId,
            }
          : null,
      )

      // Somebody else's challenge. The reveal is rebuilt from what the round
      // made public, so every player sees the cups come off, not just the one
      // who doubted.
      if (resolvedElsewhere && showing.current !== previous) {
        const past = await fetchReveal(previous)
        if (generation.current !== mine) return
        if (past !== null) {
          showing.current = previous
          setReveal({ pending: false, data: past })
        }
      }
    } catch (caught) {
      if (generation.current !== mine) return
      const failure = toGameError(caught)
      setError({ message: failure.message, code: failure.code, stale: false })
    }
  }, [gameId, youId])

  useEffect(() => {
    if (gameId === null || youId === null) return

    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()

    /*
     * One re-read per thing that happened, not per row that changed.
     *
     * A single move writes to more than one table — a bid touches `rounds`,
     * and a resolution touches `rounds`, a `game_players` row for every player
     * who paid, and `games` when somebody is knocked out. Each of those arrives
     * as its own event, and each fired its own refresh: five queries apiece,
     * eight or nine of them inside a second, on a phone, at the exact moment
     * the table is trying to animate a reveal. The generation counter meant
     * only the last one was ever drawn, so the rest were pure heat.
     *
     * A burst of changes is one piece of news. Collapsing them costs a tenth of
     * a second on the first event, which is far below the time the reply is
     * already taking, and it is what a table with six people bursting at each
     * other actually needs.
     */
    let coalesce: ReturnType<typeof setTimeout> | undefined
    const soon = () => {
      clearTimeout(coalesce)
      coalesce = setTimeout(() => void refresh(), COALESCE_MS)
    }

    // Tracks whether we have been subscribed before. While the channel was
    // down, whole rounds may have come and gone; the only safe response to
    // coming back is to re-read everything.
    let wasLive = false

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameId}` },
        soon,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        soon,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        soon,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('live')
          if (wasLive) void refresh()
          wasLive = true
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection(navigator.onLine ? 'reconnecting' : 'offline')
        }
      })

    /*
     * And a slow heartbeat underneath it all.
     *
     * Realtime is a notification channel, not a guarantee, and the way it fails
     * that costs the most is the quiet way: the socket stays up, the connection
     * reads `live`, and the events simply stop arriving. Every other kind of
     * break announces itself and is already handled — a dropped channel, a
     * backgrounded tab, a radio coming back — but this one leaves a player
     * looking at a green dot and a table that has stopped, with nothing to do
     * but reload and no reason to think they should.
     *
     * Once every fifteen seconds is nothing next to a round, and it is not a
     * substitute for Realtime: it is the floor under it. Skipped while the tab
     * is hidden, where nobody is looking and the visibility handler will
     * re-read on the way back in.
     */
    const heartbeat = setInterval(() => {
      if (document.hidden) return
      void refresh()
    }, HEARTBEAT_MS)

    return () => {
      clearTimeout(coalesce)
      clearInterval(heartbeat)
      void supabase.removeChannel(channel)
    }
  }, [gameId, youId, refresh])

  /*
   * Coming back.
   *
   * A phone suspends a background tab and silently drops the socket, so
   * returning to the app is its own kind of reconnection — and so is the radio
   * coming back after a lift or a tunnel. The lobby has watched all three since
   * it was written; the table watched only the first, which meant the one
   * screen where being out of date actually costs you something was the one
   * that said nothing about it. A player who lost signal mid-round saw a live
   * dot and a table several bids behind until they happened to switch apps.
   */
  useEffect(() => {
    if (gameId === null) return

    function onVisible() {
      if (document.visibilityState === 'visible') void refresh()
    }
    function onOnline() {
      setConnection('reconnecting')
      void refresh()
    }
    function onOffline() {
      setConnection('offline')
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [gameId, refresh])

  /**
   * Run an action, then read the table back.
   *
   * Realtime does deliver the same change, but it is a notification channel and
   * not a guarantee: if it is slow or dropped, a player would bid and watch
   * nothing happen. The action already knows the state moved.
   */
  const run = useCallback(
    async (action: () => Promise<void>, kind: PendingAction) => {
      if (gameId === null) return
      /*
       * One action at a time, decided here rather than by the buttons.
       *
       * `busy` disables them, but `busy` is React state: it reaches the DOM on
       * the next render, and a double tap is two events in the same frame. Both
       * got through, and the second was worse than a wasted request — both
       * carried the same round version, so the server applied the first and
       * refused the second on the optimistic-concurrency check. The player was
       * shown "Somebody got there first. Have another look." for their own
       * second tap, at a table where nobody else had moved.
       *
       * A ref is read and written synchronously, so the second call sees the
       * first before it has had a chance to await anything. It returns in
       * silence, because the player's action is already on its way and the only
       * honest thing to say about a duplicate is nothing.
       */
      if (inFlight.current !== null) return
      inFlight.current = kind
      setPending(kind)
      setBusy(true)
      setError(null)
      try {
        await action()
        await refresh()
      } catch (caught) {
        const failure = toGameError(caught)
        setError({ message: failure.message, code: failure.code, stale: failure.stale })
        // "Somebody got there first" is answered by looking again, not by the
        // player doing anything differently.
        if (failure.stale) await refresh()
      } finally {
        inFlight.current = null
        setPending(null)
        setBusy(false)
      }
    },
    [gameId, refresh],
  )

  const bid = useCallback(
    (next: ProposedBid) =>
      run(() => api.placeBid(gameId as string, next.quantity, next.face), 'bid'),
    [gameId, run],
  )

  const bull = useCallback(() => run(() => api.callBull(gameId as string), 'bull'), [gameId, run])

  const doubt = useCallback(async () => {
    if (gameId === null) return
    // Same guard as `run`, and it matters most here: two challenges in one
    // frame would open the reveal, claim the round, and then have the second
    // refused — with the cups already off the table.
    if (inFlight.current !== null) return
    inFlight.current = 'lie'
    setPending('lie')
    // The reveal opens on the pause, before the answer exists. That is the
    // whole point: what would otherwise be a spinner is the beat where a player
    // wonders whether they were right.
    setReveal({ pending: true, data: null })
    setBusy(true)
    setError(null)
    /*
     * Claim the round now, not when the answer arrives.
     *
     * Read before the await for the obvious reason — by the time it returns
     * the table has moved on to the next round — but claimed before it too,
     * which is less obvious and is the whole point. The server writes the
     * resolution before it replies, so Realtime can deliver the round change
     * and drive a refresh while this request is still in flight: that refresh
     * would find the claim unmade, rebuild the same reveal from the log and
     * set it, and then the reply would set a second identical one on top and
     * restart a sequence already playing.
     *
     * Cleared in the catch, so a challenge that is refused leaves nothing
     * claimed and a later resolution of that round still plays normally.
     */
    const resolving = seenRound.current
    showing.current = resolving
    try {
      const data = await api.challenge(gameId)
      setReveal({ pending: false, data })
      await refresh()
    } catch (caught) {
      // No resolution, so no reveal. Put the table back rather than leaving the
      // cups held over a challenge that never happened.
      setReveal(null)
      showing.current = null
      const failure = toGameError(caught)
      setError({ message: failure.message, code: failure.code, stale: failure.stale })
      if (failure.stale) await refresh()
    } finally {
      inFlight.current = null
      setPending(null)
      setBusy(false)
    }
  }, [gameId, refresh])

  const dismissReveal = useCallback(() => setReveal(null), [])
  const dismissError = useCallback(() => setError(null), [])

  return {
    view,
    connection,
    busy,
    pending,
    reveal,
    over,
    error,
    bid,
    bull,
    doubt,
    dismissReveal,
    dismissError,
    refresh,
  }
}
