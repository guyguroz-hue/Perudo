// =============================================================================
// GENERATED — do not edit.
//
// Built from supabase/functions/game/ by `npm run bundle:function`. Edit the
// sources there and regenerate; edits made here are lost on the next build and,
// worse, would be a second copy of rules that are supposed to exist once.
//
// This is the file to paste into the Supabase dashboard:
//   Edge Functions -> Deploy a new function -> Via Editor -> name it `game`
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.116.0";
//#region src/game/errors.ts
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
var UnresolvedRuleError = class extends Error {
	/** Identifier from docs/DECISIONS.md, e.g. `R-001`. */
	ruleId;
	/** The concrete situation that was reached. */
	situation;
	constructor(ruleId, situation) {
		super(`Unresolved house rule ${ruleId}: ${situation}. This outcome is deliberately undefined — see docs/GAME_RULES.md §12. It must be decided by the product owner, not inferred.`);
		this.name = "UnresolvedRuleError";
		this.ruleId = ruleId;
		this.situation = situation;
	}
};
//#endregion
//#region src/game/bids.ts
/**
* Minimum Perudo quantity when switching from a normal face (GAME_RULES §5).
* 4 -> 2, 5 -> 3, 6 -> 3, 7 -> 4, 8 -> 4, 9 -> 5.
*/
function minPerudoQuantity(previousQuantity) {
	return Math.ceil(previousQuantity / 2);
}
/**
* Minimum quantity when switching from Perudo back to a normal face
* (GAME_RULES §6). 4 -> 9, 5 -> 11, 6 -> 13.
*/
function minQuantityAfterPerudo(previousPerudoQuantity) {
	return previousPerudoQuantity * 2 + 1;
}
const ok$1 = { legal: true };
function no(reason, detail) {
	return {
		legal: false,
		reason,
		detail
	};
}
function isFace(value) {
	return Number.isInteger(value) && value >= 1 && value <= 6;
}
/**
* Judge a proposed bid against the current round state.
*
* Returns a verdict rather than throwing, because the client needs the same
* answer to drive the bid builder. The client's copy is a convenience only —
* the authoritative check is this function running server-side (PART 46).
*/
function checkBid(round, next) {
	if (!Number.isInteger(next.quantity) || next.quantity < 1) return no("INVALID_QUANTITY", `quantity must be a whole number of at least 1, got ${next.quantity}`);
	if (!isFace(next.face)) return no("INVALID_FACE", `face must be 1-6, got ${next.face}`);
	return round.type === "farewell" ? checkFarewellBid(round, next) : checkNormalBid(round, next);
}
/**
* Farewell Round (GAME_RULES §10). The opening bid may pick any face, Perudo
* included, and that face is then locked for the rest of the round. Only the
* quantity may rise.
*/
function checkFarewellBid(round, next) {
	const current = round.bid;
	if (current === null) return ok$1;
	const locked = round.lockedFace ?? current.face;
	if (next.face !== locked) return no("FACE_LOCKED", `the face is locked to ${locked} for this Farewell Round`);
	if (next.quantity <= current.quantity) return no("QUANTITY_MUST_INCREASE", `quantity must exceed ${current.quantity}, got ${next.quantity}`);
	return ok$1;
}
function checkNormalBid(round, next) {
	const current = round.bid;
	if (current === null) return next.face === 1 ? no("CANNOT_OPEN_WITH_PERUDO", "a normal round cannot open on Perudo") : ok$1;
	const fromPerudo = current.face === 1;
	const toPerudo = next.face === 1;
	if (fromPerudo && toPerudo) return next.quantity > current.quantity ? ok$1 : no("QUANTITY_MUST_INCREASE", `Perudo quantity must exceed ${current.quantity}, got ${next.quantity}`);
	if (fromPerudo) {
		const minimum = minQuantityAfterPerudo(current.quantity);
		return next.quantity >= minimum ? ok$1 : no("BELOW_MIN_AFTER_PERUDO", `leaving ${current.quantity} Perudos requires at least ${minimum}, got ${next.quantity}`);
	}
	if (toPerudo) {
		const minimum = minPerudoQuantity(current.quantity);
		return next.quantity >= minimum ? ok$1 : no("BELOW_MIN_PERUDO", `switching to Perudo from ${current.quantity} requires at least ${minimum}, got ${next.quantity}`);
	}
	if (next.quantity < current.quantity) return no("MUST_NOT_DECREASE", `the quantity may never fall: ${current.quantity}x${current.face} -> ${next.quantity}x${next.face}`);
	if (next.quantity === current.quantity && next.face <= current.face) return no("FACE_MUST_INCREASE", `holding the quantity at ${current.quantity} means the face must rise above ${current.face}`);
	return ok$1;
}
//#endregion
//#region src/game/resolution.ts
/**
* Resolve a challenge against the current bid.
*
* Everything here is server-authoritative: the count, the verdict and the die
* movements. The client is never told the result it should expect (PART 76).
*
* Every branch below is a decided rule. Where the house rules once left a gap,
* the gap is closed rather than guessed: see docs/DECISIONS.md for what each
* outcome was decided to be and why.
*/
function resolveChallenge(input) {
	const { round, players, actualCount, challengerId, kind } = input;
	const bid = round.bid;
	if (bid === null) throw new Error("resolveChallenge called with no active bid");
	const isBull = bid.bull !== null;
	const claimHolds = isBull ? actualCount === bid.quantity : actualCount >= bid.quantity;
	const dieDeltas = isBull ? resolveBull(bid.bull.callerId, claimHolds, players) : resolvePlainBid(bid.bidderId, claimHolds, challengerId, kind);
	if (isBull && kind === "burst_lie" && !claimHolds) dieDeltas.set(challengerId, (dieDeltas.get(challengerId) ?? 0) + 1);
	return buildOutcome(actualCount, claimHolds, dieDeltas, players, isBull ? claimHolds ? bid.bull.callerId : challengerId : claimHolds ? bid.bidderId : challengerId);
}
/**
* Ordinary bid, read as "at least" (GAME_RULES §7 and §9.2).
*
* Normal Lie never grants a die. Burst Lie is the only move in the game that
* can, and only when the bid it challenged was false.
*/
function resolvePlainBid(bidderId, bidHolds, challengerId, kind) {
	const deltas = /* @__PURE__ */ new Map();
	if (bidHolds) {
		deltas.set(challengerId, -1);
		return deltas;
	}
	deltas.set(bidderId, -1);
	if (kind === "burst_lie") deltas.set(challengerId, (deltas.get(challengerId) ?? 0) + 1);
	return deltas;
}
/**
* Bull, read as "exactly" (GAME_RULES §8.3, §8.4).
*
* Correct: every other active player loses a die and the caller loses nothing —
* the challenger included, since they are among "every participant except the
* Bull caller".
*
* False: the caller alone pays. Declaring an exact count is a strong claim, and
* being wrong costs only the player who made it.
*/
function resolveBull(bullCallerId, bullIsExact, players) {
	const deltas = /* @__PURE__ */ new Map();
	if (!bullIsExact) {
		deltas.set(bullCallerId, -1);
		return deltas;
	}
	for (const player of players) if (player.playerId !== bullCallerId) deltas.set(player.playerId, -1);
	return deltas;
}
function buildOutcome(actualCount, claimHolds, dieDeltas, players, provedRight) {
	const eliminated = [];
	const farewellQueue = [];
	let survivors = 0;
	let lastSurvivor = null;
	const capped = /* @__PURE__ */ new Map();
	for (const player of players) {
		const raw = dieDeltas.get(player.playerId) ?? 0;
		const delta = raw > 0 ? Math.min(raw, Math.max(0, 5 - player.diceCount)) : raw;
		if (delta !== 0) capped.set(player.playerId, delta);
		const after = player.diceCount + delta;
		if (after <= 0) {
			eliminated.push(player.playerId);
			continue;
		}
		survivors += 1;
		lastSurvivor = player.playerId;
		if (after === 1 && delta < 0) farewellQueue.push(player.playerId);
	}
	return {
		actualCount,
		claimHolds,
		dieDeltas: capped,
		eliminated,
		farewellQueue,
		winnerId: survivors === 1 ? lastSurvivor : null,
		gameOver: survivors <= 1,
		nextStarterId: provedRight
	};
}
//#endregion
//#region src/game/random.ts
/**
* A uniform random integer in `[0, bound)`.
*
* Values at or above the largest multiple of `bound` are drawn again rather
* than folded in. A byte taken modulo 6 without that step favours 0–3 by about
* a fifth — the same bias `roll_die()` rejects in SQL, for the same reason.
*/
function randomBelow(bound, bytes) {
	if (!Number.isInteger(bound) || bound < 1 || bound > 256) throw new Error(`randomBelow needs a whole bound in 1..256, got ${bound}`);
	if (bound === 1) return 0;
	const limit = 256 - 256 % bound;
	for (;;) {
		const byte = bytes(1)[0];
		if (byte < limit) return byte % bound;
	}
}
//#endregion
//#region src/game/turns.ts
/**
* The next player clockwise after `afterId` who still holds dice.
*
* Seats are a ring: it wraps, and it skips everyone who is out. If `afterId` is
* the only player left holding dice, it returns them — the caller is resolving
* a game that is already over, and a turn is not what decides that.
*/
function nextActive(players, afterId) {
	const ring = [...players].sort((a, b) => a.seat - b.seat);
	const active = ring.filter((player) => player.diceCount > 0);
	if (active.length === 0) throw new Error("nextActive called with nobody holding dice");
	const from = ring.find((player) => player.playerId === afterId);
	if (from === void 0) throw new Error(`nextActive called with ${afterId}, who is not at this table`);
	return active.find((player) => player.seat > from.seat)?.playerId ?? active[0].playerId;
}
/** Whether acting now would be a Burst: legal, but out of turn (§9.1, §8.5). */
function isBurst(turnHolderId, actorId) {
	return turnHolderId !== null && turnHolderId !== actorId;
}
/**
* Who opens the very first round of a game — chosen at random (R-011).
*
* The house rules say who opens every round after a resolution: whoever was
* proved right (R-002). They say nothing about the first, and every fixed
* answer hands somebody an advantage decided by seating or by who happened to
* create the room. A draw hands it to nobody.
*
* Uniform, and from cryptographic bytes rather than `Math.random`: this decides
* a real advantage, and a predictable draw is not a draw.
*/
function chooseStarter(players, bytes) {
	const active = [...players].filter((player) => player.diceCount > 0).sort((a, b) => a.seat - b.seat);
	if (active.length === 0) throw new Error("chooseStarter called with nobody holding dice");
	return active[randomBelow(active.length, bytes)].playerId;
}
//#endregion
//#region supabase/functions/game/errors.ts
var GameError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.name = "GameError";
		this.code = code;
		this.status = status;
	}
};
/**
* Postgres raises these by name from the apply_* functions. Anything else is a
* genuine fault and is not translated into a polite refusal — a server bug
* should not read to a player like a rule.
*/
function fromPostgres(message) {
	if (message.includes("STALE_STATE")) return new GameError("STALE_STATE", "Somebody else acted first. The table has moved on.", 409);
	if (message.includes("ROUND_ALREADY_OPEN")) return new GameError("ROUND_ALREADY_OPEN", "A round is already under way.", 409);
	if (message.includes("GAME_NOT_ACTIVE")) return new GameError("GAME_NOT_ACTIVE", "This game is not running.", 409);
	return null;
}
//#endregion
//#region supabase/functions/game/actions.ts
/**
* Cryptographic bytes, for the one draw this layer makes.
*
* Deno has WebCrypto; so does every browser, so this is the same source the
* engine's own tests run against.
*/
const bytes = (n) => crypto.getRandomValues(new Uint8Array(n));
async function openRound(store, actor, gameId) {
	requireActive((await store.game(gameId)).status);
	const players = await store.players(gameId);
	requirePlayer(players, actor.id);
	const live = await store.liveRound(gameId);
	if (live !== null) return { roundId: live.id };
	const starter = chooseStarter(players.map((player) => ({
		playerId: player.user_id,
		seat: player.seat,
		diceCount: player.dice_count
	})), bytes);
	return { roundId: await store.openRound(gameId, "normal", starter) };
}
async function placeBid(store, actor, gameId, quantity, face) {
	const { game, round, seated } = await liveState(store, gameId, actor);
	requireStartRule(game.round_start_rule);
	const verdict = checkBid(roundState(round), {
		quantity,
		face
	});
	if (!verdict.legal) throw new GameError("ILLEGAL_BID", verdict.detail);
	const burst = isBurst(round.turn_player_id, actor.id);
	await store.applyBid({
		roundId: round.id,
		version: round.version,
		player: actor.id,
		quantity,
		face,
		burst,
		nextTurn: nextActive(seated, actor.id),
		lockFace: round.type === "farewell"
	});
	return { version: round.version + 1 };
}
async function callBull(store, actor, gameId) {
	const { round, seated } = await liveState(store, gameId, actor);
	if (round.bid_quantity === null) throw new GameError("BULL_NEEDS_BID", "There is no bid to call exact.");
	if (round.bull_player_id !== null) throw new GameError("BULL_ALREADY_CALLED", "This bid has already been Bulled.");
	await store.applyBull({
		roundId: round.id,
		version: round.version,
		player: actor.id,
		burst: isBurst(round.turn_player_id, actor.id),
		nextTurn: nextActive(seated, actor.id)
	});
	return { version: round.version + 1 };
}
/**
* A challenge, resolved and applied.
*
* One request, one response, carrying the whole reveal. The client cannot hold
* anybody's dice in advance — that is what `player_dice` exists to prevent — so
* a round trip here is unavoidable, and the answer arriving in one piece is
* what lets the dramatic pause and the network wait be the same moment
* (docs/GAME_UI.md §5.1).
*/
async function challenge(store, actor, gameId) {
	const { game, players, round, seated } = await liveState(store, gameId, actor);
	requireStartRule(game.round_start_rule);
	const state = roundState(round);
	if (state.bid === null) throw new GameError("NO_BID_TO_CHALLENGE", "There is nothing on the table to doubt.");
	if ((state.bid.bull?.callerId ?? state.bid.bidderId) === actor.id) throw new GameError("SELF_CHALLENGE", "That claim is yours.");
	const kind = isBurst(round.turn_player_id, actor.id) ? "burst_lie" : "lie";
	const actualCount = await store.countFace(round.id, state.bid.face);
	const outcome = resolveChallenge({
		round: state,
		players: seated.map((player) => ({
			playerId: player.playerId,
			diceCount: player.diceCount
		})),
		actualCount,
		challengerId: actor.id,
		kind
	});
	const survivors = new Set(seated.filter((player) => player.diceCount + (outcome.dieDeltas.get(player.playerId) ?? 0) > 0).map((player) => player.playerId));
	const queue = [...round.farewell_queue, ...outcome.farewellQueue].filter((id) => survivors.has(id));
	const nextStarter = queue.length > 0 ? queue[0] : outcome.nextStarterId;
	const nextType = queue.length > 0 ? "farewell" : "normal";
	const nextQueue = queue.length > 0 ? queue.slice(1) : [];
	const applied = await store.applyChallenge({
		p_round_id: round.id,
		p_version: round.version,
		p_challenger: actor.id,
		p_kind: kind,
		p_actual_count: actualCount,
		p_claim_holds: outcome.claimHolds,
		p_deltas: Object.fromEntries(outcome.dieDeltas),
		p_eliminated: outcome.eliminated,
		p_game_over: outcome.gameOver,
		p_winner: outcome.winnerId,
		p_next_starter: outcome.gameOver ? null : nextStarter,
		p_next_type: nextType,
		p_next_queue: nextQueue
	});
	const nameOf = (id) => players.find((player) => player.user_id === id)?.display_name ?? "Player";
	const reveals = applied.reveals ?? [];
	return {
		roundType: round.type,
		quantity: state.bid.quantity,
		face: state.bid.face,
		bidderName: nameOf(state.bid.bidderId),
		bullCallerName: state.bid.bull === null ? null : nameOf(state.bid.bull.callerId),
		challengerName: nameOf(actor.id),
		challengeKind: kind,
		hands: reveals.map((row) => ({
			id: row.player_id,
			name: nameOf(row.player_id),
			dice: row.dice
		})),
		actualCount,
		claimHolds: outcome.claimHolds,
		deltas: Object.fromEntries(outcome.dieDeltas),
		eliminated: outcome.eliminated,
		gameOver: outcome.gameOver,
		winnerId: outcome.winnerId,
		newRoundId: applied.new_round_id ?? null
	};
}
async function liveState(store, gameId, actor) {
	const game = await store.game(gameId);
	requireActive(game.status);
	const players = await store.players(gameId);
	requirePlayer(players, actor.id);
	const round = await store.liveRound(gameId);
	if (round === null) throw new GameError("NO_ROUND", "No round is open.", 409);
	return {
		game,
		players,
		round,
		seated: players.map((player) => ({
			playerId: player.user_id,
			seat: player.seat,
			diceCount: player.dice_count
		}))
	};
}
function roundState(round) {
	return {
		type: round.type,
		lockedFace: round.locked_face,
		bid: round.bid_quantity === null || round.bid_face === null || round.bid_player_id === null ? null : {
			quantity: round.bid_quantity,
			face: round.bid_face,
			bidderId: round.bid_player_id,
			bull: round.bull_player_id === null ? null : { callerId: round.bull_player_id }
		}
	};
}
function requireActive(status) {
	if (status !== "active") throw new GameError("GAME_NOT_ACTIVE", "This game is not running.", 409);
}
function requirePlayer(players, id) {
	const player = players.find((row) => row.user_id === id);
	if (player === void 0) throw new GameError("NOT_A_PLAYER", "You are not in this game.", 403);
	if (player.dice_count <= 0) throw new GameError("ELIMINATED", "You are out of this game.", 403);
	return player;
}
/**
* Two alternative round-start rules are stored as a room setting and are
* explicitly not implemented (R-002). A game created under one of them is
* refused rather than quietly played under a different rule.
*/
function requireStartRule(rule) {
	if (rule !== "winner_starts") throw new UnresolvedRuleError("R-002", `round_start_rule '${rule}' is not implemented`);
}
//#endregion
//#region supabase/functions/game/store.ts
var Store = class {
	#db;
	constructor(db) {
		this.#db = db;
	}
	async game(gameId) {
		const { data, error } = await this.#db.from("games").select("id, status, round_start_rule, room_id").eq("id", gameId).maybeSingle();
		if (error !== null) throw lift(error);
		if (data === null) throw new GameError("GAME_NOT_ACTIVE", "No such game.", 404);
		return data;
	}
	async players(gameId) {
		const { data, error } = await this.#db.from("game_players").select("user_id, seat, dice_count, profiles!game_players_user_id_fkey(display_name)").eq("game_id", gameId).order("seat");
		if (error !== null) throw lift(error);
		return (data ?? []).map((row) => ({
			user_id: row.user_id,
			seat: row.seat,
			dice_count: row.dice_count,
			display_name: nameOf(row.profiles)
		}));
	}
	/** The round still being played, or null between rounds. */
	async liveRound(gameId) {
		const { data, error } = await this.#db.from("rounds").select("id, round_number, type, locked_face, status, bid_quantity, bid_face, bid_player_id, bull_player_id, turn_player_id, farewell_queue, version").eq("game_id", gameId).neq("status", "resolved").maybeSingle();
		if (error !== null) throw lift(error);
		return data ?? null;
	}
	/**
	* How many dice on the table count toward a face.
	*
	* The only thing about anybody's dice this function can learn, and it is a
	* number. Counting happens where the dice already live.
	*/
	async countFace(roundId, face) {
		const { data, error } = await this.#db.rpc("count_face", {
			p_round_id: roundId,
			p_face: face
		});
		if (error !== null) throw lift(error);
		return data;
	}
	async openRound(gameId, type, starter) {
		const { data, error } = await this.#db.rpc("deal_round", {
			p_game_id: gameId,
			p_type: type,
			p_turn_player: starter
		});
		if (error !== null) throw lift(error);
		return data;
	}
	async applyBid(args) {
		const { error } = await this.#db.rpc("apply_bid", {
			p_round_id: args.roundId,
			p_version: args.version,
			p_player: args.player,
			p_quantity: args.quantity,
			p_face: args.face,
			p_burst: args.burst,
			p_next_turn: args.nextTurn,
			p_lock_face: args.lockFace
		});
		if (error !== null) throw lift(error);
	}
	async applyBull(args) {
		const { error } = await this.#db.rpc("apply_bull", {
			p_round_id: args.roundId,
			p_version: args.version,
			p_player: args.player,
			p_burst: args.burst,
			p_next_turn: args.nextTurn
		});
		if (error !== null) throw lift(error);
	}
	async applyChallenge(args) {
		const { data, error } = await this.#db.rpc("apply_challenge", args);
		if (error !== null) throw lift(error);
		return data;
	}
};
function nameOf(profiles) {
	const name = (Array.isArray(profiles) ? profiles[0] : profiles)?.display_name;
	return typeof name === "string" ? name : "Player";
}
function lift(error) {
	return fromPostgres(error.message) ?? new Error(error.message);
}
//#endregion
//#region supabase/functions/game/index.ts
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
const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cors = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS"
};
Deno.serve(async (request) => {
	if (request.method === "OPTIONS") return new Response(null, { headers: cors });
	if (request.method !== "POST") return fail(new GameError("BAD_REQUEST", "POST only.", 405));
	try {
		const actorId = await whoIsCalling(request);
		const body = await request.json();
		const gameId = asString(body.gameId, "gameId");
		const store = new Store(createClient(url, serviceKey));
		const actor = { id: actorId };
		switch (body.action) {
			case "open_round": return ok(await openRound(store, actor, gameId));
			case "bid": return ok(await placeBid(store, actor, gameId, asInt(body.quantity, "quantity"), asFace(body.face)));
			case "bull": return ok(await callBull(store, actor, gameId));
			case "challenge": return ok(await challenge(store, actor, gameId));
			default: return fail(new GameError("BAD_REQUEST", `Unknown action: ${String(body.action)}`));
		}
	} catch (error) {
		return fail(error);
	}
});
/**
* Identity, established by Supabase rather than claimed by the caller.
*
* The token is handed back to Supabase with the anon key, which is the same
* check any ordinary request gets. Reading a user id out of the JWT here
* instead would mean trusting a string the caller supplied.
*/
async function whoIsCalling(request) {
	const authorization = request.headers.get("Authorization");
	if (authorization === null) throw new GameError("NOT_AUTHENTICATED", "No credentials.", 401);
	const { data, error } = await createClient(url, anonKey, { global: { headers: { Authorization: authorization } } }).auth.getUser();
	if (error !== null || data.user === null) throw new GameError("NOT_AUTHENTICATED", "Those credentials are not valid.", 401);
	return data.user.id;
}
function ok(payload) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			...cors,
			"Content-Type": "application/json"
		}
	});
}
/**
* A refusal says which rule refused. A fault says nothing.
*
* An unexpected error's message can carry anything the server happened to be
* holding, so it is logged and not returned — the shape of an internal error is
* itself information, and this server holds dice.
*/
function fail(error) {
	if (error instanceof GameError) return new Response(JSON.stringify({
		error: error.code,
		message: error.message
	}), {
		status: error.status,
		headers: {
			...cors,
			"Content-Type": "application/json"
		}
	});
	if (error instanceof UnresolvedRuleError) {
		console.error("UNRESOLVED RULE", error.ruleId, error.situation);
		return new Response(JSON.stringify({
			error: "UNRESOLVED_RULE",
			message: `This situation is not covered by the house rules yet (${error.ruleId}). It has to be decided rather than guessed.`
		}), {
			status: 501,
			headers: {
				...cors,
				"Content-Type": "application/json"
			}
		});
	}
	console.error("UNHANDLED", error);
	return new Response(JSON.stringify({
		error: "INTERNAL",
		message: "Something broke."
	}), {
		status: 500,
		headers: {
			...cors,
			"Content-Type": "application/json"
		}
	});
}
function asString(value, name) {
	if (typeof value !== "string" || value === "") throw new GameError("BAD_REQUEST", `${name} is required.`);
	return value;
}
function asInt(value, name) {
	if (typeof value !== "number" || !Number.isInteger(value)) throw new GameError("BAD_REQUEST", `${name} must be a whole number.`);
	return value;
}
function asFace(value) {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 6) throw new GameError("BAD_REQUEST", "face must be 1-6.");
	return value;
}
//#endregion
