import { describe, expect, it } from 'vitest'
import { checkBid, minPerudoQuantity, minQuantityAfterPerudo, opensFarewell } from './bids'
import type { BidRejection, Face, RoundState } from './types'
import { bid, farewellRound, normalRound } from './testing'

function expectLegal(round: RoundState, quantity: number, face: Face) {
  expect(checkBid(round, { quantity, face })).toEqual({ legal: true })
}

function expectRejected(
  round: RoundState,
  quantity: number,
  face: Face,
  reason: BidRejection,
) {
  const verdict = checkBid(round, { quantity, face })
  expect(verdict.legal).toBe(false)
  if (!verdict.legal) expect(verdict.reason).toBe(reason)
}

// PART 61 — normal bid progression
describe('normal bid progression (GAME_RULES §4)', () => {
  const current = normalRound(bid(4, 5))

  it('allows a quantity increase', () => expectLegal(current, 5, 5))
  it('allows a face increase', () => expectLegal(current, 4, 6))
  it('allows both to increase', () => expectLegal(current, 5, 6))

  // R-009: the quantity is the anchor. Raise it and the face may go anywhere.
  it('allows a higher quantity with a lower face', () => expectLegal(current, 5, 4))
  it('allows a higher quantity with the lowest face', () => expectLegal(current, 5, 2))
  it('allows a much higher quantity with a lower face', () => expectLegal(current, 9, 2))

  it('rejects any drop in quantity', () => {
    expectRejected(current, 3, 4, 'MUST_NOT_DECREASE')
    expectRejected(current, 3, 5, 'MUST_NOT_DECREASE')
    expectRejected(current, 3, 6, 'MUST_NOT_DECREASE')
  })

  it('requires the face to rise when the quantity holds', () => {
    expectRejected(current, 4, 4, 'FACE_MUST_INCREASE')
    expectRejected(current, 4, 2, 'FACE_MUST_INCREASE')
  })

  it('rejects repeating the current bid', () =>
    expectRejected(current, 4, 5, 'FACE_MUST_INCREASE'))

  it('rejects impossible quantities', () => {
    expectRejected(current, 0, 5, 'INVALID_QUANTITY')
    expectRejected(current, -1, 5, 'INVALID_QUANTITY')
    expectRejected(current, 2.5, 5, 'INVALID_QUANTITY')
  })

  it('rejects impossible faces', () => {
    expectRejected(current, 5, 0 as Face, 'INVALID_FACE')
    expectRejected(current, 5, 7 as Face, 'INVALID_FACE')
    expectRejected(current, 5, 2.5 as Face, 'INVALID_FACE')
  })

  it('allows any normal face to open a round', () => {
    expectLegal(normalRound(), 1, 2)
    expectLegal(normalRound(), 7, 6)
  })
})

// PART 62 — Perudo transitions
describe('normal to Perudo (GAME_RULES §5)', () => {
  it.each([
    [4, 2],
    [5, 3],
    [6, 3],
    [7, 4],
    [8, 4],
    [9, 5],
  ])('%i becomes a minimum of %i Perudos', (previous, minimum) => {
    expect(minPerudoQuantity(previous)).toBe(minimum)
    expectLegal(normalRound(bid(previous, 5)), minimum, 1)
    expectRejected(normalRound(bid(previous, 5)), minimum - 1, 1, 'BELOW_MIN_PERUDO')
  })

  it('allows more than the minimum', () => expectLegal(normalRound(bid(6, 5)), 10, 1))

  it('refuses to open a normal round on Perudo', () =>
    expectRejected(normalRound(), 3, 1, 'CANNOT_OPEN_WITH_PERUDO'))
})

describe('Perudo to normal (GAME_RULES §6)', () => {
  it.each([
    [4, 9],
    [5, 11],
    [6, 13],
  ])('%i Perudos requires a minimum of %i', (previous, minimum) => {
    expect(minQuantityAfterPerudo(previous)).toBe(minimum)
    expectLegal(normalRound(bid(previous, 1)), minimum, 3)
    expectRejected(normalRound(bid(previous, 1)), minimum - 1, 3, 'BELOW_MIN_AFTER_PERUDO')
  })

  it('permits any normal face at the minimum quantity', () => {
    for (const face of [2, 3, 4, 5, 6] as Face[]) {
      expectLegal(normalRound(bid(4, 1)), 9, face)
    }
  })

  it('treats Perudo to Perudo as an ordinary quantity raise', () => {
    expectLegal(normalRound(bid(3, 1)), 4, 1)
    expectRejected(normalRound(bid(3, 1)), 3, 1, 'QUANTITY_MUST_INCREASE')
    expectRejected(normalRound(bid(3, 1)), 2, 1, 'QUANTITY_MUST_INCREASE')
  })
})

// PART 67 — Farewell Round bidding
describe('Farewell Round bidding (GAME_RULES §10)', () => {
  it('lets the opening bid pick any face, Perudo included', () => {
    for (const face of [1, 2, 3, 4, 5, 6] as Face[]) {
      expectLegal(farewellRound(), 2, face)
    }
  })

  it('locks the face for the rest of the round', () => {
    const round = farewellRound(bid(3, 4), 4)
    expectRejected(round, 4, 5, 'FACE_LOCKED')
    expectRejected(round, 4, 3, 'FACE_LOCKED')
    expectRejected(round, 4, 1, 'FACE_LOCKED')
  })

  it('allows the quantity to rise on the locked face', () => {
    expectLegal(farewellRound(bid(3, 4), 4), 4, 4)
  })

  it('refuses a quantity that does not rise', () => {
    expectRejected(farewellRound(bid(3, 4), 4), 3, 4, 'QUANTITY_MUST_INCREASE')
    expectRejected(farewellRound(bid(3, 4), 4), 2, 4, 'QUANTITY_MUST_INCREASE')
  })

  it('does not apply the Perudo transition rules when Perudo is the locked face', () => {
    // In a normal round, leaving 4 Perudos would demand 9. Here the face is
    // locked, so the only legal move is a plain quantity raise.
    const round = farewellRound(bid(4, 1), 1)
    expectLegal(round, 5, 1)
    expectRejected(round, 9, 3, 'FACE_LOCKED')
  })
})

/*
 * The one bid in the game that is worth more than a raise.
 *
 * A Farewell Round's opening bid chooses the face, and that face is then locked
 * for everybody until the round ends (GAME_RULES §10). Every other bid is a
 * raise and nothing more, which is why turn order is a suggestion everywhere
 * else and binding here (R-013).
 *
 * This says only when the privilege exists. Who is allowed to exercise it is
 * the action layer's question, because only the server knows whose turn it is.
 */
describe('the opening bid of a Farewell Round', () => {
  it('is still owed while the round has no bid on it', () => {
    expect(opensFarewell({ type: 'farewell', lockedFace: null, bid: null })).toBe(true)
  })

  it('is spent the moment the face is locked', () => {
    // From here the round is ordinary: every later bid may only raise the
    // quantity on a face that is already fixed, so there is nothing to steal.
    expect(
      opensFarewell({
        type: 'farewell',
        lockedFace: 5,
        bid: { quantity: 2, face: 5, bidderId: 'a', bull: null },
      }),
    ).toBe(false)
  })

  it('never applies to a normal round, opening bid or not', () => {
    // Turn order is a suggestion in a normal round — that is what Burst is.
    expect(opensFarewell({ type: 'normal', lockedFace: null, bid: null })).toBe(false)
  })
})
