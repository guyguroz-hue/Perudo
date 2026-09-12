/**
 * The Edge Function refuses with a stable code and its own sentence. This is
 * where both become something to put on screen.
 *
 * A real Error subclass, for the same reason `RoomError` is one: anything that
 * catches a plain object and asks `instanceof Error` gets false, and
 * `String(it)` produces "[object Object]" — the conversion meant to explain a
 * failure destroys it instead.
 */
export class GameActionError extends Error {
  /** Stable identifier: 'ILLEGAL_BID', 'STALE_STATE', 'UNKNOWN', … */
  readonly code: string
  /** True when the table moved under you and looking again is the answer. */
  readonly stale: boolean

  constructor(code: string, message: string, stale: boolean) {
    super(message)
    this.name = 'GameActionError'
    this.code = code
    this.stale = stale
  }
}

/**
 * Codes the client rewords.
 *
 * Most refusals arrive with a sentence written where the decision was made —
 * `checkBid` explains exactly why a bid was refused, and no generic phrasing
 * here could do better. These are the ones where the server's wording is a
 * code, or where the player needs to be told what to do rather than what
 * happened.
 */
const EXPLANATIONS: Record<string, string> = {
  STALE_STATE: 'Somebody got there first. Have another look.',
  NO_ROUND: 'The round has not started yet.',
  ROUND_ALREADY_OPEN: 'That round is already under way.',
  GAME_NOT_ACTIVE: 'This game has finished.',
  NOT_A_PLAYER: 'You are not in this game.',
  ELIMINATED: 'You are out of this game.',
  NOT_AUTHENTICATED: 'Your session ended. Reload to start a new one.',
  INTERNAL: 'Something broke at our end. Try again.',
}

/** Refusals that mean "the table moved", which the UI answers by refetching. */
const STALE = new Set(['STALE_STATE', 'NO_ROUND', 'ROUND_ALREADY_OPEN', 'GAME_NOT_ACTIVE'])

export function toGameError(error: unknown): GameActionError {
  if (error instanceof GameActionError) return error

  const { code, message } = read(error)
  return new GameActionError(code, EXPLANATIONS[code] ?? message, STALE.has(code))
}

function read(error: unknown): { code: string; message: string } {
  if (error !== null && typeof error === 'object') {
    const body = error as { error?: unknown; message?: unknown }
    if (typeof body.error === 'string') {
      return {
        code: body.error,
        message: typeof body.message === 'string' ? body.message : body.error,
      }
    }
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Something went wrong.'

  // A failed fetch never reaches the function at all, so there is no code to
  // read. Saying "check your connection" is the only useful thing here.
  if (/fetch|network|load failed/i.test(message)) {
    return { code: 'NETWORK', message: 'Could not reach the table. Check your connection.' }
  }
  return { code: 'UNKNOWN', message }
}
