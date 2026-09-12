# Decision Log

Format: each decision records date, context, alternatives, choice, reasoning,
consequences. **Conversation history is not a source of truth — this file is.**

IDs: `D-xxx` architectural/product · `R-xxx` game rules.

---

## ✅ RESOLVED

### D-000 — Supabase as the sole backend
- **Date:** 2026-09-11
- **Context:** Real-time multiplayer game with hidden information needs an
  authoritative server.
- **Alternatives:** separate Express/Node backend; dedicated VPS; Firebase.
- **Decision:** Supabase only (PostgreSQL + Auth + Realtime + RLS + Edge
  Functions/RPC). No separate backend platform.
- **Why:** Owner directive. RLS gives database-level enforcement of private
  dice, which is the project's central security requirement.
- **Consequences:** Authoritative logic must run in Postgres functions and/or
  Edge Functions. See D-002.

### D-00A — Frontend stack: React + Vite + TypeScript
- **Date:** 2026-09-11
- **Context:** Frontend framework selection for a real-time mobile-first game.
- **Alternatives:** Next.js; plain HTML/JS with no build step.
- **Decision:** React + Vite + TypeScript (SPA).
- **Why:** Owner selection. No SSR requirement; the backend is Supabase, so
  Next.js server features would be unused weight.
- **Consequences:** Static-hostable build. All env vars are `VITE_`-prefixed
  and client-visible, so no secret may ever be placed in them.

### D-00B — Secrets handling
- **Date:** 2026-09-11
- **Context:** Supabase URL + publishable key needed at build/runtime.
- **Decision:** Real values in `.env.local` (gitignored); `.env.example`
  committed with placeholders only; deployment platforms receive them as
  environment variables. Service-role/secret keys never enter this repo.
- **Consequences:** All client-side safety depends on RLS being correct.

### D-001 — Migration delivery path
- **Date:** 2026-09-11
- **Context:** This environment's egress proxy denied `*.supabase.co`.
- **Alternatives:** SQL files only; network allow-list only; both.
- **Decision:** Open network access to Supabase **and** keep every schema change
  as a reviewed file in `supabase/migrations/`.
- **Why:** Files remain the audit trail and the review surface regardless of how
  they are applied; nothing reaches the database without being readable in the
  repository first.
- **Consequences:** Migrations are ordinary reviewable artefacts. Additionally,
  `scripts/test-db.sh` verifies them against a local PostgreSQL instance, so
  correctness never depends on network reachability.
- **Status note (2026-09-11):** egress to `djvwgnwfscuafeioprju.supabase.co`
  was still refused at the time of writing; nothing has been applied to the live
  project yet.

### D-002 — Authoritative rule engine location
- **Date:** 2026-09-11
- **Context:** Rules must be server-authoritative, atomic under the concurrency
  Burst creates, and must not diverge between layers.
- **Alternatives:** (A) all rules in plpgsql RPC — fastest and atomic, but the
  rules would exist twice, once in SQL and once in TypeScript for the bid
  builder. (C) split lobby/game across both platforms.
- **Decision:** **(B)** One TypeScript engine in `src/game`, imported by a
  Supabase Edge Function which holds authority, and by the client for UI hints
  only. State is committed through a version-checked atomic write.
- **Why:** A single engine removes the drift risk outright, and a pure TS module
  is unit-testable without a database. The spec requires a domain layer testable
  independently of React.
- **Consequences:** Occasional Edge Function cold start (~300ms) on an action.
  Concurrency is handled by optimistic version checks with retry rather than
  by holding a database lock across the whole action. Under Burst contention
  the loser receives `STALE_STATE` — which is the correct game outcome anyway,
  since the first Burst to land wins.

### D-003 — Authentication
- **Date:** 2026-09-11
- **Decision:** Anonymous sign-in plus a chosen display name.
- **Alternatives:** email magic link; anonymous with optional upgrade.
- **Why:** A party game played over an invite link cannot afford a sign-up step.
  Anonymous users are real `auth.users` rows, so `auth.uid()` and every RLS
  policy behave identically.
- **Consequences:** Abandoned anonymous accounts accumulate and will need
  pruning. `rooms.host_id` is therefore `ON DELETE SET NULL` rather than
  `RESTRICT`, so deleting a stale account cannot be blocked by a room it once
  hosted.

### D-004 — Branching model
- **Date:** 2026-09-11
- **Decision:** `main` is the trunk; work continues on feature branches.
- **Why:** The repository had no commits, so the first push made a feature
  branch the default. Corrected before history accumulated.
- **Consequences:** `main` has been created and pushed. **Manual step required:**
  set `main` as the default branch in GitHub repository settings.

---

## ❓ OPEN — game rules (block PHASE 2)

Full statements in `GAME_RULES.md` §12. **None may be implemented until
resolved. Do not invent behavior.**

### ✅ R-001 — false Bull (2026-09-11)
The **Bull caller alone loses a die**, whether the real count is above or below
the declared one. Nobody else is affected, the challenger included.
*Consequence:* Bull becomes a genuine gamble in both directions — correct, it
costs everyone else a die; wrong, it costs only you.

### ✅ R-003 — simultaneous Farewell Rounds (2026-09-11)
Every player driven to one die is **queued** for their own Farewell Round; the
order among them is arbitrary. The engine uses seat order — deterministic and
replayable, which matters more for an authoritative server than randomness does.
Also settled: the trigger is the **transition** down to one die. Parking on one
die earns nothing further; regaining a die and dropping again earns a new one.
*Consequence:* the queue is game state that must survive across rounds.

### ✅ R-004 — simultaneous elimination (2026-09-11)
Order carries no meaning and no tiebreak is applied. An eliminated player is
never awarded the win. One player left holding dice wins; none left means **no
winner**.
*Consequence:* the no-winner branch appears unreachable under current rules
(every resolution spares somebody), but is implemented as specified.

### ✅ R-002 — who opens the next round (2026-09-11)
**Whoever was proved right**, with a Farewell Round taking precedence.
Two answers had been given that disagreed — "whoever lost a die" and "whoever
won the bet" — which name different players in an ordinary Dudo. Resolved in
favour of the winner.
*Consequence:* the starter is always a surviving player, since being right never
costs a die, so the round transition needs no fallback. Alternatives
(`loser_starts`, `free_for_all`) are stored as a room setting but unimplemented.

### ✅ R-005 — Bull eligibility (2026-09-11)
A Bull is a bet like any other, so it may be declared **out of turn as a Burst**.
*Consequence:* turn validation must treat Bull the same as a Burst bid; the
action layer, not the engine, enforces this.

### ✅ R-006 — Burst Dudo against a Bull (2026-09-11)
Burst Dudo works against a Bull exactly as against any other bid. The two rules
turned out to **compose without conflict**: when the Bull is false the caller
pays and the burster gains; when it is exact, "everyone except the Bull caller
loses one" already charges the mistaken burster their die, so only the gain
needed adding.
*Consequence:* bursting does **not** shield the rest of the table from a correct
Bull. That reading was chosen because nothing in the rule suspends the Bull
resolution — worth confirming if the intent was a two-player duel instead.

### ✅ R-007 — dice ceiling (2026-09-11)
**Five dice, never more, in any situation.** A Burst Dudo won by a player already
at five grants nothing; the loser still loses theirs.
*Consequence:* enforced in the database as well as the engine, so a bug in the
action layer cannot mint a sixth die. `games.starting_dice` was narrowed from
1–6 to 1–5 to match.

### ✅ R-009 — bid progression (2026-09-11)
**The quantity is the anchor and may never fall.** Raise it and the face may go
anywhere — `4 fives → 5 fours` is legal. Hold it and the face must rise.
*Consequence:* this is tournament Perudo's rule, and it replaced the stricter
literal reading the engine had been using.

### ✅ R-008 — Burst and Bull in a Farewell Round (2026-09-11)
**Both fully permitted.** A Farewell Round changes what counts and what may be
bid; it does not change who may act or how a challenge resolves.
*Consequence:* none in the engine — the rules were already orthogonal, and the
tests added for this confirmed existing behaviour rather than changing it.

### ✅ D-006 — The Perudo face (2026-09-11)
The one is drawn as an **Andean serpent-hook glyph**, not a pip. Owner chose the
faithful drawing from rendered options at real sizes.

Drawn rather than copied: the mark on commercial Perudo dice is somebody's
artwork, so this is a piece in that spirit rather than a reproduction.

**Two levels of detail**, chosen by size. The full drawing is used from 30px up;
below that a reduction with the same gesture and fewer strokes takes over,
because the interior of the full drawing collapses into a smudge at the size a
player scans the table with — and that is the size they see most. Standard icon
practice, not a compromise.

Dark like the pips, not brass. The shape already carries the distinction, and a
brass mark pulls the eye harder than it deserves in a hand of five.

Stroke weight is matched to pip diameter rather than chosen by eye. A measured
check confirmed the ink is fully black; a thin line simply covers less area than
a solid dot, so the face reads a little lighter. That is inherent to a drawn
mark and accepted.

*Consequence:* the same component serves the bid builder, a player's hand and
the reveal, so the three cannot drift apart.

### ✅ D-005 — Room system decisions (2026-09-11)
- **Minimum 3 players**, room **fixed at 6**.
- **Room actions run as Postgres RPCs**; game actions stay in the Edge Function.
  A clarification of D-002, not a reversal: room membership is not a game rule,
  and it needs transactions and row locks that an Edge Function cannot provide.
- **Radix primitives, no Tailwind.** shadcn was specified, but it requires
  Tailwind and the project already has a working token system. Radix is what
  shadcn is built on, so this keeps the accessibility and drops the second
  design system.
- **No Ready system** — the host starts; presence is readiness.
- **Host grace period 60s**, then deterministic migration.
- **Room expiry**: lobby 4h, in-game 24h.
- Deferred: spectators, turn timer, QR codes, room titles.

Full reasoning in `docs/ROOMS.md`.

### ✅ D-007 — The bid builder offers the table, not infinity (2026-09-11)

Nothing in the rules caps a bid's quantity, so the legal range is unbounded.
The builder's quantity control stops at the number of dice on the table.

*Why this removes no move:* every bid above the table total is certainly false,
so all of them are the same bid in play — a doomed one. A player cornered into
a minimum above the table total can still reach it, because the range opens to
whatever the lowest legal quantity is. What the control will not do is make a
thumb travel through sixty values that differ in nothing.

*Where it is enforced:* `quantityBounds` in `src/game/builder.ts`. The server's
own check is `checkBid`, which does not cap anything — this is an affordance,
not a rule, and it is deliberately not in the rules module's judgement.

### ✅ D-008 — The builder derives its options from `checkBid` (2026-09-11)

A bid builder needs answers `checkBid` does not give: which faces are offerable
at this quantity, how low the quantity may go, where to open. Every one of them
is found by asking `checkBid` over a few hundred pairs, never by restating the
rule.

*Why not compute them directly:* it would be faster and it would be a second
implementation of the bid rules. The options a player can reach and the rules
the server enforces would then be two things that agree until they do not.

*What it turned up:* the lowest legal bid is not the raise anyone wants. Against
four fives it is **two Perudos**, because switching to the wildcard lets the
quantity fall (GAME_RULES §5). Opening the builder there would have buried the
ordinary raise behind a wildcard jump. `minimalRaise` is therefore a separate
question from `lowestLegalBid`, and the distinction only surfaced because the
search asked the rules instead of assuming them.

### ✅ D-009 — the turn moves on from whoever acted (2026-09-11)

A Burst is not a special case in the turn order. After anybody bids or calls
Bull — in turn or out of it — play continues clockwise from **them**.

*Why this is the rule and not a choice:* GAME_RULES §9.1 says normal play
resumes with the player **after the last Burst player**. Applying "the turn
moves on from the actor" uniformly produces exactly that, and produces ordinary
clockwise play when nobody bursts. One rule, both cases.

*Consequence:* `src/game/turns.ts` is eight lines, and `last_burst_player_id` is
kept for the log and for display rather than for computing anything.

---

### ✅ R-011 — who opens the first round: **drawn at random** (2026-09-12)

R-002 says who opens every round after a resolution. Nothing said who opens the
first, and the two obvious answers — the host, or the lowest seat — name
different players whenever the host has migrated, and both hand somebody an
advantage decided by seating or by who happened to create the room.

Answered by the owner: **a completely random draw, so that it is fair.** A draw
gives the advantage to nobody rather than giving it to somebody by accident.

*Consequence:* `chooseStarter` in `src/game/turns.ts`, uniform over the players
holding dice, from cryptographic bytes rather than `Math.random` — this decides
a real advantage, and a predictable draw is not a draw. Bytes at or above the
largest multiple of the candidate count are drawn again rather than folded in,
the same bias `roll_die()` rejects in SQL.

*Why it is not in the database, unlike the dice:* dice live in Postgres because
they must stay secret, not because they must be random. Who opens is public the
moment it is decided, so it only has to be unbiased — and in the engine it can
be tested, which uniformity in SQL cannot easily be.

---

## ❓ STILL OPEN — game rules

One, raised rather than guessed, and reached by building the action layer. It
is not a gap in the original specification: it is a situation the rules had no
reason to mention until something had to execute it.

### ❓ R-010 — a second Bull on the same bid

A Bull re-reads the current bid as "exactly" (§8.1) and any later bid
supersedes it (§8.2). What is not said is whether a *second* player may Bull a
bid that has already been Bulled — and it matters, because the Bull caller is
who pays when the Bull is false and who is spared when it is exact.

*Status:* refused, in the action layer and again in `apply_bull`. Refusing
declines to invent the semantics; allowing it would have had to invent them.
Not blocking: the game plays without ever needing a second Bull.
