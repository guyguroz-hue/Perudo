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

**PHASE 5a — Authentication & identity.** ✅ Complete and visually verified.
Next: the lobby, which needs the server action layer.

**PHASE 2 — Game engine.** The defined rules are implemented and tested. The
engine cannot be completed further without the rule decisions: every undefined
branch raises `UnresolvedRuleError` by design.

Phase 1 slice 2 (rounds, bids, private dice, event log) is the next database
step and also waits on R-001…R-004 for its round-state columns.

## Completed phases

### PHASE 0 — Audit & architecture (in progress)
- [x] Repository inspected (see "Existing state" below).
- [x] Supabase integration inspected (**blocked** — see Risks).
- [x] Project documentation created (`docs/`).
- [x] Roadmap proposed.
- [x] Risks and open decisions identified.
- [x] Owner approval of roadmap.
- [x] Open decisions D-001 … D-004 resolved.

### PHASE 1 slice 1 — identity, rooms, membership, game lifecycle ✅
- [x] `profiles`, `rooms`, `room_members`, `games`, `game_players`.
- [x] Constraints, partial unique indexes, derived elimination column.
- [x] RLS on every table; clients hold SELECT only (plus own profile).
- [x] Membership predicates as `SECURITY DEFINER` functions (recursion-safe).
- [x] Realtime publication limited to the four public tables.
- [x] Local verification harness (`scripts/test-db.sh`) — 11 assertions passing
      against real PostgreSQL, migrations applied as a non-superuser owner.
- [ ] Applied to the live Supabase project (blocked: egress still refused).

### PHASE 2 — game engine (defined rules) ✅
- [x] Pure `src/game` module: no React, no Supabase, no randomness, no clock.
- [x] Counting with the normal-round wildcard and the Farewell suspension of it.
- [x] Bid legality: progression, `ceil(n/2)`, `2n+1`, Farewell face locking.
- [x] Resolution: normal Dudo, Burst Dudo die gain, correct Bull.
- [x] Elimination, victory, Farewell trigger.
- [x] `UnresolvedRuleError` on every undefined branch (R-001/R-003/R-004/R-006).
- [x] 55 Vitest cases covering PARTS 61–68.
- [ ] Remaining rules — blocked on R-001…R-009.

### PHASE 5a — authentication and player identity ✅
- [x] Anonymous sign-in on load; session reused across refreshes.
- [x] Profile creation/rename written straight from the browser — safe because
      the RLS policy pins the row to `id = auth.uid()`.
- [x] Display-name validation mirroring the database constraint exactly.
- [x] Design tokens (felt, wood, brass, bone), reduced-motion support.
- [x] Reusable `Die` and `Button`; the Vite template is gone.
- [x] Deliberate loading and error states; failures explained in plain language.
- [x] Verified in a real browser at 390x844: name screen, validation refusal,
      and seated state, with no console errors.

### PHASE 1 slice 2 — rounds, bids, private dice, event log ⏸️
Blocked on R-001…R-004 for the round-state columns.

## Existing state (as of audit, 2026-09-11)

Everything in the repository was created in this session. There was **no
pre-existing work** — the GitHub repo was empty (zero commits, zero refs).

| Area | State |
|---|---|
| Frontend | Vite `react-ts` scaffold, React 19, TS 6, Vite 8 |
| Components | App shell, `Die`, `Button`, auth screens |
| Routing | ❌ none (deferred until the lobby needs it) |
| Styling system | ✅ design tokens + components |
| Supabase client | ✅ `src/lib/supabaseClient.ts`, env-driven |
| Env vars | ✅ `.env.local` (gitignored), `.env.example` committed |
| Database schema | ✅ slice 1 (identity, rooms, membership, game lifecycle) |
| Migrations | ✅ `supabase/migrations/` — 2 files, locally verified |
| DB functions / RPC | ❌ none |
| Edge Functions | ❌ none |
| RLS policies | ✅ all slice-1 tables, read-only for clients |
| Authentication | ✅ anonymous sign-in + profile identity |
| Tests | ✅ Vitest (62) + SQL/RLS harness (11) |
| CI / deployment | ❌ none |
| Game logic | ✅ pure engine, defined rules, 55 tests |

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
| B-1 | Apply migrations to the live Supabase project | R-NET (egress still refused) |
| B-2 | Inspect live DB schema / RLS / auth config | R-NET |
| B-3 | Integration tests against real Supabase | R-NET |
| B-4 | Implement false-Bull resolution | R-001 |
| B-5 | Implement round-transition / next-starter logic | R-002, R-003, R-004 |
| B-6 | Implement Bull eligibility & Burst interaction | R-005, R-006 |
| B-7 | Implement Burst Dudo die gain | R-007 (ceiling) |

## Known risks

See `ARCHITECTURE.md` § Risks for detail.

- **R-NET (partially mitigated):** egress to `*.supabase.co` is still refused,
  so nothing has reached the live project. Mitigated for correctness by
  `scripts/test-db.sh`, which applies the migrations to a throwaway local
  PostgreSQL instance as a non-superuser owner and asserts the RLS behaviour.
  What it cannot cover: Supabase-specific behaviour (PostgREST, Realtime
  delivery, Auth), which still needs a live run.
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

✅ **Database:** `scripts/test-db.sh` — 11 assertions covering schema invariants,
cross-room RLS isolation, client write refusal, profile ownership, signed-out
access and the Realtime publication surface. All passing.

✅ **Engine:** `npm test` — 55 Vitest cases across counting, bid legality,
Perudo transitions, Dudo, Burst Dudo, Bull, Farewell and elimination, plus
assertions that every undefined rule raises instead of guessing.
❌ **Integration against live Supabase:** blocked by R-NET.

## Production-readiness status

❌ Not started. Prerequisite: Phases 1–9.
