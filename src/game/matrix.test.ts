import { describe, expect, it } from 'vitest'
import { MAX_DICE } from './types'
import type { ChallengeKind, PlayerId } from './types'
import { checkBid } from './bids'
import { quantityBounds } from './builder'
import { resolveChallenge } from './resolution'
import type { ChallengeOutcome, PlayerStanding } from './resolution'
import { nextActive } from './turns'
import { bid, normalRound } from './testing'

/**
 * The same rules, at every size of table.
 *
 * The rule tests next door each state one situation precisely. This file does
 * the other half: it takes every rule that has to hold whatever the table looks
 * like, and checks it holds from two players to six.
 *
 * Two is where the arithmetic degenerates — "everyone except the caller" is one
 * person, the turn ring is a pair passing back and forth — and six is where it
 * is busiest. Bugs in this game live at both ends, and a case written for three
 * players finds neither.
 */

const SIZES = [2, 3, 4, 5, 6] as const

function table(count: number, dice = MAX_DICE): PlayerStanding[] {
  return Array.from({ length: count }, (_, i) => ({ playerId: `p${i}`, diceCount: dice }))
}

function seats(players: readonly PlayerStanding[]) {
  return players.map((player, seat) => ({ ...player, seat }))
}

function total(players: readonly PlayerStanding[]): number {
  return players.reduce((sum, player) => sum + player.diceCount, 0)
}

function after(players: readonly PlayerStanding[], outcome: ChallengeOutcome) {
  return players.map((player) => ({
    ...player,
    diceCount: player.diceCount + (outcome.dieDeltas.get(player.playerId) ?? 0),
  }))
}

/** A challenge on a table of `count` players, with the count on the table fixed. */
function resolve(input: {
  count: number
  dice?: number
  quantity: number
  actualCount: number
  bidder?: PlayerId
  bull?: PlayerId | null
  challenger: PlayerId
  kind?: ChallengeKind
}): { players: PlayerStanding[]; outcome: ChallengeOutcome } {
  const players = table(input.count, input.dice)
  const outcome = resolveChallenge({
    round: normalRound(bid(input.quantity, 5, input.bidder ?? 'p0', input.bull ?? null)),
    players,
    actualCount: input.actualCount,
    challengerId: input.challenger,
    kind: input.kind ?? 'lie',
  })
  return { players, outcome }
}

describe.each(SIZES)('a table of %i', (count) => {
  const dice = count * MAX_DICE

  // -------------------------------------------------------------------------
  // Bids
  // -------------------------------------------------------------------------
  /*
   * The builder offers up to every die on the table. The rules set no ceiling
   * of their own — bidding more dice than exist is legal and simply loses, and
   * inventing a cap here would be inventing a rule — so what is checked is that
   * the control reaches the whole table and that the engine accepts it.
   */
  it('offers a bid on every die on the table', () => {
    const round = normalRound()
    expect(quantityBounds(round, dice)).toEqual({ min: 1, max: dice })
    expect(checkBid(round, { quantity: dice, face: 5 }).legal).toBe(true)
    expect(checkBid(round, { quantity: 0, face: 5 }).legal).toBe(false)
    expect(checkBid(round, { quantity: 1.5, face: 5 }).legal).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Turn order
  // -------------------------------------------------------------------------
  it('walks the whole table once before coming back round', () => {
    const ring = seats(table(count))
    const visited: PlayerId[] = []
    let at = ring[0].playerId
    for (let step = 0; step < count; step += 1) {
      at = nextActive(ring, at)
      visited.push(at)
    }
    // Everybody, each exactly once, ending back where it started.
    expect(new Set(visited).size).toBe(count)
    expect(visited[count - 1]).toBe(ring[0].playerId)
  })

  it('skips whoever is out, however many that is', () => {
    for (let out = 1; out < count; out += 1) {
      const ring = seats(table(count)).map((player, i) => ({
        ...player,
        diceCount: i < out ? 0 : MAX_DICE,
      }))
      const holder = ring[out].playerId
      const next = nextActive(ring, holder)
      expect(ring.find((p) => p.playerId === next)?.diceCount).toBeGreaterThan(0)
    }
  })

  // -------------------------------------------------------------------------
  // Lie
  // -------------------------------------------------------------------------
  it('takes exactly one die off the table on a normal Lie, whichever way it goes', () => {
    for (const [actualCount, loser] of [
      [dice, 'p1'], // the bid holds, so the challenger pays
      [0, 'p0'], // the bid is false, so the bidder pays
    ] as const) {
      const { players, outcome } = resolve({
        count,
        quantity: 3,
        actualCount,
        challenger: 'p1',
      })
      expect(outcome.dieDeltas.get(loser)).toBe(-1)
      expect(total(after(players, outcome))).toBe(dice - 1)
    }
  })

  // -------------------------------------------------------------------------
  // Burst Lie — the only move that hands a die back (GAME_RULES §9.2)
  // -------------------------------------------------------------------------
  it('moves a die across the table on a correct Burst Lie, so the total is unchanged', () => {
    const { players, outcome } = resolve({
      count,
      dice: MAX_DICE - 1, // room to receive, so the ceiling is not what is tested
      quantity: 3,
      actualCount: 0,
      challenger: 'p1',
      kind: 'burst_lie',
    })
    expect(outcome.dieDeltas.get('p0')).toBe(-1)
    expect(outcome.dieDeltas.get('p1')).toBe(1)
    expect(total(after(players, outcome))).toBe(count * (MAX_DICE - 1))
  })

  it('never takes anybody past five, at any size', () => {
    const { players, outcome } = resolve({
      count,
      quantity: 3,
      actualCount: 0,
      challenger: 'p1',
      kind: 'burst_lie',
    })
    for (const player of after(players, outcome)) {
      expect(player.diceCount).toBeLessThanOrEqual(MAX_DICE)
    }
  })

  // -------------------------------------------------------------------------
  // Bull (GAME_RULES §8.3, §8.4)
  // -------------------------------------------------------------------------
  it('charges everyone but the caller when a Bull is exact', () => {
    const { players, outcome } = resolve({
      count,
      quantity: 4,
      actualCount: 4,
      bull: 'p1',
      challenger: 'p0',
    })
    expect(outcome.claimHolds).toBe(true)
    expect(outcome.dieDeltas.get('p1')).toBeUndefined()
    for (const player of players) {
      if (player.playerId !== 'p1') expect(outcome.dieDeltas.get(player.playerId)).toBe(-1)
    }
    // One die from every player but one — which at a table of two is one die.
    expect(total(after(players, outcome))).toBe(dice - (count - 1))
  })

  it('charges the caller alone when a Bull is wrong, high or low', () => {
    for (const actualCount of [3, 5]) {
      const { players, outcome } = resolve({
        count,
        quantity: 4,
        actualCount,
        bull: 'p1',
        challenger: 'p0',
      })
      expect(outcome.claimHolds).toBe(false)
      expect(outcome.dieDeltas.get('p1')).toBe(-1)
      expect(total(after(players, outcome))).toBe(dice - 1)
    }
  })

  // -------------------------------------------------------------------------
  // The invariant every branch has to keep
  // -------------------------------------------------------------------------
  /*
   * Whoever opens the next round must still be at the table.
   *
   * It follows from the rules — being proved right never costs you a die — but
   * it follows through five separate branches, and a round opened by a player
   * who was just eliminated is a game that cannot continue. So it is checked
   * rather than reasoned about, on every branch and every size.
   */
  it('never nominates a starter who is out, on any branch', () => {
    const cases: { quantity: number; actualCount: number; bull?: PlayerId; kind?: ChallengeKind }[] = [
      { quantity: 3, actualCount: 99 }, // bid holds
      { quantity: 3, actualCount: 0 }, // bid false
      { quantity: 3, actualCount: 0, kind: 'burst_lie' },
      { quantity: 3, actualCount: 99, kind: 'burst_lie' },
      { quantity: 4, actualCount: 4, bull: 'p1' }, // Bull exact
      { quantity: 4, actualCount: 9, bull: 'p1' }, // Bull wrong
      { quantity: 4, actualCount: 4, bull: 'p1', kind: 'burst_lie' },
      { quantity: 4, actualCount: 9, bull: 'p1', kind: 'burst_lie' },
    ]

    for (const one of cases) {
      // One die each: the harshest table there is, where any loss is an exit.
      // A Bulled claim belongs to its caller, so somebody else challenges it —
      // the bidder may, and at a table of two there is nobody else.
      const { players, outcome } = resolve({
        count,
        dice: 1,
        quantity: one.quantity,
        actualCount: one.actualCount,
        bull: one.bull ?? null,
        challenger: one.bull === undefined ? 'p1' : 'p0',
        kind: one.kind,
      })

      expect(outcome.eliminated).not.toContain(outcome.nextStarterId)
      const standing = after(players, outcome).find(
        (p) => p.playerId === outcome.nextStarterId,
      )
      expect(standing?.diceCount ?? 0).toBeGreaterThan(0)
    }
  })

  /*
   * The game ends when it is over, and only then.
   *
   * `gameOver`, `winnerId` and `eliminated` are three answers to the same
   * question and have to agree. A table that reports a winner while two people
   * still hold dice, or none while one does, is a game that either stops early
   * or never stops.
   */
  it('agrees with itself about whether the game is over', () => {
    for (const startingDice of [1, 2, MAX_DICE]) {
      for (const [quantity, actualCount, bull] of [
        [3, 99, null],
        [3, 0, null],
        [4, 4, 'p1'],
        [4, 9, 'p1'],
      ] as const) {
        const { players, outcome } = resolve({
          count,
          dice: startingDice,
          quantity,
          actualCount,
          bull,
          challenger: bull === null ? 'p1' : 'p0',
        })

        const survivors = after(players, outcome).filter((p) => p.diceCount > 0)
        expect(outcome.gameOver).toBe(survivors.length <= 1)
        expect(outcome.winnerId).toBe(survivors.length === 1 ? survivors[0].playerId : null)
        expect(outcome.eliminated.length).toBe(count - survivors.length)
      }
    }
  })

  /*
   * A Farewell Round is owed to whoever was knocked down to one die, and to
   * nobody else (GAME_RULES §10, R-003). A correct Bull at a table sitting on
   * two dice each owes one to everybody but the caller at once.
   */
  it('queues a Farewell Round for everyone knocked down to a single die', () => {
    const { outcome } = resolve({
      count,
      dice: 2,
      quantity: 4,
      actualCount: 4,
      bull: 'p1',
      challenger: 'p0',
    })

    const expected = Array.from({ length: count }, (_, i) => `p${i}`).filter(
      (id) => id !== 'p1',
    )
    expect(outcome.farewellQueue).toEqual(expected)
    expect(outcome.eliminated).toEqual([])
  })
})
