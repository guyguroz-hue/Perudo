import { describe, expect, it } from 'vitest'
import { resolveChallenge } from './resolution'
import { UnresolvedRuleError } from './errors'
import type { ChallengeKind } from './types'
import { bid, blanks, hand, normalRound } from './testing'

// Four relevant fives on this table: three fives plus one wild one. So a bid of
// "4 fives" holds, and "5 fives" does not.
const table = [hand('alice', 5, 5, 2), hand('bob', 5, 1, 3)]

function challenge(quantity: number, kind: ChallengeKind, challengerId = 'bob') {
  return resolveChallenge({
    round: normalRound(bid(quantity, 5, 'alice')),
    hands: table,
    challengerId,
    kind,
  })
}

// PART 63 — normal Dudo
describe('normal Dudo (GAME_RULES §7)', () => {
  it('counts the table correctly, wildcards included', () => {
    expect(challenge(4, 'dudo').actualCount).toBe(4)
  })

  it('costs the challenger a die when the bid holds', () => {
    const outcome = challenge(4, 'dudo')
    expect(outcome.claimHolds).toBe(true)
    expect(outcome.dieDeltas.get('bob')).toBe(-1)
    expect(outcome.dieDeltas.get('alice')).toBeUndefined()
  })

  it('costs the bidder a die when the bid is false', () => {
    const outcome = challenge(5, 'dudo')
    expect(outcome.claimHolds).toBe(false)
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
    expect(outcome.dieDeltas.get('bob')).toBeUndefined()
  })

  it('never grants a die, on either verdict', () => {
    for (const quantity of [4, 5]) {
      for (const delta of challenge(quantity, 'dudo').dieDeltas.values()) {
        expect(delta).toBeLessThan(0)
      }
    }
  })
})

// PART 66 — Burst Dudo
describe('Burst Dudo (GAME_RULES §9.2)', () => {
  it('takes a die from the bidder and grants one to the caller when the bid is false', () => {
    const outcome = challenge(5, 'burst_dudo')
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
    expect(outcome.dieDeltas.get('bob')).toBe(1)
  })

  it('costs the caller a die when the bid holds, with no gain anywhere', () => {
    const outcome = challenge(4, 'burst_dudo')
    expect(outcome.dieDeltas.get('bob')).toBe(-1)
    expect([...outcome.dieDeltas.values()].every((d) => d < 0)).toBe(true)
  })

  it('is the only move in the game that can hand a player a die', () => {
    expect(challenge(5, 'burst_dudo').dieDeltas.get('bob')).toBe(1)
    expect(challenge(5, 'dudo').dieDeltas.get('bob')).toBeUndefined()
  })
})

// PART 64 — Bull
describe('Bull (GAME_RULES §8)', () => {
  // Carol contributes nothing, so this table also holds exactly four fives.
  const bullTable = [hand('alice', 5, 5, 2), hand('bob', 5, 1, 3), hand('carol', 4, 4, 6)]

  it('reads the bid as "exactly", not "at least"', () => {
    const exact = resolveChallenge({
      round: normalRound(bid(4, 5, 'alice', 'bob')),
      hands: bullTable,
      challengerId: 'carol',
      kind: 'dudo',
    })
    expect(exact.actualCount).toBe(4)
    expect(exact.claimHolds).toBe(true)

    // "3 fives" would be a perfectly good "at least" claim with four on the
    // table — but a Bulled bid must be exact, so this one is false.
    expect(() =>
      resolveChallenge({
        round: normalRound(bid(3, 5, 'alice', 'bob')),
        hands: bullTable,
        challengerId: 'carol',
        kind: 'dudo',
      }),
    ).toThrow(UnresolvedRuleError)
  })

  it('costs every active player except the Bull caller a die when correct', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(4, 5, 'alice', 'bob')),
      hands: bullTable,
      challengerId: 'carol',
      kind: 'dudo',
    })
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
    expect(outcome.dieDeltas.get('carol')).toBe(-1)
    expect(outcome.dieDeltas.has('bob')).toBe(false)
  })

  it('is discarded once a later bid supersedes it', () => {
    // Same table, but the Bull has been superseded by a plain bid of 3 fives.
    // Read as "at least", that holds — so the challenger pays.
    const outcome = resolveChallenge({
      round: normalRound(bid(3, 5, 'carol')),
      hands: bullTable,
      challengerId: 'alice',
      kind: 'dudo',
    })
    expect(outcome.claimHolds).toBe(true)
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
  })
})

// PART 68 — elimination and victory
describe('elimination and victory (GAME_RULES §11)', () => {
  it('eliminates a player who loses their last die', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(9, 5, 'alice')),
      hands: [hand('alice', 5), blanks('bob', 3)],
      challengerId: 'bob',
      kind: 'dudo',
    })
    expect(outcome.eliminated).toEqual(['alice'])
  })

  it('declares the last player holding dice the winner', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(9, 5, 'alice')),
      hands: [hand('alice', 5), blanks('bob', 3)],
      challengerId: 'bob',
      kind: 'dudo',
    })
    expect(outcome.winnerId).toBe('bob')
  })

  it('does not declare a winner while two players still hold dice', () => {
    expect(challenge(5, 'dudo').winnerId).toBeNull()
  })
})

// PART 67 — Farewell trigger
describe('Farewell Round trigger (GAME_RULES §10)', () => {
  it('nominates the player driven down to exactly one die', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(9, 5, 'alice')),
      hands: [hand('alice', 5, 5), blanks('bob', 3)],
      challengerId: 'bob',
      kind: 'dudo',
    })
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
    expect(outcome.farewellPlayerId).toBe('alice')
  })

  it('does not trigger for a player who was already on one die', () => {
    // Bob holds a single die and loses nothing; Alice drops from 3 to 2.
    const outcome = resolveChallenge({
      round: normalRound(bid(1, 5, 'alice')),
      hands: [hand('alice', 5, 2, 2), hand('bob', 4)],
      challengerId: 'bob',
      kind: 'dudo',
    })
    expect(outcome.dieDeltas.get('bob')).toBe(-1)
    expect(outcome.farewellPlayerId).toBeNull()
  })

  it('does not trigger on a die gained by Burst Dudo', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(9, 5, 'alice')),
      hands: [blanks('alice', 3), hand('bob', 6)],
      challengerId: 'bob',
      kind: 'burst_dudo',
    })
    expect(outcome.dieDeltas.get('bob')).toBe(1)
    expect(outcome.farewellPlayerId).toBeNull()
  })
})

// PART 27 — the rules that must never be invented
describe('undefined rules raise rather than guess (GAME_RULES §12)', () => {
  it('R-001: refuses to resolve a false Bull', () => {
    expect(() =>
      resolveChallenge({
        round: normalRound(bid(2, 5, 'alice', 'bob')),
        hands: table,
        challengerId: 'bob',
        kind: 'dudo',
      }),
    ).toThrow(/R-001/)
  })

  it('R-006: refuses a Burst Dudo aimed at a Bull', () => {
    expect(() =>
      resolveChallenge({
        round: normalRound(bid(4, 5, 'alice', 'bob')),
        hands: table,
        challengerId: 'bob',
        kind: 'burst_dudo',
      }),
    ).toThrow(/R-006/)
  })

  it('R-003: refuses when two players reach one die at once', () => {
    // A correct Bull takes a die from everyone except its caller, which can
    // drop several players to one die in the same instant.
    expect(() =>
      resolveChallenge({
        round: normalRound(bid(2, 5, 'alice', 'carol')),
        hands: [hand('alice', 5, 2), hand('bob', 5, 3), blanks('carol', 4)],
        challengerId: 'bob',
        kind: 'dudo',
      }),
    ).toThrow(/R-003/)
  })

  it('R-004: refuses when two players are eliminated at once', () => {
    expect(() =>
      resolveChallenge({
        round: normalRound(bid(2, 5, 'alice', 'carol')),
        hands: [hand('alice', 5), hand('bob', 5), blanks('carol', 4)],
        challengerId: 'bob',
        kind: 'dudo',
      }),
    ).toThrow(/R-004/)
  })

  it('names the rule and the situation so the gap is actionable', () => {
    try {
      resolveChallenge({
        round: normalRound(bid(2, 5, 'alice', 'bob')),
        hands: table,
        challengerId: 'bob',
        kind: 'dudo',
      })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(UnresolvedRuleError)
      expect((error as UnresolvedRuleError).ruleId).toBe('R-001')
      expect((error as UnresolvedRuleError).situation).toContain('false Bull')
    }
  })
})
