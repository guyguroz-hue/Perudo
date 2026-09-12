-- =============================================================================
-- Starting, ending and replaying — behaviour and authorisation
-- =============================================================================

\set ON_ERROR_STOP on

\set h  '''e0000000-0000-0000-0000-000000000001'''
\set p2 '''e0000000-0000-0000-0000-000000000002'''
\set p3 '''e0000000-0000-0000-0000-000000000003'''
\set p4 '''e0000000-0000-0000-0000-000000000004'''

insert into auth.users (id) values (:h),(:p2),(:p3),(:p4);
insert into public.profiles (id, display_name) values
  (:h,'Host'),(:p2,'Two'),(:p3,'Three'),(:p4,'Four');

create or replace function pg_temp.act2(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

-- A room with the host alone in it.
do $$
declare v_id uuid; v_code text;
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  select room_id, code into v_id, v_code from public.create_room();
  reset role;
  create temp table t_g as select v_id as id, v_code as code;
end $$;
grant select on t_g to authenticated;
\echo '--- room created ---'

-- -----------------------------------------------------------------------------
-- The minimum
-- -----------------------------------------------------------------------------

do $$
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  begin
    perform public.start_game((select id from t_g));
    raise exception 'FAIL: a game started with one player';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'NOT_ENOUGH_PLAYERS' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;
end $$;
\echo 'PASS  one player cannot start a game'

-- Two is now enough to start, so the rest of this file seats a third before it
-- tries anything else — otherwise every later case would be racing a game that
-- had already begun.
do $$
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000002');
  set local role authenticated; perform public.join_room_by_code((select code from t_g)); reset role;
end $$;

do $$
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000003');
  set local role authenticated; perform public.join_room_by_code((select code from t_g)); reset role;

  perform pg_temp.act2('e0000000-0000-0000-0000-000000000002');
  set local role authenticated;
  begin
    perform public.start_game((select id from t_g));
    raise exception 'FAIL: a player who is not the host started the game';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'NOT_HOST' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;
end $$;
\echo 'PASS  only the host can start'

-- -----------------------------------------------------------------------------
-- Starting
-- -----------------------------------------------------------------------------

do $$
declare v_game uuid; v_seats int; v_dice int; v_status text;
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  v_game := public.start_game((select id from t_g));
  reset role;

  select count(*) into v_seats from public.game_players where game_id = v_game;
  if v_seats <> 3 then raise exception 'FAIL: % players were seated, expected 3', v_seats; end if;

  select count(*) into v_dice from public.game_players
   where game_id = v_game and dice_count = 5;
  if v_dice <> 3 then raise exception 'FAIL: not everyone started on five dice'; end if;

  -- Seats carry over: where you waited is where you play.
  if exists (
    select 1 from public.game_players gp
      join public.room_members m
        on m.user_id = gp.user_id and m.room_id = (select id from t_g)
     where gp.game_id = v_game and gp.seat <> m.seat
  ) then
    raise exception 'FAIL: seats were reshuffled between lobby and game';
  end if;

  select status into v_status from public.rooms where id = (select id from t_g);
  if v_status <> 'in_game' then raise exception 'FAIL: room status is %', v_status; end if;

  create temp table t_game as select v_game as id;
end $$;
grant select on t_game to authenticated;
\echo 'PASS  starting seats everyone on five dice, keeping their seats'

do $$
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  begin
    -- The double tap.
    perform public.start_game((select id from t_g));
    raise exception 'FAIL: a second game was started in the same room';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'GAME_ALREADY_STARTED' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;

  if (select count(*) from public.games where room_id = (select id from t_g)) <> 1 then
    raise exception 'FAIL: more than one game exists for this room';
  end if;
end $$;
\echo 'PASS  starting twice does not start a second game'

do $$
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000004');
  set local role authenticated;
  begin
    perform public.join_room_by_code((select code from t_g));
    raise exception 'FAIL: someone joined a room whose game had started';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'GAME_ALREADY_STARTED' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;
end $$;
\echo 'PASS  the room is locked to newcomers once play begins'

-- -----------------------------------------------------------------------------
-- Rematch
-- -----------------------------------------------------------------------------

do $$
declare v_members int;
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  begin
    perform public.return_to_lobby((select id from t_g));
    raise exception 'FAIL: a game in progress was returned to the lobby';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'GAME_IN_PROGRESS' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;

  -- Stand in for the finish the engine will eventually record.
  update public.games set status = 'completed', completed_at = now()
   where id = (select id from t_game);
  update public.rooms set status = 'finished' where id = (select id from t_g);

  perform pg_temp.act2('e0000000-0000-0000-0000-000000000002');
  set local role authenticated;
  begin
    perform public.return_to_lobby((select id from t_g));
    raise exception 'FAIL: a non-host called a rematch';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'NOT_HOST' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;

  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  perform public.return_to_lobby((select id from t_g));
  perform public.return_to_lobby((select id from t_g));   -- idempotent
  reset role;

  if (select status from public.rooms where id = (select id from t_g)) <> 'lobby' then
    raise exception 'FAIL: the room did not reopen';
  end if;

  select count(*) into v_members from public.room_members
   where room_id = (select id from t_g) and left_at is null;
  if v_members <> 3 then
    raise exception 'FAIL: a rematch cost the room its players (% left)', v_members;
  end if;
end $$;
\echo 'PASS  a rematch reopens the room with the same people, host only'

do $$
declare v_game2 uuid;
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  v_game2 := public.start_game((select id from t_g));
  reset role;

  if v_game2 = (select id from t_game) then
    raise exception 'FAIL: the rematch reused the finished game';
  end if;
  if (select count(*) from public.games where room_id = (select id from t_g)) <> 2 then
    raise exception 'FAIL: the room should now have two games';
  end if;
end $$;
\echo 'PASS  the rematch is a new game, not a revived one'

-- -----------------------------------------------------------------------------
-- Closing
-- -----------------------------------------------------------------------------

do $$
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000002');
  set local role authenticated;
  begin
    perform public.end_room((select id from t_g));
    raise exception 'FAIL: a non-host closed the room';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'NOT_HOST' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;

  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  perform public.end_room((select id from t_g));
  reset role;

  if (select status from public.rooms where id = (select id from t_g)) <> 'closed' then
    raise exception 'FAIL: the room did not close';
  end if;
  if exists (select 1 from public.room_members
              where room_id = (select id from t_g) and left_at is null) then
    raise exception 'FAIL: players were left seated in a closed room';
  end if;
  -- An unfinished game is abandoned, never completed: nobody won it.
  if exists (select 1 from public.games
              where room_id = (select id from t_g) and status in ('starting','active')) then
    raise exception 'FAIL: a live game survived the room closing';
  end if;
  if not exists (select 1 from public.games
                  where room_id = (select id from t_g) and status = 'abandoned') then
    raise exception 'FAIL: the open game should have been abandoned';
  end if;
end $$;
\echo 'PASS  the host closes the room, abandoning any game still open'

-- -----------------------------------------------------------------------------
-- Host migration on silence
-- -----------------------------------------------------------------------------

do $$
declare v_room uuid; v_code text; v_host uuid;
begin
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  select room_id, code into v_room, v_code from public.create_room();
  reset role;

  perform pg_temp.act2('e0000000-0000-0000-0000-000000000002');
  set local role authenticated; perform public.join_room_by_code(v_code); reset role;

  -- Everyone is reporting in: the host keeps the room.
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000003');
  set local role authenticated; perform public.join_room_by_code(v_code); reset role;

  select host_id into v_host from public.rooms where id = v_room;
  if v_host <> 'e0000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: the host was replaced while present';
  end if;

  -- The host goes quiet. Everyone else is still here.
  update public.room_members set last_seen_at = now() - interval '5 minutes'
   where room_id = v_room and user_id = 'e0000000-0000-0000-0000-000000000001';

  -- Someone else reports in, which is when the silence gets noticed.
  perform pg_temp.act2('e0000000-0000-0000-0000-000000000002');
  set local role authenticated; perform public.touch_room_member(v_room); reset role;

  select host_id into v_host from public.rooms where id = v_room;
  if v_host = 'e0000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: a silent host kept the room';
  end if;
  if not exists (select 1 from public.room_members
                  where room_id = v_room and user_id = v_host and left_at is null) then
    raise exception 'FAIL: the room was handed to someone who is not in it';
  end if;

  create temp table t_quiet as select v_room as id, v_code as code;
end $$;
grant select on t_quiet to authenticated;
\echo 'PASS  a host who has gone quiet for a minute is stood down'

do $$
declare v_before uuid; v_after uuid;
begin
  -- Nobody is reporting in: an older client, a stalled tab, a bad connection
  -- across the whole table. Note this cannot be shown through the heartbeat —
  -- calling it makes you fresh, and a demonstrably present player is a
  -- legitimate replacement. It shows through someone leaving, which also
  -- re-evaluates the host.
  update public.room_members set last_seen_at = now() - interval '5 minutes'
   where room_id = (select id from t_quiet);

  select host_id into v_before from public.rooms where id = (select id from t_quiet);

  perform pg_temp.act2('e0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  perform public.leave_room((select id from t_quiet));
  reset role;

  -- That one had left, so a change there would be correct. Set them stale again
  -- and have another silent player leave, with the host still seated.
  update public.room_members set last_seen_at = now() - interval '5 minutes'
   where room_id = (select id from t_quiet);
  select host_id into v_before from public.rooms where id = (select id from t_quiet);

  perform pg_temp.act2('e0000000-0000-0000-0000-000000000003');
  set local role authenticated;
  perform public.leave_room((select id from t_quiet));
  reset role;

  select host_id into v_after from public.rooms where id = (select id from t_quiet);
  if v_after is distinct from v_before then
    raise exception 'FAIL: the host changed when nobody was any fresher (% -> %)',
      v_before, v_after;
  end if;
end $$;
\echo 'PASS  a table where everyone is silent keeps its host'

drop table t_g; drop table t_game; drop table t_quiet;

\echo ''
\echo '================ GAME LIFECYCLE TESTS PASSED ================'
