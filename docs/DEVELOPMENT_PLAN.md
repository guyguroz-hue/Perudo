# Development Plan

## Project goal

A real online multiplayer implementation of a **custom house-rule Perudo /
Liar's Dice** game: real-time, hidden information, server-authoritative rules,
secure private dice, persistent rooms, reconnection, polished mobile-first UI.

Not a demo. Not single-player. Not generic Perudo — see `GAME_RULES.md`.

**Stack:** React + Vite + TypeScript + Supabase (PostgreSQL, Auth, Realtime,
RLS, Edge Functions and/or RPC). Supabase is the *only* backend.

---

## Current phase

**PHASE 0 — Audit & Architecture.** ⏸️ Awaiting owner approval of roadmap and
answers to open decisions before PHASE 1 begins.

## Completed phases

### PHASE 0 — Audit & architecture (in progress)
- [x] Repository inspected (see "Existing state" below).
- [x] Supabase integration inspected (**blocked** — see Risks).
- [x] Project documentation created (`docs/`).
- [x] Roadmap proposed.
- [x] Risks and open decisions identified.
- [ ] Owner approval of roadmap.
- [ ] Open decisions D-001 … D-004 resolved.

## Existing state (as of audit, 2026-09-11)

Everything in the repository was created in this session. There was **no
pre-existing work** — the GitHub repo was empty (zero commits, zero refs).

| Area | State |
|---|---|
| Frontend | Vite `react-ts` scaffold, React 19, TS 6, Vite 8 |
| Components | `App.tsx` (Vite template), `SupabaseStatus.tsx` (connection probe) |
| Routing | ❌ none |
| Styling system | ❌ none (Vite template CSS only) |
| Supabase client | ✅ `src/lib/supabaseClient.ts`, env-driven |
| Env vars | ✅ `.env.local` (gitignored), `.env.example` committed |
| Database schema | ❌ none |
| Migrations | ❌ none (no `supabase/` directory, no CLI) |
| DB functions / RPC | ❌ none |
| Edge Functions | ❌ none |
| RLS policies | ❌ none |
| Authentication | ❌ not configured |
| Tests | ❌ none (no runner installed) |
| CI / deployment | ❌ none |
| Game logic | ❌ none |

Build (`npm run build`) and lint (`npm run lint`) pass clean.

---

## Upcoming phases

| Phase | Name | Gate |
|---|---|---|
| 1 | Database & security foundation | D-001…D-004 answered |
| 2 | Game engine & rule validation (pure, tested) | R-001…R-008 answered |
| 3 | Authoritative multiplayer actions | Phase 1 + 2 |
| 4 | Realtime synchronization | Phase 3 |
| 5 | Authentication & lobby | Phase 1, 4 |
| 6 | Core game UI | Phase 4, 5 |
| 7 | Special mechanics UI (Bull / Burst / Farewell) | Phase 6 |
| 8 | Polish, animation, UX | Phase 7 |
| 9 | Testing & security hardening | Phase 8 |
| 10 | Production readiness | Phase 9 |

Phases 1 and 2 are independent and may proceed in parallel: Phase 2 is a pure
TypeScript engine with zero Supabase dependency, so it can be built and tested
even while the network block (R-NET) is unresolved.

---

## Blocked tasks

| ID | Task | Blocked by |
|---|---|---|
| B-1 | Apply any migration to the live Supabase project | R-NET (egress blocked) |
| B-2 | Inspect live DB schema / RLS / auth config | R-NET |
| B-3 | Integration tests against real Supabase | R-NET |
| B-4 | Implement false-Bull resolution | R-001 |
| B-5 | Implement round-transition / next-starter logic | R-002, R-003, R-004 |
| B-6 | Implement Bull eligibility & Burst interaction | R-005, R-006 |
| B-7 | Implement Burst Dudo die gain | R-007 (ceiling) |

## Known risks

See `ARCHITECTURE.md` § Risks for detail.

- **R-NET (blocking, operational):** this development environment's egress
  proxy denies `*.supabase.co` (HTTP 403 on CONNECT). No migrations, no schema
  inspection, no live testing from here.
- **R-SEC-1:** private dice are the core security asset. A single wrong RLS
  policy or over-broad Realtime publication leaks the game.
- **R-CONC-1:** Burst allows out-of-turn actions, which massively widens the
  concurrency surface versus turn-based play.
- **R-DRIFT-1:** if rules live in both SQL and TypeScript they will drift.
- **R-RULE-1:** 8 unresolved rules block Phase 2 completion.

## Decisions required

Tracked in `DECISIONS.md` (D-xxx architectural, R-xxx rules). All currently
**open**: D-001…D-004, R-001…R-008.

## Testing status

❌ No test runner installed. Planned: **Vitest** for the pure engine (Phase 2),
plus SQL-level policy tests and multiplayer integration tests (Phase 9).

## Production-readiness status

❌ Not started. Prerequisite: Phases 1–9.
