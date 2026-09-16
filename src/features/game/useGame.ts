import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { ProposedBid } from '../../game'
import * as api from './api'
import { toGameError } from './errors'
import {
  fetchGameStanding,
  fetchRecentMoves,
  fetchPlayers,
  fetchReveal,
  fetchRound,
  toTableView,
} from './read'
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
export interface GameHandle {
  readonly view: TableView | null
  readonly connection: Connection
  /** An action is in flight. The table stays visible; the buttons do not fire twice. */
  readonly busy: boolean
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
  readonly over: { readonly winnerName: string | null } | null
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
  readonly error: {
    readonly message: string
    /** Stable identifier: 'BULL_ALREADY_CALLED', 'NOT_DEPLOYED', … */
    readonly code: string
    readonly stale: boolean
  } | null
  bid: (bid: ProposedBid) => Promise<void>
  bull: () => Promise<void>
  doubt: () => Promise<void>
  dismissReveal: () => void
  refresh: () => Promise<void>
}

export function useGame(gameId: string | null, youId: string | null): GameHandle {
  const [view, setView] = useState<TableView | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState<GameHandle['reveal']>(null)
  const [over, setOver] = useState<GameHandle['over']>(null)
  const [error, setError] = useState<GameHandle['error']>(null)

  /*
   * News expires; refusals do not.
   *
   * "Somebody got there first" describes a moment that has already passed, and
   * the table it was about was refetched before the words appeared. Left on
   * screen it becomes a permanent label on a game that has moved several
   * rounds beyond it. A refusal stays until the player acts again, because it
   * is still true.
   */
  useEffect(() => {
    if (error === null || !error.stale) return
    const fades = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(fades)
  }, [error])

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

  const refresh = useCallback(async () => {
    if (gameId === null || youId === null) return
    const mine = ++generation.current

    try {
      const [round, players, standing] = await Promise.all([
        fetchRound(gameId),
        fetchPlayers(gameId, youId),
        fetchGameStanding(gameId),
      ])
      if (generation.current !== mine) return

      const previous = seenRound.current
      const resolvedElsewhere =
        started.current && previous !== null && round?.id !== previous

      const names = new Map(players.map((player) => [player.id, player.name]))
      const [hand, moves] = await Promise.all([
        round === null ? Promise.resolve(null) : api.fetchOwnHand(round.id, youId),
        fetchRecentMoves(gameId, names),
      ])
      if (generation.current !== mine) return

      seenRound.current = round?.id ?? null
      started.current = true
      setView(toTableView(round, players, hand, moves))
      setOver(
        standing.status === 'completed'
          ? { winnerName: standing.winnerId === null ? null : (names.get(standing.winnerId) ?? null) }
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

    // Tracks whether we have been subscribed before. While the channel was
    // down, whole rounds may have come and gone; the only safe response to
    // coming back is to re-read everything.
    let wasLive = false

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => void refresh(),
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

    return () => {
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
    async (action: () => Promise<void>) => {
      if (gameId === null) return
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
        setBusy(false)
      }
    },
    [gameId, refresh],
  )

  const bid = useCallback(
    (next: ProposedBid) =>
      run(() => api.placeBid(gameId as string, next.quantity, next.face)),
    [gameId, run],
  )

  const bull = useCallback(() => run(() => api.callBull(gameId as string)), [gameId, run])

  const doubt = useCallback(async () => {
    if (gameId === null) return
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
      setBusy(false)
    }
  }, [gameId, refresh])

  const dismissReveal = useCallback(() => setReveal(null), [])

  return {
    view,
    connection,
    busy,
    reveal,
    over,
    error,
    bid,
    bull,
    doubt,
    dismissReveal,
    refresh,
  }
}
