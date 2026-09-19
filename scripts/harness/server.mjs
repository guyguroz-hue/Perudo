/**
 * The app, served with its transport replaced and a table behind it.
 *
 * Vite serves the real application — every file under `src/` exactly as built
 * for production — with one module swapped: `lib/supabaseClient` resolves to
 * the harness transport. Behind it sits an in-memory database and the real
 * Edge Function action layer, loaded straight out of
 * `supabase/functions/game/` through Vite's own TypeScript pipeline so that the
 * rules under test are the rules that ship.
 *
 * Several browsers can sit at one table here, which is the thing neither
 * `/preview` nor `/solo` can do and the thing every reported bug came from.
 */
import { createServer } from 'vite'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createDb } from './db.mjs'
import { createStore } from './store.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../..')

export async function startHarness({ port = 5199 } = {}) {
  const db = createDb()
  /** Every query the browsers made, in order. See `/fake/query`. */
  const asked = []

  const vite = await createServer({
    root: ROOT,
    configFile: join(ROOT, 'vite.config.ts'),
    logLevel: 'warn',
    server: { port, strictPort: true },
    plugins: [
      {
        name: 'perudo-harness-transport',
        enforce: 'pre',
        resolveId(source) {
          if (/(^|\/)lib\/supabaseClient(\.ts)?$/.test(source)) {
            return join(HERE, 'client.js')
          }
          return null
        },
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (!request.url.startsWith('/fake/')) return next()
            void handle(request, response)
          })
        },
      },
    ],
  })

  // The real refusal codes and the real actions, through Vite's TS pipeline.
  const errors = await vite.ssrLoadModule('/supabase/functions/game/errors.ts')
  const actions = await vite.ssrLoadModule('/supabase/functions/game/actions.ts')
  const engine = await vite.ssrLoadModule('/src/game/index.ts')
  const { store } = createStore(db, errors.fromPostgres)

  async function handle(request, response) {
    const send = (status, payload) => {
      response.statusCode = status
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(payload))
    }

    const url = new URL(request.url, 'http://harness')

    if (url.pathname === '/fake/changes') {
      return send(200, {
        ...db.changesSince(Number(url.searchParams.get('since') ?? 0)),
        live: db.liveSince(Number(url.searchParams.get('live') ?? 0)),
      })
    }

    const body = request.method === 'POST' ? await readJson(request) : {}
    const actor = request.headers['x-fake-user'] || null

    if (url.pathname === '/fake/auth/anon') {
      return send(200, { id: randomUUID() })
    }

    if (url.pathname === '/fake/query') {
      const { spec, write } = body
      /*
       * Every read, kept.
       *
       * This harness does not model row-level security and must not pretend to
       * — that is proved against a real Postgres by `npm run test:db`. What it
       * can answer is the question RLS cannot: what the browser actually asks
       * for. A client that asks for the whole of `player_dice` and relies on a
       * policy to trim it is one policy change away from dealing everybody
       * else's hand to the screen.
       */
      asked.push({ actor, table: spec.table, filters: spec.filters ?? [] })
      if (write !== null && write !== undefined) {
        if (spec.table !== 'profiles') return send(400, { message: 'no such write' })
        // An upsert answers with the row it wrote, not with the table.
        db.upsertProfile(write.id, write.display_name)
        return send(200, db.query({ ...spec, filters: [{ op: 'eq', col: 'id', val: write.id }] }))
      }
      return send(200, db.query(spec))
    }

    if (url.pathname === '/fake/broadcast') {
      return send(200, { seq: db.broadcast(body.channel, body.event, body.payload) })
    }

    if (url.pathname === '/fake/presence') {
      if (body.leave === true) db.untrack(body.channel, body.key)
      else db.track(body.channel, body.key, body.state)
      return send(200, { ok: true })
    }

    if (url.pathname === '/fake/rpc') {
      return send(200, db.rpc(actor, body.name, body.args))
    }

    if (url.pathname.startsWith('/fake/functions/')) {
      return send(...(await invoke(actor, body)))
    }

    return send(404, { message: 'no such harness route' })
  }

  /**
   * The Edge Function's own routing and refusal mapping, kept identical to
   * `supabase/functions/game/index.ts` — the status codes and error codes it
   * returns are what `api.ts` turns into the sentences a player reads.
   */
  async function invoke(actorId, body) {
    if (actorId === null) {
      return [401, { error: 'NOT_AUTHENTICATED', message: 'No credentials.' }]
    }
    const actor = { id: actorId }
    const gameId = body.gameId
    try {
      switch (body.action) {
        case 'open_round':
          return [200, await actions.openRound(store, actor, gameId)]
        case 'bid':
          return [200, await actions.placeBid(store, actor, gameId, body.quantity, body.face)]
        case 'bull':
          return [200, await actions.callBull(store, actor, gameId)]
        case 'challenge':
          return [200, await actions.challenge(store, actor, gameId)]
        default:
          return [400, { error: 'BAD_REQUEST', message: `Unknown action: ${body.action}` }]
      }
    } catch (error) {
      if (error instanceof errors.GameError) {
        return [error.status, { error: error.code, message: error.message }]
      }
      if (error instanceof engine.UnresolvedRuleError) {
        return [
          501,
          {
            error: 'UNRESOLVED_RULE',
            message: `This situation is not covered by the house rules yet (${error.ruleId}).`,
          },
        ]
      }
      console.error('HARNESS UNHANDLED', error)
      return [500, { error: 'INTERNAL', message: 'Something broke.' }]
    }
  }

  await vite.listen()
  return {
    url: `http://localhost:${port}`,
    db,
    asked,
    // The one server capability a test needs to reach directly: setting up a
    // position that would otherwise take a dozen played rounds to arrive at.
    store,
    async close() {
      await vite.close()
    },
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', (chunk) => (raw += chunk))
    request.on('end', () => {
      try {
        resolve(raw === '' ? {} : JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}
