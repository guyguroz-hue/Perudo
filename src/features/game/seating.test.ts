import { describe, expect, it } from 'vitest'
import { placeSeats } from './seating'
import type { TablePlayer } from './view'

function table(count: number, youAt: number): TablePlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    seatIndex: i,
    name: `P${i}`,
    diceCount: 5,
    isYou: i === youAt,
    isEliminated: false,
    hasTurn: false,
  }))
}

describe('where everybody sits', () => {
  // The one thing this has to get right: you are nearest the reader, whatever
  // seat the database gave you.
  it('puts you at the bottom whoever you are', () => {
    for (let youAt = 0; youAt < 6; youAt += 1) {
      const seats = placeSeats(table(6, youAt))
      const you = seats.find((seat) => seat.player.isYou)
      expect(you?.y).toBeCloseTo(1)
      expect(you?.x).toBeCloseTo(0)
      expect(you?.side).toBe('near')
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
      // No two seats land on top of each other.
      const spots = new Set(seats.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)}`))
      expect(spots.size).toBe(count)
    }
  })

  // A round table seen from slightly above: its back edge sits nearer the
  // middle than its front edge, so the far seats are pulled in.
  it('foreshortens the far side of the ring', () => {
    const seats = placeSeats(table(4, 0))
    const near = seats.find((seat) => seat.side === 'near')
    const far = seats.find((seat) => seat.side === 'far')
    expect(Math.abs(far!.y)).toBeLessThan(Math.abs(near!.y))
  })

  it('draws the near seats larger than the far ones', () => {
    const seats = placeSeats(table(6, 0))
    const near = seats.find((seat) => seat.side === 'near')
    const far = seats.find((seat) => seat.side === 'far')
    expect(near!.scale).toBeGreaterThan(far!.scale)
  })

  it('survives a table it was handed empty', () => {
    expect(placeSeats([])).toEqual([])
  })
})
