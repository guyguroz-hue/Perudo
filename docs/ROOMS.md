# Room & Lobby Architecture — PROPOSAL

> **Status: architecture approved, not implemented.** Milestone 1 output.
> Every product decision it depended on has been made and is recorded in §11.

The room system answers **who is here, where they sit, who hosts, and whether
the game has started.** It does not answer what a player may do — that is the
game engine's job, and the two must not blur together.

---

## 1. What already exists

| Piece | State | Fit for rooms |
|---|---|---|
| `rooms` | code, host, status, max_players | Good bones; **limits are wrong** |
| `room_members` | room, user, seat, joined_at, left_at | Good; needs kick + heartbeat |
| `games` / `game_players` | lifecycle, seats, dice counts | Reusable as-is |
| RLS | SELECT-only for clients, membership-gated | Correct posture, extends cleanly |
| Auth | anonymous sign-in + profile | Exactly the guest model wanted |
| Rule engine | complete, 85 tests | Untouched by this work |
| **Action layer** | **does not exist** | **The main gap** |
| **Routing** | **does not exist** | Needed for `/join/:code` |

The client currently holds **no write privilege on any game table**. That is the
right starting point: every room mutation has to go through a server action.

## 2. Conflicts with the six-player specification

Three existing constraints contradict the new spec and need a migration:

| Constraint | Now | Must be |
|---|---|---|
| `rooms_max_players` | 2–10, default 8 | **exactly 6** |
| `room_members_seat_range` | 0–9 | **0–5** |
| `game_players_seat_range` | 0–9 | **0–5** |

There is also a **room-code problem**. The current alphabet is
`23456789ABCDEFGHJKMNPQRSTUVWXYZ` — it drops `0 O 1 I L` but still contains
both `5` and `S`, which the specification explicitly calls out as confusable.
Proposed replacement:

```
2346789ABCDEFGHJKMNPQRTUVWXYZ     (29 characters, 5 long ≈ 20.5M codes)
```

`B/8` and `Z/2` are the next most confusable pairs if we want to go further.

## 3. How the six-player limit is actually enforced

The requirement is that two simultaneous joins can never both succeed. Three
independent layers, so a bug in any one of them still cannot produce a seventh
player:

1. **A seat is a physical resource.** Seats are `0–5` and there is already a
   partial unique index on `(room_id, seat) where left_at is null`. Two
   transactions claiming the same seat — one is rejected by the database, not by
   application logic.
2. **Joins serialise on the room row.** The join RPC takes
   `SELECT … FROM rooms WHERE id = $1 FOR UPDATE` before allocating, so
   concurrent joins to the same room queue rather than race.
3. **A count check inside that transaction**, which is then trustworthy because
   the row is locked.

The database physically cannot hold seven active members with distinct seats in
`0–5`. This is testable without a browser: two concurrent Postgres sessions
reproduce the race exactly, which is how it will be verified.

## 4. Where room actions run — a clarification of D-002

D-002 put the **rule engine** in a TypeScript Edge Function. Room actions are
not rules, and they need something an Edge Function cannot give: a real
transaction with row locks, so that read → validate → allocate seat → write is
atomic.

Proposed split:

| Action kind | Runs as | Why |
|---|---|---|
| Room & membership — create, join, leave, kick, start, end, rematch, host transfer | **`SECURITY DEFINER` plpgsql RPC** | Transactional, row-locked, single round trip, no game rules so nothing is duplicated |
| Game actions — bid, Bull, Lie, Burst | **Edge Function running `src/game`** | One rule engine, as decided |

This is a **clarification, not a reversal** of D-002: no game rule is being
moved into SQL. Approved 2026-09-11.

## 5. Room lifecycle

Explicit states on `rooms.status`, never scattered booleans:

```
lobby ──► starting ──► in_game ──► finished ──┐
  ▲                                            │
  └──────────── rematch ───────────────────────┘
  
any ──► closed
```

`starting` exists specifically to make Start idempotent. The transition is:

```sql
update rooms set status = 'starting' where id = $1 and status = 'lobby'
```

Zero rows means someone already started — a double-tap, a retried request, or a
second device. The second caller is told the game is already starting rather
than starting it again.

Current statuses are `lobby / in_game / completed / abandoned`; this needs
`starting`, `finished` and `closed`.

## 6. Membership, kicking, and rejoining

`room_members` gains:

- `removed_at`, `removed_by` — a kick, distinct from `left_at` (a voluntary
  departure). Both free the seat; only one blocks return.
- `last_seen_at` — a heartbeat, used **only** for host migration decisions.

**An honest limitation.** Players are anonymous, so a kicked player can clear
their browser storage, obtain a fresh identity, and rejoin. Blocking on
`user_id` stops the casual case — tapping the link again — which is what the
specification actually asks for. It is not a ban system and should not be
described as one. Anything stronger needs real accounts.

## 7. Connection state and host migration

Connection state is **ephemeral and never authoritative**. It lives in Supabase
Realtime Presence, not in the database. A dropped connection must never look
like leaving the room — which is why `room_members` deliberately has no
`connected` column.

Host migration cannot rest on presence, because presence is a client claim.
Proposed: the host changes only through an RPC, triggered by an explicit leave,
or lazily — on the next room action, if the host's `last_seen_at` is older than
the grace period, the host moves to the longest-seated remaining member.
Deterministic, no scheduler required, and no two hosts can exist because the
transition is a single locked update.

**Grace period: 60 seconds** — long enough for a lift or a network handover,
short enough that a room does not sit leaderless.

## 8. Private dice are unaffected

Nothing here touches the private-dice design. The room layer broadcasts
membership, seats, host and lifecycle — all public. Realtime carries only the
four public tables, and the private dice table (still unbuilt) must never be
added to that publication.

## 9. Proposed milestones

| # | Scope | Verifiable by |
|---|---|---|
| ~~2~~ | ~~Schema: limits, lifecycle, kick, heartbeat, code alphabet~~ | **Done.** 10 schema tests + a real 5-way race |
| ~~3~~ | ~~RPCs: create, join by code, leave, kick~~ | **Done.** 12 behaviour tests + the race run through the real RPC |
| ~~4~~ | ~~Routing + lobby UI: seats at a table, code, share, copy~~ | **Done.** Driven in a real browser at 390×844 |
| ~~5~~ | ~~Realtime: joins, leaves, host changes, connection state~~ | **Done bar live multi-device, which only the owner can run** |
| ~~6~~ | ~~Start: host-only, atomic, transition, room lock~~ | **Done.** 10 SQL tests + browser |
| ~~7~~ | ~~Reconnect: refresh, disconnect, host migration~~ | **Done.** Live multi-device still the owner's |
| ~~8~~ | ~~Rematch: results → lobby → same room~~ | **Done.** |

## 9a. How the six-player guarantee was verified

`scripts/test-concurrency.sh` is not a simulation. Five real PostgreSQL
sessions, in five concurrent transactions, all wait for the same wall-clock
instant and then contend for the one free seat. Exactly one wins.

It runs against the schema with **no application-level locking at all**, because
the claim being tested is that the schema alone makes a seventh player
impossible. The row lock the join RPC will take is there to produce a clean
`ROOM_FULL` error instead of a unique-violation — it is not what keeps the
guarantee.

The test was checked for teeth: with `room_members_active_seat_idx` dropped, the
same race seats **seven** players and the test fails. It detects the thing it
claims to detect.

## 9b. The action surface

Five functions are the entire way a client changes a room. Each is
`SECURITY DEFINER` with an empty `search_path`, and each re-derives the actor
from `auth.uid()` — a caller can name a room and a code, never who they are.

| Function | Refuses with |
|---|---|
| `create_room()` | `NOT_AUTHENTICATED`, `PROFILE_REQUIRED` |
| `join_room_by_code(code)` | `INVALID_ROOM`, `ROOM_EXPIRED`, `ROOM_FULL`, `GAME_ALREADY_STARTED`, `REMOVED_FROM_ROOM` |
| `leave_room(room)` | — (leaving a room you are not in is not worth an error) |
| `kick_player(room, user)` | `NOT_HOST`, `CANNOT_KICK_SELF`, `NOT_IN_ROOM`, `INVALID_ROOM` |
| `touch_room_member(room)` | — (a heartbeat that fails is not worth interrupting anyone) |

`require_player` and `ensure_room_host` are internal: revoked from every client
role, reachable only from the actions above, which run as their owner. There is
a test that a client calling them directly is refused.

Joining is **idempotent**, and deliberately still works once a game is under
way — which is what lets a player reload the page mid-game without losing their
seat. It is only *new* players who are turned away after the start.

### Two bugs the tests caught

Worth recording, because both would have been invisible in production:

1. **`room_id` and `seat` are the function's OUT parameters**, so an unqualified
   `where room_id = …` inside the body resolved to those rather than to the
   columns.
2. **`FOUND` is overwritten by every `SELECT INTO`.** The seat lookup is an
   aggregate, which always returns a row, so the later `if found` reported on
   *that* query instead of on whether the player already had a membership. The
   join returned a seat number while writing no row at all — the player would
   have believed they were in a room that did not contain them.

## 9c. The lobby

Routes: `/` (create or join), `/join/:code` (what an invite link lands on),
`/room/:roomId` (the table). Identity is gated ahead of all of them, and the URL
is left alone while a player picks a name — so an invite link survives the
detour and carries on to the room it was sent for.

`useRoom` treats Realtime as a **notification, never a source**. Every event
triggers a refetch through RLS, so what renders is always what the database
would answer rather than a patch applied to a local copy. Six people per room
makes refetching cheap; drift between a local model and the truth is not.

Actions refresh immediately rather than waiting for their own event to come
back. Browser testing is what caught this: the host removed a player and the
count sat unchanged, because Realtime was unreachable in the harness. Realtime
does deliver the change in production — but it is best-effort, and an action
already knows the state moved.

Radix supplies the confirmation dialog: focus trapping, escape, scroll lock and
the accessible roles, with the appearance entirely ours. This is what
`shadcn/ui` is built on, without importing a second design system (D-005).

## 9d. Connection state

Three things can stop changes arriving, and all three are handled the same way:
**re-read everything on the way back.**

| Event | Response |
|---|---|
| Channel resubscribes after an error | Refetch — events during the gap are simply gone |
| Tab becomes visible again | Refetch — phones suspend background tabs and drop the socket silently |
| Browser reports `online` | Refetch |

The distinction that matters is between *the first* subscription and a *re*
subscription. Only the second implies missed events, so only the second forces
a re-read.

The indicator says nothing while the connection is healthy. A permanent green
light is noise, and players should be thinking about the game rather than the
transport. It appears exactly when a still table stops meaning "nobody has
moved" and starts meaning "you are not being told".

Verified in a browser across all three states — Realtime genuinely unreachable
from the test environment, which made it an honest test rather than a simulated
one — with the lobby remaining usable throughout.

## 9e. Starting, ending, replaying

**Starting** is host-only, needs three players, and is guarded by a single
condition: the room must still be in the lobby. That one check is the whole of
double-tap protection — a second caller, whether a second tap, a retried
request or a second device, finds the room already moved on and is told so
rather than starting a second game. Seats carry over, so where someone waited
is where they play.

The countdown runs on the **transition** into a game, not on its presence.
Refreshing mid-game would otherwise replay it every time; there is a browser
test asserting it does not.

**Rematch** leaves membership completely untouched. The same people keep the
same seats, and nobody re-joins. It is a new game row, never a revived one.

**Ending a room** abandons any game still open rather than completing it —
nobody won it, and recording a winner would be a lie.

### Host migration, finally switched on

The earlier version only noticed a host who had actually left. With a heartbeat
arriving every twenty seconds, a host who has gone quiet for a minute can be
stood down too — but only in favour of someone **demonstrably fresher**.

That guard matters more than it looks. Without it, a table where nobody is
reporting in — an older client, a stalled tab, the whole group on a bad
connection — would hand the room around on every action for no reason.

The check lives in the heartbeat, which is where the tests pushed it. Joining
was the wrong home: a player already seated returns early, so the commonest
action in a live room never reached it.

## 10. A testing limitation worth stating up front

This environment cannot reach `*.supabase.co`. Consequences:

- Migrations continue to be applied by hand from the repository.
- Concurrency, RLS and the six-player guarantee **can** be tested properly, via
  concurrent sessions against a local PostgreSQL instance — that is a faithful
  test of the actual mechanism.
- End-to-end multi-client browser tests against the live project **cannot** run
  here. Playwright can drive the UI against a local build with the network
  stubbed, which catches UI and routing faults but not live Realtime behaviour.

This is not theoretical. Opening a room failed in production with PGRST201:
`room_members` gained a second foreign key to `profiles` (`removed_by`), which
made an existing embed ambiguous, and PostgREST refuses an ambiguous embed
rather than choosing one. Every local test passed throughout — the schema was
correct, and PostgREST is not part of it. **Adding a foreign key to a table that
is embedded anywhere is a live-behaviour change**, and worth re-checking against
the real project rather than the harness.

---

## 11. Decisions (all made 2026-09-11)

| Decision | Choice | Why |
|---|---|---|
| **Minimum players** | **3** | The smallest table where Burst and Bull mean anything — a third party can interrupt, and a correct Bull costs more than one player |
| **Room size** | **Fixed at 6** | No setting most people would never touch, one lobby composition to design, fewer states to test |
| **Room actions** | **Postgres RPC**, game actions stay in the Edge Function | Transactions and row locks; no rule is duplicated |
| **UI primitives** | **Radix directly, no Tailwind** | shadcn's accessibility without importing a second design system alongside the existing tokens |
| **Ready system** | **None** | Presence in the lobby is readiness; the host starts when it looks right |
| **Host grace period** | **60 seconds** | Survives a lift or a network handover |
| **Room expiry** | Lobby **4h**, in-game **24h** | A long break must not kill a real game; a forgotten lobby should not outlive the evening |

### Deferred, deliberately

- **Spectator mode** — not implemented, but room state is shaped so it could be.
  A spectator must never receive hidden dice, which needs its own permission
  model.
- **Turn timer** — not in scope. Would change how the game feels and needs its
  own decision.
- **QR code** — after the MVP. Sharing a link and a code covers the need.
- **Room titles** — the code, the host's name and the faces around the table are
  identity enough.
