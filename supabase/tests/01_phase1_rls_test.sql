-- =============================================================================
-- PHASE 1 verification — schema constraints and RLS isolation
-- =============================================================================
-- Run via scripts/test-db.sh. Any failed assertion aborts with a non-zero exit.
--
-- The question every test below answers: can a player see or change anything
-- that is not theirs? Seed data is inserted as the superuser (RLS bypassed);
-- assertions run as `authenticated` with a JWT subject, exactly as PostgREST
-- executes a client request.
-- =============================================================================

\set ON_ERROR_STOP on

-- Fixed UUIDs so failures are readable.
\set alice '''11111111-1111-1111-1111-111111111111'''
\set bob   '''22222222-2222-2222-2222-222222222222'''
\set carol '''33333333-3333-3333-3333-333333333333'''

-- Claim payloads as PostgREST would set them for each request.
\set alice_jwt '''{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'''
\set carol_jwt '''{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'''

-- -----------------------------------------------------------------------------
-- Seed
-- -----------------------------------------------------------------------------
insert into auth.users (id, is_anonymous) values
  (:alice, true), (:bob, true), (:carol, true);

insert into public.profiles (id, display_name) values
  (:alice, 'Alice'), (:bob, 'Bob'), (:carol, 'Carol');

-- Room 1: Alice (host) + Bob.       Room 2: Carol alone — a different table.
insert into public.rooms (id, code, host_id, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ABCDE', :alice, 'in_game'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'FGHJK', :carol, 'lobby');

insert into public.room_members (room_id, user_id, seat) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :alice, 0),
  ('aaaaaaaa-0000-0000-0000-000000000001', :bob,   1),
  ('bbbbbbbb-0000-0000-0000-000000000002', :carol, 0);

insert into public.games (id, room_id, status, started_at) values
  ('cccccccc-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000001', 'active', now());

insert into public.game_players (game_id, user_id, seat, dice_count) values
  ('cccccccc-0000-0000-0000-000000000003', :alice, 0, 5),
  ('cccccccc-0000-0000-0000-000000000003', :bob,   1, 3);

\echo '--- seed ok ---'

-- -----------------------------------------------------------------------------
-- Schema invariants (checked as owner; these are constraints, not policies)
-- -----------------------------------------------------------------------------

do $$
begin
  -- Elimination is a generated column, so it cannot disagree with dice_count.
  update public.game_players set dice_count = 0
   where user_id = '22222222-2222-2222-2222-222222222222';

  if not (select is_eliminated from public.game_players
           where user_id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL: dice_count=0 did not derive is_eliminated=true';
  end if;

  update public.game_players set dice_count = 3
   where user_id = '22222222-2222-2222-2222-222222222222';

  if (select is_eliminated from public.game_players
       where user_id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL: dice_count>0 still reported is_eliminated=true';
  end if;
end $$;
\echo 'PASS  elimination is derived from dice_count'

do $$
begin
  begin
    insert into public.game_players (game_id, user_id, seat, dice_count)
    values ('cccccccc-0000-0000-0000-000000000003',
            '33333333-3333-3333-3333-333333333333', 2, -1);
    raise exception 'FAIL: negative dice_count was accepted';
  exception when check_violation then null;
  end;
end $$;
\echo 'PASS  negative dice_count rejected'

do $$
begin
  begin
    insert into public.rooms (code, host_id) values
      ('abc', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: malformed room code was accepted';
  exception when check_violation then null;
  end;
end $$;
\echo 'PASS  malformed room code rejected'

do $$
begin
  begin
    -- Room 1 already has a live game.
    insert into public.games (room_id, status) values
      ('aaaaaaaa-0000-0000-0000-000000000001', 'active');
    raise exception 'FAIL: a second live game was allowed in one room';
  exception when unique_violation then null;
  end;
end $$;
\echo 'PASS  only one live game per room'

do $$
begin
  begin
    insert into public.games (room_id, status, winner_id) values
      ('bbbbbbbb-0000-0000-0000-000000000002', 'active',
       '33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL: winner was allowed on a non-completed game';
  exception when check_violation then null;
  end;
end $$;
\echo 'PASS  winner requires a completed game'

-- -----------------------------------------------------------------------------
-- RLS — Alice is a member of room 1
-- -----------------------------------------------------------------------------

begin;
set local request.jwt.claims = :alice_jwt;
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.rooms;
  if n <> 1 then raise exception 'FAIL: Alice sees % rooms, expected 1', n; end if;

  if not exists (select 1 from public.rooms where code = 'ABCDE') then
    raise exception 'FAIL: Alice cannot see her own room';
  end if;

  select count(*) into n from public.room_members;
  if n <> 2 then raise exception 'FAIL: Alice sees % members, expected 2', n; end if;

  select count(*) into n from public.games;
  if n <> 1 then raise exception 'FAIL: Alice sees % games, expected 1', n; end if;

  select count(*) into n from public.game_players;
  if n <> 2 then raise exception 'FAIL: Alice sees % game_players, expected 2', n; end if;

  -- Carol shares no room with Alice, so her display name must be invisible.
  select count(*) into n from public.profiles;
  if n <> 2 then raise exception 'FAIL: Alice sees % profiles, expected 2', n; end if;

  if exists (select 1 from public.profiles where display_name = 'Carol') then
    raise exception 'FAIL: Alice can read the profile of a stranger';
  end if;
end $$;
commit;
\echo 'PASS  Alice sees exactly her own room, game and co-members'

-- -----------------------------------------------------------------------------
-- RLS — Carol is in a different room and must be fully isolated
-- -----------------------------------------------------------------------------

begin;
set local request.jwt.claims = :carol_jwt;
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.rooms;
  if n <> 1 then raise exception 'FAIL: Carol sees % rooms, expected 1', n; end if;

  if exists (select 1 from public.rooms where code = 'ABCDE') then
    raise exception 'FAIL: Carol can see a room she does not belong to';
  end if;

  select count(*) into n from public.games;
  if n <> 0 then raise exception 'FAIL: Carol sees % games, expected 0', n; end if;

  select count(*) into n from public.game_players;
  if n <> 0 then
    raise exception 'FAIL: Carol sees % game_players from another room, expected 0', n;
  end if;

  select count(*) into n from public.room_members;
  if n <> 1 then raise exception 'FAIL: Carol sees % members, expected 1', n; end if;

  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL: Carol sees % profiles, expected 1', n; end if;
end $$;
commit;
\echo 'PASS  Carol is fully isolated from another room'

-- -----------------------------------------------------------------------------
-- RLS — clients hold no write privileges on game state
-- -----------------------------------------------------------------------------

begin;
set local request.jwt.claims = :alice_jwt;
set local role authenticated;

do $$
begin
  begin
    insert into public.rooms (code, host_id)
    values ('ZZZZZ', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: a client inserted a room directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.games set status = 'completed';
    raise exception 'FAIL: a client updated game state directly';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.game_players set dice_count = 5;
    raise exception 'FAIL: a client changed a dice count directly';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.room_members;
    raise exception 'FAIL: a client deleted membership directly';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.generate_room_code();
    raise exception 'FAIL: a client can generate room codes';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
\echo 'PASS  clients cannot write game state or mint room codes'

-- -----------------------------------------------------------------------------
-- RLS — a player owns their own profile and nobody else's
-- -----------------------------------------------------------------------------

begin;
set local request.jwt.claims = :alice_jwt;
set local role authenticated;

do $$
declare n int;
begin
  update public.profiles set display_name = 'Alice Renamed'
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Alice could not rename herself'; end if;

  -- Bob is visible to Alice, so this is the interesting case: visibility must
  -- not imply write access.
  update public.profiles set display_name = 'Hacked'
   where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Alice renamed Bob (% rows)', n; end if;

  begin
    insert into public.profiles (id, display_name)
    values ('44444444-4444-4444-4444-444444444444', 'Impostor');
    raise exception 'FAIL: Alice created a profile for another user id';
  -- A WITH CHECK rejection surfaces as insufficient_privilege (42501),
  -- not as a constraint violation.
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
\echo 'PASS  a player can edit only their own profile'

-- -----------------------------------------------------------------------------
-- Signed-out callers get nothing
-- -----------------------------------------------------------------------------

begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.rooms;
    raise exception 'FAIL: anon could read rooms';
  exception when insufficient_privilege then null;
  end;

  begin
    perform count(*) from public.game_players;
    raise exception 'FAIL: anon could read game_players';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
\echo 'PASS  signed-out callers have no access'

-- -----------------------------------------------------------------------------
-- Realtime publication carries only public state
-- -----------------------------------------------------------------------------

do $$
declare n int;
begin
  select count(*) into n
    from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public';
  if n <> 4 then
    raise exception 'FAIL: expected 4 published tables, found %', n;
  end if;

  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    raise exception 'FAIL: profiles should not be broadcast';
  end if;
end $$;
\echo 'PASS  realtime publishes exactly the four public game tables'

\echo ''
\echo '================ ALL PHASE 1 TESTS PASSED ================'
