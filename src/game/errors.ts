/**
 * Raised when play reaches a situation the house rules do not determine.
 *
 * This is deliberately loud. The specification lists several outcomes as
 * intentionally unresolved (docs/GAME_RULES.md §12), and inventing behaviour for
 * them would bake a made-up rule into the product. Crashing the action is the
 * correct response: it surfaces the gap instead of silently inventing an answer.
 *
 * Nothing in the engine throws this at present: every rule it implements has
 * been decided. It is kept for the action layer, which still has R-008 ahead of
 * it — whether Burst and Bull are permitted inside a Farewell Round — and for
 * whatever the round-state work turns up next.
 */
export class UnresolvedRuleError extends Error {
  /** Identifier from docs/DECISIONS.md, e.g. `R-001`. */
  readonly ruleId: string
  /** The concrete situation that was reached. */
  readonly situation: string

  constructor(ruleId: string, situation: string) {
    super(
      `Unresolved house rule ${ruleId}: ${situation}. ` +
        `This outcome is deliberately undefined — see docs/GAME_RULES.md §12. ` +
        `It must be decided by the product owner, not inferred.`,
    )
    this.name = 'UnresolvedRuleError'
    this.ruleId = ruleId
    this.situation = situation
  }
}
