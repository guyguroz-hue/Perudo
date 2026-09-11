import type { PlayerId } from './types'

/**
 * Turn order.
 *
 * Perudo's turn is not simply "the next seat", because Burst lets any active
 * player bid or challenge out of order (GAME_RULES §9.1). The rule that makes
 * it tractable is this one:
 *
 *   > When Burst activity stops, normal clockwise play resumes with the player
 *   > AFTER the LAST BURST PLAYER.
 *
 * Which means there is only one rule to implement: after anybody acts, in turn
 * or not, play continues clockwise from *them*. A Burst is not a special case
 * in the turn order — it is a player taking the turn, and the turn moving on
 * from where they are.
 */
export interface Seated {
  readonly playerId: PlayerId
  readonly seat: number
  readonly diceCount: number
}

/**
 * The next player clockwise after `afterId` who still holds dice.
 *
 * Seats are a ring: it wraps, and it skips everyone who is out. If `afterId` is
 * the only player left holding dice, it returns them — the caller is resolving
 * a game that is already over, and a turn is not what decides that.
 */
export function nextActive(players: readonly Seated[], afterId: PlayerId): PlayerId {
  const ring = [...players].sort((a, b) => a.seat - b.seat)
  const active = ring.filter((player) => player.diceCount > 0)
  if (active.length === 0) {
    throw new Error('nextActive called with nobody holding dice')
  }

  // The actor may themselves be out — a player eliminated by the very
  // resolution being applied — so the search is by seat rather than by index
  // into the active list.
  const from = ring.find((player) => player.playerId === afterId)
  if (from === undefined) {
    throw new Error(`nextActive called with ${afterId}, who is not at this table`)
  }

  return (
    active.find((player) => player.seat > from.seat)?.playerId ?? active[0].playerId
  )
}

/** Whether acting now would be a Burst: legal, but out of turn (§9.1, §8.5). */
export function isBurst(turnHolderId: PlayerId | null, actorId: PlayerId): boolean {
  return turnHolderId !== null && turnHolderId !== actorId
}
