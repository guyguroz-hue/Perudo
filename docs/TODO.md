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
- [x] **T-1d** ~~Apply round_start_rule and dice_ceiling migrations~~ — applied.
- [x] **T-1e** ~~Apply room_system migration~~ — applied.
- [x] **T-1f** ~~Apply room_actions~~ — applied.
- [x] **T-1g** ~~Apply game_lifecycle~~ — applied.
- [x] **T-1h** ~~Apply rounds_and_private_dice~~ — applied. Live project is current.
- [x] **T-5** ~~Private-dice table + RLS~~ — done, and verified by sabotage:
      the plausible wrong policy and a publication leak both fail the suite.

## 🟠 High priority

- [x] **T-6** ~~Resolve D-003 / D-004~~ — anonymous auth; `main` as trunk.
- [x] **T-7a** ~~Resolve R-005/R-006~~ — Bull may burst; Burst Lie composes.
- [x] **T-7b** ~~Resolve R-008~~ — both permitted; engine already correct.
- [x] **T-8** ~~Resolve R-007~~ — five dice, enforced in engine and database.
- [x] **T-8b** ~~Confirm R-009~~ — quantity anchors, face is free when it rises.
- [ ] **T-25** Implement the non-default `round_start_rule` paths
      (`loser_starts`, `free_for_all`) plus the UI to choose. The column exists
      and is constrained; the action layer must reject anything but
      `winner_starts` until these are built.
- [x] **T-9** ~~Install Vitest; set up the pure engine test harness~~ — 55 cases.
- [x] **T-10** ~~Phase 1 slice 1 schema + migrations + RLS~~ — locally verified.
- [ ] **T-10b** Phase 1 slice 2: rounds, bids, private dice, reveals, event log.
- [x] **T-11** ~~Decide min/max players per game~~ — **three to six**, and not
      as a number the application checks: six seats exist, the unique seat index
      is what refuses a seventh, and `start_game` refuses fewer than three.
- [x] **T-12** ~~Keep `player_dice` out of the Realtime publication~~ — enforced
      by the migration itself and by an exact-list assertion.

## 🟡 Normal

- [ ] **T-24** Align the deployment source: Vercel's production branch is
      `claude/supabase-git-connection-8jawms`, and GitHub's default branch is
      not yet `main`. Both should point at `main` so there is one source of
      truth and no need to push to two places.

- [x] **T-13** ~~Replace the Vite template app shell~~ — done, template removed.
- [ ] **T-14** Replace the Vite template `README.md` with project documentation.
- [x] **T-15** ~~Add routing~~ — `/`, `/join/:code`, `/room/:roomId`.
- [x] **T-16** ~~Design-token foundation~~ — `src/styles/tokens.css`.
- [ ] **T-17** Stable error-code contract shared by client and server.
- [ ] **T-18** Supabase generated types wired into the build.
- [ ] **T-19** Rename `VITE_SUPABASE_ANON_KEY` → `VITE_SUPABASE_PUBLISHABLE_KEY`
      (the value is a `sb_publishable_…` key, not a legacy anon JWT).

## ✨ Polish

- [ ] **T-27** `expires_at` only advances when the `rooms` row itself is
      written. A lobby nobody touches for four hours expires even with people
      sitting in it, since joins write `room_members`, not `rooms`. Unlikely to
      bite in practice — creating, starting and host changes all write the row —
      but the sweeper should consider member activity too.
- [ ] **T-26** A sweeper for expired rooms. `expires_at` is maintained and
      indexed, but nothing deletes yet. Not urgent — joins will reject expired
      rooms — but the table grows without it.

- [ ] **T-20** Animations. Done: the deal (every cup shaken for a beat when the
      round number moves) and the reveal (cups lifted on the table itself, the
      count filling one die at a time). Still owed: a die lost or won, which
      currently just changes a number on a badge; the Burst interruption; and
      the victory.
- [x] **T-21** ~~Reduced-motion support~~ — the media query zeroes every
      duration globally, and the two sequences that are driven by timers rather
      than by CSS — the deal shake and the reveal — each check it and go
      straight to their end state.
- [x] **T-22** ~~Sound, with mute control~~ — dice and cups synthesised, music
      generated (`src/lib/ambient.ts`) unless `/audio/table.mp3` is supplied,
      and a switch on the table that is remembered.
- [ ] **T-23** Accessibility pass: contrast, focus, labels, non-color-only feedback.

## 🐛 Bugs

- [x] **B-6** ~~Opening the first round could reach a player as a server
      fault.~~ Every client opens the first round, because every client is told
      the game started at the same instant — so the race is not rare, it is how
      every game begins, once per player at the table. `deal_round` checked for
      a live round before inserting, which narrows the window and cannot close
      it: two sessions both read "no round yet", and the loser came back with
      `duplicate key value violates unique constraint "rounds_unique_number"`,
      which the Edge Function does not recognise and therefore does not
      translate. Losers outnumber the winner at every table. `deal_round` now
      catches `unique_violation` at the insert and raises `ROUND_ALREADY_OPEN`,
      which the client already handles as the race working.
      `scripts/test-round-race.sh` runs six real sessions into the same instant
      and failed against the old function. Also: the game screen asks once and
      never again, so a genuine failure left an error on a table that never
      arrived with nothing to press. It now offers a retry — except for an
      undecided rule, which will refuse identically forever.

- [x] **B-5** ~~A player's name sat on the cup of the chair behind them.~~ Only
      your own chair hung its badge downward; everybody else's hung upward over
      their cup. At five and six seats the chairs flanking yours stand in front
      of the ones across the table, so their badges landed squarely on the cup
      behind — Alice's name on Carl's cup, every time a room filled up. "Near"
      is a half of the table now, not one chair. An empty chair had the mirror
      fault: anchored at cup height with no cup under it, its invitation floated
      in the room above the table, and at two players three of them hung in the
      window. Those lie flat on the timber now. `src/three/layout.test.ts`
      pins both and fails against the old rule at exactly five and six seats —
      the sizes nobody assembles by hand while working on something else.

- [x] **B-4** ~~Every bid failed with "Something broke".~~ The Edge Function
      logged `Could not find the function public.apply_bid(...) in the schema
      cache`. PostgREST resolves an RPC from the JSON body by matching argument
      names and checking each value can be coerced to the declared type, and a
      JSON number does not resolve to `smallint` — so the function was
      unreachable. The evidence was exact: every function in the schema with a
      smallint parameter failed and every one without worked, which is why
      starting a game and dealing a round were fine. `count_face` had the same
      fault and had simply not been reached, because it takes a challenge to
      call it. Parameters are `integer` now and narrowed inside; the columns
      stay smallint, which was never the problem. **Second fault of the same
      class as B-3, and invisible to the local harness for the same reason** —
      these tests call the functions directly in SQL, where a literal is
      coerced at parse time. `supabase/tests/08_postgrest_contract_test.sql`
      now asserts the two properties a function needs to be reachable at all:
      no smallint parameters, and no overloads. It fails against the old schema
      and names both broken functions.

- [x] **B-3** ~~Opening a room failed with PGRST201.~~ `room_members` points at
      `profiles` twice — through `user_id` and through `removed_by` — so an
      unqualified embed is ambiguous and PostgREST refuses it outright rather
      than choosing. The foreign key is now named explicitly. **This class of
      fault is invisible to the local harness**: it is PostgREST behaviour, not
      PostgreSQL's, and adding a second foreign key to an already-embedded table
      is enough to cause it.

- [x] **B-2** ~~Room failures rendered as `[object Object]`.~~ `toRoomError`
      returned a plain object which `api.ts` then threw; the catching code
      converted it a second time, and because a plain object is not an `Error`
      the conversion stringified it and destroyed the original cause. Now a real
      `Error` subclass, so conversion is idempotent and the message survives.
      Eight regression tests, including one asserting nothing ever renders
      "[object Object]" whatever it is handed.

- [x] **B-1** ~~Missing env vars threw at module load, so a misconfigured
      deployment rendered a completely blank page — no message, no retry.~~
      Fixed: configuration is reported as state, not thrown, and an
      `ErrorBoundary` now backstops render-time crashes. Verified by building
      with no env vars and confirming the error screen appears.

- [x] **T-37** ~~Screens still on the old palette.~~ Done. The bridge block at
      the foot of `src/styles/tokens.css` is empty and no token resolves to
      nothing. `Finish`, the lobby (`RoomScreen`, `RoomTable`, `RoomCode`,
      `Countdown`), the way in (`HomeScreen`, `NameScreen`) and the shared
      parts (`Button`, `ConnectionDot`, `ErrorBoundary`) are all on the new
      system. `Seat` was deleted rather than redesigned: the lobby sits at the
      real table now, so its badges are the table's badges.

## 🧹 Technical debt

- [ ] **TD-10** `UnresolvedRuleError` now has no thrower, since every rule is
      decided. Kept deliberately for the round-state and action-layer work,
      which is likely to surface new ambiguities. Remove it if that turns out
      not to happen.

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
- [x] **TD-8** ~~`Seated` placeholder screen~~ — replaced by the real lobby.
- [x] **T-28** ~~Wire the Start button~~ — starts a real game.
- [x] **T-30** ~~Build the game screens~~ — `features/game/GameTable` carries
      the whole of a round: the rendered table, the bid builder, Lie and Bull,
      and the reveal, which now happens on the table rather than replacing it
      (`RevealPanel` + `revealStage`). All of it can be seen at **`/preview`**,
      driven by fixtures.
- [x] **T-29** ~~`GameView` is a placeholder~~ — replaced by
      `features/game/GameScreen`, which reads the round through RLS, follows it
      over Realtime, and acts through the Edge Function.
- [ ] **T-31** `/preview` is reachable in production. Harmless (it touches no
      network and no database, and is the one screen that works when Supabase
      does not), and useful while the UI is being reviewed on a phone. Decide
      whether it stays once the game screens are wired.
- [x] **T-32** ~~The game action layer~~ — `supabase/functions/game/` runs the
      engine from `src/game` and applies its decisions through `apply_bid`,
      `apply_bull` and `apply_challenge`. Paste `bundle.ts` into the dashboard.
- [x] **T-33** ~~Wire the game screen to the action layer and Realtime~~ — done.
      A game deals its first round once the function is deployed.
- [x] **T-35** ~~A finished game had nowhere to go~~ — nothing set the room to
      `finished`, and `return_to_lobby` only reopens a room that is. A table
      that finished a game could never start another one. Fixed with a trigger
      on `games`, so the room follows whatever completes the game.
- [x] **T-36** ~~Game over showed nothing~~ — `features/game/Finish`, including
      the R-004 case where nobody wins.
- [ ] **T-34** The reveal is rebuilt for non-challengers from the round, the
      reveals and the challenge event. Verified by types and by reading, not yet
      by two browsers against the live project.
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
