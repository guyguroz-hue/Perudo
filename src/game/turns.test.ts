import { describe, expect, it } from 'vitest'
import { chooseStarter, isBurst, nextActive } from './turns'
import type { Seated } from './turns'
import type { Bytes } from './random'

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

describe('who opens the first round (R-011)', () => {
  /** Hands out a fixed script of bytes, so a draw can be made to land anywhere. */
  function scripted(...values: number[]): Bytes {
    let i = 0
    return () => new Uint8Array([values[i++ % values.length]])
  }

  it('draws from the players holding dice, in seat order', () => {
    // Three active players (b holds nothing), so the draw is over 0..2.
    expect(chooseStarter(table, scripted(0))).toBe('a')
    expect(chooseStarter(table, scripted(1))).toBe('c')
    expect(chooseStarter(table, scripted(2))).toBe('d')
  })

  it('never draws a player who is out', () => {
    for (let byte = 0; byte < 255; byte += 1) {
      expect(chooseStarter(table, scripted(byte))).not.toBe('b')
    }
  })

  // The same bias roll_die() rejects in SQL. With three candidates, 255 is the
  // one byte that would fold unevenly, so it is drawn again instead.
  it('redraws rather than folding the tail of the byte range', () => {
    expect(chooseStarter(table, scripted(255, 1))).toBe('c')
  })

  it('is uniform across a lot of draws', () => {
    const bytes: Bytes = (n) => crypto.getRandomValues(new Uint8Array(n))
    const counts = new Map<string, number>()
    const draws = 12_000
    for (let i = 0; i < draws; i += 1) {
      const id = chooseStarter(table, bytes)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }

    expect(counts.size).toBe(3)
    // Expect 4000 each. A fair draw stays well inside 10%; folding the tail of
    // the byte range would show up as one candidate running ahead.
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan((draws / 3) * 0.9)
      expect(count).toBeLessThan((draws / 3) * 1.1)
    }
  })

  it('refuses a table with nobody left', () => {
    const empty = table.map((p) => ({ ...p, diceCount: 0 }))
    expect(() => chooseStarter(empty, scripted(0))).toThrow(/nobody holding dice/)
  })

  it('does not draw at all when there is only one candidate', () => {
    const alone = table.map((p) => (p.playerId === 'a' ? p : { ...p, diceCount: 0 }))
    const refuse: Bytes = () => {
      throw new Error('drew a byte for a choice of one')
    }
    expect(chooseStarter(alone, refuse)).toBe('a')
  })
})
