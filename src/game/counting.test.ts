import { describe, expect, it } from 'vitest'
import { countAcrossTable, countInHand } from './counting'
import { hand } from './testing'

describe('counting — normal round (GAME_RULES §3)', () => {
  it('counts ones as wild toward a normal face', () => {
    // The worked example from the specification: 4 fives and 2 ones satisfy
    // a bid of 6 fives.
    const table = [hand('a', 5, 5, 1), hand('b', 5, 5, 1)]
    expect(countAcrossTable(table, 5, 'normal')).toBe(6)
  })

  it('does not let the wildcard count itself twice when bidding Perudo', () => {
    expect(countInHand([1, 1, 5, 5], 1, 'normal')).toBe(2)
  })

  it('ignores unrelated faces', () => {
    expect(countInHand([2, 3, 4, 6], 5, 'normal')).toBe(0)
  })
})

describe('counting — Farewell Round (GAME_RULES §10)', () => {
  it('does NOT treat ones as wild', () => {
    // The same dice that made "6 fives" true in a normal round only make four
    // once the Farewell Round strips the wildcard.
    const table = [hand('a', 5, 5, 1), hand('b', 5, 5, 1)]
    expect(countAcrossTable(table, 5, 'farewell')).toBe(4)
  })

  it('counts a locked Perudo face as an ordinary face', () => {
    expect(countInHand([1, 1, 1, 4], 1, 'farewell')).toBe(3)
  })
})
