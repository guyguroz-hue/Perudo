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
  NOT_DEPLOYED:
    'The game server is not reachable under the name this app calls. ' +
    'Deploy the Edge Function as `game`.',
  NO_ROUND: 'The round has not started yet.',
  ROUND_ALREADY_OPEN: 'That round is already under way.',
  GAME_NOT_ACTIVE: 'This game has finished.',
  NOT_A_PLAYER: 'You are not in this game.',
  ELIMINATED: 'You are out of this game.',
  NOT_AUTHENTICATED: 'Your session ended. Reload to start a new one.',
  INTERNAL: 'Something broke at our end. Try again.',
  /*
   * The database does not match the code running against it.
   *
   * Not a bug in the game and not something a player can retry past, so it does
   * not get the encouraging sentence the others do. The server's own wording
   * says which step was skipped; these three only make sure the reader knows it
   * is the deployment rather than the table.
   */
  DB_OUT_OF_DATE:
    'The database is behind this version of the game. The pending migrations ' +
    'have not been run.',
  DB_AMBIGUOUS:
    'The database has two versions of the same function. Re-run the latest ' +
    'migrations.',
  DB_FORBIDDEN:
    'The game server is not permitted to make this write. A grant is missing; ' +
    're-run the latest migrations.',
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
    const body = error as { error?: unknown; message?: unknown; code?: unknown }

    // Our own refusal: a stable code and a sentence written where the decision
    // was made.
    if (typeof body.error === 'string') {
      return {
        code: body.error,
        message: typeof body.message === 'string' ? body.message : body.error,
      }
    }

    // Supabase's gateway answering instead of the function — which is what a
    // function deployed under a different name looks like. Worth naming,
    // because the alternative is "Edge Function returned a non-2xx status
    // code", which sends somebody looking for a bug in the game.
    if (typeof body.code === 'number' && typeof body.message === 'string') {
      return {
        code: body.code === 404 ? 'NOT_DEPLOYED' : `HTTP_${body.code}`,
        message: body.message,
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
