/**
 * The transport, and nothing above it.
 *
 * This stands in for `src/lib/supabaseClient.ts` when the app runs under the
 * live harness, and it is the ONLY thing swapped: `App`, `AuthProvider`,
 * `RoomScreen`, `LobbyView`, `GameScreen`, `useGame`, `api.ts` and `read.ts`
 * are the files that ship. What it replaces is the socket and the HTTP, so that
 * the screen people actually play on can be driven by a test.
 *
 * It speaks the same small part of supabase-js the app uses and no more: a
 * PostgREST query builder, `rpc`, `functions.invoke`, anonymous auth, and a
 * channel whose `postgres_changes` arrive by polling a change feed instead of
 * over a websocket. Polling is the one place this is unlike production, and it
 * is a difference in when an update arrives, not in what the app does with it.
 */

const USER_KEY = 'perudo.harness.user'
const POLL_MS = 90

let cachedUser = null
try {
  cachedUser = window.localStorage.getItem(USER_KEY)
} catch {
  cachedUser = null
}

async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-fake-user': cachedUser ?? '' },
    body: JSON.stringify(body),
  })
  return response.json()
}

// ------------------------------------------------------------------ queries

class Query {
  constructor(table) {
    this.spec = { table, select: '*', filters: [], order: [], limit: null, single: null }
    this.write = null
  }

  select(columns) {
    this.spec.select = columns
    return this
  }
  eq(col, val) {
    this.spec.filters.push({ op: 'eq', col, val })
    return this
  }
  neq(col, val) {
    this.spec.filters.push({ op: 'neq', col, val })
    return this
  }
  is(col, val) {
    this.spec.filters.push({ op: 'is', col, val })
    return this
  }
  in(col, val) {
    this.spec.filters.push({ op: 'in', col, val })
    return this
  }
  order(col, options) {
    this.spec.order.push({ col, asc: options?.ascending !== false })
    return this
  }
  limit(n) {
    this.spec.limit = n
    return this
  }
  maybeSingle() {
    this.spec.single = 'maybe'
    return this
  }
  single() {
    this.spec.single = 'one'
    return this
  }
  upsert(row) {
    this.write = row
    return this
  }

  then(resolve, reject) {
    return post('/fake/query', { spec: this.spec, write: this.write }).then(resolve, reject)
  }
}

// ----------------------------------------------------------------- realtime

const channels = new Set()
let polling = false
let since = 0
let liveSince = 0

function startPolling() {
  if (polling) return
  polling = true
  const tick = async () => {
    try {
      const response = await fetch(`/fake/changes?since=${since}&live=${liveSince}`)
      const { seq, changes, live } = await response.json()
      since = seq
      for (const change of changes) {
        for (const channel of channels) {
          for (const listener of channel.rows) {
            if (listener.table !== change.table) continue
            if (!filterMatches(listener.filter, change.row)) continue
            listener.callback({ eventType: 'UPDATE', new: change.row })
          }
        }
      }

      /*
       * Presence and broadcast, which a voice call is entirely made of.
       *
       * Presence arrives as a whole snapshot and is only handed on when it
       * differs, because the mesh above it opens and closes connections from
       * the difference — a sync on every poll would be a table that rebuilt its
       * audio ten times a second.
       */
      if (live !== undefined) {
        liveSince = live.seq
        for (const message of live.messages) {
          for (const channel of channels) {
            if (channel.name !== message.channel) continue
            for (const listener of channel.casts) {
              if (listener.event !== message.event) continue
              listener.callback({ payload: message.payload })
            }
          }
        }

        const next = live.presence ?? {}
        for (const channel of channels) {
          const room = next[channel.name] ?? {}
          if (JSON.stringify(room) === JSON.stringify(channel.present)) continue
          channel.present = room
          for (const listener of channel.syncs) listener()
        }
      }
    } catch {
      // A poll that fails is the socket being down, which the app already
      // handles by re-reading on its own heartbeat.
    }
    setTimeout(tick, POLL_MS)
  }
  void tick()
}

/** `game_id=eq.<uuid>`, the one filter shape the app subscribes with. */
function filterMatches(filter, row) {
  if (filter === undefined || filter === null) return true
  const match = filter.match(/^(\w+)=eq\.(.+)$/)
  if (match === null) return true
  return String(row[match[1]]) === match[2]
}

class Channel {
  constructor(name, options) {
    this.name = name
    this.rows = []
    this.casts = []
    this.syncs = []
    this.present = {}
    this.key = options?.config?.presence?.key ?? cachedUser ?? 'anonymous'
  }

  on(type, config, callback) {
    if (type === 'broadcast') this.casts.push({ event: config.event, callback })
    else if (type === 'presence') this.syncs.push(callback)
    else this.rows.push({ table: config.table, filter: config.filter, callback })
    return this
  }

  async send({ event, payload }) {
    await post('/fake/broadcast', { channel: this.name, event, payload })
    return 'ok'
  }

  async track(state) {
    await post('/fake/presence', { channel: this.name, key: this.key, state })
    return 'ok'
  }

  async untrack() {
    await post('/fake/presence', { channel: this.name, key: this.key, leave: true })
    return 'ok'
  }

  presenceState() {
    return this.present
  }

  subscribe(onStatus) {
    channels.add(this)
    startPolling()
    setTimeout(() => onStatus?.('SUBSCRIBED'), 0)
    return this
  }
}

// --------------------------------------------------------------------- auth

const authListeners = new Set()

const auth = {
  async getSession() {
    return {
      data: { session: cachedUser === null ? null : { user: { id: cachedUser } } },
      error: null,
    }
  },
  async signInAnonymously() {
    const { id } = await post('/fake/auth/anon', {})
    cachedUser = id
    try {
      window.localStorage.setItem(USER_KEY, id)
    } catch {
      // A private window keeps the id in memory for this page, which is all
      // the harness needs.
    }
    return { data: { user: { id } }, error: null }
  },
  onAuthStateChange(callback) {
    authListeners.add(callback)
    return {
      data: { subscription: { unsubscribe: () => authListeners.delete(callback) } },
    }
  },
}

// ---------------------------------------------------------------- the client

export const configError = null
export const supabaseUrl = 'harness://in-memory'

export const supabase = {
  auth,
  from: (table) => new Query(table),
  rpc: (name, args) => post('/fake/rpc', { name, args }),
  channel: (name, options) => new Channel(name, options),
  removeChannel: async (channel) => {
    channels.delete(channel)
    await channel.untrack().catch(() => {})
  },
  functions: {
    async invoke(name, { body, signal } = {}) {
      const response = await fetch(`/fake/functions/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-fake-user': cachedUser ?? '' },
        body: JSON.stringify(body),
        signal,
      })
      if (!response.ok) {
        // supabase-js hands a non-2xx back as an error carrying the Response,
        // which is where every refusal the server makes is actually written.
        const error = new Error('Edge Function returned a non-2xx status code')
        error.context = response
        return { data: null, error }
      }
      return { data: await response.json(), error: null }
    },
  },
}
