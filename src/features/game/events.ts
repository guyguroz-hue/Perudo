import type { Face } from '../../game'

/**
 * One line of what just happened.
 *
 * Fifth in the information hierarchy of the waiting screen, and the only part
 * of it that is prose — so it has to read like something a person at the table
 * would say. "Alice bid 4 sixes", not "BID quantity=4 face=6".
 *
 * Pure, and separated from the fetching, because the fiddly parts are all here:
 * a bid of one is not "1 sixes", the wildcard is not "1", and a Burst is a
 * different sentence rather than the same one with a word bolted on.
 */

export interface GameEvent {
  readonly kind: string
  readonly actorName: string
  readonly quantity?: number
  readonly face?: Face
}

/** How a face is said out loud. The wildcard has a name, not a number. */
export function faceWord(face: Face, quantity: number): string {
  const one = quantity === 1
  switch (face) {
    case 1:
      return one ? 'Perudo' : 'Perudos'
    case 2:
      return one ? 'two' : 'twos'
    case 3:
      return one ? 'three' : 'threes'
    case 4:
      return one ? 'four' : 'fours'
    case 5:
      return one ? 'five' : 'fives'
    case 6:
      // The one irregular plural in the set, and the one worth a test.
      return one ? 'six' : 'sixes'
  }
}

export function describeEvent(event: GameEvent): string | null {
  const { kind, actorName, quantity, face } = event
  const bid =
    quantity !== undefined && face !== undefined
      ? `${quantity} ${faceWord(face, quantity)}`
      : null

  switch (kind) {
    case 'bid':
      return bid === null ? null : `${actorName} bid ${bid}`
    case 'burst_bid':
      return bid === null ? null : `${actorName} burst in with ${bid}`
    case 'bull':
      return bid === null
        ? `${actorName} called Bull`
        : `${actorName} called Bull on ${bid} — exactly`
    case 'burst_bull':
      return bid === null
        ? `${actorName} burst in with Bull`
        : `${actorName} burst in with Bull on ${bid} — exactly`
    case 'dudo':
      return `${actorName} called Dudo`
    case 'burst_dudo':
      return `${actorName} burst in with Dudo`
    default:
      // An event kind this build does not know about says nothing, rather than
      // printing a raw identifier at a player.
      return null
  }
}
