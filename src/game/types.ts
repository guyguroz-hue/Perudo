/**
 * Core domain types for the house-rule Perudo engine.
 *
 * This module is pure: no React, no Supabase, no I/O. The authoritative Edge
 * Function and the client both import it, which is what keeps a single set of
 * rules from drifting into two (DECISIONS.md D-002).
 *
 * The rules themselves live in docs/GAME_RULES.md. Where that document marks a
 * rule UNDEFINED, this engine raises `UnresolvedRuleError` rather than guessing.
 */

/** A die face. In a normal round `1` is Perudo — the wildcard. */
export type Face = 1 | 2 | 3 | 4 | 5 | 6

/** The wildcard face. Not a wildcard during a Farewell Round (GAME_RULES §10). */
export const PERUDO: Face = 1

export const FACES: readonly Face[] = [1, 2, 3, 4, 5, 6]

export type PlayerId = string

/**
 * `normal` — ones are wild, Perudo transitions apply.
 * `farewell` — one face is locked for the whole round and ones are NOT wild.
 */
export type RoundType = 'normal' | 'farewell'

/** A player's hidden hand. Server-side only until a legitimate reveal. */
export interface Hand {
  readonly playerId: PlayerId
  readonly dice: readonly Face[]
}

/**
 * A Bull declaration re-reads the current bid as "exactly X" instead of
 * "at least X" (GAME_RULES §8.1). It never introduces a quantity or face of its
 * own, which is why it hangs off the bid rather than replacing it.
 */
export interface BullDeclaration {
  readonly callerId: PlayerId
}

/**
 * The single current active bid. A later valid bid replaces this wholesale,
 * discarding any Bull attached to it (GAME_RULES §8.2).
 */
export interface ActiveBid {
  readonly quantity: number
  readonly face: Face
  readonly bidderId: PlayerId
  readonly bull: BullDeclaration | null
}

/** What a player is proposing, before it has been judged legal. */
export interface ProposedBid {
  readonly quantity: number
  readonly face: Face
}

export interface RoundState {
  readonly type: RoundType
  /**
   * Farewell rounds only: the face fixed by the opening bid, which may be any
   * face including Perudo. `null` until that opening bid is made.
   */
  readonly lockedFace: Face | null
  /** `null` before the opening bid of the round. */
  readonly bid: ActiveBid | null
}

export type ChallengeKind = 'dudo' | 'burst_dudo'

/** Why a proposed bid was refused. Stable codes so the UI can explain itself. */
export type BidRejection =
  | 'INVALID_QUANTITY'
  | 'INVALID_FACE'
  | 'CANNOT_OPEN_WITH_PERUDO'
  | 'MUST_NOT_DECREASE'
  | 'BELOW_MIN_PERUDO'
  | 'BELOW_MIN_AFTER_PERUDO'
  | 'FACE_LOCKED'
  | 'QUANTITY_MUST_INCREASE'

export type BidCheck =
  | { readonly legal: true }
  | { readonly legal: false; readonly reason: BidRejection; readonly detail: string }
