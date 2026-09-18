/**
 * The server's half of the database, as `GameStore`.
 *
 * The action layer in `supabase/functions/game/actions.ts` runs against this
 * unchanged — same interface, same call order, same refusals. What it mirrors
 * are the SECURITY DEFINER functions no browser may call: deal_round,
 * count_face, reveal_round and the three apply_* writes, straight out of the
 * migrations that define them.
 *
 * The version checks are the interesting part and are kept exactly: every write
 * commits against the version it read, and a write that lost that race raises
 * STALE_STATE, which is what turns two players bursting at the same instant
 * into one applied move and one honest refusal rather than two applied moves.
 */
import { randomUUID } from 'node:crypto'

/** A database failure, raised the way `store.ts` lifts one. */
function lift(fromPostgres, message) {
  const named = fromPostgres({ message })
  return named ?? new Error(message)
}

export function createStore(db, fromPostgres) {
  const { tables } = db
  const raise = (message) => {
    throw lift(fromPostgres, message)
  }

  const liveRoundRow = (gameId) =>
    tables.rounds.find((r) => r.game_id === gameId && r.status !== 'resolved') ?? null

  function dealRound(gameId, type, starter) {
    const game = tables.games.find((g) => g.id === gameId)
    if (game === undefined || game.status !== 'active') raise('GAME_NOT_ACTIVE')
    if (liveRoundRow(gameId) !== null) raise('ROUND_ALREADY_OPEN')

    const number =
      tables.rounds
        .filter((r) => r.game_id === gameId)
        .reduce((most, r) => Math.max(most, r.round_number), 0) + 1

    const round = {
      id: randomUUID(),
      game_id: gameId,
      round_number: number,
      type,
      locked_face: null,
      status: 'bidding',
      bid_quantity: null,
      bid_face: null,
      bid_player_id: null,
      bull_player_id: null,
      turn_player_id: starter,
      last_burst_player_id: null,
      farewell_queue: [],
      version: 0,
      resolved_at: null,
    }
    tables.rounds.push(round)

    for (const player of tables.game_players) {
      if (player.game_id !== gameId || player.dice_count <= 0) continue
      tables.player_dice.push({
        round_id: round.id,
        player_id: player.user_id,
        dice: Array.from({ length: player.dice_count }, () => db.rollDie()),
      })
    }
    db.touch('rounds', round)
    return round.id
  }

  return {
    store: {
      async game(gameId) {
        const row = tables.games.find((g) => g.id === gameId)
        if (row === undefined) raise('GAME_NOT_ACTIVE')
        return {
          id: row.id,
          status: row.status,
          round_start_rule: row.round_start_rule,
          room_id: row.room_id,
        }
      },

      async players(gameId) {
        return tables.game_players
          .filter((p) => p.game_id === gameId)
          .sort((a, b) => a.seat - b.seat)
          .map((p) => ({
            user_id: p.user_id,
            seat: p.seat,
            dice_count: p.dice_count,
            display_name:
              tables.profiles.find((profile) => profile.id === p.user_id)?.display_name ??
              'Player',
          }))
      },

      async liveRound(gameId) {
        const row = liveRoundRow(gameId)
        return row === null ? null : { ...row }
      },

      /** count_face: the wildcard rules, and the only thing about the dice that leaves. */
      async countFace(roundId, face) {
        const round = tables.rounds.find((r) => r.id === roundId)
        if (round === undefined) raise('INVALID_ROUND')
        let total = 0
        for (const hand of tables.player_dice) {
          if (hand.round_id !== roundId) continue
          for (const die of hand.dice) {
            if (die === face || (round.type === 'normal' && face !== 1 && die === 1)) total += 1
          }
        }
        return total
      },

      async openRound(gameId, type, starter) {
        return dealRound(gameId, type, starter)
      },

      async applyBid(args) {
        const round = tables.rounds.find((r) => r.id === args.roundId)
        if (round === undefined || round.version !== args.version || round.status !== 'bidding') {
          raise('STALE_STATE')
        }
        round.bid_quantity = args.quantity
        round.bid_face = args.face
        round.bid_player_id = args.player
        // A new bid supersedes the Bull entirely (GAME_RULES §8.2).
        round.bull_player_id = null
        if (args.lockFace && round.locked_face === null) round.locked_face = args.face
        round.turn_player_id = args.nextTurn
        if (args.burst) round.last_burst_player_id = args.player
        round.version += 1

        db.logEvent(round.game_id, round.id, args.player, args.burst ? 'burst_bid' : 'bid', {
          quantity: args.quantity,
          face: args.face,
        })
        db.touch('rounds', round)
      },

      async applyBull(args) {
        const round = tables.rounds.find((r) => r.id === args.roundId)
        if (
          round === undefined ||
          round.version !== args.version ||
          round.status !== 'bidding' ||
          round.bid_quantity === null ||
          round.bull_player_id !== null
        ) {
          raise('STALE_STATE')
        }
        round.bull_player_id = args.player
        round.turn_player_id = args.nextTurn
        if (args.burst) round.last_burst_player_id = args.player
        round.version += 1

        db.logEvent(round.game_id, round.id, args.player, args.burst ? 'burst_bull' : 'bull', {
          quantity: round.bid_quantity,
          face: round.bid_face,
        })
        db.touch('rounds', round)
      },

      async applyChallenge(args) {
        const round = tables.rounds.find((r) => r.id === args.p_round_id)
        if (round === undefined || round.version !== args.p_version || round.status !== 'bidding') {
          raise('STALE_STATE')
        }
        round.status = 'resolved'
        round.resolved_at = new Date().toISOString()
        round.version += 1
        const gameId = round.game_id

        // reveal_round: the one legitimate path from private dice to public.
        for (const hand of tables.player_dice) {
          if (hand.round_id !== round.id) continue
          if (
            tables.dice_reveals.some(
              (r) => r.round_id === hand.round_id && r.player_id === hand.player_id,
            )
          ) {
            continue
          }
          tables.dice_reveals.push({ ...hand, dice: [...hand.dice] })
        }

        for (const [playerId, delta] of Object.entries(args.p_deltas)) {
          const player = tables.game_players.find(
            (p) => p.game_id === gameId && p.user_id === playerId,
          )
          if (player === undefined) continue
          player.dice_count += delta
          if (player.dice_count === 0 && player.eliminated_at === null) {
            player.eliminated_at = new Date().toISOString()
          }
          db.touch('game_players', player)
        }

        db.logEvent(gameId, round.id, args.p_challenger, args.p_kind, {
          actual_count: args.p_actual_count,
          claim_holds: args.p_claim_holds,
          deltas: args.p_deltas,
          eliminated: args.p_eliminated,
        })

        let newRoundId = null
        const game = tables.games.find((g) => g.id === gameId)
        if (args.p_game_over) {
          game.status = 'completed'
          game.winner_id = args.p_winner
          game.version += 1
          db.touch('games', game)
          // The games_finish_room trigger.
          const room = tables.rooms.find((r) => r.id === game.room_id)
          if (room !== undefined && room.status === 'in_game') {
            room.status = 'finished'
            db.touch('rooms', room)
          }
        } else {
          newRoundId = dealRound(gameId, args.p_next_type, args.p_next_starter)
          const next = tables.rounds.find((r) => r.id === newRoundId)
          next.farewell_queue = [...args.p_next_queue]
        }

        db.touch('rounds', round)

        return {
          reveals: tables.dice_reveals
            .filter((r) => r.round_id === round.id)
            .map((r) => ({ player_id: r.player_id, dice: r.dice })),
          standings: tables.game_players
            .filter((p) => p.game_id === gameId)
            .sort((a, b) => a.seat - b.seat)
            .map((p) => ({ player_id: p.user_id, dice_count: p.dice_count, seat: p.seat })),
          new_round_id: newRoundId,
          game_over: args.p_game_over,
          winner_id: args.p_winner,
        }
      },
    },
  }
}
