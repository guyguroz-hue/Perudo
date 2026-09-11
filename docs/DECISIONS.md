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

| ID | Question |
|---|---|
| R-001 | Consequence of a **FALSE** current Bull |
| R-002 | Who starts the next round after an ordinary (non-Farewell) round |
| R-003 | Farewell starter when **multiple** players reach 1 die simultaneously |
| R-004 | Handling of **multiple eliminations** from one resolution (reachable via correct Bull) |
| R-005 | Bull eligibility — turn-only, or out-of-turn like Burst |
| R-006 | Burst + Bull interaction; may an already-Bulled bid be Bulled again |
| R-007 | Die-gain ceiling on Burst Dudo (can a player exceed 5 dice) |
| R-008 | Are Burst / Bull legal during a Farewell Round; does staying at 1 die re-trigger Farewell |
