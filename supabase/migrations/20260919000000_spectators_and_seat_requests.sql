-- =============================================================================
-- Watching a table, and asking to sit at one
-- =============================================================================
-- Safe to re-run.
--
-- Two things a room could not do. A table that had started was a closed door:
-- somebody who tapped the invite link a minute late got "that game is already
-- under way" and nothing else, and a table of six had no way to let a seventh
-- friend follow along at all.
--
-- The whole design rests on one decision: a spectator IS a room member, with no
-- seat. Every read policy in this schema is already written against
-- `is_room_member`, so watching needs no new policy and — more to the point —
-- no new way for anyone to read anything. The one table that matters is
-- `player_dice`, whose policy names a single player and not a room, so a
-- spectator sees no hand at all. What they see is exactly what every player at
-- the table already sees about everyone else: seats, dice counts, bids, the
-- log, and the hands a challenge makes public.
--
-- Asking for a seat is a column on the same row rather than a table of its own.
-- A request is a fact about a membership — this person, in this room, would
-- like to sit down — and it is already delivered live, because clients watch
-- `room_members` for the seat list.
--
-- What a seat request does NOT do is add anybody to the game in progress.
-- Players and their dice are fixed when a game starts, and there is no honest
-- number of dice to hand someone who arrives at round nine. An approved player
-- takes a seat and plays from the next game; until then they watch, like
-- everybody else waiting.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A member who is not playing
-- -----------------------------------------------------------------------------

alter table public.room_members
  add column if not exists role text not null default 'player';

alter table public.room_members drop constraint if exists room_members_role_valid;
alter table public.room_members
  add constraint room_members_role_valid check (role in ('player', 'spectator'));

-- A spectator has no seat, and the schema says so rather than the application
-- remembering to. The seat range moves with it: null is now a real answer.
alter table public.room_members alter column seat drop not null;

alter table public.room_members drop constraint if exists room_members_seat_range;
alter table public.room_members
  add constraint room_members_seat_range check (seat is null or seat between 0 and 5);

alter table public.room_members drop constraint if exists room_members_seat_matches_role;
alter table public.room_members
  add constraint room_members_seat_matches_role check (
    (role = 'player'    and seat is not null) or
    (role = 'spectator' and seat is null)
  );

-- The six-seat limit is still the unique index and not a check anywhere: a
-- spectator holds no seat, so any number of them can watch a full table.
-- Postgres treats nulls as distinct in a unique index, which is exactly the
-- behaviour wanted here and is worth saying out loud, because it is the whole
-- reason this needs no second index.

-- -----------------------------------------------------------------------------
-- 2. Asking for one
-- -----------------------------------------------------------------------------
-- Two timestamps rather than a status column. `asked_at` is set while a request
-- is outstanding and cleared when it is answered either way, so "who is waiting"
-- is a null check and cannot drift; `answered_at` is kept so the asker can be
-- told the host has seen it.

alter table public.room_members add column if not exists asked_at    timestamptz;
alter table public.room_members add column if not exists answered_at timestamptz;

-- Only a spectator can have a request outstanding. Approving one seats them,
-- which clears it in the same statement.
alter table public.room_members drop constraint if exists room_members_only_spectators_ask;
alter table public.room_members
  add constraint room_members_only_spectators_ask
  check (asked_at is null or role = 'spectator');

comment on column public.room_members.role is
  'player holds a seat and plays; spectator holds none and watches. Both are '
  'members, which is what every read policy in this schema is written against.';

-- -----------------------------------------------------------------------------
-- 3. SPECTATE_ROOM
-- -----------------------------------------------------------------------------
-- The way in to a table you cannot sit at. Unlike join_room_by_code this does
-- not care whether the room is full or whether a game is running: there is no
-- seat to contend for.

create or replace function public.spectate_room(p_code text)
returns table (room_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player  uuid := public.require_player();
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_room    public.rooms%rowtype;
  v_member  public.room_members%rowtype;
  v_has_row boolean;
begin
  select * into v_room from public.rooms r where r.code = v_code for update;
  if not found then
    raise exception 'INVALID_ROOM';
  end if;
  if v_room.expires_at <= now() or v_room.status = 'closed' then
    raise exception 'ROOM_EXPIRED';
  end if;

  select * into v_member
    from public.room_members m
   where m.room_id = v_room.id and m.user_id = v_player;
  v_has_row := found;

  if v_has_row and v_member.removed_at is not null then
    raise exception 'REMOVED_FROM_ROOM';
  end if;

  -- Already here, in whatever capacity. Watching is not a demotion: a seated
  -- player who opens the link again keeps their seat.
  if v_has_row and v_member.left_at is null then
    return query select v_room.id;
    return;
  end if;

  if v_has_row then
    update public.room_members as m
       set role = 'spectator',
           seat = null,
           left_at = null,
           asked_at = null,
           answered_at = null,
           last_seen_at = now()
     where m.room_id = v_room.id and m.user_id = v_player;
  else
    insert into public.room_members (room_id, user_id, seat, role)
    values (v_room.id, v_player, null, 'spectator');
  end if;

  return query select v_room.id;
end;
$$;

comment on function public.spectate_room(text) is
  'Joins a room as a spectator: no seat, no approval, and it works on a table '
  'that is full or already playing.';

-- -----------------------------------------------------------------------------
-- 4. ASK_FOR_SEAT
-- -----------------------------------------------------------------------------
-- One function for two situations, because from the asker''s side it is one
-- button. In a lobby there is nothing to approve — anybody with the code can
-- walk in — so a free seat is taken on the spot. During or after a game the
-- host decides, and the request goes to them.
--
-- Returns which of the two happened, so the screen can say the right thing
-- without asking again.

create or replace function public.ask_for_seat(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := public.require_player();
  v_room   public.rooms%rowtype;
  v_member public.room_members%rowtype;
  v_seat   smallint;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for update;
  if not found then
    raise exception 'INVALID_ROOM';
  end if;
  if v_room.status = 'closed' then
    raise exception 'ROOM_EXPIRED';
  end if;

  select * into v_member
    from public.room_members m
   where m.room_id = p_room_id and m.user_id = v_player and m.left_at is null;
  if not found then
    raise exception 'NOT_IN_ROOM';
  end if;
  if v_member.role = 'player' then
    return 'seated';                              -- already has one
  end if;

  -- Asked for whether or not it is granted now: there is no point telling
  -- somebody the host will think about it when the table physically cannot
  -- take them.
  select min(s)::smallint into v_seat
    from generate_series(0, 5) s
   where not exists (
     select 1 from public.room_members m
      where m.room_id = p_room_id and m.seat = s and m.left_at is null
   );
  if v_seat is null then
    raise exception 'ROOM_FULL';
  end if;

  if v_room.status = 'lobby' then
    update public.room_members as m
       set role = 'player', seat = v_seat, asked_at = null, answered_at = now()
     where m.room_id = p_room_id and m.user_id = v_player;
    return 'seated';
  end if;

  update public.room_members as m
     set asked_at = now(), answered_at = null
   where m.room_id = p_room_id and m.user_id = v_player;
  return 'asked';
end;
$$;

comment on function public.ask_for_seat(uuid) is
  'A spectator asks to play. In a lobby it seats them outright; otherwise it '
  'puts the request in front of the host. Refused when no seat is free.';

-- -----------------------------------------------------------------------------
-- 5. ANSWER_SEAT_REQUEST
-- -----------------------------------------------------------------------------

create or replace function public.answer_seat_request(
  p_room_id uuid,
  p_user_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := public.require_player();
  v_room   public.rooms%rowtype;
  v_seat   smallint;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for update;
  if not found then
    raise exception 'INVALID_ROOM';
  end if;
  if v_room.host_id is distinct from v_player then
    raise exception 'NOT_HOST';
  end if;

  if not exists (
    select 1 from public.room_members m
     where m.room_id = p_room_id and m.user_id = p_user_id
       and m.left_at is null and m.asked_at is not null
  ) then
    -- Answered twice, or withdrawn between the tap and the write. Not a fault:
    -- the host pressed a button about something that is no longer true.
    return;
  end if;

  if not p_approve then
    update public.room_members as m
       set asked_at = null, answered_at = now()
     where m.room_id = p_room_id and m.user_id = p_user_id;
    return;
  end if;

  select min(s)::smallint into v_seat
    from generate_series(0, 5) s
   where not exists (
     select 1 from public.room_members m
      where m.room_id = p_room_id and m.seat = s and m.left_at is null
   );
  if v_seat is null then
    raise exception 'ROOM_FULL';
  end if;

  update public.room_members as m
     set role = 'player', seat = v_seat, asked_at = null, answered_at = now()
   where m.room_id = p_room_id and m.user_id = p_user_id;
end;
$$;

comment on function public.answer_seat_request(uuid, uuid, boolean) is
  'Host-only. Approving seats the spectator at the lowest free seat; they play '
  'from the next game, because a game in progress has fixed players and dice.';

-- -----------------------------------------------------------------------------
-- 6. START_GAME seats players, not the room
-- -----------------------------------------------------------------------------
-- The one existing function this changes, and it has to change: seating
-- everyone present would deal dice to people who are watching.

create or replace function public.start_game(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player  uuid := public.require_player();
  v_room    public.rooms%rowtype;
  v_seated  int;
  v_game_id uuid;
  v_dice    constant smallint := 5;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for update;

  if not found then
    raise exception 'INVALID_ROOM';
  end if;
  if v_room.host_id is distinct from v_player then
    raise exception 'NOT_HOST';
  end if;

  -- The whole of double-tap protection, in one condition. A second caller -
  -- another tap, a retried request, a second device - finds the room no longer
  -- in the lobby and is told so rather than starting a second game.
  if v_room.status <> 'lobby' then
    raise exception 'GAME_ALREADY_STARTED';
  end if;

  select count(*) into v_seated
    from public.room_members m
   where m.room_id = p_room_id and m.left_at is null and m.role = 'player';

  if v_seated < 2 then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  insert into public.games (room_id, status, starting_dice, round_start_rule, started_at)
  values (p_room_id, 'active', v_dice, v_room.round_start_rule, now())
  returning id into v_game_id;

  -- Seats carry over from the room, so where someone sat while waiting is where
  -- they sit to play. Spectators are left out by role, not by seat: they have
  -- no seat to leave them out by.
  insert into public.game_players (game_id, user_id, seat, dice_count)
  select v_game_id, m.user_id, m.seat, v_dice
    from public.room_members m
   where m.room_id = p_room_id and m.left_at is null and m.role = 'player';

  update public.rooms set status = 'in_game' where id = p_room_id;

  return v_game_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Who may call these
-- -----------------------------------------------------------------------------

revoke execute on function public.spectate_room(text)                        from public, anon;
revoke execute on function public.ask_for_seat(uuid)                         from public, anon;
revoke execute on function public.answer_seat_request(uuid, uuid, boolean)   from public, anon;

grant execute on function public.spectate_room(text)                        to authenticated;
grant execute on function public.ask_for_seat(uuid)                         to authenticated;
grant execute on function public.answer_seat_request(uuid, uuid, boolean)   to authenticated;

notify pgrst, 'reload schema';
