import { UnresolvedRuleError } from '../../../src/game'
import type { Face } from '../../../src/game'
import { callBull, challenge, openRound, placeBid } from './actions'
import { createClient } from './deps'
import { GameError } from './errors'
import { Store } from './store'

/**
 * The authoritative game server.
 *
 * Two clients, and the difference between them is the whole security model:
 *
 *   - one built from the caller's own token, used for exactly one thing —
 *     asking Supabase who they are. It has the caller's privileges and no more,
 *     so a forged identity is not something this function has to detect.
 *   - one built from the service key, used for every read and write. It is the
 *     only thing in the system that may touch a round.
 *
 * The service key never leaves the server and is never returned in a response.
 */

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }
  if (request.method !== 'POST') {
    return fail(new GameError('BAD_REQUEST', 'POST only.', 405))
  }

  try {
    const actorId = await whoIsCalling(request)
    const body = (await request.json()) as Record<string, unknown>
    const gameId = asString(body.gameId, 'gameId')
    const store = new Store(createClient(url, serviceKey))
    const actor = { id: actorId }

    switch (body.action) {
      case 'open_round':
        return ok(await openRound(store, actor, gameId))
      case 'bid':
        return ok(
          await placeBid(
            store,
            actor,
            gameId,
            asInt(body.quantity, 'quantity'),
            asFace(body.face),
          ),
        )
      case 'bull':
        return ok(await callBull(store, actor, gameId))
      case 'challenge':
        return ok(await challenge(store, actor, gameId))
      default:
        return fail(new GameError('BAD_REQUEST', `Unknown action: ${String(body.action)}`))
    }
  } catch (error) {
    return fail(error)
  }
})

/**
 * Identity, established by Supabase rather than claimed by the caller.
 *
 * The token is handed back to Supabase with the anon key, which is the same
 * check any ordinary request gets. Reading a user id out of the JWT here
 * instead would mean trusting a string the caller supplied.
 */
async function whoIsCalling(request: Request): Promise<string> {
  const authorization = request.headers.get('Authorization')
  if (authorization === null) {
    throw new GameError('NOT_AUTHENTICATED', 'No credentials.', 401)
  }

  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data, error } = await asCaller.auth.getUser()
  if (error !== null || data.user === null) {
    throw new GameError('NOT_AUTHENTICATED', 'Those credentials are not valid.', 401)
  }
  return data.user.id
}

function ok(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/**
 * A refusal says which rule refused. A fault says nothing.
 *
 * An unexpected error's message can carry anything the server happened to be
 * holding, so it is logged and not returned — the shape of an internal error is
 * itself information, and this server holds dice.
 */
function fail(error: unknown): Response {
  if (error instanceof GameError) {
    return new Response(JSON.stringify({ error: error.code, message: error.message }), {
      status: error.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (error instanceof UnresolvedRuleError) {
    // The game reached a situation the house rules do not determine. Loud on
    // purpose: inventing an answer would bake a made-up rule into the product.
    console.error('UNRESOLVED RULE', error.ruleId, error.situation)
    return new Response(
      JSON.stringify({
        error: 'UNRESOLVED_RULE',
        message:
          `This situation is not covered by the house rules yet (${error.ruleId}). ` +
          `It has to be decided rather than guessed.`,
      }),
      { status: 501, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  console.error('UNHANDLED', error)
  return new Response(JSON.stringify({ error: 'INTERNAL', message: 'Something broke.' }), {
    status: 500,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new GameError('BAD_REQUEST', `${name} is required.`)
  }
  return value
}

/**
 * The largest quantity the database can hold.
 *
 * A storage limit, not a rule. The house rules set no ceiling on a bid — one
 * above the dice on the table is legal and simply loses — so nothing here
 * decides what is playable. What it does is turn a number no column can take
 * into a refusal the player can read, instead of an overflow deep in a write
 * that surfaces as "something broke".
 */
const LARGEST_QUANTITY = 32767

function asInt(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new GameError('BAD_REQUEST', `${name} must be a whole number.`)
  }
  if (value < 1 || value > LARGEST_QUANTITY) {
    throw new GameError('BAD_REQUEST', `${name} is out of range.`)
  }
  return value
}

function asFace(value: unknown): Face {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 6) {
    throw new GameError('BAD_REQUEST', 'face must be 1-6.')
  }
  return value as Face
}
