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
  readonly diceCount: number
  readonly isYou: boolean
  readonly isEliminated: boolean
  /** Holds the normal turn. A Burst does not move this (GAME_RULES §9.1). */
  readonly hasTurn: boolean
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
  /** One line of what just happened. Null at the start of a round. */
  readonly lastEvent: string | null
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

export function you(view: TableView): TablePlayer | null {
  return view.players.find((player) => player.isYou) ?? null
}
