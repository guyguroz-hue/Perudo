import { describe, expect, it } from 'vitest'
import { RoomError, toRoomError } from './errors'

describe('room errors', () => {
  it('turns a known code into a sentence', () => {
    const result = toRoomError(new Error('ROOM_FULL'))
    expect(result.code).toBe('ROOM_FULL')
    expect(result.message).toContain('six players')
  })

  it('passes an already-converted error through unchanged', () => {
    // The regression that produced "[object Object]" on screen: api.ts threw a
    // converted error, the caller converted it again, and because the first
    // result was not an Error the second conversion stringified an object and
    // destroyed the original cause.
    const once = toRoomError(new Error('ROOM_FULL'))
    const twice = toRoomError(once)
    expect(twice).toBe(once)
    expect(twice.message).toContain('six players')
  })

  it('is an Error, so anything catching it can read a message', () => {
    const result = toRoomError(new Error('NOT_HOST'))
    expect(result).toBeInstanceOf(Error)
    expect(String(result)).not.toContain('[object Object]')
  })

  it('reads Supabase error objects, which are not Error instances', () => {
    const result = toRoomError({
      message: 'permission denied for table rooms',
      code: '42501',
    })
    expect(result.detail).toContain('permission denied')
    expect(result.message).not.toContain('[object Object]')
  })

  it('recognises a database that has not caught up with the app', () => {
    const result = toRoomError({
      message: 'Could not find the function public.create_room without parameters',
    })
    expect(result.code).toBe('DATABASE_BEHIND')
    expect(result.detail).toContain('create_room')
  })

  it('marks a network failure retryable', () => {
    expect(toRoomError(new Error('Failed to fetch')).retryable).toBe(true)
  })

  it('keeps the raw text of anything it does not recognise', () => {
    const result = toRoomError(new Error('something nobody predicted'))
    expect(result.code).toBe('UNKNOWN')
    expect(result.message).toBe('something nobody predicted')
  })

  it('never produces an unreadable message, whatever it is handed', () => {
    for (const input of [null, undefined, 42, {}, [], Symbol('x')]) {
      const result = toRoomError(input)
      expect(result).toBeInstanceOf(RoomError)
      expect(result.message).not.toContain('[object Object]')
    }
  })
})

describe('PostgREST embed ambiguity', () => {
  it('is surfaced as something actionable rather than swallowed', () => {
    // The failure that reached a player: room_members points at profiles twice
    // (user_id and removed_by), so an unqualified embed is refused. The message
    // names the constraints to choose between, and that detail must survive.
    const result = toRoomError({
      code: 'PGRST201',
      message:
        "Could not embed because more than one relationship was found for 'room_members' and 'profiles'",
      details: "Try changing 'profiles' to one of the following: 'profiles!room_members_user_id_fkey'",
    })
    expect(result.detail).toContain('room_members_user_id_fkey')
    expect(result.message).not.toContain('[object Object]')
  })
})
