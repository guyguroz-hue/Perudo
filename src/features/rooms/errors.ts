/**
 * The room actions raise stable, machine-readable messages — 'ROOM_FULL',
 * 'NOT_HOST' and so on. This is the single place they become sentences.
 *
 * Every failure a player can actually cause has its own explanation. "Something
 * went wrong" is reserved for the cases we genuinely did not anticipate, and
 * when it appears it carries the raw text so it can be diagnosed.
 */
export interface RoomError {
  readonly code: string
  readonly message: string
  /** True when retrying the same action might work. */
  readonly retryable: boolean
}

const EXPLANATIONS: Record<string, { message: string; retryable?: boolean }> = {
  INVALID_ROOM: {
    message: 'No room with that code. Check it and try again.',
    retryable: true,
  },
  ROOM_FULL: {
    message: 'That room is full — six players is the limit.',
  },
  GAME_ALREADY_STARTED: {
    message: 'That game is already under way. You can join the next one.',
  },
  ROOM_EXPIRED: {
    message: 'That room has closed.',
  },
  REMOVED_FROM_ROOM: {
    message: 'You were removed from that room.',
  },
  NOT_HOST: {
    message: 'Only the host can do that.',
  },
  CANNOT_KICK_SELF: {
    message: 'You cannot remove yourself. Leave the room instead.',
  },
  NOT_IN_ROOM: {
    message: 'That player has already left.',
  },
  PROFILE_REQUIRED: {
    message: 'Pick a name before joining a game.',
  },
  NOT_AUTHENTICATED: {
    message: 'Your session ended. Reload to start a new one.',
  },
  CODE_GENERATION_FAILED: {
    message: 'Could not create a room just now. Try again.',
    retryable: true,
  },
}

export function toRoomError(error: unknown): RoomError {
  const raw = error instanceof Error ? error.message : String(error)
  const code = raw.trim()

  const known = EXPLANATIONS[code]
  if (known !== undefined) {
    return { code, message: known.message, retryable: known.retryable ?? false }
  }

  const lower = raw.toLowerCase()
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return {
      code: 'NETWORK',
      message: 'Could not reach the server. Check your connection.',
      retryable: true,
    }
  }

  return { code: 'UNKNOWN', message: raw, retryable: true }
}
