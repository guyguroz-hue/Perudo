import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchRoom, fetchSeats, touchRoom } from './api'
import { toRoomError } from './errors'
import type { Room, Seat } from './types'

export interface RoomHandle {
  readonly view: RoomView
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
  | { readonly status: 'gone'; readonly message: string }
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
        setView({ status: 'gone', message: 'You are no longer in this room.' })
        return
      }

      const seats = await fetchSeats(roomId, room.host_id, youId)
      if (generation.current !== mine) return

      setView({ status: 'ready', room, seats })
    } catch (error) {
      if (generation.current !== mine) return
      setView({ status: 'gone', message: toRoomError(error).message })
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
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, youId, refresh])

  // Heartbeat. Feeds host migration only — it can never remove anyone, because
  // a quiet connection is not a departure.
  useEffect(() => {
    if (roomId === null) return
    void touchRoom(roomId)
    const timer = setInterval(() => void touchRoom(roomId), 20_000)
    return () => clearInterval(timer)
  }, [roomId])

  return { view, refresh }
}
