import { describe, expect, it } from 'vitest'
import { PAY_AFTER_MS, PAY_MS, resultHoldMs } from './revealStage'

/**
 * The reveal's pacing, as a set of promises it makes to itself.
 *
 * These are three numbers in three different places — the pause before the
 * dice move, how long they take to move, and how long the whole result stands
 * before the table goes on without being asked — and nothing about any one of
 * them says what the others are. Tuning one and advancing the table over a die
 * still in the air is the mistake this exists to make impossible.
 */
describe('the reveal’s timing', () => {
  it('never moves on while a die is still in the air', () => {
    // Every table size, from the smallest resolution to a correct Bull that
    // takes a die from five people at once.
    for (let changed = 0; changed <= 6; changed += 1) {
      expect(resultHoldMs(changed)).toBeGreaterThan(PAY_AFTER_MS + PAY_MS)
    }
  })

  it('leaves the settled table on screen long enough to be read', () => {
    // Not just longer than the animation — long enough after it that a player
    // sees what the table looks like now, which is the point of the reveal.
    for (let changed = 0; changed <= 6; changed += 1) {
      const afterwards = resultHoldMs(changed) - (PAY_AFTER_MS + PAY_MS)
      expect(afterwards).toBeGreaterThanOrEqual(2000)
    }
  })

  it('holds longer the more there is to read, up to a limit', () => {
    // A player waiting on a table that has already finished moving is a player
    // being made to wait, so it is capped rather than growing without end.
    expect(resultHoldMs(3)).toBeGreaterThan(resultHoldMs(1))
    expect(resultHoldMs(6)).toBeLessThanOrEqual(12_000)
  })

  it('gives a die long enough to be followed across the table', () => {
    // The only thing that ever changes what a player holds. Quicker than this
    // and a player who blinked has missed the result.
    expect(PAY_MS).toBeGreaterThanOrEqual(800)
  })
})
