import { GameError } from './errors'

/**
 * Where the voices are relayed, when they have to be.
 *
 * Two browsers usually talk to each other directly. Usually — a phone on a
 * mobile network is often behind carrier-grade NAT, which has no route in from
 * outside, and for those pairs the audio has to go through a relay. That relay
 * is TURN, and a TURN server will not take traffic from just anybody.
 *
 * Which is why this is here and not in the browser: whatever the relay wants as
 * proof, the browser is the wrong place to keep it.
 *
 * Two ways to configure one, and the order matters — the simple one wins,
 * because the reason it exists is that the other one asks for a credit card.
 *
 *   TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL
 *     A relay and a fixed username and password, handed straight to the
 *     browser. This is what every free provider gives you, and it is what a
 *     coturn on a box of your own gives you. The password is long-lived and
 *     reaches the client, which is the honest trade: it is a relay account,
 *     not a key that mints relay accounts.
 *
 *   CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN
 *     A key that mints credentials good for a few hours. Better, because
 *     nothing long-lived ever leaves this function — and it wants a card on
 *     file, which is why it is not the only way.
 *
 * With neither, this returns nothing rather than failing. Voice still works
 * over STUN for most pairs, and a table where two people cannot hear each other
 * is a better outcome than a table where nobody can press the button. The
 * client says which two, so it is not a mystery.
 */

const KEY_ID = Deno.env.get('CLOUDFLARE_TURN_KEY_ID') ?? ''
const API_TOKEN = Deno.env.get('CLOUDFLARE_TURN_API_TOKEN') ?? ''

/** Comma-separated, because a relay is usually offered on several ports. */
const TURN_URLS = Deno.env.get('TURN_URLS') ?? ''
const TURN_USERNAME = Deno.env.get('TURN_USERNAME') ?? ''
const TURN_CREDENTIAL = Deno.env.get('TURN_CREDENTIAL') ?? ''

/**
 * How long the minted credentials last.
 *
 * Longer than any game anybody will play in one sitting, so a table does not
 * lose its relay in the middle of a round, and far short of the key itself,
 * which never leaves this function.
 */
const TTL_SECONDS = 6 * 60 * 60

export interface IceServer {
  readonly urls: string | readonly string[]
  readonly username?: string
  readonly credential?: string
}

export async function iceServers(): Promise<{ iceServers: IceServer[] }> {
  // A relay you were simply given. No round trip, nothing to mint.
  if (TURN_URLS !== '') {
    const urls = TURN_URLS.split(',')
      .map((url) => url.trim())
      .filter((url) => url !== '')
    if (urls.length > 0) {
      return {
        iceServers: [
          {
            urls,
            ...(TURN_USERNAME === '' ? {} : { username: TURN_USERNAME }),
            ...(TURN_CREDENTIAL === '' ? {} : { credential: TURN_CREDENTIAL }),
          },
        ],
      }
    }
  }

  if (KEY_ID === '' || API_TOKEN === '') return { iceServers: [] }

  let response: Response
  try {
    response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    )
  } catch {
    // The relay provider being unreachable is not this game being broken.
    return { iceServers: [] }
  }

  if (!response.ok) {
    /*
     * Named rather than swallowed, because the two ways this fails have
     * different fixes and neither is visible from the outside: a token that has
     * been revoked returns 401, and a key id that does not exist returns 404.
     * Both look identical to a player — "voice is a bit unreliable" — and the
     * status code is the whole difference.
     */
    throw new GameError(
      'VOICE_UNAVAILABLE',
      'The voice relay refused our credentials. Check the TURN key on the server.',
      502,
    )
  }

  const body = (await response.json()) as { iceServers?: unknown }
  return { iceServers: normalise(body.iceServers) }
}

/**
 * One shape, whatever came back.
 *
 * The provider has two endpoints that differ only in whether `iceServers` is an
 * array or a single object, and a browser wants an array either way. Accepting
 * both costs three lines and removes a class of breakage that would only ever
 * show up as "voice stopped working" long after anybody changed anything.
 */
function normalise(value: unknown): IceServer[] {
  if (Array.isArray(value)) return value as IceServer[]
  if (value !== null && typeof value === 'object') return [value as IceServer]
  return []
}
