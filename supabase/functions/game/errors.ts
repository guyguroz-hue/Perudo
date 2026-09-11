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
  | 'SELF_CHALLENGE'
  | 'STALE_STATE'
  | 'UNRESOLVED_RULE'
  | 'BAD_REQUEST'

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
 * Postgres raises these by name from the apply_* functions. Anything else is a
 * genuine fault and is not translated into a polite refusal — a server bug
 * should not read to a player like a rule.
 */
export function fromPostgres(message: string): GameError | null {
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
  return null
}
