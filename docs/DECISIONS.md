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

---

## ❓ OPEN — architectural (block PHASE 1)

### D-001 — How do database migrations reach the live Supabase project?
- **Context:** This dev environment's egress proxy denies `*.supabase.co`
  (HTTP 403 on CONNECT, confirmed 2026-09-11). Migrations cannot be pushed,
  and the live schema cannot be inspected, from here.
- **Options:** (A) commit SQL migration files; owner pastes/applies them via
  the Supabase dashboard or CLI locally. (B) allow-list `*.supabase.co` in the
  environment's network policy. (C) both.
- **Status:** open.

### D-002 — Where does the authoritative rule engine execute?
- **Context:** Rules must be server-authoritative, atomic under concurrency
  (Burst allows out-of-turn actions), and must not drift between layers.
- **Options:** (A) plpgsql RPC owns all rules. (B) TypeScript Edge Function
  owns all rules; DB does version-checked state swap. (C) hybrid.
- **Status:** open. Highest-leverage decision in the project.

### D-003 — Authentication method
- **Context:** Party game played by friends via invite link; every RLS policy
  keys off `auth.uid()`.
- **Options:** (A) anonymous sign-in + display name. (B) email magic link.
  (C) anonymous with optional upgrade.
- **Status:** open.

### D-004 — Git branching & default branch
- **Context:** The repo had zero commits, so the first push made the feature
  branch `claude/supabase-git-connection-8jawms` the default branch.
- **Options:** (A) create `main` as default, feature branches + PRs.
  (B) keep current branch as trunk.
- **Status:** open.

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
