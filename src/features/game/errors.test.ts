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
