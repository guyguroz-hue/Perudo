import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchRoom, fetchSeats, touchRoom } from './api'
import { toRoomError } from './errors'
import type { Room, Seat } from './types'

/**
 * How well we are hearing from the server.
 *
 * `live` means changes made by other players will appear on their own.
 * Anything else means they will not, which is worth telling a player before
 * they wonder why the table looks frozen.
 */
export type Connection = 'connecting' | 'live' | 'reconnecting' | 'offline'

export interface RoomHandle {
  readonly view: RoomView
  readonly connection: Connection
  /**
   * Refetch now, without waiting for a Realtime event.
   *
   * Called straight after an action succeeds. Realtime does deliver the same
   * change, but it is a notification channel, not a guarantee: if it is slow,
   * dropped, or unreachable, the host would remove a player and watch nothing
   * happen. The action already knows the state moved — it should say so.
   */
  refresh: () => Promise<void>
}

export type RoomView =
  | { readonly status: 'loading' }
  | {
      readonly status: 'gone'
      readonly message: string
      readonly detail: string | null
      /** True when this looks like a blip rather than a room that has ended. */
      readonly retryable: boolean
    }
  | { readonly status: 'ready'; readonly room: Room; readonly seats: Seat[] }

/**
 * Live view of one room.
 *
 * Realtime tells us *that* something changed; it is never the thing we read. On
 * every event the room and its seats are refetched through RLS, so what renders
 * is always what the database would answer, not a patch applied optimistically
 * to a local copy. Rooms hold six people — refetching is cheap, and drift
 * between a local model and the truth is not.
 */
export function useRoom(roomId: string | null, youId: string | null): RoomHandle {
  const [view, setView] = useState<RoomView>({ status: 'loading' })
  const [connection, setConnection] = useState<Connection>('connecting')
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    if (roomId === null || youId === null) return
    const mine = ++generation.current

    try {
      const room = await fetchRoom(roomId)
      if (generation.current !== mine) return

      if (room === null) {
        // RLS hides rooms you do not belong to, so "not found" and "not yours"
        // are the same answer from here — and the same thing to a player.
        setView({
          status: 'gone',
          message: 'You are no longer in this room.',
          detail: null,
          retryable: false,
        })
        return
      }

      const seats = await fetchSeats(roomId, room.host_id, youId)
      if (generation.current !== mine) return

      setView({ status: 'ready', room, seats })
    } catch (error) {
      if (generation.current !== mine) return
      const failure = toRoomError(error)
      setView({
        status: 'gone',
        message: failure.message,
        // Kept visible for anything we did not anticipate: a screenshot of the
        // error should be enough to diagnose it.
        detail:
          failure.code === 'UNKNOWN' || failure.code === 'DATABASE_BEHIND'
            ? failure.detail
            : null,
        retryable: failure.retryable,
      })
    }
  }, [roomId, youId])

  useEffect(() => {
    if (roomId === null || youId === null) return

    // The linter cannot see that `refresh` only touches state after an await,
    // and reads this as a synchronous setState in an effect. Fetching a room
    // from the database on mount is precisely what an effect is for; the rule
    // is right in general and wrong here.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()

    // Tracks whether we have been subscribed before, so a *re*connection can be
    // told apart from the first one. It matters: while the channel was down,
    // players may have joined or left, and those events are simply gone. The
    // only safe response to coming back is to re-read everything.
    let wasLive = false

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
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
  }, [roomId, youId, refresh])

  // A phone suspends a background tab and silently drops the socket, so coming
  // back to the app is its own kind of reconnection.
  useEffect(() => {
    if (roomId === null) return

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
  }, [roomId, refresh])

  // Heartbeat. Feeds host migration only — it can never remove anyone, because
  // a quiet connection is not a departure.
  useEffect(() => {
    if (roomId === null) return
    void touchRoom(roomId)
    const timer = setInterval(() => void touchRoom(roomId), 20_000)
    return () => clearInterval(timer)
  }, [roomId])

  return { view, connection, refresh }
}
