import {
  checkBid,
  countsToward,
  diceOnTable,
  farewellApplies,
  isBurst,
  nextActive,
  resolveChallenge,
} from '../../game'
import type { ChallengeKind, Face, PlayerId, RoundState, RoundType } from '../../game'
import type { RevealData } from '../game/reveal'
import type { TableMove } from '../game/view'

/**
 * A whole game of Perudo, in one browser tab.
 *
 * The real game is server-authoritative for a reason that does not apply here:
 * the server exists so no client can see another player's dice or claim a
 * result the rules do not support. A table of bots has nobody to hide from and
 * nobody to cheat, so it needs none of that, and paying for a round trip per
 * move to learn the game would be absurd.
 *
 * What it does not do is re-implement the rules. Every judgement below comes
 * from `src/game` — the same module the Edge Function imports — so the game
 * this teaches cannot drift from the game it is teaching. If Bull ever changes,
 * the tutorial changes with it, because there is only one Bull.
 *
 * This is deliberately shaped like `supabase/functions/game/actions.ts`: the
 * same moves, the same order, the same things checked before each. What the
 * server keeps in Postgres, this keeps in a field.
 */

export interface SeatState {
  readonly id: PlayerId
  readonly name: string
  readonly seatIndex: number
  /** Bots act on their own; exactly one seat is the person playing. */
  readonly isYou: boolean
  diceCount: number
  dice: Face[]
}

export interface TableState {
  readonly seats: readonly SeatState[]
  round: RoundState
  roundNumber: number
  turnId: PlayerId
  /** Players owed a Farewell Round, in the order they will take them (R-003). */
  farewellQueue: PlayerId[]
  /** What has been said this round, oldest first. Same shape the table renders. */
  moves: TableMove[]
  winnerId: PlayerId | null
  over: boolean
}

/** A die roll. Injected so a scripted hand can deal itself a known table. */
export type Roll = (playerId: PlayerId, count: number) => Face[]

export const fairRoll: Roll = (_playerId, count) =>
  Array.from({ length: count }, () => {
    const [byte] = crypto.getRandomValues(new Uint8Array(1))
    // Rejection-free because 252 is divisible by six: the top four values of a
    // byte are simply re-drawn, which is what src/game/random.ts does too.
    return (((byte < 252 ? byte : 0) % 6) + 1) as Face
  })

export function seat(
  id: string,
  name: string,
  seatIndex: number,
  isYou = false,
  diceCount = 5,
): SeatState {
  return { id, name, seatIndex, isYou, diceCount, dice: [] }
}

/** Everyone still holding dice, in seat order. */
export function active(table: TableState): readonly SeatState[] {
  return table.seats.filter((s) => s.diceCount > 0)
}

/** The same players, in the shape the engine's turn rules expect. */
function seated(table: TableState) {
  return active(table).map((s) => ({
    playerId: s.id,
    seat: s.seatIndex,
    diceCount: s.diceCount,
  }))
}

export function seatOf(table: TableState, id: PlayerId): SeatState {
  const found = table.seats.find((s) => s.id === id)
  if (found === undefined) throw new Error(`no seat for ${id}`)
  return found
}

/** Write a move into the round's log. Keyed by round and position, so the
    list can be animated without a move ever changing identity under it. */
function say(table: TableState, actorId: PlayerId, text: string, burst: boolean): void {
  table.moves = [
    ...table.moves,
    { id: `${table.roundNumber}-${table.moves.length}`, actorId, text, burst },
  ]
}

/**
 * Open a round: everyone still in gets as many dice as they hold.
 *
 * A Farewell Round is opened for whoever is owed one, ahead of the player who
 * was proved right (GAME_RULES §11, R-002, R-003).
 */
export function deal(table: TableState, roll: Roll = fairRoll): void {
  const owed = table.farewellQueue.filter((id) => seatOf(table, id).diceCount > 0)
  const type: RoundType = owed.length > 0 ? 'farewell' : 'normal'
  if (owed.length > 0) {
    table.turnId = owed[0]
    table.farewellQueue = owed.slice(1)
  }

  for (const s of table.seats) s.dice = s.diceCount > 0 ? roll(s.id, s.diceCount) : []
  table.round = { type, lockedFace: null, bid: null }
  table.roundNumber += 1
  // A new deal is a new set of facts. Nothing said about the last hand is a
  // claim about this one.
  table.moves = []
}

export interface Refusal {
  readonly ok: false
  readonly why: string
}
export type Done = { readonly ok: true }
export type Outcome<T> = ({ readonly ok: true } & T) | Refusal

/** Place a bid. The engine decides whether it is legal; this only applies it. */
export function bid(
  table: TableState,
  actorId: PlayerId,
  quantity: number,
  face: Face,
): Done | Refusal {
  if (table.over) return { ok: false, why: 'The game is over.' }
  const verdict = checkBid(table.round, { quantity, face })
  if (!verdict.legal) return { ok: false, why: verdict.detail }

  const actor = seatOf(table, actorId)
  if (actor.diceCount === 0) return { ok: false, why: 'You are out of this game.' }

  const burst = isBurst(table.turnId, actorId)
  table.round = {
    ...table.round,
    // A Farewell Round's opening bid fixes the face for the rest of it (§10).
    lockedFace:
      table.round.type === 'farewell' && table.round.bid === null ? face : table.round.lockedFace,
    bid: { quantity, face, bidderId: actorId, bull: null },
  }
  // Play continues clockwise from whoever acted, in turn or not (§9.1).
  table.turnId = nextActive(seated(table), actorId)
  say(table, actorId, `${actor.name} bid ${quantity} ${faceWord(face, quantity)}`, burst)
  return { ok: true }
}

/** Call Bull: re-reads the bid on the table as "exactly" (§8.1). */
export function bull(table: TableState, actorId: PlayerId): Done | Refusal {
  if (table.over) return { ok: false, why: 'The game is over.' }
  if (table.round.bid === null) return { ok: false, why: 'There is no bid to call exact.' }
  // What a second Bull would mean is undecided, and it decides who pays (R-010).
  if (table.round.bid.bull !== null) return { ok: false, why: 'This bid has already been Bulled.' }

  const actor = seatOf(table, actorId)
  const claim = table.round.bid
  // Read before the turn moves: afterwards every move looks like it was in turn.
  const burst = isBurst(table.turnId, actorId)
  table.round = {
    ...table.round,
    bid: { ...claim, bull: { callerId: actorId } },
  }
  table.turnId = nextActive(seated(table), actorId)
  say(table, actorId, `${actor.name} called Bull — exactly ${claim.quantity}`, burst)
  return { ok: true }
}

/** Count the dice on the table that answer to the claim's face. */
export function countFace(table: TableState, face: Face, type: RoundType): number {
  return table.seats.reduce(
    (total, s) => total + s.dice.filter((die) => countsToward(die, face, type)).length,
    0,
  )
}

/**
 * Doubt the claim on the table, and apply everything that follows.
 *
 * The verdict, the die movements, the eliminations and who opens next all come
 * from `resolveChallenge`. This writes the answer down and builds the reveal
 * the table screen already knows how to play.
 */
export function challenge(
  table: TableState,
  actorId: PlayerId,
): Outcome<{ readonly reveal: RevealData }> {
  if (table.over) return { ok: false, why: 'The game is over.' }
  const current = table.round.bid
  if (current === null) return { ok: false, why: 'There is nothing on the table to doubt.' }

  // A Bull takes the claim over, so it is the caller who may not doubt it (§8.3).
  const claimOwnerId = current.bull?.callerId ?? current.bidderId
  if (claimOwnerId === actorId) return { ok: false, why: 'That claim is yours.' }

  const kind: ChallengeKind = isBurst(table.turnId, actorId) ? 'burst_lie' : 'lie'
  const actualCount = countFace(table, current.face, table.round.type)
  // Written before the cups come off, not after. Who doubted is the one thing a
  // player cannot work out from the dice on the table, and it is exactly what
  // they are looking at while the reveal plays.
  say(table, actorId, `${seatOf(table, actorId).name} called Lie`, kind === 'burst_lie')

  const outcome = resolveChallenge({
    round: table.round,
    players: active(table).map((s) => ({ playerId: s.id, diceCount: s.diceCount })),
    actualCount,
    challengerId: actorId,
    kind,
  })

  const hands = table.seats
    .filter((s) => s.diceCount > 0)
    .map((s) => ({ id: s.id, name: s.name, dice: [...s.dice] }))

  for (const [id, delta] of outcome.dieDeltas) {
    seatOf(table, id).diceCount += delta
  }

  const survivors = new Set(active(table).map((s) => s.id))
  // Dropped once only two are left, like a newly owed one (R-012).
  table.farewellQueue = !farewellApplies(survivors.size)
    ? []
    : [...table.farewellQueue, ...outcome.farewellQueue].filter((id) => survivors.has(id))
  table.over = outcome.gameOver
  table.winnerId = outcome.winnerId
  if (!outcome.gameOver) table.turnId = outcome.nextStarterId

  return {
    ok: true,
    reveal: {
      roundType: table.round.type,
      quantity: current.quantity,
      face: current.face,
      bidderName: seatOf(table, current.bidderId).name,
      bullCallerName: current.bull === null ? null : seatOf(table, current.bull.callerId).name,
      challengerName: seatOf(table, actorId).name,
      challengeKind: kind,
      hands,
      actualCount,
      claimHolds: outcome.claimHolds,
      deltas: Object.fromEntries(outcome.dieDeltas),
      eliminated: [...outcome.eliminated],
    },
  }
}

/** How many dice are in play, which every bound in the builder is measured against. */
export function onTable(table: TableState): number {
  return diceOnTable(active(table))
}

export function faceWord(face: Face, quantity: number): string {
  if (face === 1) return quantity === 1 ? 'Perudo' : 'Perudos'
  // "sixes", not "sixs". The plural of six is the one that does not take a
  // bare s, and it is also the face people bid most often.
  const one = ['', 'one', 'two', 'three', 'four', 'five', 'six']
  const many = ['', 'ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
  return (quantity === 1 ? one : many)[face]
}
