import { supabase } from '../../lib/supabaseClient'
import type { Face, PlayerId } from '../../game'
import { GameActionError, toGameError } from './errors'
import type { RevealData } from './reveal'

/**
 * Talking to the authoritative game server.
 *
 * Every move goes through the Edge Function. There is no path from here that
 * writes a round, a bid or a die: clients hold SELECT and nothing else on every
 * game table, so this is not a convention the client agrees to follow — it is
 * the only thing it can do.
 */

/**
 * How long a move may take before the table gives up on it.
 *
 * There was no limit at all, and on a phone that is not an edge case — a
 * request made as the signal goes hangs until the socket is reclaimed, which
 * can be minutes or never. Every one of these calls is awaited by something
 * that has already taken the controls away: a bid leaves `busy` set, so the
 * whole console stays disabled, and a challenge leaves the reveal holding its
 * breath with the cups up and no dock underneath. Both are a frozen game with
 * nothing on screen admitting it.
 *
 * Generous on purpose. A challenge is the slowest thing the server does — it
 * counts the table, resolves, writes the round and deals the next one — and a
 * limit that fires on a slow-but-working connection would take a game away
 * from somebody who was about to get an answer. Twelve seconds is far beyond
 * anything the function does and far short of a player deciding the app is
 * broken.
 */
const PATIENCE_MS = 12_000

async function act<T>(body: Record<string, unknown>): Promise<T> {
  const giveUp = new AbortController()
  // An explicit controller rather than AbortSignal.timeout, so the timer can be
  // cleared the moment the answer lands: a pending timeout per move would keep
  // a phone's timer queue awake for no reason, and this is a game people leave
  // open.
  const timer = setTimeout(() => giveUp.abort(), PATIENCE_MS)

  let data: unknown
  let error: unknown
  try {
    ;({ data, error } = await supabase.functions.invoke('game', { body, signal: giveUp.signal }))
  } catch (thrown) {
    // An abort surfaces as a returned error in some versions of the client and
    // as a throw in others, so both roads lead here.
    if (giveUp.signal.aborted) throw gaveUp()
    throw toGameError(thrown)
  } finally {
    clearTimeout(timer)
  }

  // A non-2xx response arrives as an error whose body holds the refusal. Left
  // unread, every rule the server enforces would reach the player as "Edge
  // Function returned a non-2xx status code".
  if (error !== null && error !== undefined) {
    if (giveUp.signal.aborted) throw gaveUp()
    throw toGameError(await refusalFrom(error))
  }
  return data as T
}

/**
 * The timeout firing, said as a refusal.
 *
 * Not stale. Stale means the table moved and looking again is the answer;
 * here nothing is known to have happened at all — the request may have been
 * applied, or never arrived. Either way the player's next move refetches, and
 * the server checks the move again, so guessing which it was would buy
 * nothing and could show them a table that never existed.
 */
function gaveUp(): GameActionError {
  return new GameActionError(
    'TIMED_OUT',
    'The table did not answer. Check your connection and try again.',
    false,
  )
}

async function refusalFrom(error: unknown): Promise<unknown> {
  const response = (error as { context?: unknown }).context
  if (response instanceof Response) {
    try {
      return await response.json()
    } catch {
      // Fall through to the error itself: a body that is not JSON is a crash,
      // not a refusal, and pretending otherwise would invent a rule.
    }
  }
  return error
}

/** Opens the first round of a game. Idempotent: returns the live one if there is one. */
export async function openRound(gameId: string): Promise<string> {
  const { roundId } = await act<{ roundId: string }>({ action: 'open_round', gameId })
  return roundId
}

export async function placeBid(gameId: string, quantity: number, face: Face): Promise<void> {
  await act({ action: 'bid', gameId, quantity, face })
}

export async function callBull(gameId: string): Promise<void> {
  await act({ action: 'bull', gameId })
}

/**
 * Doubt the claim on the table, and get back the whole reveal.
 *
 * One request, one answer, carrying every hand, the count, the verdict and the
 * die changes. The client cannot hold anybody's dice in advance — that is what
 * `player_dice` exists to prevent — so the round trip is unavoidable, and this
 * is what makes it survivable: the dramatic pause and the network wait are the
 * same moment rather than two in a row.
 */
export async function challenge(gameId: string): Promise<RevealData> {
  return act<RevealData>({ action: 'challenge', gameId })
}

/** Your own dice. The only hand any client is ever given. */
export async function fetchOwnHand(
  roundId: string,
  youId: PlayerId,
): Promise<readonly Face[] | null> {
  const { data, error } = await supabase
    .from('player_dice')
    .select('dice')
    // Redundant against the RLS policy, which already permits exactly this row
    // and no other. Kept because a query that asks for its own row is readable
    // as correct; one that asks for everything and trusts a policy is not.
    .eq('round_id', roundId)
    .eq('player_id', youId)
    .maybeSingle()

  if (error !== null) throw new GameActionError('UNKNOWN', error.message, false)
  return (data?.dice as Face[] | undefined) ?? null
}
