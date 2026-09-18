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

- [x] **T-39** ~~No way to play without four friends awake.~~ `/solo` is the
      tutorial's table without the tutoring: same rules, same bots, nobody
      talking over it. Reaches nothing, so like `/learn` it sits before the
      sign-in gate.

      The bots are fair by construction rather than by discipline. `decide`
      takes a `BotView` — its own dice, the claim on the table, how many dice
      are in play — and everybody else's faces are absent from the type, so a
      bot cannot read them however it is written. That is the guarantee the
      real game gets from the server, arrived at the only way it can be in one
      tab. A test deals the other seats two completely different tables, leaves
      the bot's own hand and the public state identical, and demands the same
      decision.

      They also take two to three and a half seconds to answer, varied — a bot
      decides in under a millisecond, and a table where three opponents move
      between blinks is not a fast game, it is a game that already happened.

- [x] **T-38** ~~Nobody can learn this game from the app.~~ `/learn` is a whole
      game against three bots, in the tab, reaching no network and no database
      — so it sits *before* the sign-in gate: the one person who most needs it
      is somebody handed a link to a game they have never heard of, and making
      them commit to the product first is backwards.

      It does not re-implement anything. The table is driven by `src/game`, the
      same module the Edge Function imports, and the screen is the real
      `GameTable`. So the tutorial cannot teach a rule the game does not have,
      or a screen the player will not meet again five minutes later. Every word
      of the lesson comes from `docs/GAME_RULES.md` — these are house rules, and
      Bull, Burst and the Farewell Round do not exist in the game somebody may
      already know.

      The bots are built to be legible rather than strong: they reason the way
      the game asks a person to reason (how many of this face are likely to be
      out there, given my own hand) and they never Burst, because three
      opponents exercising the hardest rule in the game while somebody is
      learning the word "bid" is noise — the lesson demonstrates one Burst
      deliberately instead, scripted so it lands at a moment the player has
      just been told to watch for, and free play stays Burst-free. Tested by
      playing forty whole games and
      asserting every single bot move against the engine's own `checkBid` —
      there is no list of positions a bot can reach, so nothing less covers it.

- [ ] **T-27** `expires_at` only advances when the `rooms` row itself is
      written. A lobby nobody touches for four hours expires even with people
      sitting in it, since joins write `room_members`, not `rooms`. Unlikely to
      bite in practice — creating, starting and host changes all write the row —
      but the sweeper should consider member activity too.
- [ ] **T-26** A sweeper for expired rooms. `expires_at` is maintained and
      indexed, but nothing deletes yet. Not urgent — joins will reject expired
      rooms — but the table grows without it.

- [ ] **T-20** Animations. Done: a die lost or won back (it is lifted off the
      table, or set down on it, on the back of the verdict — the only thing
      that ever changes a player's standing, shown happening to the hand it
      happens to); the deal (every cup shaken for a beat when the round number
      moves); the reveal (cups lifted on the table itself, the count filling
      one die at a time); the Burst interruption (two raps and a flash of light
      across the timber — light rather than colour, because colour is whose and
      light is where to look, and no shake, because a table does not move when
      a person speaks). Still owed: the victory, which now happens on the table
      rather than on a screen of its own — the standings arrive worst first
      with the winner's row last, and what is missing is anything happening to
      the winner's cup.
- [x] **T-21** ~~Reduced-motion support~~ — the media query zeroes every
      duration globally, and the two sequences that are driven by timers rather
      than by CSS — the deal shake and the reveal — each check it and go
      straight to their end state.
- [x] **T-22** ~~Sound, with mute control~~ — dice and cups synthesised, music
      generated (`src/lib/ambient.ts`) unless `/audio/table.mp3` is supplied,
      and a switch on the table that is remembered.
- [ ] **T-23** Accessibility pass: contrast, focus, labels, non-color-only feedback.

## 🐛 Bugs

- [x] **B-11** ~~The music was a hiss.~~ Reported, accurately, as "white noise,
      awful". It was — and the cause is that the whole bed was voiced for a
      speaker this game is never played on. Measured: 78% of its energy sat
      below 400Hz, which a phone speaker a few millimetres across cannot move
      air at. So the chords were inaudible and the one layer that came through
      was the filter skirt of the room tone underneath them.

      The room tone is gone — on monitors it is a nice touch and on a phone it
      was the entire soundtrack. The pad moved up to D above middle C, its
      lowpass opened from 760Hz to 2.2kHz, and it gained a quiet sawtooth: a
      triangle and a sine put almost nothing above their own fundamental, and a
      fundamental is exactly the part a phone cannot produce. Measured after:
      nothing below 150Hz, 28.6% in the band a phone reproduces (was 15.5%
      after the first pass), and spectral flatness 0.009 — firmly tonal, where
      the hiss had made it broadband.

      **This shipped because the levels were raised without listening to what
      was being raised.** Nothing measured the difference between a tone and a
      noise until it was measured on purpose; spectral flatness over the
      phone-audible band is the number that says which one it is.

- [x] **B-10** ~~No sound at all.~~ Four separate causes, found by measuring the
      audio graph rather than by listening.

      1. **iOS silences it.** Web Audio on iOS is governed by the ring/silent
         switch — with the switch flicked to silent, which is how a great many
         phones live all day, the whole graph plays to nobody at full volume,
         with no error and no clue: the context is "running" and the meters
         move. `navigator.audioSession.type = 'playback'` (Safari 16.4+) is what
         separates "this game has a soundtrack" from "your phone just buzzed".
         Guy's own screenshot shows the phone in silent mode, so this is almost
         certainly the one he hit.
      2. **The lobby had none.** Sound existed only on the table, so a player
         waiting for a fourth friend sat in silence with nothing to press. The
         room has music and the switch now, and the tap that opens a room is the
         earliest gesture there is — a browser will not start audio before one.
      3. **Everything was too quiet**, and the balance was wrong: the bed does
         not run through the master gain, so its level is absolute, and at 0.3
         it peaked as loudly as a cup of dice. Measured at the destination, a
         lift now peaks 0.381 against the bed's 0.117 — 3.3× — where the two
         used to be level.
      4. **The music probe relied on a decode failure.** `/audio/table.mp3`
         does not exist, and a single-page host answers it with the app's own
         HTML and a 200, so the element was handed a page to play. The bed
         started only from the resulting `error`. The bed starts immediately now
         and a real track is asked about separately, with a request whose
         content type has to actually be audio.

      Measuring this needed a tap that captures every sample on the audio
      thread: polling from the main thread misses the transients entirely while
      a software renderer has the page at six frames a second, and reported a
      lift as level with the music when it was three times louder.

- [x] **B-9** ~~The host could not start a game.~~ Reported from a real room:
      the Start button was on screen, enabled and correctly wired, and pressing
      it did nothing. It was covered. Both the lobby and the table pull their
      controls up into the band of empty floor at the foot of the scene — the
      lobby by 15.6% of the stage, which is most of the Start button — and a
      positioned box paints above static content, so the stage lay invisibly
      across it and swallowed every press. Introduced with the lobby redesign:
      the table's overlay has carried `pointer-events: none` from the start and
      the lobby's never did, and the negative margin is what made it matter.
      The canvas is now marked non-interactive too, which it always was — it is
      `aria-hidden` for the same reason — so this cannot come back through the
      scene on either screen.

      **Every test this project had was blind to it.** The unit tests run in
      jsdom, which has no layout: it reports a button as visible and enabled
      while a neighbour lies across it. `scripts/test-reachable.mjs`
      (`npm run test:reach`) asks the only question that matters, in a real
      browser at 360, 390 and 430 wide: if a person puts their finger in the
      middle of this control, does the control get it? It names what is in the
      way, and it fails against the bug on nine controls.

      Two more of the same kind have joined it, both for faults nothing in
      jsdom can see. `npm run test:recover` takes the GPU context away with
      WEBGL_lose_context and checks the table comes back — this scene renders
      when something changes and stands still otherwise, so a restored context
      arrives at a canvas with no loop behind it to paint, and the table stayed
      black until a round happened to change a seat. And `npm run look` renders
      the real scene and reports each region as a dark decile, a median and a
      bright decile against `docs/reference.png`: the range is what separates a
      rendered object from a flat fill, and it is exactly what comparing two
      screenshots by eye throws away.

      A fourth has joined them: `npm run test:fit`, for the fault that the
      other three were built to miss. Both of the browser scripts above use a
      deliberately tall window, so that what-covers-what is never confused with
      what is below the fold — and below the fold is exactly where the controls
      went. A web app does not get the screen: iOS Safari keeps a URL bar along
      the bottom, `100vh` is the height the page would have once that bar
      retracts, and it retracts only after the player scrolls. Lie and Bull were
      drawn underneath it. `test:fit` loads the table at the height five real
      phones actually give a page, from an iPhone SE upward, and asks whether
      anything is under the fold, whether the page scrolls at all, and what the
      controls are costing — that last one because the stage gives way to them,
      so "it fits" is otherwise satisfied by a table squeezed to a strip.

      And a fifth, which is the one that covers the screen people actually
      play on: `npm run test:live`. Every check above runs against `/preview`
      or `/solo` — fixtures in a tab, bots in a tab — and the real game is
      `.app > .lobby > .game > .board`, three components deep inside a lobby
      that is still mounted, with a room around it, a server refusing things
      and other people acting at the same moment. That difference has already
      shipped a bug: a rule written against `.app > .game` matched in both
      harnesses and matched nothing in the game. `scripts/harness/` puts an
      in-memory table behind the Supabase client and runs the real Edge
      Function action layer against it, so three browser contexts can sit at
      one table and play: name, create, join, start, bid, Burst, Bull, doubt,
      watch the cups come off, take a Farewell Round, finish the game and go
      back to the lobby — through the code that ships, with only the transport
      replaced. The SQL is still tested as SQL by `npm run test:db`; this
      covers the browser's half, which nothing else could see.

- [x] **B-8** ~~Lie described the wrong bet once a bid had been Bulled.~~ Found
      while verifying, at Guy's request, that pressing Bull does not reveal (it
      does not — see below). A Bull re-reads the claim on the table from "at
      least seven" to "exactly seven" (GAME_RULES §8.1), so doubting it wins on
      eight as readily as on six. The Lie button went on reading "at least",
      and its label went on saying "I say there are fewer than seven". Not a
      wording slip: it described a claim that was no longer there, so a player
      weighing whether to doubt was shown the wrong bet — on a screen that
      disagreed with the bid printed directly above it. It follows the bid's
      current reading now, and a test covers both readings.

      The verification itself: a Bull resolves nothing at any layer. `callBull`
      only writes the Bull marker and hands the turn on; `apply_bull` leaves the
      round at `status = 'bidding'` and never calls `reveal_round`; the client's
      `bull` goes through the ordinary action path, which has no reveal in it.
      Play carries on, a later bid supersedes the Bull (§8.2), and anybody but
      the Bull caller may doubt it. Six tests at the action layer and three on
      the screen now pin it, because Bull and Lie sit side by side on the same
      bar and are both one press — if Bull ever became a second Lie it would end
      a round every time somebody used the strongest bid in the game.

- [x] **B-7** ~~Every player had to press "Next round" for themselves.~~ Reported
      from a real two-browser game: the table waited on six separate taps. The
      round after a resolution is dealt by `apply_challenge` itself, so every
      player was already in it — the button only ever took that client's curtain
      down, and one player putting their phone in a pocket left everybody else
      looking at a result. The result now stands on a deadline and the table
      continues on its own, with the button kept for anyone who has finished
      reading. Not a host's tap: there is nothing here for a host to decide, and
      a slow host would be deciding for everybody. `resultHoldMs` scales with how
      much there is to read — five seconds plus a beat per player whose dice
      changed, capped at nine — so a one-line verdict and a correct Bull that
      empties half the table do not get the same window.

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
