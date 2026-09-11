-- =============================================================================
-- Room actions — behaviour and authorisation
-- =============================================================================
-- Every test runs as `authenticated` with a JWT subject, exactly as PostgREST
-- executes a client call. Nothing here uses owner privileges to set up state
-- that a real client could not reach.
-- =============================================================================

\set ON_ERROR_STOP on

\set h  '''b0000000-0000-0000-0000-000000000001'''
\set g2 '''b0000000-0000-0000-0000-000000000002'''
\set g3 '''b0000000-0000-0000-0000-000000000003'''
\set g4 '''b0000000-0000-0000-0000-000000000004'''
\set g5 '''b0000000-0000-0000-0000-000000000005'''
\set g6 '''b0000000-0000-0000-0000-000000000006'''
\set g7 '''b0000000-0000-0000-0000-000000000007'''
\set nameless '''b0000000-0000-0000-0000-00000000000e'''

insert into auth.users (id) values (:h),(:g2),(:g3),(:g4),(:g5),(:g6),(:g7),(:nameless);
insert into public.profiles (id, display_name) values
  (:h,'Host'),(:g2,'G2'),(:g3,'G3'),(:g4,'G4'),(:g5,'G5'),(:g6,'G6'),(:g7,'G7');
-- `nameless` deliberately has a session but no profile.

create or replace function pg_temp.act(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

\echo '--- players seeded ---'

-- -----------------------------------------------------------------------------
-- Creating a room
-- -----------------------------------------------------------------------------

do $$
declare v_code text; v_id uuid; v_seat smallint; v_host uuid;
begin
  perform pg_temp.act('b0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  select room_id, code into v_id, v_code from public.create_room();

  if v_code !~ '^[2346789ABCDEFGHJKMNPQRTUVWXYZ]{5}$' then
    raise exception 'FAIL: create_room produced a bad code: %', v_code;
  end if;

  reset role;
  select seat into v_seat from public.room_members
   where room_id = v_id and user_id = 'b0000000-0000-0000-0000-000000000001';
  select host_id into v_host from public.rooms where id = v_id;

  if v_seat <> 0 then raise exception 'FAIL: host did not take seat 0'; end if;
  if v_host <> 'b0000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: creator is not the host';
  end if;

  create temp table t_room as select v_id as id, v_code as code;
end $$;
-- The tests read this while acting as `authenticated`, so it needs to be
-- readable by that role.
grant select on t_room to authenticated;

\echo 'PASS  create_room seats the creator as host at seat 0'

do $$
begin
  perform pg_temp.act('b0000000-0000-0000-0000-00000000000e');
  set local role authenticated;
  begin
    perform public.create_room();
    raise exception 'FAIL: a player with no profile created a room';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PROFILE_REQUIRED' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;
end $$;
\echo 'PASS  a session without a name cannot create a room'

-- -----------------------------------------------------------------------------
-- Joining
-- -----------------------------------------------------------------------------

do $$
declare v_code text; v_seat smallint;
begin
  select code into v_code from t_room;
  perform pg_temp.act('b0000000-0000-0000-0000-000000000002');
  set local role authenticated;

  -- Codes are spoken aloud and typed on phones, so case must not matter.
  select seat into v_seat from public.join_room_by_code(lower(v_code));
  if v_seat <> 1 then raise exception 'FAIL: expected seat 1, got %', v_seat; end if;

  -- Whitespace from a paste, too.
  select seat into v_seat from public.join_room_by_code('  ' || v_code || ' ');
  if v_seat <> 1 then raise exception 'FAIL: rejoining moved the seat to %', v_seat; end if;
  reset role;

  if (select count(*) from public.room_members m join t_room r on m.room_id = r.id
       where m.left_at is null) <> 2 then
    raise exception 'FAIL: a duplicate membership was created';
  end if;
end $$;
\echo 'PASS  joining is case-insensitive, whitespace-tolerant and idempotent'

do $$
begin
  perform pg_temp.act('b0000000-0000-0000-0000-000000000003');
  set local role authenticated;
  begin
    perform public.join_room_by_code('ZZZZZ');
    raise exception 'FAIL: joined a room that does not exist';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'INVALID_ROOM' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;
end $$;
\echo 'PASS  an unknown code is reported as such'

do $$
begin
  -- Fill the room: seats 2-5 go to G3..G6.
  perform pg_temp.act('b0000000-0000-0000-0000-000000000003');
  set local role authenticated; perform public.join_room_by_code((select code from t_room)); reset role;
  perform pg_temp.act('b0000000-0000-0000-0000-000000000004');
  set local role authenticated; perform public.join_room_by_code((select code from t_room)); reset role;
  perform pg_temp.act('b0000000-0000-0000-0000-000000000005');
  set local role authenticated; perform public.join_room_by_code((select code from t_room)); reset role;
  perform pg_temp.act('b0000000-0000-0000-0000-000000000006');
  set local role authenticated; perform public.join_room_by_code((select code from t_room)); reset role;

  if (select count(*) from public.room_members m join t_room r on m.room_id = r.id
       where m.left_at is null) <> 6 then
    raise exception 'FAIL: the room did not reach six';
  end if;

  perform pg_temp.act('b0000000-0000-0000-0000-000000000007');
  set local role authenticated;
  begin
    perform public.join_room_by_code((select code from t_room));
    raise exception 'FAIL: a seventh player joined';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'ROOM_FULL' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;
end $$;
\echo 'PASS  six players seat, and the seventh is told the room is full'

-- -----------------------------------------------------------------------------
-- Leaving and returning
-- -----------------------------------------------------------------------------

do $$
declare v_seat smallint;
begin
  perform pg_temp.act('b0000000-0000-0000-0000-000000000006');
  set local role authenticated;
  perform public.leave_room((select id from t_room));
  reset role;

  if (select count(*) from public.room_members m join t_room r on m.room_id = r.id
       where m.left_at is null) <> 5 then
    raise exception 'FAIL: leaving did not free the seat';
  end if;

  -- The freed seat is available to someone new.
  perform pg_temp.act('b0000000-0000-0000-0000-000000000007');
  set local role authenticated;
  select seat into v_seat from public.join_room_by_code((select code from t_room));
  reset role;
  if v_seat <> 5 then raise exception 'FAIL: expected the vacated seat 5, got %', v_seat; end if;
end $$;
\echo 'PASS  a seat freed by leaving is taken by the next player'

-- -----------------------------------------------------------------------------
-- Kicking
-- -----------------------------------------------------------------------------

do $$
begin
  perform pg_temp.act('b0000000-0000-0000-0000-000000000002');
  set local role authenticated;
  begin
    perform public.kick_player((select id from t_room),
                               'b0000000-0000-0000-0000-000000000003');
    raise exception 'FAIL: a non-host removed somebody';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'NOT_HOST' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;
end $$;
\echo 'PASS  only the host can remove a player'

do $$
begin
  perform pg_temp.act('b0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  begin
    perform public.kick_player((select id from t_room),
                               'b0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: the host removed themselves';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'CANNOT_KICK_SELF' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;

  perform public.kick_player((select id from t_room),
                             'b0000000-0000-0000-0000-000000000003');
  reset role;

  if exists (select 1 from public.room_members m join t_room r on m.room_id = r.id
              where m.user_id = 'b0000000-0000-0000-0000-000000000003' and m.left_at is null) then
    raise exception 'FAIL: the removed player still holds a seat';
  end if;
end $$;
\echo 'PASS  the host removes a player, and cannot remove themselves'

do $$
begin
  perform pg_temp.act('b0000000-0000-0000-0000-000000000003');
  set local role authenticated;
  begin
    perform public.join_room_by_code((select code from t_room));
    raise exception 'FAIL: a removed player walked straight back in';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'REMOVED_FROM_ROOM' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;
end $$;
\echo 'PASS  a removed player cannot rejoin with the same identity'

-- -----------------------------------------------------------------------------
-- Host migration, and closing
-- -----------------------------------------------------------------------------

do $$
declare v_host uuid;
begin
  perform pg_temp.act('b0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  perform public.leave_room((select id from t_room));
  reset role;

  select host_id into v_host from public.rooms where id = (select id from t_room);
  if v_host is null then raise exception 'FAIL: the room was left hostless'; end if;
  if v_host = 'b0000000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: the departed host is still hosting';
  end if;
  if not exists (select 1 from public.room_members m join t_room r on m.room_id = r.id
                  where m.user_id = v_host and m.left_at is null) then
    raise exception 'FAIL: the new host is not even in the room';
  end if;
end $$;
\echo 'PASS  a departing host hands the room to a player still at the table'

do $$
declare u uuid; v_status text;
begin
  for u in select m.user_id from public.room_members m
            join t_room r on m.room_id = r.id where m.left_at is null loop
    perform pg_temp.act(u);
    set local role authenticated;
    perform public.leave_room((select id from t_room));
    reset role;
  end loop;

  select status into v_status from public.rooms where id = (select id from t_room);
  if v_status <> 'closed' then
    raise exception 'FAIL: the room should have closed, status is %', v_status;
  end if;
end $$;
\echo 'PASS  the room closes when the last player leaves'

-- -----------------------------------------------------------------------------
-- A game in progress is not joinable
-- -----------------------------------------------------------------------------

do $$
declare v_code text; v_id uuid;
begin
  perform pg_temp.act('b0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  select room_id, code into v_id, v_code from public.create_room();
  reset role;

  update public.rooms set status = 'in_game' where id = v_id;

  perform pg_temp.act('b0000000-0000-0000-0000-000000000002');
  set local role authenticated;
  begin
    perform public.join_room_by_code(v_code);
    raise exception 'FAIL: someone joined a game already under way';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'GAME_ALREADY_STARTED' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;

  -- But a player already seated may still "join" — which is what makes a page
  -- refresh mid-game harmless.
  perform pg_temp.act('b0000000-0000-0000-0000-000000000001');
  set local role authenticated;
  perform public.join_room_by_code(v_code);
  reset role;

  -- expires_at is derived, not assigned: the trigger recomputes it on every
  -- write, which is exactly what makes activity extend a room's life. Forcing
  -- the state that only time would otherwise produce means suspending it.
  alter table public.rooms disable trigger rooms_set_expiry;
  update public.rooms set expires_at = now() - interval '1 minute' where id = v_id;
  alter table public.rooms enable trigger rooms_set_expiry;

  perform pg_temp.act('b0000000-0000-0000-0000-000000000002');
  set local role authenticated;
  begin
    perform public.join_room_by_code(v_code);
    raise exception 'FAIL: joined an expired room';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'ROOM_EXPIRED' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
  reset role;
end $$;
\echo 'PASS  a started room rejects newcomers but still readmits its own players'
\echo 'PASS  an expired room is refused'

-- -----------------------------------------------------------------------------
-- Clients cannot reach the internals
-- -----------------------------------------------------------------------------

do $$
begin
  perform pg_temp.act('b0000000-0000-0000-0000-000000000001');
  set local role authenticated;

  begin
    perform public.require_player();
    raise exception 'FAIL: a client called require_player directly';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.ensure_room_host((select id from t_room));
    raise exception 'FAIL: a client called ensure_room_host directly';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
\echo 'PASS  internal helpers are not reachable from a client'

drop table t_room;

\echo ''
\echo '================ ROOM ACTION TESTS PASSED ================'
