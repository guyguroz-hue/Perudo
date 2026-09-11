import { describe, expect, it } from 'vitest'
import { isBurst, nextActive } from './turns'
import type { Seated } from './turns'

const table: readonly Seated[] = [
  { playerId: 'a', seat: 0, diceCount: 3 },
  { playerId: 'b', seat: 1, diceCount: 0 },
  { playerId: 'c', seat: 2, diceCount: 5 },
  { playerId: 'd', seat: 4, diceCount: 1 },
]

describe('play continues from whoever acted', () => {
  it('moves clockwise', () => {
    expect(nextActive(table, 'a')).toBe('c')
    expect(nextActive(table, 'c')).toBe('d')
  })

  it('wraps round the table', () => {
    expect(nextActive(table, 'd')).toBe('a')
  })

  it('skips players who are out', () => {
    // b sits between a and c and holds nothing.
    expect(nextActive(table, 'a')).not.toBe('b')
  })

  // The whole of GAME_RULES §9.1: normal play resumes with the player after the
  // last Burst player. There is no separate rule for a Burst — a Burst is a
  // player taking the turn, and the turn moving on from where they sit.
  it('resumes after a Burst from the player who burst', () => {
    // c holds the normal turn; d bursts in from further round the table.
    expect(nextActive(table, 'd')).toBe('a')
  })

  it('continues from a player the resolution just eliminated', () => {
    const after = table.map((p) => (p.playerId === 'd' ? { ...p, diceCount: 0 } : p))
    expect(nextActive(after, 'd')).toBe('a')
  })

  it('refuses a table with nobody left', () => {
    expect(() => nextActive(table.map((p) => ({ ...p, diceCount: 0 })), 'a')).toThrow(
      /nobody holding dice/,
    )
  })

  it('refuses a player who is not at the table', () => {
    expect(() => nextActive(table, 'zoe')).toThrow(/not at this table/)
  })
})

describe('what counts as a Burst', () => {
  it('is acting when the turn belongs to somebody else', () => {
    expect(isBurst('a', 'c')).toBe(true)
    expect(isBurst('a', 'a')).toBe(false)
  })

  it('is not a Burst when nobody holds the turn', () => {
    expect(isBurst(null, 'c')).toBe(false)
  })
})
