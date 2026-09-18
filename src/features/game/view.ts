import { opensFarewell } from '../../game'
import type { Face, PlayerId, RoundState } from '../../game'

/**
 * What the table screen renders from.
 *
 * Deliberately not a database row. The screen is built and tested against this
 * shape, so the layout work does not wait on the action layer, and the wiring
 * that eventually fills it has one obvious contract to meet.
 *
 * Note what is not here: anybody else's dice. They are absent from the type,
 * not merely unrendered, so a component cannot leak what it was never handed.
 */
export interface TablePlayer {
  readonly id: PlayerId
  readonly name: string
  /**
   * The seat they took in the room, 0-5.
   *
   * Their colour hangs off this rather than off their position in this list,
   * so it never changes when somebody is eliminated and the list shortens.
   */
  readonly seatIndex: number
  readonly diceCount: number
  readonly isYou: boolean
  readonly isEliminated: boolean
  /** Holds the normal turn. A Burst does not move this (GAME_RULES §9.1). */
  readonly hasTurn: boolean
}

/** One move, as the table would recount it. */
export interface TableMove {
  /** Stable within a round, so a list of these can be keyed and animated. */
  readonly id: string
  /** Whose move it was. Null only for something the table did to itself. */
  readonly actorId: PlayerId | null
  readonly text: string
  /** Made out of turn (GAME_RULES §9.1), which is worth marking. */
  readonly burst: boolean
}

export interface TableView {
  readonly round: RoundState
  readonly roundNumber: number
  readonly players: readonly TablePlayer[]
  /**
   * Your own dice, or null when you hold none — eliminated, or between rounds.
   * The only hand any client is ever given.
   */
  readonly yourHand: readonly Face[] | null
  /**
   * What has been said this round, oldest first.
   *
   * A list rather than a line, because Burst means turn order tells you
   * nothing: anybody may act at any moment, so "whose bid is this" cannot be
   * worked out from where the turn sits, and by the time the cups come off the
   * one line saying who doubted has already been replaced. Who said what is not
   * decoration in this game — it is most of what a player is reasoning about.
   */
  readonly moves: readonly TableMove[]
}

/** The player whose normal turn it is, if anyone's. */
export function turnHolder(view: TableView): TablePlayer | null {
  return view.players.find((player) => player.hasTurn && !player.isEliminated) ?? null
}

/** Whether acting now would be a Burst: legal, but out of turn (§9.1, §8.5). */
export function wouldBurst(view: TableView): boolean {
  const holder = turnHolder(view)
  return holder !== null && !holder.isYou
}

/**
 * Whether cutting in is barred right now, and why.
 *
 * Exactly one moment in the game: a Farewell Round that has not been opened
 * yet (GAME_RULES §10, R-013). The opening bid there chooses the face for
 * everybody, so it belongs to the player the round is owed to and nobody may
 * take it from them.
 *
 * Asked here so the builder offers the same answer the server will give. A
 * button that produces a refusal is a worse way to learn a rule than a button
 * that is plainly not available and says why.
 */
export function burstBarred(view: TableView): boolean {
  return wouldBurst(view) && opensFarewell(view.round)
}

export function you(view: TableView): TablePlayer | null {
  return view.players.find((player) => player.isYou) ?? null
}
