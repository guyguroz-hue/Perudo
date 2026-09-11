# TODO

Completed items are marked `[x]` and kept, not deleted.

## 🔴 Critical

- [x] **T-0** ~~Enable anonymous sign-ins~~ — done, confirmed working live.

- [x] **T-1** ~~Resolve D-001~~ — resolved; migrations are reviewed files.
- [x] **T-2** ~~Resolve D-002~~ — resolved; TS engine in an Edge Function.
- [x] **T-1b** ~~Apply migrations to the live project~~ — applied 2026-09-11.
- [ ] **T-1c** **Manual:** set `main` as the default branch in GitHub settings.
- [x] **T-3** ~~Resolve R-001~~ — false Bull costs its caller a die.
- [x] **T-4a** ~~Resolve R-003/R-004~~ — Farewell queue; no tiebreak on elimination.
- [x] **T-4b** ~~Resolve R-002~~ — whoever was proved right opens.
- [ ] **T-1d** Apply the two new migrations to the live project:
      `20260911180000_round_start_rule.sql` and `20260911190000_dice_ceiling.sql`.
- [ ] **T-5** Design private-dice table + RLS so no player can read another's dice
      (Phase 1 slice 2 — the single highest-risk item in the project).

## 🟠 High priority

- [x] **T-6** ~~Resolve D-003 / D-004~~ — anonymous auth; `main` as trunk.
- [x] **T-7a** ~~Resolve R-005/R-006~~ — Bull may burst; Burst Dudo composes.
- [ ] **T-7b** Resolve **R-008** — Burst and Bull inside a Farewell Round.
- [x] **T-8** ~~Resolve R-007~~ — five dice, enforced in engine and database.
- [x] **T-8b** ~~Confirm R-009~~ — quantity anchors, face is free when it rises.
- [ ] **T-25** Implement the non-default `round_start_rule` paths
      (`loser_starts`, `free_for_all`) plus the UI to choose. The column exists
      and is constrained; the action layer must reject anything but
      `winner_starts` until these are built.
- [x] **T-9** ~~Install Vitest; set up the pure engine test harness~~ — 55 cases.
- [x] **T-10** ~~Phase 1 slice 1 schema + migrations + RLS~~ — locally verified.
- [ ] **T-10b** Phase 1 slice 2: rounds, bids, private dice, reveals, event log.
- [ ] **T-11** Decide min/max players per game (recommend 2–8).
- [ ] **T-12** Keep `player_dice` out of the Realtime publication when it lands;
      the publication test asserts the exact table list, so adding it will fail.

## 🟡 Normal

- [ ] **T-24** Align the deployment source: Vercel's production branch is
      `claude/supabase-git-connection-8jawms`, and GitHub's default branch is
      not yet `main`. Both should point at `main` so there is one source of
      truth and no need to push to two places.

- [x] **T-13** ~~Replace the Vite template app shell~~ — done, template removed.
- [ ] **T-14** Replace the Vite template `README.md` with project documentation.
- [ ] **T-15** Add routing (`/`, `/room/:code`, `/join/:code`).
- [x] **T-16** ~~Design-token foundation~~ — `src/styles/tokens.css`.
- [ ] **T-17** Stable error-code contract shared by client and server.
- [ ] **T-18** Supabase generated types wired into the build.
- [ ] **T-19** Rename `VITE_SUPABASE_ANON_KEY` → `VITE_SUPABASE_PUBLISHABLE_KEY`
      (the value is a `sb_publishable_…` key, not a legacy anon JWT).

## ✨ Polish

- [ ] **T-20** Animations (roll, reveal, die loss/gain, Burst interruption, victory).
- [ ] **T-21** Reduced-motion support.
- [ ] **T-22** Sound, with mute control (non-essential by design).
- [ ] **T-23** Accessibility pass: contrast, focus, labels, non-color-only feedback.

## 🐛 Bugs

- [x] **B-1** ~~Missing env vars threw at module load, so a misconfigured
      deployment rendered a completely blank page — no message, no retry.~~
      Fixed: configuration is reported as state, not thrown, and an
      `ErrorBoundary` now backstops render-time crashes. Verified by building
      with no env vars and confirming the error screen appears.

## 🧹 Technical debt

- [ ] **TD-5** RLS policies call `is_room_member(id)` once per candidate row, so
      `select * from rooms` scales with total room count rather than with the
      caller's rooms. Fine at current scale; revisit with a subquery form if
      lobby queries slow down.
- [ ] **TD-6** `game_players.user_id` is `ON DELETE RESTRICT`, so a user who has
      played cannot be deleted. Deliberate for now (game history integrity);
      an account-deletion/anonymisation policy is a later product decision.
- [ ] **TD-7** `profiles` is not in the Realtime publication, so a display-name
      change does not broadcast. Lobby must refetch. Revisit if it feels stale.

- [x] **TD-1** ~~`SupabaseStatus.tsx` connectivity probe~~ — removed.
- [x] **TD-2** ~~`App.tsx` is the Vite template~~ — replaced.
- [x] **TD-3** ~~No test runner~~ — Vitest.
- [ ] **TD-8** The `Seated` screen in `App.tsx` is a placeholder, not the lobby.
      Clearly labelled as temporary; replace in the lobby phase.
- [ ] **TD-9** `Profile` is hand-typed in `src/features/auth/types.ts`. Replace
      with Supabase generated types once the schema is applied (T-18).
- [ ] **TD-4** No CI pipeline.

## ❓ Questions for Guy

Tracked authoritatively in `DECISIONS.md`: D-001…D-004, R-001…R-008.

## 💡 Future ideas

Recorded only; **not** to be built without an explicit request.

- Spectator mode · match history · reconnect grace timer tuning ·
  localization (Hebrew/English) · PWA install.

> Explicitly **out of scope** (PART 95/96): ranking, matchmaking, currency,
> gambling, monetization, chat, ads, progression.

---

## ✅ Completed

- [x] Vite + React + TypeScript project scaffolded.
- [x] `@supabase/supabase-js` installed; env-driven client created.
- [x] `.env.local` gitignored; `.env.example` committed.
- [x] PHASE 0 audit + `docs/` created.
- [x] `main` branch created and pushed.
- [x] PHASE 1 slice 1: core schema, RLS, and a local verification harness.
- [x] PHASE 2: pure rule engine for the defined rules, 55 tests.
- [x] PHASE 5a: anonymous auth, player identity, design system, app shell.
