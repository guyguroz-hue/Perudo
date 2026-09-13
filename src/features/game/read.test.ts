import { describe, expect, it } from 'vitest'
import { movesFromEvents } from './read'
import type { EventRow } from './read'

/**
 * Turning the log into the round's moves.
 *
 * The fetch around this is one query and nothing else; everything that could
 * be wrong is here. Two things in particular: Postgres hands back the newest
 * row first and the screen reads oldest first, and the moves wanted are the
 * ones from *this* round while the log is kept per game.
 */

const NAMES = new Map([
  ['alice', 'Alice'],
  ['carl', 'Carl'],
  ['maya', 'Maya'],
])

/** Rows as the query returns them: newest first. */
function rows(...spec: readonly (readonly [number, string, string, string, object?])[]): EventRow[] {
  return spec.map(([id, round_id, actor_id, kind, payload]) => ({
    id,
    round_id,
    actor_id,
    kind,
    payload: (payload ?? {}) as Record<string, unknown>,
  }))
}

describe('the round’s moves, out of the game’s log', () => {
  it('reads oldest first, whichever way the rows arrive', () => {
    const moves = movesFromEvents(
      rows(
        [3, 'r1', 'maya', 'bid', { quantity: 5, face: 5 }],
        [2, 'r1', 'carl', 'bid', { quantity: 4, face: 5 }],
        [1, 'r1', 'alice', 'bid', { quantity: 3, face: 5 }],
      ),
      NAMES,
    )
    expect(moves.map((m) => m.text)).toEqual([
      'Alice bid 3 fives',
      'Carl bid 4 fives',
      'Maya bid 5 fives',
    ])
  })

  /*
   * A round boundary is not a fixed number of rows back — a round can be one
   * bid and a Lie, or a dozen raises — so it is found rather than assumed.
   * Carrying a bid over from the round before would be worse than showing
   * nothing: the dice have been re-rolled, so it is a claim about a table that
   * no longer exists.
   */
  it('stops at the round it is in', () => {
    const moves = movesFromEvents(
      rows(
        [4, 'r2', 'alice', 'bid', { quantity: 2, face: 3 }],
        [3, 'r1', 'carl', 'lie'],
        [2, 'r1', 'maya', 'bid', { quantity: 9, face: 6 }],
      ),
      NAMES,
    )
    expect(moves.map((m) => m.text)).toEqual(['Alice bid 2 threes'])
  })

  /*
   * Between rounds there is no open round at all, and the last thing said still
   * belongs to the one that just finished — which is exactly when a player is
   * reading it, because the cups are coming off.
   */
  it('keeps the finished round’s moves while the reveal plays', () => {
    const moves = movesFromEvents(
      rows(
        [3, 'r1', 'carl', 'burst_lie'],
        [2, 'r1', 'alice', 'bid', { quantity: 6, face: 2 }],
        [1, 'r0', 'maya', 'bid', { quantity: 1, face: 1 }],
      ),
      NAMES,
    )
    expect(moves.map((m) => m.text)).toEqual(['Alice bid 6 twos', 'Carl burst in with Lie'])
  })

  it('marks the moves made out of turn', () => {
    const moves = movesFromEvents(
      rows(
        [2, 'r1', 'carl', 'burst_bid', { quantity: 7, face: 4 }],
        [1, 'r1', 'alice', 'bid', { quantity: 3, face: 4 }],
      ),
      NAMES,
    )
    expect(moves.map((m) => m.burst)).toEqual([false, true])
  })

  it('names somebody it has never heard of rather than showing an id', () => {
    const moves = movesFromEvents(rows([1, 'r1', 'ghost', 'bid', { quantity: 2, face: 6 }]), NAMES)
    expect(moves[0].text).toBe('Someone bid 2 sixes')
    expect(moves[0].text).not.toContain('ghost')
  })

  /*
   * An event kind a later build writes and this one cannot say out loud is left
   * out. A raw identifier in the middle of a sentence is worse than a shorter
   * list.
   */
  it('leaves out what it cannot say', () => {
    const moves = movesFromEvents(
      rows(
        [2, 'r1', 'carl', 'something_new'],
        [1, 'r1', 'alice', 'bid', { quantity: 3, face: 4 }],
      ),
      NAMES,
    )
    expect(moves.map((m) => m.text)).toEqual(['Alice bid 3 fours'])
  })

  it('says nothing about a game that has not started', () => {
    expect(movesFromEvents([], NAMES)).toEqual([])
  })
})
