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

/**
 * What the result cost, in words.
 *
 * The die changes were a row of chips — "Alice −1", "Dana −1" — which is the
 * data and not the sentence. How many dice somebody holds is the whole state
 * of the game for them, and losing one is the only thing that ever happens to
 * it, so it is worth saying out loud rather than leaving as an annotation for
 * a player to decode while a timer runs down.
 *
 * Names are grouped by what happened to them, because at a table of six a
 * correct Bull does the same thing to five people at once, and five separate
 * sentences saying the same thing is a wall rather than a result.
 *
 * Nobody's pronoun is known here, so none is used: it is "Alice is out", never
 * "Alice loses her last die". That is also shorter, which is the usual reward
 * for not guessing.
 */
export interface Consequence {
  readonly kind: 'loss' | 'gain' | 'out'
  readonly text: string
}

export function consequences(data: RevealData): Consequence[] {
  const nameOf = (id: PlayerId) => data.hands.find((hand) => hand.id === id)?.name ?? 'Player'
  const out = new Set(data.eliminated)

  const losers: string[] = []
  const gainers: string[] = []

  for (const [id, delta] of Object.entries(data.deltas)) {
    if (delta < 0 && !out.has(id)) losers.push(nameOf(id))
    if (delta > 0) gainers.push(nameOf(id))
  }

  const said: Consequence[] = []

  if (losers.length > 0) {
    said.push({
      kind: 'loss',
      // "each" only when there is more than one of them, or a single player is
      // told they individually lose a die, which reads as a correction.
      text: `${list(losers)} ${losers.length > 1 ? 'each lose' : 'loses'} a die`,
    })
  }

  if (gainers.length > 0) {
    // Only Burst Lie can hand a die back, and only ever one, to one player —
    // so this is singular by the rules and not by assumption (GAME_RULES §9.2).
    said.push({ kind: 'gain', text: `${list(gainers)} wins a die back` })
  }

  if (out.size > 0) {
    const names = [...out].map(nameOf)
    said.push({ kind: 'out', text: `${list(names)} ${names.length > 1 ? 'are' : 'is'} out` })
  }

  return said
}

/** "Alice", "Alice and Dana", "Alice, Dana and Maya". */
function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
