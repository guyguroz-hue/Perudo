import type { ChallengeKind, Face, PlayerId, RoundType } from '../../game'

/**
 * Everything the reveal needs, in one object.
 *
 * It arrives in one piece because the challenge request *is* the resolution:
 * the client cannot hold anybody's dice in advance — that is the whole reason
 * `player_dice` exists with the policy it has — so a round trip is
 * unavoidable. The response carries the hands, the count, the verdict and the
 * die changes together, and the dramatic pause and the network wait are the
 * same moment (docs/GAME_UI.md §5.1).
 */
export interface RevealHand {
  readonly id: PlayerId
  readonly name: string
  readonly dice: readonly Face[]
}

export interface RevealData {
  readonly roundType: RoundType
  readonly quantity: number
  readonly face: Face
  readonly bidderName: string
  /** Set when the bid had been Bulled, which re-reads it as "exactly" (§8.1). */
  readonly bullCallerName: string | null
  readonly challengerName: string
  readonly challengeKind: ChallengeKind
  readonly hands: readonly RevealHand[]
  readonly actualCount: number
  readonly claimHolds: boolean
  /** Die changes by player. Negative loses, positive gains. */
  readonly deltas: Readonly<Record<PlayerId, number>>
  readonly eliminated: readonly PlayerId[]
}

/**
 * The claim on trial, as the table already knows it.
 *
 * Separate from `RevealData` because it is available at once — the bid and any
 * Bull on it are public — where everything in `RevealData` has to be asked for.
 * It is what the reveal can show during the pause.
 */
export interface RevealClaim {
  readonly quantity: number
  readonly face: Face
  readonly reading: 'at least' | 'exactly'
}

/** Whose claim was actually on trial. A Bull takes the bid over (§8.3). */
export function claimOwner(data: RevealData): string {
  return data.bullCallerName ?? data.bidderName
}

export function reading(data: RevealData): 'at least' | 'exactly' {
  return data.bullCallerName === null ? 'at least' : 'exactly'
}

/**
 * Standings for a reveal that has already arrived.
 *
 * The live game reads these from the table, where they are public and known
 * before the challenge is answered. This is for the case where the reveal is
 * the only thing to hand.
 */
export function standingsFor(
  data: RevealData,
): { id: PlayerId; name: string; diceCount: number }[] {
  return data.hands.map((hand) => ({
    id: hand.id,
    name: hand.name,
    diceCount: hand.dice.length,
  }))
}

export function claimFor(data: RevealData): RevealClaim {
  return { quantity: data.quantity, face: data.face, reading: reading(data) }
}
