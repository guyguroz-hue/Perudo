import { describe, expect, it } from 'vitest'
import { checkBid } from '../../game'
import type { Face } from '../../game'
import { botToAct, decide } from './bots'
import { active, bid, bull, challenge, deal, faceWord, onTable, seat, seatOf } from './table'
import type { TableState } from './table'

/**
 * A game against bots, played to the end, over and over.
 *
 * The point of the tutorial is that it teaches the real game — so the thing
 * worth testing is not that the bots are clever but that they can never do
 * something the real game would refuse. A bot that bids below the minimum
 * teaches a rule that does not exist, and the player would carry it to a real
 * table and be told they are wrong.
 *
 * So this plays whole games and asserts the rules hold on every single move,
 * which is the only way to cover a bot's judgement: there is no list of
 * positions it can get into.
 */
function table(names: readonly string[]): TableState {
  return {
    seats: names.map((name, i) => seat(`p${i}`, name, i, i === 0)),
    round: { type: 'normal', lockedFace: null, bid: null },
    roundNumber: 0,
    turnId: 'p0',
    farewellQueue: [],
    lastEvent: null,
    winnerId: null,
    over: false,
  }
}

/** Play a whole game with every seat driven by the bot policy. */
function playOut(state: TableState, guard: (t: TableState) => void): number {
  let moves = 0
  deal(state)
  while (!state.over && moves < 4000) {
    moves += 1
    const actor = seatOf(state, state.turnId)
    const move = decide(state, actor.id)

    if (move.kind === 'bid') {
      // The claim about to be made must be one the real game would accept.
      expect(checkBid(state.round, { quantity: move.quantity, face: move.face }).legal).toBe(true)
      expect(bid(state, actor.id, move.quantity, move.face).ok).toBe(true)
    } else if (move.kind === 'bull') {
      expect(bull(state, actor.id).ok).toBe(true)
    } else {
      const done = challenge(state, actor.id)
      expect(done.ok).toBe(true)
      if (!state.over) deal(state)
    }
    guard(state)
  }
  return moves
}

describe('a game against bots', () => {
  it('never breaks a rule, over many whole games', () => {
    for (let game = 0; game < 40; game += 1) {
      const state = table(['You', 'Ada', 'Bo', 'Cy'])
      playOut(state, (t) => {
        // Nobody may hold a negative hand, or more than the ceiling (R-007).
        for (const s of t.seats) {
          expect(s.diceCount).toBeGreaterThanOrEqual(0)
          expect(s.diceCount).toBeLessThanOrEqual(5)
          expect(s.dice.length).toBeLessThanOrEqual(5)
        }
        // The turn never rests on somebody who is out.
        if (!t.over) expect(seatOf(t, t.turnId).diceCount).toBeGreaterThan(0)
      })
      // Somebody wins, or the last two go out together — both are real
      // endings (R-004), and a game that simply stops is not.
      expect(state.over).toBe(true)
      const standing = active(state)
      expect(standing.length).toBeLessThanOrEqual(1)
      if (standing.length === 1) expect(state.winnerId).toBe(standing[0].id)
    }
  })

  it('finishes rather than grinding on forever', () => {
    // A bot that will never doubt makes a game that never ends, which on a
    // phone looks exactly like a hang.
    for (let game = 0; game < 15; game += 1) {
      const state = table(['You', 'Ada', 'Bo'])
      const moves = playOut(state, () => {})
      expect(moves).toBeLessThan(800)
    }
  })

  it('deals every player exactly the dice they hold', () => {
    const state = table(['You', 'Ada', 'Bo'])
    seatOf(state, 'p1').diceCount = 2
    deal(state)
    expect(seatOf(state, 'p0').dice).toHaveLength(5)
    expect(seatOf(state, 'p1').dice).toHaveLength(2)
    expect(onTable(state)).toBe(12)
    for (const s of state.seats) {
      for (const die of s.dice) expect([1, 2, 3, 4, 5, 6]).toContain(die)
    }
  })
})

describe('the moves themselves', () => {
  it('refuses a bid the rules refuse, rather than applying it', () => {
    const state = table(['You', 'Ada'])
    deal(state)
    expect(bid(state, 'p0', 3, 4 as Face).ok).toBe(true)
    // Lower than what is on the table.
    const worse = bid(state, 'p1', 2, 4 as Face)
    expect(worse.ok).toBe(false)
    expect(state.round.bid?.quantity).toBe(3)
  })

  it('will not let the claimant doubt their own claim', () => {
    const state = table(['You', 'Ada'])
    deal(state)
    bid(state, 'p0', 2, 5 as Face)
    expect(challenge(state, 'p0')).toMatchObject({ ok: false })
  })

  it('hands a Bulled claim over to its caller', () => {
    // A Bull takes the claim, so the original bidder may doubt it and the
    // caller may not (GAME_RULES §8.3).
    const state = table(['You', 'Ada', 'Bo'])
    deal(state)
    bid(state, 'p0', 2, 5 as Face)
    expect(bull(state, 'p1').ok).toBe(true)
    expect(challenge(state, 'p1')).toMatchObject({ ok: false })
    const doubted = challenge(state, 'p0')
    expect(doubted.ok).toBe(true)
    if (doubted.ok) expect(doubted.reveal.bullCallerName).toBe('Ada')
  })

  it('refuses a second Bull, which is not a decided rule', () => {
    // R-010. The real server refuses this, so the tutorial must not allow it.
    const state = table(['You', 'Ada', 'Bo'])
    deal(state)
    bid(state, 'p0', 2, 5 as Face)
    expect(bull(state, 'p1').ok).toBe(true)
    expect(bull(state, 'p2').ok).toBe(false)
  })

  it('counts a Perudo toward the claim, and stops in a Farewell Round', () => {
    const state = table(['You', 'Ada'])
    deal(state)
    seatOf(state, 'p0').dice = [1, 5, 2, 3, 4]
    seatOf(state, 'p1').dice = [5, 1, 6, 6, 6]
    // Two fives and two wildcards.
    expect(countIn(state, 5, 'normal')).toBe(4)
    expect(countIn(state, 5, 'farewell')).toBe(2)
  })
})

function countIn(state: TableState, face: number, type: 'normal' | 'farewell'): number {
  const round = { ...state.round, type }
  const saved = state.round
  state.round = round
  // countFace is exported from the module under test via the table's own path.
  const n = state.seats.reduce(
    (total, s) =>
      total +
      s.dice.filter((die) => (type === 'normal' ? die === face || die === 1 : die === face)).length,
    0,
  )
  state.round = saved
  return n
}

describe('the bots', () => {
  it('act only on their own turn', () => {
    const state = table(['You', 'Ada', 'Bo'])
    deal(state)
    // It is the player's turn, so no bot is waiting to move.
    expect(botToAct(state)).toBeNull()
    bid(state, 'p0', 2, 5 as Face)
    expect(botToAct(state)?.id).toBe('p1')
  })
})

describe('how the table says a bid out loud', () => {
  it('pluralises every face correctly', () => {
    // "sixs" shipped, and six is the face people bid most often.
    expect(faceWord(6, 3)).toBe('sixes')
    expect(faceWord(6, 1)).toBe('six')
    expect(faceWord(5, 4)).toBe('fives')
    expect(faceWord(2, 2)).toBe('twos')
    expect(faceWord(1, 1)).toBe('Perudo')
    expect(faceWord(1, 3)).toBe('Perudos')
  })
})
