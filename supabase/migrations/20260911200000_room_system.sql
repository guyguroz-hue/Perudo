-- =============================================================================
-- Room system: six seats, lifecycle, removal, heartbeat, expiry
-- =============================================================================
-- Turns the provisional room tables into the model docs/ROOMS.md describes.
--
-- The central idea: the six-player limit is not a rule the application checks,
-- it is a property of the schema. Seats are 0-5, a seat is unique among present
-- members, and there is no seventh seat to take. Application code cannot get
-- this wrong because the database will not let it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Six seats, everywhere
-- -----------------------------------------------------------------------------
-- max_players is dropped rather than pinned to 6. A column that may only ever
-- hold one value is a second place for the truth to live, and the day it
-- disagreed with the seat range the disagreement would be silent. The seat
-- constraint IS the limit. (Re-adding it later is one migration, if rooms ever
-- become resizable.)

alter table public.rooms drop column if exists max_players;

alter table public.room_members drop constraint if exists room_members_seat_range;
alter table public.room_members
  add constraint room_members_seat_range check (seat between 0 and 5);

alter table public.game_players drop constraint if exists game_players_seat_range;
alter table public.game_players
  add constraint game_players_seat_range check (seat between 0 and 5);

-- -----------------------------------------------------------------------------
-- 2. Room codes without confusable characters
-- -----------------------------------------------------------------------------
-- The previous alphabet dropped 0 O 1 I L but kept both 5 and S, which is the
-- pair people most often mishear when a code is read aloud. 29 characters over
-- 5 positions is ~20.5M codes — collisions are a retry, not a problem.

create or replace function public.generate_room_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('2346789ABCDEFGHJKMNPQRTUVWXYZ',
           1 + floor(random() * 29)::int, 1),
    ''
  )
  from generate_series(1, 5);
$$;

revoke execute on function public.generate_room_code() from public, anon, authenticated;

-- Any code minted under the old alphabet would fail the new constraint. Rooms
-- are short-lived by design and this runs before any have been shared, so they
-- are reissued rather than kept; the loop guards against a collision with an
-- existing code.
do $$
declare
  r record;
  candidate text;
begin
  for r in
    select id from public.rooms
     where code !~ '^[2346789ABCDEFGHJKMNPQRTUVWXYZ]{5}$'
  loop
    loop
      candidate := public.generate_room_code();
      exit when not exists (select 1 from public.rooms where code = candidate);
    end loop;
    update public.rooms set code = candidate where id = r.id;
  end loop;
end;
$$;

alter table public.rooms drop constraint if exists rooms_code_format;
alter table public.rooms
  add constraint rooms_code_format
  check (code ~ '^[2346789ABCDEFGHJKMNPQRTUVWXYZ]{5}$');

-- -----------------------------------------------------------------------------
-- 3. Room lifecycle
-- -----------------------------------------------------------------------------
--   lobby -> starting -> in_game -> finished -> lobby (rematch)
--   any   -> closed
--
-- `starting` is what makes Start idempotent. The transition is
--   update rooms set status='starting' where id=$1 and status='lobby'
-- and a zero-row result means somebody already started: a double tap, a retried
-- request, or a second device. The caller is told, not obeyed.

update public.rooms set status = 'finished' where status = 'completed';
update public.rooms set status = 'closed'   where status = 'abandoned';

alter table public.rooms drop constraint if exists rooms_status_valid;
alter table public.rooms
  add constraint rooms_status_valid
  check (status in ('lobby', 'starting', 'in_game', 'finished', 'closed'));

comment on column public.rooms.status is
  'Room lifecycle. Never inferred from booleans elsewhere; this column is the '
  'only answer to "has the game started".';

-- -----------------------------------------------------------------------------
-- 4. Removal, and the heartbeat
-- -----------------------------------------------------------------------------
-- `left_at is null` remains the single test for "present at the table".
-- Removal sets it too — removed_at records WHY the seat was vacated, so there
-- is still exactly one condition to get right everywhere else.

alter table public.room_members
  add column if not exists removed_at  timestamptz,
  add column if not exists removed_by  uuid references public.profiles (id) on delete set null,
  add column if not exists last_seen_at timestamptz not null default now();

alter table public.room_members drop constraint if exists room_members_removal_implies_departure;
alter table public.room_members
  add constraint room_members_removal_implies_departure
  check (removed_at is null or left_at is not null);

comment on column public.room_members.removed_at is
  'Set when the host removed this member, in addition to left_at. Blocks a '
  'casual rejoin. NOT a ban: players are anonymous, so clearing browser storage '
  'yields a new identity. It stops someone tapping the invite link again, which '
  'is all it is meant to do.';

comment on column public.room_members.last_seen_at is
  'Heartbeat, used ONLY to decide host migration. Never a substitute for '
  'membership: a dropped connection must not look like leaving the room.';

-- -----------------------------------------------------------------------------
-- 5. Expiry
-- -----------------------------------------------------------------------------
-- A forgotten lobby should not outlive the evening, and a long break must never
-- kill a real game. Maintained by trigger rather than by the action layer, so it
-- cannot drift out of date when somebody forgets to set it.

create or replace function public.set_room_expiry()
returns trigger
language plpgsql
as $$
begin
  new.expires_at := now() + case new.status
    when 'in_game' then interval '24 hours'
    when 'closed'  then interval '1 hour'
    else                interval '4 hours'   -- lobby, starting, finished
  end;
  return new;
end;
$$;

alter table public.rooms
  add column if not exists expires_at timestamptz not null default now() + interval '4 hours';

drop trigger if exists rooms_set_expiry on public.rooms;
create trigger rooms_set_expiry
  before insert or update on public.rooms
  for each row execute function public.set_room_expiry();

-- Finding expired rooms to sweep, and rejecting joins to dead ones.
create index if not exists rooms_expires_idx
  on public.rooms (expires_at)
  where status <> 'closed';

comment on column public.rooms.expires_at is
  'Recomputed on every write from the current status: 24h once in game, 4h '
  'otherwise, 1h once closed. Any activity on the room pushes it out.';

-- -----------------------------------------------------------------------------
-- 6. Membership predicate
-- -----------------------------------------------------------------------------
-- Unchanged in meaning, restated here so the new columns are visibly accounted
-- for: removal sets left_at, so "present" is still one condition.

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

revoke execute on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Minimum players
-- -----------------------------------------------------------------------------
-- Three. Not expressible as a constraint — a room passes through 1 and 2 members
-- on its way to 3 — so it is enforced at START_GAME in the action layer.
-- Recorded here so the number lives next to the schema it governs.
comment on table public.rooms is
  'A private table for up to six players. Three are required to start a game; '
  'that minimum is enforced by the start action, since a room legitimately '
  'holds fewer while it is filling up.';
