import { describe, expect, it } from 'vitest'
import { checkBid } from './bids'
import {
  diceOnTable,
  initialBid,
  legalFacesAt,
  lowestLegalBid,
  minimalRaise,
  quantityBounds,
  withFace,
} from './builder'
import type { Face, RoundState } from './types'
import { FACES } from './types'
import { bid, farewellRound, normalRound } from './testing'

/** Every state a builder could open in, used to check properties across all of them. */
const STATES: readonly { readonly name: string; readonly round: RoundState }[] = [
  { name: 'opening a normal round', round: normalRound() },
  { name: 'facing 1x2', round: normalRound(bid(1, 2)) },
  { name: 'facing 4x5', round: normalRound(bid(4, 5)) },
  { name: 'facing 9x6', round: normalRound(bid(9, 6)) },
  { name: 'facing 3 Perudos', round: normalRound(bid(3, 1)) },
  { name: 'facing 12 Perudos', round: normalRound(bid(12, 1)) },
  { name: 'opening a Farewell Round', round: farewellRound() },
  { name: 'facing 2x4 in a Farewell Round', round: farewellRound(bid(2, 4), 4) },
  { name: 'facing 2 Perudos in a Farewell Round', round: farewellRound(bid(2, 1), 1) },
]

const TABLE = 15

/** Whether any quantity at all makes this face biddable in this round. */
function reachable(round: RoundState, face: Face): boolean {
  for (let quantity = 1; quantity <= 80; quantity += 1) {
    if (checkBid(round, { quantity, face }).legal) return true
  }
  return false
}

describe('the builder offers exactly what the rules allow', () => {
  // The point of the whole module: it never answers from its own idea of the
  // rules, so it cannot disagree with the check the server runs.
  it.each(STATES)('offers only legal faces — $name', ({ round }) => {
    for (let quantity = 1; quantity <= 40; quantity += 1) {
      const offered = legalFacesAt(round, quantity)
      for (const face of FACES) {
        expect(offered.includes(face)).toBe(checkBid(round, { quantity, face }).legal)
      }
    }
  })

  // quantityBounds reports a single min and then trusts the range above it.
  // That is only honest if legality never comes back off once it is on.
  it.each(STATES)('has no legal quantity below its minimum — $name', ({ round }) => {
    const { min } = quantityBounds(round, TABLE)
    for (let quantity = 1; quantity < min; quantity += 1) {
      expect(legalFacesAt(round, quantity)).toHaveLength(0)
    }
  })

  it.each(STATES)('leaves no gap above its minimum — $name', ({ round }) => {
    const { min } = quantityBounds(round, TABLE)
    for (let quantity = min; quantity <= min + 40; quantity += 1) {
      expect(legalFacesAt(round, quantity).length).toBeGreaterThan(0)
    }
  })
})

describe('the lowest legal bid is not the raise anyone wants', () => {
  // Worth stating outright, because it is the trap this module exists to avoid:
  // switching to the wildcard lets the quantity fall, so the genuinely lowest
  // legal bid against four fives is two Perudos. Opening the builder there
  // would put a wildcard jump one tap away and bury the ordinary raise.
  it('lets the quantity fall by jumping to Perudo', () => {
    expect(lowestLegalBid(normalRound(bid(4, 5)), TABLE)).toEqual({ quantity: 2, face: 1 })
    expect(minimalRaise(normalRound(bid(4, 5)), TABLE)).toEqual({ quantity: 4, face: 6 })
  })
})

describe('where the builder opens', () => {
  // The one-tap promise: facing a bid, the builder already holds the raise a
  // player most often wants, so Bid is the only touch needed.
  it('nudges the face up when it can go up', () => {
    expect(minimalRaise(normalRound(bid(4, 5)), TABLE)).toEqual({ quantity: 4, face: 6 })
  })

  it('asks for one more of the same face once the face has maxed out', () => {
    expect(minimalRaise(normalRound(bid(4, 6)), TABLE)).toEqual({ quantity: 5, face: 6 })
  })

  it('raises Perudo by one rather than paying the exit price', () => {
    expect(minimalRaise(normalRound(bid(3, 1)), TABLE)).toEqual({ quantity: 4, face: 1 })
  })

  it('only raises the quantity in a Farewell Round', () => {
    expect(minimalRaise(farewellRound(bid(2, 4), 4), TABLE)).toEqual({ quantity: 3, face: 4 })
    expect(minimalRaise(farewellRound(bid(2, 1), 1), TABLE)).toEqual({ quantity: 3, face: 1 })
  })

  it('opens on a legal raise from every state', () => {
    for (const { round } of STATES) {
      if (round.bid === null) continue
      expect(checkBid(round, minimalRaise(round, TABLE)).legal).toBe(true)
    }
  })

  it('opens a round on the face the player holds most of', () => {
    // Three fives once the two wild ones are counted; nothing else beats it.
    const opening = initialBid(normalRound(), TABLE, [5, 5, 1, 1, 3])
    expect(opening).toEqual({ quantity: 4, face: 5 })
  })

  it('does not count ones as wild when opening a Farewell Round', () => {
    const opening = initialBid(farewellRound(), TABLE, [5, 1, 1, 1, 3])
    expect(opening).toEqual({ quantity: 3, face: 1 })
  })

  it('never opens on Perudo in a normal round, however many ones are held', () => {
    const opening = initialBid(normalRound(), TABLE, [1, 1, 1, 1, 1])
    expect(opening.face).not.toBe(1)
  })

  it('opens on a legal bid from any hand', () => {
    for (const round of [normalRound(), farewellRound()]) {
      for (const face of FACES) {
        const hand = Array.from({ length: 5 }, () => face)
        expect(checkBid(round, initialBid(round, TABLE, hand)).legal).toBe(true)
      }
    }
  })
})

describe('changing the face keeps the bid legal', () => {
  // Two faces are genuinely unreachable: Perudo cannot open a normal round, and
  // a Farewell Round locks its face for good. The builder must leave the bid
  // alone in those cases rather than land on something the server would refuse.
  it.each(STATES)('lands on a legal bid for every face — $name', ({ round }) => {
    const start = initialBid(round, TABLE, [3, 3, 3, 3, 3])
    for (const face of FACES) {
      const next = withFace(round, start, face)
      expect(checkBid(round, next).legal).toBe(true)
      expect(next.face).toBe(reachable(round, face) ? face : start.face)
    }
  })

  it('holds the quantity when the face alone is a legal change', () => {
    expect(withFace(normalRound(bid(4, 2)), { quantity: 4, face: 2 }, 6)).toEqual({
      quantity: 4,
      face: 6,
    })
  })

  // Switching from 5x4 to Perudo needs only ceil(5/2) = 3, so five is already
  // legal and the quantity stays where the player left it. Moving it for them
  // would change two things when they touched one; the quantity control's own
  // floor drops to three, which is where that choice belongs.
  it('leaves the quantity alone when it is already legal for the new face', () => {
    expect(withFace(normalRound(bid(5, 4)), { quantity: 5, face: 4 }, 1)).toEqual({
      quantity: 5,
      face: 1,
    })
    expect(quantityBounds(normalRound(bid(5, 4)), TABLE).min).toBe(3)
  })

  it('drops the quantity to the Perudo minimum when it has to', () => {
    // Against 9x4 the builder sits at quantity 9; Perudo needs only 5.
    expect(withFace(normalRound(bid(9, 4)), { quantity: 9, face: 4 }, 1)).toEqual({
      quantity: 9,
      face: 1,
    })
    // But from a bid it cannot hold, it lands on the minimum that works.
    expect(withFace(normalRound(bid(9, 4)), { quantity: 4, face: 4 }, 1)).toEqual({
      quantity: 5,
      face: 1,
    })
  })

  it('pays the exit price when switching away from Perudo', () => {
    // GAME_RULES §6: leaving 4 Perudos needs 4 * 2 + 1 = 9.
    expect(withFace(normalRound(bid(4, 1)), { quantity: 5, face: 1 }, 3)).toEqual({
      quantity: 9,
      face: 3,
    })
  })

  it('refuses to leave the locked face of a Farewell Round', () => {
    const round = farewellRound(bid(2, 4), 4)
    const start = { quantity: 3, face: 4 as Face }
    expect(withFace(round, start, 6)).toEqual(start)
  })
})

describe('the quantity range', () => {
  it('reaches the dice on the table', () => {
    expect(quantityBounds(normalRound(bid(4, 5)), TABLE)).toEqual({ min: 2, max: TABLE })
  })

  // Bidding past the table total is legal and sometimes forced. The range
  // opens to reach it rather than trapping a player below their own minimum.
  it('opens past the table when the minimum is already above it', () => {
    const round = normalRound(bid(8, 1))
    expect(quantityBounds(round, 10)).toEqual({ min: 9, max: 10 })
    // Returning to a normal face costs 8 * 2 + 1 = 17, past the ten on the table.
    expect(withFace(round, { quantity: 9, face: 1 }, 4)).toEqual({ quantity: 17, face: 4 })
  })

  it('counts the dice still held, not the seats', () => {
    expect(diceOnTable([{ diceCount: 5 }, { diceCount: 2 }, { diceCount: 0 }])).toBe(7)
  })
})
