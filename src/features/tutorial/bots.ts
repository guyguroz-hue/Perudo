import { countsToward, legalFacesAt, quantityBounds } from '../../game'
import type { Face, PlayerId, RoundState } from '../../game'
import type { SeatState, TableState } from './table'
import { active, onTable } from './table'

/**
 * Players who are not people.
 *
 * They exist to teach, so they are built to be *legible* rather than strong.
 * A bot that plays optimally teaches nothing: it bluffs at frequencies a
 * beginner cannot read and doubts on margins they cannot see, and the lesson
 * becomes "I lost and I do not know why". These reason the way the game asks a
 * person to reason — how many of this face are probably out there, given what
 * I can see in my own hand — and they say so out loud when asked.
 *
 * They also never Burst. Burst means anybody may act at any moment, which is
 * the hardest thing about this game to follow, and three opponents exercising
 * it freely make a table nobody can read. The tutorial demonstrates a Burst
 * deliberately, once, with the player watching for it.
 *
 * And they cannot cheat, because they are not given the means to. A bot is
 * handed its own dice and the public state — the claim on the table, how many
 * dice are in play — and nothing else. That is the difference between a bot
 * that does not look at your hand and a bot that cannot: the first is a promise
 * about today's code, the second is a fact about its type.
 */

/**
 * Everything a bot is allowed to know.
 *
 * Exactly what a person in that seat can see. `own` is the only hidden
 * information in it, and it is the bot's own.
 */
export interface BotView {
  readonly round: RoundState
  /** Every die in play, which is public — counts are, faces are not. */
  readonly diceOnTable: number
  readonly own: readonly Face[]
}

/** What one seat may see. The only place a bot's view is assembled. */
export function seenBy(table: TableState, botId: PlayerId): BotView {
  const bot = table.seats.find((s) => s.id === botId)
  if (bot === undefined) throw new Error(`no bot ${botId}`)
  return { round: table.round, diceOnTable: onTable(table), own: bot.dice }
}

/** A bot's move, and why — the "why" is shown while teaching. */
export type BotMove =
  | { readonly kind: 'bid'; readonly quantity: number; readonly face: Face; readonly because: string }
  | { readonly kind: 'bull'; readonly because: string }
  | { readonly kind: 'lie'; readonly because: string }

/**
 * How many dice out there are expected to answer to a face.
 *
 * A third of the unseen dice: one chance in six of being the face itself, and
 * one in six of being a Perudo, which counts as it in a normal round. In a
 * Farewell Round ones are just ones, so it drops to a sixth (GAME_RULES §10).
 *
 * This is the one piece of arithmetic the game actually turns on, and it is the
 * thing a new player has no feel for — which is why the bots say it out loud.
 */
export function expected(unseen: number, wildcardsCount: boolean): number {
  return unseen * (wildcardsCount ? 2 / 6 : 1 / 6)
}

/** How many of this bot's own dice answer to a face. */
function inHand(view: BotView, face: Face, wildcardsCount: boolean): number {
  return view.own.filter((die) => countsToward(die, face, wildcardsCount ? 'normal' : 'farewell'))
    .length
}

/**
 * Decide a move.
 *
 * Order matters and mirrors how a person plays: look at what is claimed, ask
 * whether it is believable, and only then think about raising it.
 */
export function decide(view: BotView): BotMove {
  const wild = view.round.type === 'normal'
  const total = view.diceOnTable
  const unseen = total - view.own.length
  const claim = view.round.bid

  if (claim === null) {
    // Opening. Bid what is in front of it, which is always defensible and is
    // the habit a beginner should copy.
    const face = pickFace(view, wild)
    const mine = inHand(view, face, wild)
    const quantity = Math.max(1, mine + Math.round(expected(unseen, wild) * 0.6))
    return {
      kind: 'bid',
      quantity,
      face,
      because: `I hold ${mine} of those, and there are ${unseen} dice I cannot see.`,
    }
  }

  const mine = inHand(view, claim.face, wild)
  // What the claim needs from everybody else, against what is likely to be there.
  const needed = claim.quantity - mine
  const likely = expected(unseen, wild)

  // A Bulled claim is "exactly", and doubting it wins whenever the count is
  // anything else — which is most of the time. Cheap to doubt, so the bar is low.
  if (claim.bull !== null) {
    return { kind: 'lie', because: `Exactly ${claim.quantity} is a narrow claim, and I hold ${mine}.` }
  }

  if (needed > likely + 1.6) {
    return {
      kind: 'lie',
      because: `That needs ${Math.max(0, Math.round(needed))} from the other dice; I would expect about ${likely.toFixed(1)}.`,
    }
  }

  // Right on the number, and holding enough of it to believe the exact count.
  if (Math.abs(needed - likely) < 0.35 && mine >= 2 && claim.quantity >= 3) {
    return { kind: 'bull', because: `That is almost exactly what I would expect, and I hold ${mine}.` }
  }

  const raise = nextBid(view, wild)
  if (raise === null) {
    return { kind: 'lie', because: 'There is nothing left I am willing to claim.' }
  }
  return { ...raise, kind: 'bid' }
}

/**
 * The smallest raise this bot is prepared to stand behind.
 *
 * It walks the legal raises in order and takes the first one it can defend
 * from its own hand — which is exactly the reasoning a beginner is being asked
 * to learn, done slowly.
 */
function nextBid(
  view: BotView,
  wild: boolean,
): { quantity: number; face: Face; because: string } | null {
  /*
   * Two passes: raises first, and switching to Perudo only if nothing else
   * will do.
   *
   * Ranking faces within a quantity was not enough. Switching the bid to ones
   * halves the quantity, so the lowest legal bid after "three fours" is "two
   * Perudos" — and at that quantity Perudo is the *only* legal face. A search
   * that walks quantities upward from the minimum therefore finds a Perudo
   * switch before it finds any raise at all, every single time.
   *
   * That is a real rule and a good move. It is also the exact move that makes
   * a beginner think they misheard, one card after being told the quantity may
   * never fall — so the table finds something else to say if it can.
   */
  return search(view, wild, false) ?? search(view, wild, true)
}

function search(
  view: BotView,
  wild: boolean,
  allowPerudo: boolean,
): { quantity: number; face: Face; because: string } | null {
  const total = view.diceOnTable
  const bounds = quantityBounds(view.round, total)

  for (let quantity = bounds.min; quantity <= bounds.max; quantity += 1) {
    const faces = legalFacesAt(view.round, quantity).filter(
      (face) => allowPerudo || face !== 1,
    )
    // Best face first: the one this bot actually holds the most of.
    const ranked = [...faces].sort(
      (a, b) => inHand(view, b, wild) - inHand(view, a, wild) || a - b,
    )
    for (const face of ranked) {
      const mine = inHand(view, face, wild)
      const needed = quantity - mine
      if (needed <= expected(total - view.own.length, wild) + 0.9) {
        return {
          quantity,
          face,
          because: `I hold ${mine}, so ${quantity} only needs ${Math.max(0, needed)} from everyone else.`,
        }
      }
    }
  }
  return null
}

/** The face this bot holds most of, for an opening bid. Never Perudo (§7). */
function pickFace(view: BotView, wild: boolean): Face {
  const faces: Face[] = [2, 3, 4, 5, 6]
  return faces.reduce((best, face) =>
    inHand(view, face, wild) > inHand(view, best, wild) ? face : best,
  )
}

/** Whose turn it is, when that is a bot. */
export function botToAct(table: TableState): SeatState | null {
  const holder = active(table).find((s) => s.id === table.turnId)
  return holder !== undefined && !holder.isYou ? holder : null
}
