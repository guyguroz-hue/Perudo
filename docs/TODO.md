# TODO

Completed items are marked `[x]` and kept, not deleted.

## 🔴 Critical

- [x] **T-1** ~~Resolve D-001~~ — resolved; migrations are reviewed files.
- [x] **T-2** ~~Resolve D-002~~ — resolved; TS engine in an Edge Function.
- [ ] **T-1b** Apply `supabase/migrations/` to the live project (egress still refused).
- [ ] **T-1c** **Manual:** set `main` as the default branch in GitHub settings.
- [ ] **T-3** Resolve R-001 — false-Bull consequence. Blocks all Bull resolution.
- [ ] **T-4** Resolve R-002/R-003/R-004 — round-transition & Farewell starter rules.
- [ ] **T-5** Design private-dice table + RLS so no player can read another's dice
      (Phase 1 slice 2 — the single highest-risk item in the project).

## 🟠 High priority

- [x] **T-6** ~~Resolve D-003 / D-004~~ — anonymous auth; `main` as trunk.
- [ ] **T-7** Resolve R-005/R-006/R-008 — Bull eligibility and Burst interaction.
- [ ] **T-8** Resolve R-007 — die-gain ceiling.
- [ ] **T-9** Install Vitest; set up the pure engine test harness.
- [x] **T-10** ~~Phase 1 slice 1 schema + migrations + RLS~~ — locally verified.
- [ ] **T-10b** Phase 1 slice 2: rounds, bids, private dice, reveals, event log.
- [ ] **T-11** Decide min/max players per game (recommend 2–8).
- [ ] **T-12** Keep `player_dice` out of the Realtime publication when it lands;
      the publication test asserts the exact table list, so adding it will fail.

## 🟡 Normal

- [ ] **T-13** Replace the Vite template `App.tsx` / `App.css` with real app shell.
- [ ] **T-14** Replace the Vite template `README.md` with project documentation.
- [ ] **T-15** Add routing (`/`, `/room/:code`, `/join/:code`).
- [ ] **T-16** Design-token / styling foundation (dark felt, wood, tactile).
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

- _(none recorded)_

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

- [ ] **TD-1** `SupabaseStatus.tsx` is a temporary connectivity probe, not a
      product feature. Remove once the real lobby exists.
- [ ] **TD-2** `App.tsx` is still the unmodified Vite template.
- [ ] **TD-3** No test runner installed.
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
