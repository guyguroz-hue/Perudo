import { supabase } from '../../lib/supabaseClient'
import { toRoomError } from './errors'
import type { Room, Seat } from './types'

/**
 * Thin wrappers over the room RPCs.
 *
 * There is no client-side validation here on purpose. The database is the
 * authority on whether a room is joinable, full, started or expired, and a
 * second opinion in the browser could only ever disagree with it.
 */

export async function createRoom(): Promise<{ roomId: string; code: string }> {
  const { data, error } = await supabase.rpc('create_room')
  if (error) throw toRoomError(error)

  const row = firstRow<{ room_id: string; code: string }>(data)
  if (row === null) throw toRoomError(new Error('CODE_GENERATION_FAILED'))
  return { roomId: row.room_id, code: row.code }
}

export async function joinRoom(code: string): Promise<{ roomId: string; seat: number }> {
  const { data, error } = await supabase.rpc('join_room_by_code', { p_code: code })
  if (error) throw toRoomError(error)

  const row = firstRow<{ room_id: string; seat: number }>(data)
  if (row === null) throw toRoomError(new Error('INVALID_ROOM'))
  return { roomId: row.room_id, seat: row.seat }
}

export async function leaveRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_room', { p_room_id: roomId })
  if (error) throw toRoomError(error)
}

export async function kickPlayer(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('kick_player', {
    p_room_id: roomId,
    p_user_id: userId,
  })
  if (error) throw toRoomError(error)
}

/** Best-effort presence signal. A failed heartbeat is never worth surfacing. */
export async function touchRoom(roomId: string): Promise<void> {
  await supabase.rpc('touch_room_member', { p_room_id: roomId })
}

export async function fetchRoom(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, code, host_id, status, expires_at')
    .eq('id', roomId)
    .maybeSingle()
  if (error) throw toRoomError(error)
  return (data as Room | null) ?? null
}

/**
 * The people currently at the table, in seat order.
 *
 * Names come from `profiles`, which RLS only exposes for players who share a
 * room with the caller — so this query returning a name is itself proof of
 * co-membership.
 */
export async function fetchSeats(
  roomId: string,
  hostId: string | null,
  youId: string,
): Promise<Seat[]> {
  const { data, error } = await supabase
    .from('room_members')
    // The foreign key is named explicitly, and must stay that way.
    //
    // room_members points at profiles twice — through user_id, and through
    // removed_by, which records who removed a player. PostgREST cannot guess
    // which relationship an embed means when there is more than one, and
    // refuses the query outright (PGRST201) rather than picking. Naming the
    // constraint is the only thing that makes this unambiguous.
    .select('user_id, seat, profiles!room_members_user_id_fkey(display_name)')
    .eq('room_id', roomId)
    .is('left_at', null)
    .order('seat')
  if (error) throw toRoomError(error)

  type Row = {
    user_id: string
    seat: number
    profiles: { display_name: string } | { display_name: string }[] | null
  }

  return ((data ?? []) as Row[]).map((row) => ({
    user_id: row.user_id,
    seat: row.seat,
    display_name: nameOf(row.profiles),
    is_host: row.user_id === hostId,
    is_you: row.user_id === youId,
  }))
}

// PostgREST returns an embedded row as an object or, depending on how it infers
// the relationship, a single-element array. Both shapes mean one profile.
function nameOf(
  profiles: { display_name: string } | { display_name: string }[] | null,
): string {
  if (profiles === null) return 'Player'
  const one = Array.isArray(profiles) ? profiles[0] : profiles
  return one?.display_name ?? 'Player'
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null
  return (data as T | null) ?? null
}
