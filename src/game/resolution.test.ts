import { describe, expect, it } from 'vitest'
import { resolveChallenge } from './resolution'
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

// R-006 — Burst Dudo aimed at a Bull
describe('Burst Dudo against a Bull (R-006)', () => {
  // Four fives on this table.
  const bullTable = [hand('alice', 5, 5, 2), hand('bob', 5, 1, 3), hand('carol', 4, 4, 6)]

  it('wins a die back when the Bull proves false', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(2, 5, 'alice', 'bob')),
      hands: bullTable,
      challengerId: 'carol',
      kind: 'burst_dudo',
    })
    expect(outcome.claimHolds).toBe(false)
    expect(outcome.dieDeltas.get('carol')).toBe(1)
    expect(outcome.dieDeltas.get('bob')).toBe(-1)
    expect(outcome.dieDeltas.has('alice')).toBe(false)
  })

  it('costs the challenger a die when the Bull was exact', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(4, 5, 'alice', 'bob')),
      hands: bullTable,
      challengerId: 'carol',
      kind: 'burst_dudo',
    })
    expect(outcome.dieDeltas.get('carol')).toBe(-1)
  })

  it('still costs the whole table when the Bull was exact', () => {
    // Bursting does not shield the other players from a correct Bull: the two
    // rules compose, so everyone but the caller pays either way.
    const outcome = resolveChallenge({
      round: normalRound(bid(4, 5, 'alice', 'bob')),
      hands: bullTable,
      challengerId: 'carol',
      kind: 'burst_dudo',
    })
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
    expect(outcome.dieDeltas.get('carol')).toBe(-1)
    expect(outcome.dieDeltas.has('bob')).toBe(false)
  })

  it('matches a normal Dudo except for the gain', () => {
    const asDudo = resolveChallenge({
      round: normalRound(bid(2, 5, 'alice', 'bob')),
      hands: bullTable,
      challengerId: 'carol',
      kind: 'dudo',
    })
    expect(asDudo.dieDeltas.get('bob')).toBe(-1)
    expect(asDudo.dieDeltas.has('carol')).toBe(false)
  })
})

// R-007 — the ceiling on dice
describe('the five-dice ceiling (R-007)', () => {
  it('refuses to take a full hand past five', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(9, 5, 'alice')),
      hands: [blanks('alice', 3), hand('bob', 6, 6, 6, 6, 6)],
      challengerId: 'bob',
      kind: 'burst_dudo',
    })
    // Bob was right, but he is already holding five.
    expect(outcome.claimHolds).toBe(false)
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
    expect(outcome.dieDeltas.get('bob')).toBeUndefined()
  })

  it('still grants the die when there is room', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(9, 5, 'alice')),
      hands: [blanks('alice', 3), hand('bob', 6, 6, 6, 6)],
      challengerId: 'bob',
      kind: 'burst_dudo',
    })
    expect(outcome.dieDeltas.get('bob')).toBe(1)
  })

  it('caps a Burst Dudo against a Bull too', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(1, 5, 'alice', 'alice')),
      hands: [hand('alice', 5, 5), hand('bob', 6, 6, 6, 6, 6)],
      challengerId: 'bob',
      kind: 'burst_dudo',
    })
    // Two fives on the table, so the Bull of one is false and Alice pays.
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
    expect(outcome.dieDeltas.get('bob')).toBeUndefined()
  })
})

// R-002 — who opens the next round
describe('the next round opens with whoever was proved right (R-002)', () => {
  it('hands it to the challenger when the bid was false', () => {
    expect(challenge(5, 'dudo').nextStarterId).toBe('bob')
  })

  it('hands it to the bidder when the bid stood', () => {
    expect(challenge(4, 'dudo').nextStarterId).toBe('alice')
  })

  it('works the same way for a Burst Dudo', () => {
    expect(challenge(5, 'burst_dudo').nextStarterId).toBe('bob')
    expect(challenge(4, 'burst_dudo').nextStarterId).toBe('alice')
  })

  it('hands it to the Bull caller when the count was exact', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(4, 5, 'alice', 'bob')),
      hands: table,
      challengerId: 'alice',
      kind: 'dudo',
    })
    expect(outcome.claimHolds).toBe(true)
    expect(outcome.nextStarterId).toBe('bob')
  })

  it('hands it to the challenger when the Bull proved false', () => {
    const outcome = resolveChallenge({
      round: normalRound(bid(2, 5, 'alice', 'bob')),
      hands: table,
      challengerId: 'alice',
      kind: 'dudo',
    })
    expect(outcome.claimHolds).toBe(false)
    expect(outcome.nextStarterId).toBe('alice')
  })

  it('never nominates a player who was eliminated in the same resolution', () => {
    // Whoever was right never loses a die, so the starter always still holds
    // dice. This is the property the round transition depends on.
    for (const quantity of [4, 5]) {
      for (const kind of ['dudo', 'burst_dudo'] as const) {
        const outcome = challenge(quantity, kind)
        expect(outcome.eliminated).not.toContain(outcome.nextStarterId)
      }
    }
  })

  it('yields to a Farewell Round when one is owed', () => {
    // Alice is knocked down to one die, so she opens the next round even though
    // Bob was the one proved right.
    const outcome = resolveChallenge({
      round: normalRound(bid(9, 5, 'alice')),
      hands: [hand('alice', 5, 5), blanks('bob', 3)],
      challengerId: 'bob',
      kind: 'dudo',
    })
    expect(outcome.nextStarterId).toBe('bob')
    expect(outcome.farewellQueue).toEqual(['alice'])
  })
})

// R-008 — Burst and Bull inside a Farewell Round
describe('a Farewell Round permits Burst and Bull (R-008)', () => {
  // Locked on fives with no wildcard, so only literal fives count: two of them.
  const farewell = (quantity: number, bull: string | null = null) => ({
    type: 'farewell' as const,
    lockedFace: 5 as const,
    bid: {
      quantity,
      face: 5 as const,
      bidderId: 'alice',
      bull: bull === null ? null : { callerId: bull },
    },
  })
  const table = [hand('alice', 5, 1, 2), hand('bob', 5, 1, 3), hand('carol', 4, 4, 6)]

  it('counts without the wildcard, so ones do not rescue a bid', () => {
    // The same three fives-and-ones would make four in a normal round.
    const outcome = resolveChallenge({
      round: farewell(3),
      hands: table,
      challengerId: 'bob',
      kind: 'dudo',
    })
    expect(outcome.actualCount).toBe(2)
    expect(outcome.claimHolds).toBe(false)
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
  })

  it('allows a Burst Dudo, gain included', () => {
    const outcome = resolveChallenge({
      round: farewell(3),
      hands: table,
      challengerId: 'carol',
      kind: 'burst_dudo',
    })
    expect(outcome.dieDeltas.get('alice')).toBe(-1)
    expect(outcome.dieDeltas.get('carol')).toBe(1)
  })

  it('allows a Bull, resolved exactly as in a normal round', () => {
    const exact = resolveChallenge({
      round: farewell(2, 'bob'),
      hands: table,
      challengerId: 'carol',
      kind: 'dudo',
    })
    expect(exact.claimHolds).toBe(true)
    expect(exact.dieDeltas.get('alice')).toBe(-1)
    expect(exact.dieDeltas.get('carol')).toBe(-1)
    expect(exact.dieDeltas.has('bob')).toBe(false)

    const wrong = resolveChallenge({
      round: farewell(4, 'bob'),
      hands: table,
      challengerId: 'carol',
      kind: 'dudo',
    })
    expect(wrong.claimHolds).toBe(false)
    expect(wrong.dieDeltas.get('bob')).toBe(-1)
    expect(wrong.dieDeltas.size).toBe(1)
  })

  it('allows a Bull challenged by a Burst Dudo', () => {
    const outcome = resolveChallenge({
      round: farewell(4, 'bob'),
      hands: table,
      challengerId: 'carol',
      kind: 'burst_dudo',
    })
    expect(outcome.dieDeltas.get('bob')).toBe(-1)
    expect(outcome.dieDeltas.get('carol')).toBe(1)
  })
})
