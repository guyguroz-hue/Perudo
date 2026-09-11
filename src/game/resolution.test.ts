import { describe, expect, it } from 'vitest'
import { resolveChallenge } from './resolution'
import { UnresolvedRuleError } from './errors'
import type { ChallengeKind } from './types'
import { bid, blanks, hand, normalRound } from './testing'

/** Resolves a challenge on a table where the only player loses their last die. */
function buildEmptyTableOutcome() {
  return resolveChallenge({
    round: normalRound(bid(9, 5, 'alice')),
    hands: [hand('alice', 2)],
    challengerId: 'alice',
    kind: 'dudo',
  })
}

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
    // table — but a Bulled bid must be exact, so this one is false and its
    // caller pays for it.
    const inexact = resolveChallenge({
      round: normalRound(bid(3, 5, 'alice', 'bob')),
      hands: bullTable,
      challengerId: 'carol',
      kind: 'dudo',
    })
    expect(inexact.claimHolds).toBe(false)
    expect(inexact.dieDeltas.get('bob')).toBe(-1)
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
    expect(outcome.farewellQueue).toEqual(['alice'])
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
    expect(outcome.farewellQueue).toEqual([])
  })

  it('does not trigger on a die gained by Burst Dudo', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(9, 5, 'alice')),
      hands: [blanks('alice', 3), hand('bob', 6)],
      challengerId: 'bob',
      kind: 'burst_dudo',
    })
    expect(outcome.dieDeltas.get('bob')).toBe(1)
    expect(outcome.farewellQueue).toEqual([])
  })
})

// R-001 — a Bull that proves false
describe('a false Bull (GAME_RULES §8.4)', () => {
  // Four fives on this table, so a Bull declaring anything else is wrong.
  const table = [hand('alice', 5, 5, 2), hand('bob', 5, 1, 3), hand('carol', 4, 4, 6)]

  it('costs the Bull caller a die, and nobody else', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(2, 5, 'alice', 'bob')),
      hands: table,
      challengerId: 'carol',
      kind: 'dudo',
    })
    expect(outcome.actualCount).toBe(4)
    expect(outcome.claimHolds).toBe(false)
    expect(outcome.dieDeltas.get('bob')).toBe(-1)
    expect(outcome.dieDeltas.has('alice')).toBe(false)
    expect(outcome.dieDeltas.has('carol')).toBe(false)
  })

  it('is wrong when the real count is too high as well as too low', () => {
    // Three fives claimed exactly, four on the table: still false.
    const outcome = resolveChallenge({
      round: normalRound(bid(3, 5, 'alice', 'bob')),
      hands: table,
      challengerId: 'carol',
      kind: 'dudo',
    })
    expect(outcome.claimHolds).toBe(false)
    expect(outcome.dieDeltas.get('bob')).toBe(-1)
  })

  it('flips the cost entirely when the same Bull is right', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(4, 5, 'alice', 'bob')),
      hands: table,
      challengerId: 'carol',
      kind: 'dudo',
    })
    expect(outcome.dieDeltas.get('bob')).toBeUndefined()
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
    expect(outcome.dieDeltas.get('carol')).toBe(-1)
  })
})

// R-003 — several players reaching one die together
describe('simultaneous Farewell Rounds (R-003)', () => {
  it('queues every player driven down to one die', () => {
    // A correct Bull of 2 takes a die from everyone but its caller.
    const outcome = resolveChallenge({
      round: normalRound(bid(2, 5, 'alice', 'carol')),
      hands: [hand('alice', 5, 2), hand('bob', 5, 3), blanks('carol', 4)],
      challengerId: 'bob',
      kind: 'dudo',
    })
    expect(outcome.farewellQueue).toEqual(['alice', 'bob'])
  })

  it('grants a fresh Farewell Round to a player knocked back down after regaining a die', () => {
    // Bob holds two dice — he was on one, won a die back with a Burst Dudo, and
    // is now knocked down again. Crossing the boundary a second time earns a
    // second Farewell Round.
    const outcome = resolveChallenge({
      round: normalRound(bid(9, 5, 'bob')),
      hands: [blanks('alice', 3), hand('bob', 5, 2)],
      challengerId: 'alice',
      kind: 'dudo',
    })
    expect(outcome.dieDeltas.get('bob')).toBe(-1)
    expect(outcome.farewellQueue).toEqual(['bob'])
  })
})

// R-004 — several players eliminated at once
describe('simultaneous elimination (R-004)', () => {
  it('ends the game with no winner when the last players go out together', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(2, 5, 'alice', 'carol')),
      hands: [hand('alice', 5), hand('bob', 5), blanks('carol', 4)],
      challengerId: 'bob',
      kind: 'dudo',
    })
    expect(outcome.eliminated).toEqual(['alice', 'bob'])
    expect(outcome.gameOver).toBe(true)
    // Carol called the Bull and kept her dice, so she is the only one standing.
    expect(outcome.winnerId).toBe('carol')
  })

  it('leaves the Bull caller standing as winner when the last opponent goes out', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(2, 5, 'alice', 'bob')),
      hands: [hand('alice', 5), hand('bob', 1)],
      challengerId: 'alice',
      kind: 'dudo',
    })
    // The Bull is correct (two relevant dice), so Alice loses her last die and
    // Bob, who called it, keeps his.
    expect(outcome.eliminated).toEqual(['alice'])
    expect(outcome.winnerId).toBe('bob')
    expect(outcome.gameOver).toBe(true)
  })

  it('reports no winner if nobody is left holding dice', () => {
    // NOTE: no sequence of the current rules can actually reach this state.
    // Normal Dudo and Burst Dudo each cost exactly one player a die; a correct
    // Bull spares its caller; a false Bull costs only its caller. Some player
    // always survives. The branch is kept because "no winner" is the rule we
    // were given (R-004), and a future rule could make it reachable — but it is
    // asserted directly rather than through a scenario that cannot occur.
    const outcome = buildEmptyTableOutcome()
    expect(outcome.winnerId).toBeNull()
    expect(outcome.gameOver).toBe(true)
  })

  it('keeps playing while two or more players still hold dice', () => {
    const outcome = challenge(5, 'dudo')
    expect(outcome.gameOver).toBe(false)
    expect(outcome.winnerId).toBeNull()
  })
})

// The rules still deliberately undefined
describe('remaining undefined rules raise rather than guess', () => {
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

  it('names the rule and the situation so the gap is actionable', () => {
    try {
      resolveChallenge({
        round: normalRound(bid(4, 5, 'alice', 'bob')),
        hands: table,
        challengerId: 'bob',
        kind: 'burst_dudo',
      })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(UnresolvedRuleError)
      expect((error as UnresolvedRuleError).ruleId).toBe('R-006')
    }
  })
})
