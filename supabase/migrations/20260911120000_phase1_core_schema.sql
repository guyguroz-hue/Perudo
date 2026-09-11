-- =============================================================================
-- PHASE 1 / part 1 — Core schema: identity, rooms, membership, game lifecycle
-- =============================================================================
-- Scope: profiles, rooms, room_members, games, game_players.
-- Deliberately NOT in this migration: rounds, bids, private dice, reveals,
-- event log. Those arrive in a later Phase 1 slice once this foundation is
-- verified.
--
-- Security posture established here (see 20260911120100_phase1_rls.sql):
--   * RLS is enabled on every table.
--   * Clients get SELECT only (plus self-service on their own profile).
--   * All game-state mutation happens server-side through the action layer,
--     which authenticates with the Supabase secret key and bypasses RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------

-- Keeps updated_at honest without trusting callers.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Room join codes. Alphabet excludes 0/O/1/I/L to stay readable when a code is
-- spoken aloud or typed from a phone screen. 5 chars over a 31-char alphabet is
-- ~28.6M combinations, ample for concurrent live rooms; the unique constraint
-- on rooms.code makes collisions a retry, not a corruption.
create or replace function public.generate_room_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
           1 + floor(random() * 31)::int, 1),
    ''
  )
  from generate_series(1, 5);
$$;

-- -----------------------------------------------------------------------------
-- profiles — one row per authenticated user (including anonymous sign-ins)
-- -----------------------------------------------------------------------------
-- D-003: players authenticate anonymously and choose a display name. An
-- anonymous Supabase user is a real auth.users row, so auth.uid() and every RLS
-- policy behave identically to a fully registered user.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 24)
);

comment on table public.profiles is
  'Public-facing player identity. Never holds private game information.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- rooms — a persistent lobby that can host a sequence of games
-- -----------------------------------------------------------------------------

create table if not exists public.rooms (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null,
  -- Nullable + ON DELETE SET NULL on purpose. Anonymous accounts accumulate and
  -- will eventually be pruned; ON DELETE RESTRICT would make a host's deletion
  -- fail and block that cleanup. A room may therefore be briefly hostless, and
  -- the action layer promotes a remaining member. Safe precisely because the
  -- host has no authority over game results.
  host_id     uuid        references public.profiles (id) on delete set null,
  status      text        not null default 'lobby',
  max_players smallint    not null default 8,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint rooms_code_format  check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'),
  constraint rooms_code_unique  unique (code),
  constraint rooms_status_valid check (status in ('lobby', 'in_game', 'completed', 'abandoned')),
  constraint rooms_max_players  check (max_players between 2 and 10)
);

comment on column public.rooms.host_id is
  'Lobby administration only. The host is NEVER an authority on game results.';

create index if not exists rooms_host_idx on public.rooms (host_id);

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

-- Join-by-code is the hottest lookup in the lobby flow.
-- (rooms_code_unique already provides the index; named here for intent.)

-- -----------------------------------------------------------------------------
-- room_members — who is seated in a room
-- -----------------------------------------------------------------------------
-- left_at IS NULL means "currently in the room". Leaving is a soft departure so
-- that event history and past games keep referring to a real membership row.
-- Presence/connectivity is deliberately NOT stored here: a dropped connection
-- must never look like leaving the room (PART 37).

create table if not exists public.room_members (
  id        uuid        primary key default gen_random_uuid(),
  room_id   uuid        not null references public.rooms (id) on delete cascade,
  user_id   uuid        not null references public.profiles (id) on delete cascade,
  seat      smallint    not null,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,

  constraint room_members_seat_range check (seat between 0 and 9),
  constraint room_members_unique_user unique (room_id, user_id)
);

-- A seat is only reserved while the member is actually present, so a vacated
-- seat can be reused by the next player to join.
create unique index if not exists room_members_active_seat_idx
  on public.room_members (room_id, seat)
  where left_at is null;

create index if not exists room_members_user_idx
  on public.room_members (user_id)
  where left_at is null;

-- -----------------------------------------------------------------------------
-- games — one playthrough inside a room
-- -----------------------------------------------------------------------------

create table if not exists public.games (
  id            uuid        primary key default gen_random_uuid(),
  room_id       uuid        not null references public.rooms (id) on delete cascade,
  status        text        not null default 'starting',
  starting_dice smallint    not null default 5,
  winner_id     uuid        references public.profiles (id) on delete set null,
  -- Optimistic-concurrency anchor. Every authoritative state transition reads a
  -- version, computes the next state, and commits with
  --   UPDATE ... WHERE id = $1 AND version = $2
  -- A zero-row result means another player won the race -> STALE_STATE.
  -- This matters more here than in ordinary turn-based games because Burst lets
  -- any active player act at any moment (R-CONC-1).
  version       integer     not null default 0,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),

  constraint games_status_valid
    check (status in ('starting', 'active', 'completed', 'abandoned')),
  constraint games_starting_dice_range check (starting_dice between 1 and 6),
  constraint games_version_non_negative check (version >= 0),
  -- A winner may only exist on a completed game.
  constraint games_winner_requires_completion
    check (winner_id is null or status = 'completed')
);

create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- A room may host many games over time, but only one live game at a time.
create unique index if not exists games_one_live_per_room_idx
  on public.games (room_id)
  where status in ('starting', 'active');

create index if not exists games_room_idx on public.games (room_id, created_at desc);

-- -----------------------------------------------------------------------------
-- game_players — a seat at the table for one game
-- -----------------------------------------------------------------------------

create table if not exists public.game_players (
  game_id       uuid     not null references public.games (id) on delete cascade,
  user_id       uuid     not null references public.profiles (id) on delete restrict,
  seat          smallint not null,
  dice_count    smallint not null,
  -- Elimination is DERIVED, never stored independently. This makes the
  -- "dice_count vs eliminated" drift described in PART 77 structurally
  -- impossible rather than merely discouraged.
  is_eliminated boolean generated always as (dice_count = 0) stored,
  eliminated_at timestamptz,
  joined_at     timestamptz not null default now(),

  constraint game_players_pkey primary key (game_id, user_id),
  constraint game_players_seat_range check (seat between 0 and 9),
  -- NOTE: no upper bound on dice_count yet. Burst Dudo grants a die (GAME_RULES
  -- §9.2) and whether a player may exceed their starting count is UNRESOLVED
  -- (R-007). Adding a ceiling now would be inventing a rule. Once R-007 is
  -- answered, add the constraint in a follow-up migration.
  constraint game_players_dice_non_negative check (dice_count >= 0)
);

create unique index if not exists game_players_seat_idx
  on public.game_players (game_id, seat);

create index if not exists game_players_user_idx
  on public.game_players (user_id);

comment on column public.game_players.dice_count is
  'PUBLIC information: every player may see how many dice every other player '
  'holds. The dice VALUES are private and live in a separate table (later slice).';
