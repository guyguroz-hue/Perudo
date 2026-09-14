-- =============================================================================
-- Room system — schema guarantees
-- =============================================================================
-- The question these answer: can the database be made to hold a room that the
-- rules forbid? Seats, codes, lifecycle and removal are all checked by trying
-- to violate them.
--
-- Runs after 01, on the same database, with its own users and rooms.
-- =============================================================================

\set ON_ERROR_STOP on

\set p1 '''a0000000-0000-0000-0000-000000000001'''
\set p2 '''a0000000-0000-0000-0000-000000000002'''
\set p3 '''a0000000-0000-0000-0000-000000000003'''
\set p4 '''a0000000-0000-0000-0000-000000000004'''
\set p5 '''a0000000-0000-0000-0000-000000000005'''
\set p6 '''a0000000-0000-0000-0000-000000000006'''
\set p7 '''a0000000-0000-0000-0000-000000000007'''
\set room '''d0000000-0000-0000-0000-00000000000a'''

insert into auth.users (id) values (:p1),(:p2),(:p3),(:p4),(:p5),(:p6),(:p7);
insert into public.profiles (id, display_name) values
  (:p1,'One'),(:p2,'Two'),(:p3,'Three'),(:p4,'Four'),
  (:p5,'Five'),(:p6,'Six'),(:p7,'Seven');

insert into public.rooms (id, code, host_id) values (:room, 'K7MPQ', :p1);

\echo '--- room seeded ---'

-- -----------------------------------------------------------------------------
-- Six seats, and no seventh
-- -----------------------------------------------------------------------------

do $$
declare ids uuid[] := array[
  'a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000006']::uuid[];
begin
  for i in 1..6 loop
    insert into public.room_members (room_id, user_id, seat)
    values ('d0000000-0000-0000-0000-00000000000a', ids[i], i - 1);
  end loop;

  if (select count(*) from public.room_members
       where room_id = 'd0000000-0000-0000-0000-00000000000a' and left_at is null) <> 6 then
    raise exception 'FAIL: six players did not all seat';
  end if;
end $$;
\echo 'PASS  six players seat successfully'

do $$
begin
  -- There is no seat 6. The limit is the schema, not a count in application code.
  begin
    insert into public.room_members (room_id, user_id, seat)
    values ('d0000000-0000-0000-0000-00000000000a',
            'a0000000-0000-0000-0000-000000000007', 6);
    raise exception 'FAIL: a seventh seat was accepted';
  exception when check_violation then null;
  end;

  -- Nor can a seventh player squeeze onto an occupied seat.
  begin
    insert into public.room_members (room_id, user_id, seat)
    values ('d0000000-0000-0000-0000-00000000000a',
            'a0000000-0000-0000-0000-000000000007', 3);
    raise exception 'FAIL: two players shared a seat';
  exception when unique_violation then null;
  end;
end $$;
\echo 'PASS  a seventh player cannot enter, by seat range or by collision'

do $$
begin
  -- A vacated seat is reusable; a departed member is not occupying anything.
  update public.room_members set left_at = now()
   where room_id = 'd0000000-0000-0000-0000-00000000000a' and seat = 2;

  insert into public.room_members (room_id, user_id, seat)
  values ('d0000000-0000-0000-0000-00000000000a',
          'a0000000-0000-0000-0000-000000000007', 2);

  if (select count(*) from public.room_members
       where room_id = 'd0000000-0000-0000-0000-00000000000a' and left_at is null) <> 6 then
    raise exception 'FAIL: seat reuse did not keep the room at six';
  end if;
end $$;
\echo 'PASS  a vacated seat can be taken by someone new'

-- -----------------------------------------------------------------------------
-- Room codes
-- -----------------------------------------------------------------------------

do $$
begin
  -- 5 and S are the pair people mishear; neither may appear in a code.
  begin
    insert into public.rooms (code, host_id)
    values ('S7MPQ', 'a0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a code containing S was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.rooms (code, host_id)
    values ('57MPQ', 'a0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a code containing 5 was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.rooms (code, host_id)
    values ('K7MP', 'a0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a four-character code was accepted';
  exception when check_violation then null;
  end;

  -- Five is still accepted and six is what the generator now mints, so the
  -- bound has two sides and both are worth pinning: a width nobody produces is
  -- a width nobody has thought about.
  begin
    insert into public.rooms (code, host_id)
    values ('K7MPQR2', 'a0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a seven-character code was accepted';
  exception when check_violation then null;
  end;

  insert into public.rooms (code, host_id)
  values ('K7MPQ', 'a0000000-0000-0000-0000-000000000001');
  insert into public.rooms (code, host_id)
  values ('K7MPQR', 'a0000000-0000-0000-0000-000000000001');
end $$;
\echo 'PASS  confusable and malformed room codes are rejected'

do $$
declare
  code text;
begin
  for i in 1..200 loop
    code := public.generate_room_code();
    if code !~ '^[2346789ABCDEFGHJKMNPQRTUVWXYZ]{6}$' then
      raise exception 'FAIL: generator produced an invalid code: %', code;
    end if;
  end loop;
end $$;
\echo 'PASS  the generator only ever produces valid codes'

do $$
begin
  begin
    insert into public.rooms (code, host_id)
    values ('K7MPQ', 'a0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a duplicate room code was accepted';
  exception when unique_violation then null;
  end;
end $$;
\echo 'PASS  room codes are unique'

-- -----------------------------------------------------------------------------
-- Lifecycle
-- -----------------------------------------------------------------------------

do $$
declare s text;
begin
  foreach s in array array['lobby','starting','in_game','finished','closed'] loop
    update public.rooms set status = s
     where id = 'd0000000-0000-0000-0000-00000000000a';
  end loop;

  begin
    update public.rooms set status = 'playing'
     where id = 'd0000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL: an unknown room status was accepted';
  exception when check_violation then null;
  end;

  update public.rooms set status = 'lobby'
   where id = 'd0000000-0000-0000-0000-00000000000a';
end $$;
\echo 'PASS  only the five lifecycle states are accepted'

do $$
declare changed int;
begin
  -- The guard that makes Start idempotent: the second caller changes nothing.
  update public.rooms set status = 'starting'
   where id = 'd0000000-0000-0000-0000-00000000000a' and status = 'lobby';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'FAIL: the first start did not take'; end if;

  update public.rooms set status = 'starting'
   where id = 'd0000000-0000-0000-0000-00000000000a' and status = 'lobby';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: a second start was allowed through'; end if;

  update public.rooms set status = 'lobby'
   where id = 'd0000000-0000-0000-0000-00000000000a';
end $$;
\echo 'PASS  starting twice changes nothing the second time'

-- -----------------------------------------------------------------------------
-- Removal
-- -----------------------------------------------------------------------------

do $$
begin
  -- Removal is a reason for a departure, never a state without one.
  begin
    update public.room_members
       set removed_at = now(), removed_by = 'a0000000-0000-0000-0000-000000000001'
     where room_id = 'd0000000-0000-0000-0000-00000000000a' and seat = 4;
    raise exception 'FAIL: a member was removed without leaving';
  exception when check_violation then null;
  end;

  update public.room_members
     set left_at = now(), removed_at = now(),
         removed_by = 'a0000000-0000-0000-0000-000000000001'
   where room_id = 'd0000000-0000-0000-0000-00000000000a' and seat = 4;

  if (select count(*) from public.room_members
       where room_id = 'd0000000-0000-0000-0000-00000000000a' and left_at is null) <> 5 then
    raise exception 'FAIL: removal did not free the seat';
  end if;
end $$;
\echo 'PASS  removal frees the seat and records who did it'

-- -----------------------------------------------------------------------------
-- Expiry
-- -----------------------------------------------------------------------------

do $$
declare lobby_life interval; game_life interval;
begin
  update public.rooms set status = 'lobby'
   where id = 'd0000000-0000-0000-0000-00000000000a';
  select expires_at - now() into lobby_life from public.rooms
   where id = 'd0000000-0000-0000-0000-00000000000a';

  update public.rooms set status = 'in_game'
   where id = 'd0000000-0000-0000-0000-00000000000a';
  select expires_at - now() into game_life from public.rooms
   where id = 'd0000000-0000-0000-0000-00000000000a';

  if lobby_life > interval '4 hours 1 minute' or lobby_life < interval '3 hours 59 minutes' then
    raise exception 'FAIL: a lobby should live 4 hours, got %', lobby_life;
  end if;
  if game_life < interval '23 hours' then
    raise exception 'FAIL: a game in progress should live 24 hours, got %', game_life;
  end if;
  if game_life <= lobby_life then
    raise exception 'FAIL: a game in progress must outlive an idle lobby';
  end if;
end $$;
\echo 'PASS  expiry follows the lifecycle, and a live game outlives a lobby'

\echo ''
\echo '================ ROOM SYSTEM TESTS PASSED ================'
