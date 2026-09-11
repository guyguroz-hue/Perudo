-- =============================================================================
-- PHASE 1 / part 2 — Row Level Security
-- =============================================================================
-- Threat model (ARCHITECTURE.md §2): the publishable key shipped in the browser
-- is public by design. Assume every player reads DevTools, the Network tab and
-- every Supabase response. RLS is therefore the ONLY thing standing between a
-- curious player and the rest of the table. It is never disabled, not even
-- temporarily during development.
--
-- Two layers of defence, deliberately redundant:
--   1. GRANTS  — clients hold no INSERT/UPDATE/DELETE privilege on game tables
--                at all, so a future policy mistake still cannot authorise a
--                write.
--   2. POLICIES — SELECT is restricted to rooms the caller actually belongs to.
--
-- All mutation happens in the server-side action layer (Phase 3), which
-- authenticates with the Supabase secret key and bypasses RLS after validating
-- the actor, the membership, the state and the rules.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Membership predicates
-- -----------------------------------------------------------------------------
-- These are SECURITY DEFINER on purpose. A policy on room_members that asks
-- "is the caller a member of this room?" by querying room_members would recurse
-- infinitely under RLS. A definer-rights function reads the table with RLS
-- bypassed and returns only a boolean, which leaks nothing beyond what the
-- policy already decides.
--
-- `set search_path = ''` prevents a hostile search_path from resolving these
-- identifiers to attacker-controlled objects; every name below is fully
-- qualified as a result.

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
      and m.left_at is null
  );
$$;

comment on function public.is_room_member(uuid) is
  'True when the calling user is currently seated in the given room.';

create or replace function public.shares_room_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members me
    join public.room_members them on them.room_id = me.room_id
    where me.user_id = auth.uid()
      and me.left_at is null
      and them.user_id = p_user_id
      and them.left_at is null
  );
$$;

comment on function public.shares_room_with(uuid) is
  'True when the calling user currently shares at least one room with the given '
  'user. Gates display-name visibility so profiles are not world-readable.';

create or replace function public.can_view_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.games g
    join public.room_members m on m.room_id = g.room_id
    where g.id = p_game_id
      and m.user_id = auth.uid()
      and m.left_at is null
  );
$$;

-- Visibility follows the ROOM, not the game seat: a player who has been
-- eliminated, or who joined the room mid-game, still watches the table. What
-- they must never see is another player's dice values, and those live in a
-- separate table with an owner-only policy (later slice).
comment on function public.can_view_game(uuid) is
  'True when the calling user is currently seated in the room hosting the game.';

revoke execute on function public.is_room_member(uuid)   from public, anon;
revoke execute on function public.shares_room_with(uuid) from public, anon;
revoke execute on function public.can_view_game(uuid)    from public, anon;
grant  execute on function public.is_room_member(uuid)   to authenticated;
grant  execute on function public.shares_room_with(uuid) to authenticated;
grant  execute on function public.can_view_game(uuid)    to authenticated;

-- The code generator is server-side machinery, not a client capability.
revoke execute on function public.generate_room_code() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Table privileges (defence layer 1)
-- -----------------------------------------------------------------------------
-- Supabase grants broad privileges to anon/authenticated on new public tables
-- by default. Reset that to exactly what the client needs.

revoke all on public.profiles     from anon, authenticated;
revoke all on public.rooms        from anon, authenticated;
revoke all on public.room_members from anon, authenticated;
revoke all on public.games        from anon, authenticated;
revoke all on public.game_players from anon, authenticated;

-- Signed-out callers (`anon`) get nothing at all: every flow in this product,
-- including anonymous play, begins with a real Supabase session.
grant select                 on public.rooms        to authenticated;
grant select                 on public.room_members to authenticated;
grant select                 on public.games        to authenticated;
grant select                 on public.game_players to authenticated;

-- Profiles are the one exception: a player owns their own display name.
grant select, insert, update on public.profiles     to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS (defence layer 2)
-- -----------------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
alter table public.games        enable row level security;
alter table public.game_players enable row level security;

-- NOTE: `FORCE ROW LEVEL SECURITY` is deliberately NOT used. It would subject
-- the table owner to RLS as well, and the membership predicates above run with
-- definer rights as that same owner. Forcing RLS would put them back under the
-- very policies they exist to evaluate, producing
-- "infinite recursion detected in policy for relation room_members".
-- Owner-level access is not part of the threat model: clients never connect as
-- the owner, only as `authenticated` through PostgREST.

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- `(select auth.uid())` rather than a bare `auth.uid()` so Postgres hoists the
-- call into an InitPlan and evaluates it once per query instead of once per row.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.shares_room_with(id)
  );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No DELETE policy: profiles disappear with their auth.users row.

-- -----------------------------------------------------------------------------
-- rooms
-- -----------------------------------------------------------------------------
-- Note what is NOT possible here: a client cannot look a room up by code.
-- Joining goes through the server action layer, which validates the code, the
-- room status and capacity before seating anyone. That keeps room codes from
-- being enumerable by hammering the REST endpoint.

drop policy if exists rooms_select_members on public.rooms;
create policy rooms_select_members
  on public.rooms for select
  to authenticated
  using (public.is_room_member(id));

-- -----------------------------------------------------------------------------
-- room_members
-- -----------------------------------------------------------------------------

drop policy if exists room_members_select_co_members on public.room_members;
create policy room_members_select_co_members
  on public.room_members for select
  to authenticated
  using (public.is_room_member(room_id));

-- -----------------------------------------------------------------------------
-- games
-- -----------------------------------------------------------------------------

drop policy if exists games_select_room_members on public.games;
create policy games_select_room_members
  on public.games for select
  to authenticated
  using (public.is_room_member(room_id));

-- -----------------------------------------------------------------------------
-- game_players
-- -----------------------------------------------------------------------------
-- Exposes seat, dice COUNT and elimination state — all public table knowledge.
-- Dice VALUES are not in this table and never will be.

drop policy if exists game_players_select_room_members on public.game_players;
create policy game_players_select_room_members
  on public.game_players for select
  to authenticated
  using (public.can_view_game(game_id));

-- -----------------------------------------------------------------------------
-- Realtime publication
-- -----------------------------------------------------------------------------
-- Only public state is published. When the private dice table lands in the next
-- slice it must NOT be added here: private dice are fetched by their owner over
-- an RLS-protected read, never broadcast (TODO T-12).

do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'room_members', 'games', 'game_players'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Deliver the previous row on UPDATE/DELETE so clients can diff a change
-- (e.g. "dice_count went 3 -> 2") instead of refetching the whole table.
alter table public.rooms        replica identity full;
alter table public.room_members replica identity full;
alter table public.games        replica identity full;
alter table public.game_players replica identity full;
