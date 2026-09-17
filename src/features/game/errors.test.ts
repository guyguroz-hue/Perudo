import { describe, expect, it } from 'vitest'
import { GameActionError, toGameError } from './errors'

/**
 * A refusal has to arrive as the rule that refused it. These are the shapes
 * that actually turn up, including the two that used to reach a player as
 * something they could do nothing with.
 */
describe('reading a refusal', () => {
  it('keeps the sentence written where the decision was made', () => {
    // checkBid explains exactly why a bid was refused. No generic phrasing
    // here could do better, so this must not reword it.
    const failure = toGameError({
      error: 'ILLEGAL_BID',
      message: 'the quantity may never fall: 4x5 -> 3x5',
    })
    expect(failure.code).toBe('ILLEGAL_BID')
    expect(failure.message).toBe('the quantity may never fall: 4x5 -> 3x5')
  })

  it('rewords the codes that are codes', () => {
    expect(toGameError({ error: 'STALE_STATE', message: 'STALE_STATE' }).message).toBe(
      'Somebody got there first. Have another look.',
    )
  })

  it('knows which refusals mean the table moved', () => {
    expect(toGameError({ error: 'STALE_STATE' }).stale).toBe(true)
    expect(toGameError({ error: 'ILLEGAL_BID', message: 'no' }).stale).toBe(false)
  })

  // The gateway answering instead of the function, which is what a function
  // deployed under a different name looks like.
  it('names a missing deployment instead of blaming the game', () => {
    const failure = toGameError({ code: 404, message: 'Requested function was not found' })
    expect(failure.code).toBe('NOT_DEPLOYED')
    expect(failure.message).toMatch(/Deploy the Edge Function as `game`/)
  })

  it('says a network failure is a network failure', () => {
    expect(toGameError(new TypeError('Failed to fetch')).code).toBe('NETWORK')
  })

  // Converting twice must not destroy the original, which is what a plain
  // object thrown as an error used to do: String(it) gave "[object Object]".
  it('is idempotent', () => {
    const once = toGameError({ error: 'ELIMINATED' })
    expect(toGameError(once)).toBe(once)
    expect(String(once)).not.toContain('[object Object]')
  })

  it('is a real Error', () => {
    expect(toGameError('boom')).toBeInstanceOf(Error)
    expect(toGameError('boom')).toBeInstanceOf(GameActionError)
  })
})

/*
 * The code has to survive the trip to the screen.
 *
 * `toGameError` has always produced one; the screen used to drop it, because
 * the hook between them kept only the sentence and the stale flag. The cost
 * arrived as a bug report that could not be acted on — "I press Bull and get an
 * error" — for a refusal the client had already identified precisely and then
 * thrown away. These hold the two halves apart: a sentence written for the
 * player, and a name written for whoever has to fix it.
 */
describe('a refusal keeps its name', () => {
  it('carries a code beside every reworded message', () => {
    const failure = toGameError({ error: 'BULL_ALREADY_CALLED', message: 'This bid has already been Bulled.' })
    expect(failure.code).toBe('BULL_ALREADY_CALLED')
    // The server's own sentence survives: nothing generic here could do better.
    expect(failure.message).toBe('This bid has already been Bulled.')
  })

  // The two that send somebody looking in completely different places, and the
  // pair most easily confused from the sentence alone.
  it('tells a spent Bull apart from a stale one', () => {
    expect(toGameError({ error: 'BULL_ALREADY_CALLED' }).stale).toBe(false)
    expect(toGameError({ error: 'STALE_STATE' }).stale).toBe(true)
  })

  it('never leaves the code empty', () => {
    for (const thrown of ['boom', new TypeError('Failed to fetch'), {}, null]) {
      expect(toGameError(thrown).code).not.toBe('')
    }
  })
})

/*
 * A database that does not match the code.
 *
 * These used to arrive as INTERNAL — "Something broke at our end" — which is
 * the same sentence for a missing migration, a leftover overload and a revoked
 * grant, three faults with three different fixes and none of them a bug in the
 * game. They are named now because a deployment fault is a fact about which SQL
 * has been run, not about anybody's hand.
 */
describe('a database out of step with the code', () => {
  it('does not offer a retry for something retrying cannot fix', () => {
    for (const code of ['DB_OUT_OF_DATE', 'DB_AMBIGUOUS', 'DB_FORBIDDEN']) {
      const failure = toGameError({ error: code })
      expect(failure.message).toMatch(/migrations/)
      expect(failure.message).not.toMatch(/Try again/)
      // Not stale: looking at the table again changes nothing here.
      expect(failure.stale).toBe(false)
    }
  })

  it('keeps them apart from a genuine fault', () => {
    expect(toGameError({ error: 'INTERNAL' }).message).toMatch(/Try again/)
  })
})
