/**
 * A table's worth of Postgres, in memory.
 *
 * Not a mock of the game and not a second engine: every rule still comes from
 * `src/game` by way of the real action layer, which runs against this through
 * the same `GameStore` interface it uses in production. What lives here is only
 * what SQL does — rows, the eight RPCs the browser calls, the writes the
 * apply_* functions perform, and the change feed Realtime would carry.
 *
 * It exists because the one screen nobody could test is the one people play on.
 * `/preview` renders fixtures and `/solo` plays bots in a tab; neither has a
 * room, a second player, a server refusal or a Realtime event in it, and the
 * difference between that DOM and the real one has already shipped a bug.
 *
 * What it deliberately does NOT model: row-level security, and the SQL bodies
 * as SQL. Those are covered where they live — `supabase/tests/*.sql`, run by
 * `npm run test:db`, against a real Postgres. The mirror below is written from
 * those same migrations and is here to make the browser's half checkable.
 */
import { randomUUID, randomInt } from 'node:crypto'

export function createDb() {
  const tables = {
    profiles: [],
    rooms: [],
    room_members: [],
    games: [],
    game_players: [],
    rounds: [],
    player_dice: [],
    dice_reveals: [],
    game_events: [],
  }

  // What Realtime carries: that a row in a table changed, and enough of it to
  // decide whether a subscriber's filter matches.
  let seq = 0
  const changes = []
  let eventId = 0

  function touch(table, row) {
    seq += 1
    changes.push({ seq, table, row: { ...row } })
    if (changes.length > 500) changes.splice(0, changes.length - 500)
  }

  // ---------------------------------------------------------------- reading

  /** One PostgREST query, as the browser's builder describes it. */
  function query({ table, select = '*', filters = [], order = [], limit = null, single = null }) {
    let rows = tables[table] ?? []
    for (const f of filters) rows = rows.filter((row) => matches(row, f))

    for (const o of [...order].reverse()) {
      rows = [...rows].sort((a, b) => compare(a[o.col], b[o.col]) * (o.asc ? 1 : -1))
    }
    if (limit !== null) rows = rows.slice(0, limit)

    const shaped = rows.map((row) => project(row, select))

    if (single === 'maybe') {
      if (shaped.length > 1) {
        return { data: null, error: { code: 'PGRST116', message: 'more than one row returned' } }
      }
      return { data: shaped[0] ?? null, error: null }
    }
    if (single === 'one') {
      if (shaped.length !== 1) {
        return { data: null, error: { code: 'PGRST116', message: 'expected exactly one row' } }
      }
      return { data: shaped[0], error: null }
    }
    return { data: shaped, error: null }
  }

  function matches(row, { op, col, val }) {
    const value = derived(row, col)
    switch (op) {
      case 'eq':
        return String(value) === String(val)
      case 'neq':
        return String(value) !== String(val)
      case 'is':
        return val === null ? value === null || value === undefined : value === val
      case 'in':
        return val.some((one) => String(one) === String(value))
      default:
        throw new Error(`unsupported filter ${op}`)
    }
  }

  function compare(a, b) {
    if (a === b) return 0
    if (a === null || a === undefined) return -1
    if (b === null || b === undefined) return 1
    return a < b ? -1 : 1
  }

  /** Generated columns, which the browser reads as ordinary ones. */
  function derived(row, col) {
    if (col === 'is_eliminated') return row.dice_count === 0
    return row[col]
  }

  /**
   * The requested columns, embeds included.
   *
   * `profiles!game_players_user_id_fkey(display_name)` names the constraint
   * because PostgREST refuses to guess between two relationships; the local
   * column is read back out of the constraint's name, which is the same thing
   * PostgREST does with it.
   */
  function project(row, select) {
    if (select === '*') return { ...row }
    const out = {}
    for (const part of splitColumns(select)) {
      const embed = part.match(/^(\w+)!([\w]+)\(([^)]*)\)$/)
      if (embed === null) {
        out[part] = derived(row, part) ?? null
        continue
      }
      const [, target, fk, cols] = embed
      const local = localColumn(row, fk)
      const found = (tables[target] ?? []).find((other) => other.id === row[local])
      out[target] =
        found === undefined
          ? null
          : Object.fromEntries(splitColumns(cols).map((c) => [c, found[c] ?? null]))
    }
    return out
  }

  function localColumn(row, fk) {
    const candidates = Object.keys(row).filter((key) => key.endsWith('_id') && fk.includes(key))
    if (candidates.length === 0) throw new Error(`cannot read a local column out of ${fk}`)
    return candidates.sort((a, b) => b.length - a.length)[0]
  }

  function splitColumns(select) {
    const parts = []
    let depth = 0
    let current = ''
    for (const ch of select) {
      if (ch === '(') depth += 1
      if (ch === ')') depth -= 1
      if (ch === ',' && depth === 0) {
        parts.push(current.trim())
        current = ''
        continue
      }
      current += ch
    }
    if (current.trim() !== '') parts.push(current.trim())
    return parts
  }

  // ---------------------------------------------------------------- writing

  function upsertProfile(id, displayName) {
    const existing = tables.profiles.find((row) => row.id === id)
    if (existing !== undefined) {
      existing.display_name = displayName
      return { ...existing }
    }
    const row = { id, display_name: displayName }
    tables.profiles.push(row)
    return { ...row }
  }

  function logEvent(gameId, roundId, actorId, kind, payload) {
    eventId += 1
    tables.game_events.push({
      id: eventId,
      game_id: gameId,
      round_id: roundId,
      actor_id: actorId,
      kind,
      payload,
    })
  }

  /** One fair die, the way roll_die() makes one. */
  const rollDie = () => randomInt(1, 7)

  /** The lowest seat nobody is sitting in, or undefined at a full table. */
  function freeSeat(roomId) {
    const taken = new Set(
      tables.room_members
        .filter((m) => m.room_id === roomId && m.left_at === null)
        .map((m) => m.seat),
    )
    return [0, 1, 2, 3, 4, 5].find((s) => !taken.has(s))
  }

  // ------------------------------------------------------------------- RPCs
  // Mirrors of the functions the browser is allowed to call. The apply_* and
  // deal_round family are NOT here: those are server capabilities, and they are
  // reached through the store, exactly as the grants in the migrations say.

  const rpcs = {
    create_room(actor) {
      const code = newCode()
      const room = {
        id: randomUUID(),
        code,
        host_id: actor,
        status: 'lobby',
        round_start_rule: 'winner_starts',
        expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
      }
      tables.rooms.push(room)
      const member = {
        room_id: room.id,
        user_id: actor,
        seat: 0,
        role: 'player',
        asked_at: null,
        answered_at: null,
        left_at: null,
        removed_at: null,
        joined_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }
      tables.room_members.push(member)
      touch('rooms', room)
      touch('room_members', member)
      return [{ room_id: room.id, code }]
    },

    join_room_by_code(actor, { p_code }) {
      const code = String(p_code ?? '').trim().toUpperCase()
      const room = tables.rooms.find((r) => r.code === code)
      if (room === undefined) throw new Error('INVALID_ROOM')
      if (room.status === 'closed') throw new Error('ROOM_EXPIRED')

      const member = tables.room_members.find(
        (m) => m.room_id === room.id && m.user_id === actor,
      )
      if (member !== undefined && member.removed_at !== null) throw new Error('REMOVED_FROM_ROOM')
      if (member !== undefined && member.left_at === null) {
        return [{ room_id: room.id, seat: member.seat }]
      }
      if (room.status !== 'lobby') throw new Error('GAME_ALREADY_STARTED')

      const taken = new Set(
        tables.room_members
          .filter((m) => m.room_id === room.id && m.left_at === null)
          .map((m) => m.seat),
      )
      const seat = [0, 1, 2, 3, 4, 5].find((s) => !taken.has(s))
      if (seat === undefined) throw new Error('ROOM_FULL')

      if (member !== undefined) {
        member.seat = seat
        member.role = 'player'
        member.left_at = null
        touch('room_members', member)
      } else {
        const row = {
          room_id: room.id,
          user_id: actor,
          seat,
          role: 'player',
          asked_at: null,
          answered_at: null,
          left_at: null,
          removed_at: null,
          joined_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        }
        tables.room_members.push(row)
        touch('room_members', row)
      }
      return [{ room_id: room.id, seat }]
    },

    leave_room(actor, { p_room_id }) {
      const member = tables.room_members.find(
        (m) => m.room_id === p_room_id && m.user_id === actor && m.left_at === null,
      )
      if (member === undefined) return null
      member.left_at = new Date().toISOString()
      touch('room_members', member)
      return null
    },

    kick_player(actor, { p_room_id, p_user_id }) {
      const room = tables.rooms.find((r) => r.id === p_room_id)
      if (room === undefined) throw new Error('INVALID_ROOM')
      if (room.host_id !== actor) throw new Error('NOT_HOST')
      const member = tables.room_members.find(
        (m) => m.room_id === p_room_id && m.user_id === p_user_id && m.left_at === null,
      )
      if (member === undefined) return null
      member.left_at = new Date().toISOString()
      member.removed_at = new Date().toISOString()
      touch('room_members', member)
      return null
    },

    touch_room_member(actor, { p_room_id }) {
      const member = tables.room_members.find(
        (m) => m.room_id === p_room_id && m.user_id === actor && m.left_at === null,
      )
      if (member !== undefined) member.last_seen_at = new Date().toISOString()
      return null
    },

    start_game(actor, { p_room_id }) {
      const room = tables.rooms.find((r) => r.id === p_room_id)
      if (room === undefined) throw new Error('INVALID_ROOM')
      if (room.host_id !== actor) throw new Error('NOT_HOST')
      if (room.status !== 'lobby') throw new Error('GAME_ALREADY_STARTED')

      // Spectators are left out by role, not by seat: they have no seat to
      // leave them out by.
      const seated = tables.room_members.filter(
        (m) => m.room_id === p_room_id && m.left_at === null && m.role === 'player',
      )
      if (seated.length < 2) throw new Error('NOT_ENOUGH_PLAYERS')

      const game = {
        id: randomUUID(),
        room_id: p_room_id,
        status: 'active',
        winner_id: null,
        starting_dice: 5,
        round_start_rule: room.round_start_rule,
        created_at: new Date().toISOString(),
        version: 0,
      }
      tables.games.push(game)
      for (const member of seated) {
        const row = {
          game_id: game.id,
          user_id: member.user_id,
          seat: member.seat,
          dice_count: 5,
          eliminated_at: null,
        }
        tables.game_players.push(row)
        touch('game_players', row)
      }
      room.status = 'in_game'
      touch('games', game)
      touch('rooms', room)
      return game.id
    },

    /** A member with no seat. Works on a table that is full, or playing, or both. */
    spectate_room(actor, { p_code }) {
      const code = String(p_code ?? '').trim().toUpperCase()
      const room = tables.rooms.find((r) => r.code === code)
      if (room === undefined) throw new Error('INVALID_ROOM')
      if (room.status === 'closed') throw new Error('ROOM_EXPIRED')

      const member = tables.room_members.find(
        (m) => m.room_id === room.id && m.user_id === actor,
      )
      if (member !== undefined && member.removed_at !== null) throw new Error('REMOVED_FROM_ROOM')
      // Already here, in whatever capacity. Watching is not a demotion.
      if (member !== undefined && member.left_at === null) return [{ room_id: room.id }]

      if (member !== undefined) {
        Object.assign(member, {
          role: 'spectator',
          seat: null,
          left_at: null,
          asked_at: null,
          answered_at: null,
        })
        touch('room_members', member)
      } else {
        const row = {
          room_id: room.id,
          user_id: actor,
          seat: null,
          role: 'spectator',
          asked_at: null,
          answered_at: null,
          left_at: null,
          removed_at: null,
          joined_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        }
        tables.room_members.push(row)
        touch('room_members', row)
      }
      return [{ room_id: room.id }]
    },

    ask_for_seat(actor, { p_room_id }) {
      const room = tables.rooms.find((r) => r.id === p_room_id)
      if (room === undefined) throw new Error('INVALID_ROOM')
      if (room.status === 'closed') throw new Error('ROOM_EXPIRED')

      const member = tables.room_members.find(
        (m) => m.room_id === p_room_id && m.user_id === actor && m.left_at === null,
      )
      if (member === undefined) throw new Error('NOT_IN_ROOM')
      if (member.role === 'player') return 'seated'

      const seat = freeSeat(p_room_id)
      if (seat === undefined) throw new Error('ROOM_FULL')

      if (room.status === 'lobby') {
        Object.assign(member, { role: 'player', seat, asked_at: null, answered_at: new Date().toISOString() })
        touch('room_members', member)
        return 'seated'
      }
      Object.assign(member, { asked_at: new Date().toISOString(), answered_at: null })
      touch('room_members', member)
      return 'asked'
    },

    answer_seat_request(actor, { p_room_id, p_user_id, p_approve }) {
      const room = tables.rooms.find((r) => r.id === p_room_id)
      if (room === undefined) throw new Error('INVALID_ROOM')
      if (room.host_id !== actor) throw new Error('NOT_HOST')

      const member = tables.room_members.find(
        (m) =>
          m.room_id === p_room_id &&
          m.user_id === p_user_id &&
          m.left_at === null &&
          m.asked_at !== null,
      )
      // Answered twice, or withdrawn between the tap and the write.
      if (member === undefined) return null

      if (!p_approve) {
        Object.assign(member, { asked_at: null, answered_at: new Date().toISOString() })
        touch('room_members', member)
        return null
      }

      const seat = freeSeat(p_room_id)
      if (seat === undefined) throw new Error('ROOM_FULL')
      Object.assign(member, {
        role: 'player',
        seat,
        asked_at: null,
        answered_at: new Date().toISOString(),
      })
      touch('room_members', member)
      return null
    },

    return_to_lobby(actor, { p_room_id }) {
      const room = tables.rooms.find((r) => r.id === p_room_id)
      if (room === undefined) throw new Error('INVALID_ROOM')
      if (room.host_id !== actor) throw new Error('NOT_HOST')
      if (room.status === 'lobby') return null
      if (room.status !== 'finished') throw new Error('GAME_IN_PROGRESS')
      room.status = 'lobby'
      touch('rooms', room)
      return null
    },

    end_room(actor, { p_room_id }) {
      const room = tables.rooms.find((r) => r.id === p_room_id)
      if (room === undefined) throw new Error('INVALID_ROOM')
      if (room.host_id !== actor) throw new Error('NOT_HOST')
      for (const game of tables.games) {
        if (game.room_id === p_room_id && ['starting', 'active'].includes(game.status)) {
          game.status = 'abandoned'
          touch('games', game)
        }
      }
      for (const member of tables.room_members) {
        if (member.room_id === p_room_id && member.left_at === null) {
          member.left_at = new Date().toISOString()
          touch('room_members', member)
        }
      }
      room.status = 'closed'
      touch('rooms', room)
      return null
    },
  }

  function rpc(actor, name, args) {
    const fn = rpcs[name]
    if (fn === undefined) {
      return { data: null, error: { code: 'PGRST202', message: `PGRST202: no function ${name}` } }
    }
    try {
      return { data: fn(actor, args ?? {}), error: null }
    } catch (error) {
      return { data: null, error: { code: 'P0001', message: error.message } }
    }
  }

  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  function newCode() {
    for (;;) {
      let code = ''
      for (let i = 0; i < 6; i += 1) code += ALPHABET[randomInt(0, ALPHABET.length)]
      if (!tables.rooms.some((room) => room.code === code)) return code
    }
  }

  // ------------------------------------------------- broadcast and presence
  /*
   * The other half of Realtime, which the game did not need until voices.
   *
   * Row changes say what the database holds; these two say what the people
   * holding phones are doing right now, and nothing about them is ever written
   * down. A voice call is entirely made of this: who is in it, and the
   * back-and-forth two browsers have before they can hear each other.
   */
  let messageSeq = 0
  const messages = []
  const presence = new Map()

  function broadcast(channel, event, payload) {
    messageSeq += 1
    messages.push({ seq: messageSeq, channel, event, payload })
    if (messages.length > 300) messages.splice(0, messages.length - 300)
    return messageSeq
  }

  function track(channel, key, state) {
    const room = presence.get(channel) ?? new Map()
    room.set(key, state ?? {})
    presence.set(channel, room)
  }

  function untrack(channel, key) {
    presence.get(channel)?.delete(key)
  }

  function since(seq) {
    return {
      seq: messageSeq,
      messages: messages.filter((message) => message.seq > seq),
      presence: Object.fromEntries(
        [...presence].map(([channel, room]) => [channel, Object.fromEntries(room)]),
      ),
    }
  }

  return {
    tables,
    query,
    rpc,
    upsertProfile,
    logEvent,
    rollDie,
    touch,
    changesSince,
    broadcast,
    track,
    untrack,
    liveSince: since,
    seqNow: () => seq,
  }

  function changesSince(since) {
    return { seq, changes: changes.filter((change) => change.seq > since) }
  }
}
