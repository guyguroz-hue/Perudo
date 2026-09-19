-- =============================================================================
-- Spectators and seat requests
-- =============================================================================
-- Every test runs as `authenticated` with a JWT subject, exactly as PostgREST
-- executes a client call. Nothing here uses owner privileges to set up state
-- that a real client could not reach.
--
-- The claim worth proving is the security one: a spectator is a member, so they
-- read what members read — and `player_dice` is not that. Everything else is
-- about not lying to anybody about whether they are playing.
-- =============================================================================

\set ON_ERROR_STOP on

\set h  '''c1000000-0000-0000-0000-000000000001'''
\set p2 '''c1000000-0000-0000-0000-000000000002'''
\set s1 '''c1000000-0000-0000-0000-000000000003'''
\set s2 '''c1000000-0000-0000-0000-000000000004'''
\set out '''c1000000-0000-0000-0000-00000000000f'''

insert into auth.users (id) values (:h),(:p2),(:s1),(:s2),(:out);
insert into public.profiles (id, display_name) values
  (:h,'Host'),(:p2,'Player Two'),(:s1,'Watcher'),(:s2,'Watcher Two'),(:out,'Outsider');

create or replace function pg_temp.act(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

\echo '--- a room with two players, mid-game ---'

do $$
declare v_id uuid; v_code text;
begin
  perform pg_temp.act('c1000000-0000-0000-0000-000000000001');
  set local role authenticated;
  select room_id, code into v_id, v_code from public.create_room();

  perform pg_temp.act('c1000000-0000-0000-0000-000000000002');
  perform public.join_room_by_code(v_code);

  perform pg_temp.act('c1000000-0000-0000-0000-000000000001');
  perform public.start_game(v_id);

  reset role;
  create temp table t_room as select v_id as id, v_code as code;
end $$;

-- -----------------------------------------------------------------------------
-- Watching a game that has already started
-- -----------------------------------------------------------------------------

do $$
declare v_code text; v_id uuid; v_room uuid; v_role text; v_seat smallint;
begin
  select id, code into v_id, v_code from t_room;

  perform pg_temp.act('c1000000-0000-0000-0000-000000000003');
  set local role authenticated;
  -- The door join_room_by_code closes.
  begin
    perform public.join_room_by_code(v_code);
    raise exception 'FAIL: joining a running game as a player was allowed';
  exception when others then
    if sqlerrm <> 'GAME_ALREADY_STARTED' then raise; end if;
  end;

  select room_id into v_room from public.spectate_room(v_code);
  if v_room <> v_id then raise exception 'FAIL: spectate_room returned the wrong room'; end if;

  reset role;
  select role, seat into v_role, v_seat from public.room_members
   where room_id = v_id and user_id = 'c1000000-0000-0000-0000-000000000003';
  if v_role <> 'spectator' then raise exception 'FAIL: watcher is not a spectator'; end if;
  if v_seat is not null then raise exception 'FAIL: a spectator was given a seat'; end if;
end $$;

\echo 'PASS  a running game can be watched, and still cannot be joined as a player'

-- -----------------------------------------------------------------------------
-- What a spectator can and cannot read
-- -----------------------------------------------------------------------------

do $$
declare v_id uuid; v_seen int; v_hands int; v_reveals int;
begin
  select id into v_id from t_room;

  perform pg_temp.act('c1000000-0000-0000-0000-000000000003');
  set local role authenticated;

  select count(*) into v_seen from public.rooms r where r.id = v_id;
  if v_seen <> 1 then raise exception 'FAIL: a spectator cannot see the room'; end if;

  select count(*) into v_seen from public.game_players gp
    join public.games g on g.id = gp.game_id where g.room_id = v_id;
  if v_seen <> 2 then raise exception 'FAIL: a spectator cannot see who is playing (%)', v_seen; end if;

  -- The whole security question, in one number. Dice are dealt and none of
  -- them are theirs.
  select count(*) into v_hands from public.player_dice;
  if v_hands <> 0 then raise exception 'FAIL: a spectator can read % hands', v_hands; end if;

  select count(*) into v_reveals from public.dice_reveals;
  if v_reveals <> 0 then raise exception 'FAIL: hands were public before a challenge'; end if;

  reset role;
  -- And the dice really are there to have been read.
  select count(*) into v_hands from public.player_dice;
  if v_hands = 0 then raise exception 'FAIL: nothing was dealt, so nothing was proved'; end if;
end $$;

\echo 'PASS  a spectator reads the table and not a single hand'

-- -----------------------------------------------------------------------------
-- Asking for a seat
-- -----------------------------------------------------------------------------

do $$
declare v_id uuid; v_answer text; v_asked timestamptz; v_role text;
begin
  select id into v_id from t_room;

  perform pg_temp.act('c1000000-0000-0000-0000-000000000003');
  set local role authenticated;
  v_answer := public.ask_for_seat(v_id);
  if v_answer <> 'asked' then
    raise exception 'FAIL: mid-game, a seat request should go to the host, got %', v_answer;
  end if;

  reset role;
  select asked_at, role into v_asked, v_role from public.room_members
   where room_id = v_id and user_id = 'c1000000-0000-0000-0000-000000000003';
  if v_asked is null then raise exception 'FAIL: the request was not recorded'; end if;
  if v_role <> 'spectator' then raise exception 'FAIL: asking seated them by itself'; end if;

  -- Nobody but the host answers it.
  perform pg_temp.act('c1000000-0000-0000-0000-000000000002');
  set local role authenticated;
  begin
    perform public.answer_seat_request(v_id, 'c1000000-0000-0000-0000-000000000003', true);
    raise exception 'FAIL: a player who is not the host approved a seat';
  exception when others then
    if sqlerrm <> 'NOT_HOST' then raise; end if;
  end;
  reset role;
end $$;

\echo 'PASS  a seat request is recorded, and only the host may answer it'

do $$
declare v_id uuid; v_role text; v_seat smallint; v_asked timestamptz; v_players int;
begin
  select id into v_id from t_room;

  perform pg_temp.act('c1000000-0000-0000-0000-000000000001');
  set local role authenticated;
  perform public.answer_seat_request(v_id, 'c1000000-0000-0000-0000-000000000003', true);
  reset role;

  select role, seat, asked_at into v_role, v_seat, v_asked from public.room_members
   where room_id = v_id and user_id = 'c1000000-0000-0000-0000-000000000003';
  if v_role <> 'player' then raise exception 'FAIL: approval did not seat them'; end if;
  if v_seat is null then raise exception 'FAIL: approval left them without a seat'; end if;
  if v_asked is not null then raise exception 'FAIL: the request is still outstanding'; end if;

  -- And it did NOT put them in the game that is running. Players and their
  -- dice are fixed when a game starts; there is no honest number of dice to
  -- hand somebody who arrives at round nine.
  select count(*) into v_players from public.game_players gp
    join public.games g on g.id = gp.game_id
   where g.room_id = v_id and gp.user_id = 'c1000000-0000-0000-0000-000000000003';
  if v_players <> 0 then raise exception 'FAIL: an approved player was dealt into a live game'; end if;
end $$;

\echo 'PASS  approval seats them for the next game, not the one being played'

-- -----------------------------------------------------------------------------
-- A full table can still be watched
-- -----------------------------------------------------------------------------

do $$
declare v_id uuid; v_code text; v_answer text; i int; v_user uuid; v_watchers int;
begin
  select id, code into v_id, v_code from t_room;

  -- Fill the remaining three seats — host, Player Two and the approved watcher
  -- hold 0, 1 and 2. The room is mid-game, so these go through the host, which
  -- is also the path a real table takes.
  reset role;
  for i in 4..6 loop
    v_user := ('c1000000-0000-0000-0000-00000000001' || i)::uuid;
    insert into auth.users (id) values (v_user) on conflict do nothing;
    insert into public.profiles (id, display_name) values (v_user, 'Filler ' || i)
      on conflict do nothing;

    perform pg_temp.act(v_user);
    set local role authenticated;
    perform public.spectate_room(v_code);
    perform public.ask_for_seat(v_id);
    reset role;

    perform pg_temp.act('c1000000-0000-0000-0000-000000000001');
    set local role authenticated;
    perform public.answer_seat_request(v_id, v_user, true);
    reset role;
  end loop;

  -- Six seats taken. A seventh cannot ask — there is nowhere to put them.
  perform pg_temp.act('c1000000-0000-0000-0000-000000000004');
  set local role authenticated;
  perform public.spectate_room(v_code);
  begin
    perform public.ask_for_seat(v_id);
    raise exception 'FAIL: a seventh player was allowed to ask for a seat';
  exception when others then
    if sqlerrm <> 'ROOM_FULL' then raise; end if;
  end;
  reset role;

  -- But they are watching, which is the point.
  select count(*) into v_watchers from public.room_members
   where room_id = v_id and left_at is null and role = 'spectator';
  if v_watchers < 1 then raise exception 'FAIL: a full table cannot be watched'; end if;
end $$;

\echo 'PASS  a full table can still be watched, and cannot be asked to grow'

-- -----------------------------------------------------------------------------
-- The next game seats the players and nobody else
-- -----------------------------------------------------------------------------

do $$
declare v_id uuid; v_dealt int; v_watching int;
begin
  select id into v_id from t_room;

  -- End the game the hard way and reopen the lobby, which is what a finished
  -- game plus Play again does.
  reset role;
  update public.games set status = 'completed', completed_at = now() where room_id = v_id;
  update public.rooms set status = 'lobby' where id = v_id;

  perform pg_temp.act('c1000000-0000-0000-0000-000000000001');
  set local role authenticated;
  perform public.start_game(v_id);
  reset role;

  select count(*) into v_dealt from public.game_players gp
    join public.games g on g.id = gp.game_id
   where g.room_id = v_id and g.status = 'active';
  select count(*) into v_watching from public.room_members
   where room_id = v_id and left_at is null and role = 'spectator';

  if v_dealt <> 6 then raise exception 'FAIL: the new game seated % players, not six', v_dealt; end if;
  if v_watching < 1 then raise exception 'FAIL: the spectator vanished'; end if;
end $$;

\echo 'PASS  a new game deals to the six players and to none of the watchers'

-- -----------------------------------------------------------------------------
-- And none of it is reachable from outside the room
-- -----------------------------------------------------------------------------

do $$
declare v_id uuid; v_seen int;
begin
  select id into v_id from t_room;

  perform pg_temp.act('c1000000-0000-0000-0000-00000000000f');
  set local role authenticated;
  select count(*) into v_seen from public.room_members where room_id = v_id;
  if v_seen <> 0 then raise exception 'FAIL: an outsider can see the room roster'; end if;
  reset role;
end $$;

\echo 'PASS  an outsider still sees nothing'
\echo '================ SPECTATOR TESTS PASSED ================'
