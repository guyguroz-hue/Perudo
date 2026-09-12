import { describe, expect, it } from 'vitest'
import { placeSeats } from './seating'
import type { TablePlayer } from './view'

function table(count: number, youAt: number): TablePlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    seatIndex: i,
    diceCount: 5,
    isYou: i === youAt,
    isEliminated: false,
    hasTurn: false,
  }))
}

const pct = (v: string) => Number.parseFloat(v)

describe('where everybody sits', () => {
  // The one thing this has to get right: you are at the edge you are sitting
  // at, whatever seat the database gave you.
  it('puts you at the near edge whoever you are', () => {
    for (let youAt = 0; youAt < 6; youAt += 1) {
      const seats = placeSeats(table(6, youAt))
      const you = seats.find((seat) => seat.player.isYou)
      expect(you?.side).toBe('near')
      expect(pct(you!.left)).toBeCloseTo(50, 0)
      // Nearest the viewer means lowest on screen and largest.
      for (const other of seats.filter((s) => !s.player.isYou)) {
        expect(pct(you!.top)).toBeGreaterThan(pct(other.top))
        expect(you!.scale).toBeGreaterThan(other.scale)
      }
    }
  })

  // Turn order should be visible rather than worked out, so the player
  // clockwise from you must be clockwise from you on screen.
  it('keeps everyone in their order around the ring', () => {
    const seats = placeSeats(table(6, 2))
    expect(seats.map((seat) => seat.player.id)).toEqual([
      'p2',
      'p3',
      'p4',
      'p5',
      'p0',
      'p1',
    ])
  })

  it('spreads two to six players evenly', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const seats = placeSeats(table(count, 0))
      expect(seats).toHaveLength(count)
      const spots = new Set(seats.map((s) => `${s.left},${s.top}`))
      expect(spots.size).toBe(count)
    }
  })

  // Cups nearer the viewer have to be painted over the ones behind them.
  // Compared in order rather than pairwise: two seats mirrored across the table
  // sit at the same depth and their screen positions differ only by floating
  // point, which is not a stacking question.
  it('stacks near seats in front of far ones', () => {
    const seats = placeSeats(table(6, 0))
    expect([...seats].sort((a, b) => b.depth - a.depth)[0].player.isYou).toBe(true)

    const byTop = [...seats].sort((a, b) => pct(a.top) - pct(b.top))
    for (let i = 1; i < byTop.length; i += 1) {
      expect(byTop[i].depth).toBeGreaterThanOrEqual(byTop[i - 1].depth)
    }
  })

  it('survives a table it was handed empty', () => {
    expect(placeSeats([])).toEqual([])
  })
})
