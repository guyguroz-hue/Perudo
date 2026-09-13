import { describe, expect, it } from 'vitest'
import { callBull, challenge, openRound, placeBid } from './actions'
import type { BidWrite, BullWrite, GameRow, GameStore, PlayerRow, RoundRow } from './store'
import type { PlayerId, RoundType } from '../../../src/game'

/**
 * The action layer, against a table held in memory.
 *
 * This is where the rules meet state, and where the mistakes that matter live:
 * a bid judged against the wrong round, a turn advanced past the wrong player,
 * a Farewell Round owed to somebody and quietly forgotten. None of that needs a
 * database to get wrong, so none of it needs one to catch.
 */

interface Scene {
  game?: Partial<GameRow>
  players?: PlayerRow[]
  round?: Partial<RoundRow>
  /** A game that has started but has not been dealt a round yet. */
  noRound?: boolean
  count?: number
}

class Fake implements GameStore {
  readonly bids: BidWrite[] = []
  readonly bulls: BullWrite[] = []
  readonly challenges: Record<string, unknown>[] = []
  readonly opened: { type: RoundType; starter: PlayerId }[] = []

  #game: GameRow
  #players: PlayerRow[]
  #round: RoundRow | null
  #count: number

  constructor(scene: Scene = {}) {
    this.#game = {
      id: 'g1',
      status: 'active',
      round_start_rule: 'winner_starts',
      room_id: 'r1',
      ...scene.game,
    }
    this.#players = scene.players ?? [
      seat('alice', 0, 5),
      seat('bob', 1, 5),
      seat('carl', 2, 5),
    ]
    this.#round = scene.noRound === true ? null : {
      id: 'rd1',
      round_number: 1,
      type: 'normal',
      locked_face: null,
      status: 'bidding',
      bid_quantity: 4,
      bid_face: 5,
      bid_player_id: 'alice',
      bull_player_id: null,
      turn_player_id: 'bob',
      farewell_queue: [],
      version: 7,
      ...scene.round,
    }
    this.#count = scene.count ?? 3
  }

  game() {
    return Promise.resolve(this.#game)
  }
  players() {
    return Promise.resolve(this.#players)
  }
  liveRound() {
    return Promise.resolve(this.#round)
  }
  countFace() {
    return Promise.resolve(this.#count)
  }
  openRound(_gameId: string, type: RoundType, starter: PlayerId) {
    this.opened.push({ type, starter })
    return Promise.resolve('rd2')
  }
  applyBid(args: BidWrite) {
    this.bids.push(args)
    return Promise.resolve()
  }
  applyBull(args: BullWrite) {
    this.bulls.push(args)
    return Promise.resolve()
  }
  applyChallenge(args: Record<string, unknown>) {
    this.challenges.push(args)
    return Promise.resolve({ reveals: [], standings: [], new_round_id: 'rd2' })
  }
}

function seat(id: string, n: number, dice: number): PlayerRow {
  return { user_id: id, seat: n, dice_count: dice, display_name: id }
}

describe('opening the first round', () => {
  // R-011: drawn at random. Every fixed answer — the host, the lowest seat —
  // hands somebody an advantage decided by seating or by who made the room.
  it('draws a starter from the players, not from the seating', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      const store = new Fake({ noRound: true })
      await openRound(store, { id: 'bob' }, 'g1')
      seen.add(store.opened[0].starter)
    }
    expect(seen).toEqual(new Set(['alice', 'bob', 'carl']))
  })

  it('opens a normal round', async () => {
    const store = new Fake({ noRound: true })
    await openRound(store, { id: 'bob' }, 'g1')
    expect(store.opened[0].type).toBe('normal')
  })

  // Several clients reach this the instant a game starts. The unique index on
  // live rounds settles a real race; this settles the common one without
  // asking the database.
  it('returns the round already under way instead of dealing a second', async () => {
    const store = new Fake()
    expect(await openRound(store, { id: 'bob' }, 'g1')).toEqual({ roundId: 'rd1' })
    expect(store.opened).toHaveLength(0)
  })

  it('turns away somebody who is not in the game', async () => {
    const store = new Fake({ noRound: true })
    await expect(openRound(store, { id: 'zoe' }, 'g1')).rejects.toThrow(/not in this game/)
  })
})

describe('a bid is judged by the same rules the client greys out', () => {
  it('records a legal raise', async () => {
    const store = new Fake()
    await placeBid(store, { id: 'bob' }, 'g1', 4, 6)
    expect(store.bids[0]).toMatchObject({ quantity: 4, face: 6, version: 7 })
  })

  it('refuses one the engine rejects, and says why', async () => {
    const store = new Fake()
    await expect(placeBid(store, { id: 'bob' }, 'g1', 3, 6)).rejects.toThrow(
      /quantity may never fall/,
    )
    expect(store.bids).toHaveLength(0)
  })

  it('writes against the version it read, so a race is caught', async () => {
    const store = new Fake({ round: { version: 12 } })
    await placeBid(store, { id: 'bob' }, 'g1', 4, 6)
    expect(store.bids[0].version).toBe(12)
  })
})

describe('acting out of turn', () => {
  // The client never says whether it is bursting: it is derived from whose turn
  // it actually is, so a client cannot claim a Burst it did not make — which
  // matters, because only a Burst Lie can win a die back.
  it('is a Burst, and the client is not asked', async () => {
    const store = new Fake({ round: { turn_player_id: 'bob' } })
    await placeBid(store, { id: 'carl' }, 'g1', 4, 6)
    expect(store.bids[0].burst).toBe(true)
  })

  it('is not a Burst when the turn is yours', async () => {
    const store = new Fake({ round: { turn_player_id: 'bob' } })
    await placeBid(store, { id: 'bob' }, 'g1', 4, 6)
    expect(store.bids[0].burst).toBe(false)
  })

  // GAME_RULES §9.1: play resumes with the player after the last Burst player.
  it('moves the turn on from whoever acted, not from whoever held it', async () => {
    const store = new Fake({ round: { turn_player_id: 'bob' } })
    await placeBid(store, { id: 'carl' }, 'g1', 4, 6)
    expect(store.bids[0].nextTurn).toBe('alice')
  })
})

describe('a Farewell Round locks its face', () => {
  it('locks on the opening bid and not before', async () => {
    const store = new Fake({
      round: { type: 'farewell', bid_quantity: null, bid_face: null, bid_player_id: null },
    })
    await placeBid(store, { id: 'bob' }, 'g1', 2, 1)
    expect(store.bids[0].lockFace).toBe(true)
  })

  it('does not lock anything in a normal round', async () => {
    const store = new Fake()
    await placeBid(store, { id: 'bob' }, 'g1', 4, 6)
    expect(store.bids[0].lockFace).toBe(false)
  })
})

describe('Bull', () => {
  it('can be declared out of turn, like any other bet', async () => {
    const store = new Fake({ round: { turn_player_id: 'bob' } })
    await callBull(store, { id: 'carl' }, 'g1')
    expect(store.bulls[0]).toMatchObject({ player: 'carl', burst: true, nextTurn: 'alice' })
  })

  it('needs a bid to re-read', async () => {
    const store = new Fake({
      round: { bid_quantity: null, bid_face: null, bid_player_id: null },
    })
    await expect(callBull(store, { id: 'bob' }, 'g1')).rejects.toThrow(/no bid/i)
  })

  // What a second Bull would mean is undecided, and it decides who pays (R-010).
  // Refused rather than guessed.
  it('is refused on a bid already Bulled', async () => {
    const store = new Fake({ round: { bull_player_id: 'carl' } })
    await expect(callBull(store, { id: 'bob' }, 'g1')).rejects.toThrow(/already been Bulled/)
    expect(store.bulls).toHaveLength(0)
  })
})

describe('challenging', () => {
  it('is a plain Lie in turn and a Burst Lie out of it', async () => {
    const inTurn = new Fake({ round: { turn_player_id: 'bob' } })
    await challenge(inTurn, { id: 'bob' }, 'g1')
    expect(inTurn.challenges[0].p_kind).toBe('lie')

    const outOfTurn = new Fake({ round: { turn_player_id: 'bob' } })
    await challenge(outOfTurn, { id: 'carl' }, 'g1')
    expect(outOfTurn.challenges[0].p_kind).toBe('burst_lie')
  })

  it('refuses to let you challenge your own bid', async () => {
    const store = new Fake({ round: { bid_player_id: 'bob' } })
    await expect(challenge(store, { id: 'bob' }, 'g1')).rejects.toThrow(/claim is yours/)
  })

  // Once Bulled, the claim on trial belongs to the Bull caller. The bidder may
  // then challenge it — it is no longer their claim (GAME_RULES §8.3).
  it('lets the bidder challenge a Bull on their own bid', async () => {
    const store = new Fake({ round: { bid_player_id: 'bob', bull_player_id: 'carl' } })
    await challenge(store, { id: 'bob' }, 'g1')
    expect(store.challenges).toHaveLength(1)
  })

  it('refuses the Bull caller challenging their own Bull', async () => {
    const store = new Fake({ round: { bull_player_id: 'carl' } })
    await expect(challenge(store, { id: 'carl' }, 'g1')).rejects.toThrow(/claim is yours/)
  })

  it('counts the table rather than being told the count', async () => {
    // Four fives claimed, three actually there: the bid falls.
    const store = new Fake({ count: 3 })
    await challenge(store, { id: 'bob' }, 'g1')
    expect(store.challenges[0].p_actual_count).toBe(3)
    expect(store.challenges[0].p_claim_holds).toBe(false)
    expect(store.challenges[0].p_deltas).toEqual({ alice: -1 })
  })
})

describe('who opens the next round', () => {
  it('is whoever was proved right', async () => {
    const store = new Fake({ count: 9 })
    await challenge(store, { id: 'bob' }, 'g1')
    // The bid stood, so Alice was right and Bob pays.
    expect(store.challenges[0].p_claim_holds).toBe(true)
    expect(store.challenges[0].p_next_starter).toBe('alice')
    expect(store.challenges[0].p_next_type).toBe('normal')
  })

  // GAME_RULES §11: a Farewell Round takes precedence over the winner's turn.
  it('is the player knocked down to one die, ahead of the winner', async () => {
    const store = new Fake({
      players: [seat('alice', 0, 2), seat('bob', 1, 5), seat('carl', 2, 5)],
      count: 3,
    })
    await challenge(store, { id: 'bob' }, 'g1')
    expect(store.challenges[0].p_next_starter).toBe('alice')
    expect(store.challenges[0].p_next_type).toBe('farewell')
  })

  // R-003: a correct Bull can owe several at once, and each is owed their own.
  it('carries a queue of owed Farewell Rounds across rounds', async () => {
    const store = new Fake({
      players: [seat('alice', 0, 2), seat('bob', 1, 2), seat('carl', 2, 5)],
      round: { bull_player_id: 'carl', bid_quantity: 3, bid_face: 5 },
      count: 3,
    })
    await challenge(store, { id: 'bob' }, 'g1')
    // The Bull was exact, so everyone but Carl loses one — Alice and Bob both
    // land on a single die.
    expect(store.challenges[0].p_next_starter).toBe('alice')
    expect(store.challenges[0].p_next_queue).toEqual(['bob'])
  })

  it('does not owe a Farewell Round to a player it eliminated', async () => {
    const store = new Fake({
      players: [seat('alice', 0, 1), seat('bob', 1, 5), seat('carl', 2, 5)],
      count: 3,
    })
    await challenge(store, { id: 'bob' }, 'g1')
    expect(store.challenges[0].p_next_queue).toEqual([])
    expect(store.challenges[0].p_eliminated).toEqual(['alice'])
  })
})

describe('rules that are not decided are not guessed', () => {
  it('refuses a game created under an unimplemented round-start rule', async () => {
    const store = new Fake({ game: { round_start_rule: 'loser_starts' } })
    await expect(placeBid(store, { id: 'bob' }, 'g1', 4, 6)).rejects.toThrow(
      /Unresolved house rule R-002/,
    )
  })
})

describe('who may act at all', () => {
  it('turns away somebody who is not in the game', async () => {
    const store = new Fake()
    await expect(placeBid(store, { id: 'zoe' }, 'g1', 4, 6)).rejects.toThrow(/not in this game/)
  })

  it('turns away a player who is out', async () => {
    const store = new Fake({
      players: [seat('alice', 0, 5), seat('bob', 1, 0), seat('carl', 2, 5)],
    })
    await expect(placeBid(store, { id: 'bob' }, 'g1', 4, 6)).rejects.toThrow(/out of this game/)
  })

  it('turns away everybody once the game is over', async () => {
    const store = new Fake({ game: { status: 'completed' } })
    await expect(placeBid(store, { id: 'bob' }, 'g1', 4, 6)).rejects.toThrow(/not running/)
  })
})

/**
 * A Bull is a bid, not a challenge.
 *
 * GAME_RULES §8.1 is explicit: "Bull is a declaration in the bidding chain —
 * *not* an immediate challenge." It re-reads the claim on the table from "at
 * least seven fives" to "exactly seven fives", hands the turn on, and the round
 * carries on. Nobody's cup comes off, nobody loses a die, nothing is revealed.
 *
 * The two moves sit side by side on the same bar and both are one press, so
 * the way this breaks is that Bull quietly becomes a second Lie — which would
 * end a round every time somebody used the strongest bid in the game.
 */
describe('calling Bull', () => {
  it('resolves nothing, reveals nothing, and takes nobody’s die', async () => {
    const store = new Fake()
    await callBull(store, { id: 'bob' }, 'g1')

    // The only write is the Bull itself. A challenge is what reveals hands and
    // moves dice, and none was applied.
    expect(store.challenges).toHaveLength(0)
    expect(store.bulls).toHaveLength(1)
    // And no round was opened, which is what ending one would have done.
    expect(store.opened).toHaveLength(0)
  })

  it('hands the turn on so the round carries on', async () => {
    const store = new Fake()
    await callBull(store, { id: 'bob' }, 'g1')
    // Play continues clockwise from whoever acted, exactly as a bid does.
    expect(store.bulls[0]).toMatchObject({ player: 'bob', nextTurn: 'carl' })
  })

  it('leaves a bid that can still be raised over', async () => {
    // §8.2: any later valid bid completely supersedes the Bull. The table is
    // not frozen by one, and the player after it is not forced to challenge.
    const store = new Fake({ round: { bull_player_id: 'bob', turn_player_id: 'carl' } })
    await placeBid(store, { id: 'carl' }, 'g1', 5, 5)

    expect(store.bids).toHaveLength(1)
    expect(store.bids[0]).toMatchObject({ quantity: 5, face: 5, player: 'carl' })
    expect(store.challenges).toHaveLength(0)
  })

  it('can be doubted like any other bid', async () => {
    // A Bull takes the claim over (§8.3), so it is the Bull caller who may not
    // challenge it — and the original bidder who now may.
    const store = new Fake({ round: { bull_player_id: 'bob', turn_player_id: 'carl' } })
    const result = await challenge(store, { id: 'alice' }, 'g1')

    expect(result.bullCallerName).toBe('bob')
    expect(store.challenges).toHaveLength(1)
  })

  it('refuses the Bull caller doubting their own Bull', async () => {
    const store = new Fake({ round: { bull_player_id: 'bob', turn_player_id: 'carl' } })
    await expect(challenge(store, { id: 'bob' }, 'g1')).rejects.toThrow(/yours/i)
  })
})
