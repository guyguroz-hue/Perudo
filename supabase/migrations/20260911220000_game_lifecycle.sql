-- =============================================================================
-- Starting, ending and replaying a game
-- =============================================================================
-- The room's side of a game: who is seated when it begins, when newcomers stop
-- being admitted, and how a table gets back to the lobby afterwards.
--
-- None of this decides anything about play. Bids, dice and outcomes belong to
-- the engine; these functions only answer "has it started" and "who is in it".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Host migration, now that a heartbeat exists
-- -----------------------------------------------------------------------------
-- Replaces the earlier version, which only migrated when the host had actually
-- left. Clients now report in every twenty seconds, so a host who has gone
-- quiet for a minute can be stood down as well.
--
-- The guard that matters: a replacement is promoted only if they are *fresher*
-- than the host. Without it, a table where nobody is reporting in — an older
-- client, a stalled tab, the whole group on a bad connection — would hand the
-- room around on every action for no reason.
create or replace function public.ensure_room_host(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host      uuid;
  v_host_seen timestamptz;
  v_next      uuid;
  v_grace     constant interval := interval '60 seconds';
begin
  select r.host_id into v_host from public.rooms r where r.id = p_room_id;

  select m.last_seen_at into v_host_seen
    from public.room_members m
   where m.room_id = p_room_id and m.user_id = v_host and m.left_at is null;

  -- The host is here and reporting in. Nothing to do.
  if v_host is not null and v_host_seen is not null and v_host_seen > now() - v_grace then
    return;
  end if;

  if v_host is null or v_host_seen is null then
    -- Gone for good: longest-seated remaining player takes over. Deterministic,
    -- so racing callers compute the same answer and two hosts cannot appear.
    select m.user_id into v_next
      from public.room_members m
     where m.room_id = p_room_id and m.left_at is null
     order by m.joined_at, m.seat
     limit 1;
  else
    -- Still seated but silent. Only someone demonstrably present may take over.
    select m.user_id into v_next
      from public.room_members m
     where m.room_id = p_room_id
       and m.left_at is null
       and m.user_id <> v_host
       and m.last_seen_at > now() - v_grace
     order by m.joined_at, m.seat
     limit 1;

    if v_next is null then
      return;                      -- nobody is any fresher; leave the host be
    end if;
  end if;

  update public.rooms set host_id = v_next where id = p_room_id;
end;
$$;

revoke execute on function public.ensure_room_host(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- The heartbeat now evaluates host migration
-- -----------------------------------------------------------------------------
-- Migration has to be noticed *somewhere*, and joining is the wrong place: a
-- player already seated returns early, so the commonest action in a live room
-- never checks. The heartbeat is the right one. It is exactly the signal that
-- says "I am still here", which makes it the natural moment to notice that the
-- host is not — and it already arrives from every client every twenty seconds,
-- so no timer or scheduler has to exist for this.
create or replace function public.touch_room_member(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := auth.uid();
  v_hit    int;
begin
  if v_player is null then
    return;
  end if;

  update public.room_members
     set last_seen_at = now()
   where room_id = p_room_id and user_id = v_player and left_at is null;

  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    return;             -- not a member; nothing to report and nothing to decide
  end if;

  perform public.ensure_room_host(p_room_id);
end;
$$;

comment on function public.touch_room_member(uuid) is
  'Records that the caller is still present, and takes the opportunity to '
  'notice whether the host is. Never affects membership: a quiet connection is '
  'not a departure.';

revoke execute on function public.touch_room_member(uuid) from public, anon;
grant  execute on function public.touch_room_member(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- START_GAME
-- -----------------------------------------------------------------------------

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
   where m.room_id = p_room_id and m.left_at is null;

  if v_seated < 3 then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  insert into public.games (room_id, status, starting_dice, round_start_rule, started_at)
  values (p_room_id, 'active', v_dice, v_room.round_start_rule, now())
  returning id into v_game_id;

  -- Seats carry over from the room, so where someone sat while waiting is where
  -- they sit to play.
  insert into public.game_players (game_id, user_id, seat, dice_count)
  select v_game_id, m.user_id, m.seat, v_dice
    from public.room_members m
   where m.room_id = p_room_id and m.left_at is null;

  update public.rooms set status = 'in_game' where id = p_room_id;

  return v_game_id;
end;
$$;

comment on function public.start_game(uuid) is
  'Host-only. Seats everyone present into a new game and locks the room to '
  'newcomers. Three players minimum; a second call is refused, not obeyed.';

-- -----------------------------------------------------------------------------
-- RETURN_TO_LOBBY — the rematch
-- -----------------------------------------------------------------------------

create or replace function public.return_to_lobby(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := public.require_player();
  v_room   public.rooms%rowtype;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for update;

  if not found then
    raise exception 'INVALID_ROOM';
  end if;
  if v_room.host_id is distinct from v_player then
    raise exception 'NOT_HOST';
  end if;
  if v_room.status = 'lobby' then
    return;                                    -- already there; nothing to undo
  end if;
  if v_room.status <> 'finished' then
    raise exception 'GAME_IN_PROGRESS';
  end if;

  -- Membership is deliberately untouched. A rematch is the same people at the
  -- same table, so nobody re-joins and nobody loses their seat.
  update public.rooms set status = 'lobby' where id = p_room_id;
end;
$$;

comment on function public.return_to_lobby(uuid) is
  'Host-only. Reopens a finished room for another game, keeping the same '
  'players in the same seats.';

-- -----------------------------------------------------------------------------
-- END_ROOM
-- -----------------------------------------------------------------------------

create or replace function public.end_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := public.require_player();
  v_room   public.rooms%rowtype;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for update;

  if not found then
    raise exception 'INVALID_ROOM';
  end if;
  if v_room.host_id is distinct from v_player then
    raise exception 'NOT_HOST';
  end if;

  -- Any game still open is abandoned rather than completed: nobody won it, and
  -- recording a winner would be a lie.
  update public.games
     set status = 'abandoned', completed_at = now()
   where room_id = p_room_id and status in ('starting', 'active');

  update public.room_members
     set left_at = now()
   where room_id = p_room_id and left_at is null;

  update public.rooms set status = 'closed' where id = p_room_id;
end;
$$;

comment on function public.end_room(uuid) is
  'Host-only. Closes the room for everyone and abandons any game still open.';

revoke execute on function public.start_game(uuid)       from public, anon;
revoke execute on function public.return_to_lobby(uuid)  from public, anon;
revoke execute on function public.end_room(uuid)         from public, anon;
grant  execute on function public.start_game(uuid)       to authenticated;
grant  execute on function public.return_to_lobby(uuid)  to authenticated;
grant  execute on function public.end_room(uuid)         to authenticated;
