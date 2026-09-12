import { describe, expect, it } from 'vitest'
import { placeSeats, sceneSeats } from './seating'
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

describe('who sits where', () => {
  // The one thing this has to get right: you sit at the edge you are sitting
  // at, whatever seat the room gave you.
  it('puts you nearest the viewer whoever you are', () => {
    for (let youAt = 0; youAt < 6; youAt += 1) {
      const seats = placeSeats(table(6, youAt))
      const you = seats.find((seat) => seat.player.isYou)
      expect(you?.index).toBe(0)
      expect(pct(you!.badge.left)).toBeCloseTo(50, 0)
      // Nearest means lowest on screen.
      for (const other of seats.filter((s) => !s.player.isYou)) {
        expect(pct(you!.badge.top)).toBeGreaterThan(pct(other.badge.top))
      }
    }
  })

  // Turn order should be visible rather than worked out.
  it('keeps everyone in their order around the ring', () => {
    expect(placeSeats(table(6, 2)).map((seat) => seat.player.id)).toEqual([
      'p2',
      'p3',
      'p4',
      'p5',
      'p0',
      'p1',
    ])
  })

  it('gives two to six players a place each, and no two the same', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const seats = placeSeats(table(count, 0))
      expect(seats).toHaveLength(count)
      const spots = new Set(seats.map((s) => `${s.badge.left},${s.badge.top}`))
      expect(spots.size).toBe(count)
    }
  })

  // Badges sit outside the table so they never cover it, and the far ones are
  // higher up the screen than the near ones because the camera is low.
  it('lays the badges out around the table, far ones highest', () => {
    const seats = placeSeats(table(6, 0))
    const tops = seats.map((seat) => pct(seat.badge.top))
    expect(Math.min(...tops)).toBeLessThan(Math.max(...tops))
    for (const seat of seats) {
      expect(pct(seat.badge.left)).toBeGreaterThan(-20)
      expect(pct(seat.badge.left)).toBeLessThan(120)
    }
  })

  /*
   * The one thing that made the table unreadable: a badge sitting on the cup it
   * belongs to. It is guarded here rather than left to the eye, because the
   * anchor is a projection and a change to the camera moves every badge at once.
   */
  it('hangs every badge clear of its own cup, and never off the frame', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const seats = placeSeats(table(count, 0))
      for (const seat of seats) {
        // Away from the table, not over it: yours drops below your cup, and
        // everybody else's rises above theirs.
        expect(seat.badge.translate).toBe(
          seat.player.isYou ? '-50% 10px' : '-50% calc(-100% - 10px)',
        )
        // Far enough inside the frame that a name is still a name.
        expect(pct(seat.badge.left)).toBeGreaterThanOrEqual(15)
        expect(pct(seat.badge.left)).toBeLessThanOrEqual(85)
      }
    }
  })

  it('survives a table it was handed empty', () => {
    expect(placeSeats([])).toEqual([])
  })

  /*
   * Going out costs you your dice, not your chair.
   *
   * The cup that leaves the table is the eliminated player's, and everybody
   * else stays where they were sitting. The renderer places a cup from the seat
   * index and the size of the whole table, so both have to survive the filter:
   * derived from the length of the list that is left, a four-handed table with
   * one player out puts the last player in the empty chair, and then the cup
   * under a name is somebody else's.
   */
  it('leaves everyone else in their chair when a player goes out', () => {
    const players = table(4, 0)
    const whole = sceneSeats(placeSeats(players), null)

    const short = sceneSeats(
      placeSeats(players.map((p) => (p.id === 'p2' ? { ...p, diceCount: 0, isEliminated: true } : p))),
      null,
    )

    expect(short.map((s) => s.id)).toEqual(['p0', 'p1', 'p3'])
    for (const seat of short) {
      const before = whole.find((s) => s.id === seat.id)
      expect({ index: seat.index, count: seat.count }).toEqual({
        index: before?.index,
        count: before?.count,
      })
    }
  })

  // Your dice are the only faces in this browser, so they are the only faces
  // the renderer can be handed.
  it('sends the renderer your faces and nobody else’s', () => {
    const cups = sceneSeats(placeSeats(table(4, 2)), [3, 5, 2])
    expect(cups.filter((s) => s.dice !== undefined)).toHaveLength(1)
    expect(cups[0].dice).toEqual([3, 5, 2])
  })

  /*
   * The one exception to the rule above, and the reason it is a test.
   *
   * Until a challenge is resolved this browser holds nobody's dice but its
   * own — that is what `player_dice` and its policy are for. A reveal is the
   * moment the server releases every hand, and only then does the renderer get
   * them. Every cup lifts at once, because the server resolved them at once.
   */
  it('lifts every cup and shows every hand once the server has released them', () => {
    const hands = [
      { id: 'p0', name: 'P0', dice: [5, 5] as const },
      { id: 'p1', name: 'P1', dice: [1, 3, 4] as const },
      { id: 'p2', name: 'P2', dice: [6] as const },
    ]
    const cups = sceneSeats(placeSeats(table(3, 1)), [9 as never], 'revealing', hands)

    expect(cups.map((cup) => cup.state)).toEqual(['lifted', 'lifted', 'lifted'])
    for (const cup of cups) {
      expect(cup.dice).toEqual(hands.find((hand) => hand.id === cup.id)?.dice)
    }
  })

  // And before that moment, nothing changes: a cup is covered and the only
  // faces in the list are the ones this browser was given.
  it('lifts nothing and shows nothing while the round is still live', () => {
    const cups = sceneSeats(placeSeats(table(3, 1)), [2, 4, 6])
    expect(cups.map((cup) => cup.state)).toEqual(['covered', 'covered', 'covered'])
    expect(cups.filter((cup) => cup.dice !== undefined)).toHaveLength(1)
  })
})
