/**
 * Why an action was refused.
 *
 * Stable codes, because the client turns them into sentences and a sentence
 * that changes because a message was reworded is a bug waiting to happen.
 */
export type GameErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NOT_A_PLAYER'
  | 'ELIMINATED'
  | 'GAME_NOT_ACTIVE'
  | 'NO_ROUND'
  | 'ROUND_ALREADY_OPEN'
  | 'ILLEGAL_BID'
  | 'NO_BID_TO_CHALLENGE'
  | 'BULL_NEEDS_BID'
  | 'BULL_ALREADY_CALLED'
  | 'FAREWELL_OPENING'
  | 'SELF_CHALLENGE'
  | 'STALE_STATE'
  | 'UNRESOLVED_RULE'
  | 'BAD_REQUEST'
  | 'DB_OUT_OF_DATE'
  | 'DB_AMBIGUOUS'
  | 'DB_FORBIDDEN'
  | 'VOICE_UNAVAILABLE'

export class GameError extends Error {
  readonly code: GameErrorCode
  readonly status: number

  constructor(code: GameErrorCode, message: string, status = 400) {
    super(message)
    this.name = 'GameError'
    this.code = code
    this.status = status
  }
}

/**
 * A failure from the database, as something the caller can act on.
 *
 * Two different kinds arrive here. The first is a rule: the apply_* functions
 * raise these by name, and they are ordinary refusals. Anything else is a
 * genuine fault, and a server bug must not read to a player like a rule — so
 * the rest is deliberately not translated, logged rather than returned, because
 * an unexpected error's message can carry whatever the server was holding and
 * this server holds dice.
 *
 * The second kind is the exception to that, and it was bought the hard way. A
 * database that does not match the code it is running under fails here too, and
 * under the old rule every one of those reached the player as "Something broke
 * at our end" — the same sentence for a missing migration, a leftover overload
 * and a revoked grant, none of which is a bug in the game and all of which have
 * a different fix. It cost a day of guessing at a Bull button that would not
 * work.
 *
 * These are safe to name. A deployment fault is a fact about which SQL has been
 * run, not about anybody's hand: the codes come from PostgREST and Postgres
 * themselves, the sentences say which step was skipped, and nothing of the
 * failing statement is passed on.
 */
export function fromPostgres(error: { message: string; code?: string }): GameError | null {
  const { message } = error

  if (message.includes('STALE_STATE')) {
    return new GameError(
      'STALE_STATE',
      'Somebody else acted first. The table has moved on.',
      409,
    )
  }
  if (message.includes('ROUND_ALREADY_OPEN')) {
    return new GameError('ROUND_ALREADY_OPEN', 'A round is already under way.', 409)
  }
  if (message.includes('GAME_NOT_ACTIVE')) {
    return new GameError('GAME_NOT_ACTIVE', 'This game is not running.', 409)
  }

  /*
   * The function this version calls is not in the database.
   *
   * PGRST202 is PostgREST failing to match an RPC by name and argument names;
   * 42883 is Postgres itself saying the function does not exist. Either way a
   * migration has not been run, or has been run in the wrong order.
   */
  if (message.includes('PGRST202') || error.code === 'PGRST202' || error.code === '42883') {
    return new GameError(
      'DB_OUT_OF_DATE',
      'The database is missing a function this version of the game needs. ' +
        'Run the pending migrations.',
      500,
    )
  }

  /*
   * Two functions of the same name, and PostgREST will not guess.
   *
   * What a migration that adds a signature without dropping the old one leaves
   * behind. It has happened once already, to apply_bid.
   */
  if (message.includes('PGRST203') || error.code === 'PGRST203') {
    return new GameError(
      'DB_AMBIGUOUS',
      'The database has two versions of the same function. ' +
        'An older migration left one behind; re-run the latest migrations.',
      500,
    )
  }

  // The function is there and the server is not allowed to call it.
  if (error.code === '42501' || message.includes('permission denied')) {
    return new GameError(
      'DB_FORBIDDEN',
      'The game server is not permitted to write to this table. ' +
        'A grant is missing; re-run the latest migrations.',
      500,
    )
  }

  return null
}
