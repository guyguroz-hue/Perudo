import type { Face } from '../../game'

/**
 * What the tutorial says, and when.
 *
 * Every word here is from `docs/GAME_RULES.md`, which is the source of truth
 * for this game. That matters more than it sounds: these are house rules, not
 * standard Perudo, and Bull, Burst and the Farewell Round do not exist in the
 * game a player may already know. Teaching the version somebody half-remembers
 * from somewhere else would be worse than teaching nothing — they would arrive
 * at a real table confident and wrong.
 *
 * Kept as data rather than as markup so the whole lesson can be read in one
 * place and checked against the rules, and so a step cannot quietly do
 * something the others do not.
 */

/** What the player has to do before the lesson moves on. */
export type Advance =
  /** Nothing; a Next button carries it. */
  | { readonly kind: 'read' }
  /** They must make this exact bid. Anything else is refused, kindly. */
  | { readonly kind: 'bid'; readonly quantity: number; readonly face: Face }
  /** They must doubt the claim on the table. */
  | { readonly kind: 'lie' }
  /** They must call Bull. */
  | { readonly kind: 'bull' }
  /** The bots play; the step ends when it is the player's turn again. */
  | { readonly kind: 'watch' }
  /**
   * A scripted move by a named player, out of turn, so a Burst can be shown
   * happening rather than described.
   *
   * Scripted rather than left to the bots on purpose. Burst is the hardest
   * rule in this game to follow — anybody may act at any moment — and a table
   * where three opponents exercise it freely is a table a beginner cannot
   * read. One deliberate cut-in, at a moment chosen so the player is watching
   * for it, teaches the rule; three unpredictable ones teach that the game is
   * chaos.
   */
  | {
      readonly kind: 'burst'
      readonly actor: string
      readonly quantity: number
      readonly face: Face
    }

export interface Step {
  readonly id: string
  readonly title: string
  /** Short. This is read on a phone, over somebody's shoulder, mid-conversation. */
  readonly body: string
  readonly advance: Advance
  /** A control to draw attention to while this step is up. */
  readonly point?: 'hand' | 'bid' | 'lie' | 'bull' | 'table' | 'seats'
}

/**
 * The lesson, in order.
 *
 * It teaches by doing wherever doing is possible: a rule that can be explained
 * in a sentence is explained, and a rule that is really a *decision* — when to
 * doubt, when to raise — is handed to the player to make, with the answer
 * arriving as the table's own reaction rather than as more text.
 */
export const LESSON: readonly Step[] = [
  {
    id: 'goal',
    title: 'The last one holding dice wins',
    body:
      'Everybody starts with five dice under a cup. Lose one for guessing wrong, and you are out when your last one goes. That is the whole game.',
    advance: { kind: 'read' },
    point: 'table',
  },
  {
    id: 'hand',
    title: 'You see your dice. Nobody else does',
    body:
      'Yours are at the bottom of the screen. Everyone else is a cup and a number — you know how many dice they hold, never which.',
    advance: { kind: 'read' },
    point: 'hand',
  },
  {
    id: 'bid',
    title: 'A bid is a claim about the whole table',
    body:
      '"Three fours" means there are at least three fours among every die in play — yours, theirs, all of them. You are not claiming to hold them.',
    advance: { kind: 'read' },
    point: 'bid',
  },
  {
    id: 'wild',
    title: 'Ones are wild',
    body:
      'A one is a Perudo and counts as any face you like. Bid fours, and every one on the table counts as a four too. It makes the table fuller than it looks.',
    advance: { kind: 'read' },
    point: 'hand',
  },
  {
    id: 'first-bid',
    title: 'Your turn — open the bidding',
    body:
      'Set it to three fours and send it. You hold some already, and with ones counting too, three is a safe thing to say.',
    advance: { kind: 'bid', quantity: 3, face: 4 },
    point: 'bid',
  },
  {
    id: 'raise',
    title: 'Each bid has to beat the last',
    body:
      'The quantity can never go down. Raise it and the face can go anywhere; keep it and the face has to climb. Watch what they do with that.',
    advance: { kind: 'watch' },
    point: 'seats',
  },
  {
    id: 'burst',
    title: 'Anybody can cut in, at any moment',
    body:
      'It is your turn — and it is about to not matter. Watch Bo, who is two seats away and not waiting for anyone.',
    /*
     * Nine sixes, against a table holding seven.
     *
     * Both halves are deliberate. It is false, so the player's own challenge
     * two cards from now wins them a die back — which is the whole point of
     * Burst Lie and cannot be taught by describing it. And nine clears any bid
     * the bots could have reached beforehand, so the demonstration is legal
     * whatever happened in the round leading up to it. `table.test.ts` pins
     * both against the scripted hands, so editing those cannot quietly break
     * this lesson.
     */
    advance: { kind: 'burst', actor: 'bo', quantity: 9, face: 6 },
    point: 'seats',
  },
  {
    id: 'burst-after',
    title: 'That was a Burst',
    body:
      'Bo bid out of turn, and that is always allowed — for you too. It is not free, though: play carries on clockwise from whoever spoke last, so cutting in moves the turn as well as raising the bid.',
    advance: { kind: 'read' },
  },
  {
    id: 'lie',
    title: 'When you stop believing it — call Lie',
    body:
      'Every cup comes off and the dice are counted. If the claim was short, the player who made it loses a die. If it was good, you lose one instead.',
    advance: { kind: 'read' },
    point: 'lie',
  },
  {
    id: 'bull',
    title: 'Bull says the number is exactly right',
    body:
      'It is not a challenge and it reveals nothing — it is a bid, and play carries on. It re-reads the claim from "at least" to "exactly", and anyone may still doubt it.',
    advance: { kind: 'read' },
    point: 'bull',
  },
  {
    id: 'call-it',
    title: 'Nine sixes? Doubt it',
    /*
     * Careful with the promise here.
     *
     * Burst Lie is the only move that wins a die back, and it is tempting to
     * say so flatly — but the player is holding five, and five is the most
     * anyone may ever hold (GAME_RULES §9.3). The die is simply not granted.
     * A card promising one and a reveal that does not deliver it teaches that
     * the game is arbitrary, so the ceiling is taught instead, in the same
     * breath and for free.
     */
    body:
      'Not your turn, so this is a Burst Lie — the only move that can win a die back. You are holding five, which is the most anyone may ever hold, so there is nothing here to take: this one is all cost to Bo.',
    advance: { kind: 'lie' },
    point: 'lie',
  },
  {
    id: 'free',
    title: 'That is the game. Play it out',
    body:
      'Three of them, five dice each, nobody helping. One more thing you will meet: a Farewell Round, which starts when somebody drops to their last die — it locks one face for the whole round, and ones stop being wild.',
    advance: { kind: 'read' },
  },
]

/** The step a fresh tutorial starts on. */
export const FIRST = 0
