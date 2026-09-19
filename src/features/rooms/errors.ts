/**
 * The room actions raise stable, machine-readable messages — 'ROOM_FULL',
 * 'NOT_HOST' and so on. This is the single place they become sentences.
 *
 * A real Error subclass, not a plain object. Throwing a bare object meant that
 * anything catching it and asking `instanceof Error` got `false`, and
 * `String(it)` produced "[object Object]" — so the original cause was destroyed
 * by the very code meant to explain it. Extending Error also makes this
 * conversion idempotent: wrapping an already-wrapped error returns it unchanged
 * instead of flattening it into noise.
 */
export class RoomError extends Error {
  /** Stable identifier: 'ROOM_FULL', 'NETWORK', 'UNKNOWN', … */
  readonly code: string
  /** True when retrying the same action might work. */
  readonly retryable: boolean
  /** The underlying text, kept for diagnosis when the code is UNKNOWN. */
  readonly detail: string

  constructor(code: string, message: string, retryable: boolean, detail: string) {
    super(message)
    this.name = 'RoomError'
    this.code = code
    this.retryable = retryable
    this.detail = detail
  }
}

const EXPLANATIONS: Record<string, { message: string; retryable?: boolean }> = {
  INVALID_ROOM: {
    message: 'No room with that code. Check it and try again.',
    retryable: true,
  },
  ROOM_FULL: { message: 'That room is full — six players is the limit.' },
  GAME_ALREADY_STARTED: {
    message: 'That game is already under way. You can join the next one.',
  },
  ROOM_EXPIRED: { message: 'That room has closed.' },
  REMOVED_FROM_ROOM: { message: 'You were removed from that room.' },
  NOT_HOST: { message: 'Only the host can do that.' },
  CANNOT_KICK_SELF: {
    message: 'You cannot remove yourself. Leave the room instead.',
  },
  NOT_IN_ROOM: { message: 'That player has already left.' },
  PROFILE_REQUIRED: { message: 'Pick a name before joining a game.' },
  NOT_AUTHENTICATED: {
    message: 'Your session ended. Reload to start a new one.',
  },
  CODE_GENERATION_FAILED: {
    message: 'Could not create a room just now. Try again.',
    retryable: true,
  },
}

export function toRoomError(error: unknown): RoomError {
  if (error instanceof RoomError) return error

  const raw = readMessage(error)
  const code = named(raw)
  if (code !== null) {
    const known = EXPLANATIONS[code]
    return new RoomError(code, known.message, known.retryable ?? false, raw)
  }

  const lower = raw.toLowerCase()
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return new RoomError(
      'NETWORK',
      'Could not reach the server. Check your connection.',
      true,
      raw,
    )
  }

  // A missing function or column means the database has not caught up with the
  // app. Saying so beats a raw PostgREST string.
  if (
    lower.includes('could not find the function') ||
    lower.includes('does not exist') ||
    lower.includes('schema cache')
  ) {
    return new RoomError(
      'DATABASE_BEHIND',
      'This version of the game needs a database update that has not been applied yet.',
      false,
      raw,
    )
  }

  return new RoomError('UNKNOWN', raw, true, raw)
}

/**
 * Which refusal this is, found inside whatever text carried it.
 *
 * An exact match is not enough, and the gap was live for a long time. A
 * plpgsql `raise exception 'ROOM_FULL'` reaches the browser as a PostgREST
 * object carrying the message AND a SQLSTATE — P0001, for a raised exception —
 * and `readMessage` joins everything it can find into one string for the
 * detail line. So the thing being looked up was "ROOM_FULL — P0001", every
 * lookup missed, and every room refusal the database made reached the player as
 * its own raw text with a Postgres error class stapled to it. Every test that
 * covered this handed it a bare `new Error('ROOM_FULL')`, which is the one
 * shape the database never sends.
 *
 * Whole words, so a code cannot be found inside a longer one.
 */
function named(raw: string): string | null {
  const exact = raw.trim()
  if (EXPLANATIONS[exact] !== undefined) return exact
  for (const code of Object.keys(EXPLANATIONS)) {
    if (new RegExp(`\\b${code}\\b`).test(raw)) return code
  }
  return null
}

/**
 * Supabase errors are plain objects with `message`, not Error instances, and
 * their useful detail often sits in `details` or `hint` instead.
 */
function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error

  if (typeof error === 'object' && error !== null) {
    const bag = error as Record<string, unknown>
    const parts = [bag.message, bag.details, bag.hint, bag.code]
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
    if (parts.length > 0) return parts.join(' — ')
    try {
      return JSON.stringify(error)
    } catch {
      return 'Unreadable error'
    }
  }

  return String(error)
}
