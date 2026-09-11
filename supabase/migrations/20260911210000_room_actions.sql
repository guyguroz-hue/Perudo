-- =============================================================================
-- Room actions
-- =============================================================================
-- The only way a client changes a room. Clients hold no write privilege on any
-- table, so these functions are the entire surface: create, join, leave, kick.
--
-- Each is SECURITY DEFINER with an empty search_path, and each re-derives the
-- actor from auth.uid() rather than trusting an argument. A caller can name a
-- room and a code; they can never name who they are.
--
-- Failures raise with a stable, machine-readable MESSAGE — 'ROOM_FULL',
-- 'NOT_HOST' and so on. The client maps those to sentences a player can act on.
-- Raising rather than returning a status also means a half-finished join rolls
-- back on its own.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared guards
-- -----------------------------------------------------------------------------

create or replace function public.require_player()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_id) then
    -- A session exists but the player has not chosen a name yet.
    raise exception 'PROFILE_REQUIRED';
  end if;
  return v_id;
end;
$$;

comment on function public.require_player() is
  'The calling player, or an error. Identity always comes from the session, '
  'never from an argument.';

-- Promotes a new host when the current one is gone for good.
--
-- Deliberately does NOT migrate on a stale heartbeat yet. Until clients
-- actually send one, every host would look absent after sixty seconds and get
-- deposed by the next person to join. Disconnect-based migration arrives with
-- the heartbeat that makes it meaningful.
create or replace function public.ensure_room_host(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_next uuid;
begin
  select host_id into v_host from public.rooms where id = p_room_id;

  if v_host is not null and exists (
    select 1 from public.room_members m
     where m.room_id = p_room_id and m.user_id = v_host and m.left_at is null
  ) then
    return;                                      -- the host is still at the table
  end if;

  -- Longest-seated remaining player. Deterministic, so every caller that races
  -- here computes the same answer and no two hosts can appear.
  select m.user_id into v_next
    from public.room_members m
   where m.room_id = p_room_id and m.left_at is null
   order by m.joined_at, m.seat
   limit 1;

  update public.rooms set host_id = v_next where id = p_room_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- CREATE_ROOM
-- -----------------------------------------------------------------------------

create or replace function public.create_room()
returns table (room_id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := public.require_player();
  v_code   text;
  v_id     uuid;
begin
  -- Codes are unique among all rooms, so a collision is a retry rather than a
  -- failure. Ten attempts over ~20.5M codes is not a risk worth modelling.
  for i in 1..10 loop
    v_code := public.generate_room_code();
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
    v_code := null;
  end loop;

  if v_code is null then
    raise exception 'CODE_GENERATION_FAILED';
  end if;

  insert into public.rooms (code, host_id, status)
  values (v_code, v_player, 'lobby')
  returning id into v_id;

  insert into public.room_members (room_id, user_id, seat)
  values (v_id, v_player, 0);

  return query select v_id, v_code;
end;
$$;

comment on function public.create_room() is
  'Creates a room and seats the caller as host at seat 0.';

-- -----------------------------------------------------------------------------
-- JOIN_ROOM_BY_CODE
-- -----------------------------------------------------------------------------

create or replace function public.join_room_by_code(p_code text)
returns table (room_id uuid, seat smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := public.require_player();
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_room   public.rooms%rowtype;
  v_member public.room_members%rowtype;
  -- Captured explicitly rather than relying on FOUND. Every SELECT INTO
  -- overwrites FOUND, and the seat lookup below is an aggregate that always
  -- returns a row — so a later `if found` would report on that query, not on
  -- whether this player already has a membership. Reading FOUND at a distance
  -- is how a join can report a seat it never actually took.
  v_has_row boolean;
  v_seat   smallint;
begin
  -- FOR UPDATE serialises everyone joining this room. It is not what keeps the
  -- room to six — the unique seat index does that even without a lock — but it
  -- turns a losing race into a clean ROOM_FULL instead of a constraint error.
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

  -- Already seated. Tapping the link twice, or a retried request, is a no-op
  -- rather than an error — and notably this still works mid-game, which is what
  -- lets a player reload the page without losing their seat.
  if v_has_row and v_member.left_at is null then
    return query select v_room.id, v_member.seat;
    return;
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'GAME_ALREADY_STARTED';
  end if;

  select min(s)::smallint into v_seat
    from generate_series(0, 5) s
   where not exists (
     select 1 from public.room_members m
      where m.room_id = v_room.id and m.seat = s and m.left_at is null
   );

  if v_seat is null then
    raise exception 'ROOM_FULL';
  end if;

  if v_has_row then
    -- Returning after leaving: the same membership row is reused, so history
    -- and any past games keep pointing at one record per player per room.
    -- Aliased because `room_id` and `seat` are this function's OUT parameters,
    -- and an unqualified reference would resolve to those rather than to the
    -- columns.
    update public.room_members as m
       set seat = v_seat, left_at = null, last_seen_at = now()
     where m.room_id = v_room.id and m.user_id = v_player;
  else
    insert into public.room_members (room_id, user_id, seat)
    values (v_room.id, v_player, v_seat);
  end if;

  perform public.ensure_room_host(v_room.id);

  return query select v_room.id, v_seat;
end;
$$;

comment on function public.join_room_by_code(text) is
  'Seats the caller in the room with this code. Case-insensitive, idempotent, '
  'and never able to produce a seventh player.';

-- -----------------------------------------------------------------------------
-- LEAVE_ROOM
-- -----------------------------------------------------------------------------

create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := public.require_player();
  v_left   int;
begin
  perform 1 from public.rooms where id = p_room_id for update;

  update public.room_members
     set left_at = now()
   where room_id = p_room_id and user_id = v_player and left_at is null;

  -- Leaving a room you are not in is not an error worth surfacing; the player
  -- wanted to be out, and they are.
  perform public.ensure_room_host(p_room_id);

  select count(*) into v_left
    from public.room_members m
   where m.room_id = p_room_id and m.left_at is null;

  if v_left = 0 then
    update public.rooms set status = 'closed' where id = p_room_id;
  end if;
end;
$$;

comment on function public.leave_room(uuid) is
  'Vacates the caller''s seat, promotes a new host if they were hosting, and '
  'closes the room once the last person leaves.';

-- -----------------------------------------------------------------------------
-- KICK_PLAYER
-- -----------------------------------------------------------------------------

create or replace function public.kick_player(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := public.require_player();
  v_room   public.rooms%rowtype;
  v_hit    int;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for update;

  if not found then
    raise exception 'INVALID_ROOM';
  end if;
  if v_room.host_id is distinct from v_player then
    raise exception 'NOT_HOST';
  end if;
  if p_user_id = v_player then
    -- Hosts leave; they do not remove themselves. Otherwise a room could be
    -- left hostless by a single mis-tap.
    raise exception 'CANNOT_KICK_SELF';
  end if;

  update public.room_members
     set left_at = now(), removed_at = now(), removed_by = v_player
   where room_id = p_room_id and user_id = p_user_id and left_at is null;

  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'NOT_IN_ROOM';
  end if;
end;
$$;

comment on function public.kick_player(uuid, uuid) is
  'Host-only. Frees the seat and blocks a casual rejoin. Not a ban — anonymous '
  'players can obtain a new identity by clearing browser storage.';

-- -----------------------------------------------------------------------------
-- TOUCH — the heartbeat
-- -----------------------------------------------------------------------------

create or replace function public.touch_room_member(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := auth.uid();
begin
  if v_player is null then
    return;
  end if;
  update public.room_members
     set last_seen_at = now()
   where room_id = p_room_id and user_id = v_player and left_at is null;
end;
$$;

comment on function public.touch_room_member(uuid) is
  'Records that the caller is still present. Feeds host migration only; never '
  'affects membership, because a dropped connection is not a departure.';

-- -----------------------------------------------------------------------------
-- Who may call these
-- -----------------------------------------------------------------------------
-- require_player and ensure_room_host are internal machinery, not client
-- capabilities: revoked from everyone, reachable only from the actions above,
-- which run as their owner.

revoke execute on function public.require_player()           from public, anon, authenticated;
revoke execute on function public.ensure_room_host(uuid)     from public, anon, authenticated;

revoke execute on function public.create_room()              from public, anon;
revoke execute on function public.join_room_by_code(text)    from public, anon;
revoke execute on function public.leave_room(uuid)           from public, anon;
revoke execute on function public.kick_player(uuid, uuid)    from public, anon;
revoke execute on function public.touch_room_member(uuid)    from public, anon;

grant execute on function public.create_room()               to authenticated;
grant execute on function public.join_room_by_code(text)     to authenticated;
grant execute on function public.leave_room(uuid)            to authenticated;
grant execute on function public.kick_player(uuid, uuid)     to authenticated;
grant execute on function public.touch_room_member(uuid)     to authenticated;
