-- =============================================================================
-- Private dice — the security boundary
-- =============================================================================
-- One question, asked every way it can be asked: can a player obtain another
-- player's dice? Directly, through a join, through a room-wide query, through
-- the reveal table, through the event log, or through Realtime.
--
-- These are the tests that matter most in the project. A pass here is the
-- difference between a game and a spectacle.
-- =============================================================================

\set ON_ERROR_STOP on

\set a '''f1000000-0000-0000-0000-000000000001'''
\set b '''f1000000-0000-0000-0000-000000000002'''
\set c '''f1000000-0000-0000-0000-000000000003'''
\set outsider '''f1000000-0000-0000-0000-0000000000ff'''

insert into auth.users (id) values (:a),(:b),(:c),(:outsider);
insert into public.profiles (id, display_name) values
  (:a,'Ana'),(:b,'Ben'),(:c,'Cal'),(:outsider,'Nosey');

create or replace function pg_temp.act3(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

-- A game with three players and a round in progress.
do $$
declare v_room uuid; v_code text; v_game uuid; v_round uuid;
begin
  perform pg_temp.act3('f1000000-0000-0000-0000-000000000001');
  set local role authenticated;
  select room_id, code into v_room, v_code from public.create_room();
  reset role;

  perform pg_temp.act3('f1000000-0000-0000-0000-000000000002');
  set local role authenticated; perform public.join_room_by_code(v_code); reset role;
  perform pg_temp.act3('f1000000-0000-0000-0000-000000000003');
  set local role authenticated; perform public.join_room_by_code(v_code); reset role;

  perform pg_temp.act3('f1000000-0000-0000-0000-000000000001');
  set local role authenticated; v_game := public.start_game(v_room); reset role;

  insert into public.rounds (game_id, round_number, turn_player_id)
  values (v_game, 1, 'f1000000-0000-0000-0000-000000000001')
  returning id into v_round;

  -- Distinct hands, so a leak is unmistakable rather than a coincidence.
  insert into public.player_dice (round_id, player_id, dice) values
    (v_round, 'f1000000-0000-0000-0000-000000000001', array[1,1,1,1,1]::smallint[]),
    (v_round, 'f1000000-0000-0000-0000-000000000002', array[2,2,2,2,2]::smallint[]),
    (v_round, 'f1000000-0000-0000-0000-000000000003', array[3,3,3,3,3]::smallint[]);

  create temp table t_d as select v_room as room, v_game as game, v_round as round;
end $$;
grant select on t_d to authenticated;
\echo '--- three players, one round, three distinct hands ---'

-- -----------------------------------------------------------------------------
-- The central claim
-- -----------------------------------------------------------------------------

do $$
declare n int; mine smallint[];
begin
  perform pg_temp.act3('f1000000-0000-0000-0000-000000000001');
  set local role authenticated;

  -- Ana asks for every hand on the table.
  select count(*) into n from public.player_dice;
  if n <> 1 then
    raise exception 'FAIL: Ana can see % hands, expected only her own', n;
  end if;

  select dice into mine from public.player_dice;
  if mine <> array[1,1,1,1,1]::smallint[] then
    raise exception 'FAIL: Ana got the wrong hand: %', mine;
  end if;

  -- Naming another player explicitly changes nothing.
  select count(*) into n from public.player_dice
   where player_id = 'f1000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FAIL: Ana read Ben''s hand by asking for it'; end if;

  reset role;
end $$;
\echo 'PASS  a player sees their own hand and no other'

do $$
declare n int;
begin
  perform pg_temp.act3('f1000000-0000-0000-0000-000000000002');
  set local role authenticated;

  -- Through a join from a table Ben is entitled to read in full.
  select count(*) into n
    from public.game_players gp
    join public.player_dice pd on pd.player_id = gp.user_id
   where gp.game_id = (select game from t_d);
  if n <> 1 then
    raise exception 'FAIL: a join exposed % hands to Ben', n;
  end if;

  -- Through the round, which is public to the room.
  select count(*) into n
    from public.rounds r
    join public.player_dice pd on pd.round_id = r.id
   where r.id = (select round from t_d);
  if n <> 1 then
    raise exception 'FAIL: joining through rounds exposed % hands', n;
  end if;

  -- An aggregate is still a read. Counting other people's dice is not allowed
  -- either, and the sum proves which rows were visible.
  if (select coalesce(sum(d), 0) from public.player_dice pd,
        unnest(pd.dice) d) <> 10 then
    raise exception 'FAIL: an aggregate reached beyond Ben''s own hand';
  end if;

  reset role;
end $$;
\echo 'PASS  joins and aggregates cannot widen the view'

do $$
declare n int;
begin
  -- Somebody with a valid session who is in no room at all.
  perform pg_temp.act3('f1000000-0000-0000-0000-0000000000ff');
  set local role authenticated;

  select count(*) into n from public.player_dice;
  if n <> 0 then raise exception 'FAIL: an outsider saw % hands', n; end if;

  select count(*) into n from public.rounds;
  if n <> 0 then raise exception 'FAIL: an outsider saw the round state'; end if;

  select count(*) into n from public.game_events;
  if n <> 0 then raise exception 'FAIL: an outsider saw the event log'; end if;

  reset role;
end $$;
\echo 'PASS  a stranger sees nothing at all'

do $$
begin
  perform pg_temp.act3('f1000000-0000-0000-0000-000000000002');
  set local role authenticated;

  -- Writing is not a client capability anywhere in this schema.
  begin
    update public.player_dice set dice = array[6,6,6,6,6]::smallint[];
    raise exception 'FAIL: a player rewrote dice';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.player_dice (round_id, player_id, dice)
    values ((select round from t_d), 'f1000000-0000-0000-0000-000000000002',
            array[6,6,6,6,6]::smallint[]);
    raise exception 'FAIL: a player minted their own dice';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.rounds set bid_quantity = 99;
    raise exception 'FAIL: a player edited the bid directly';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.game_events (game_id, kind) values ((select game from t_d), 'forged');
    raise exception 'FAIL: a player forged an event';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.dice_reveals (round_id, player_id, dice)
    values ((select round from t_d), 'f1000000-0000-0000-0000-000000000001',
            array[1,1,1,1,1]::smallint[]);
    raise exception 'FAIL: a player faked a reveal';
  exception when insufficient_privilege then null;
  end;

  reset role;
end $$;
\echo 'PASS  no client may write dice, bids, reveals or events'

-- -----------------------------------------------------------------------------
-- Reveals: the one legitimate way out
-- -----------------------------------------------------------------------------

do $$
declare n int;
begin
  insert into public.dice_reveals (round_id, player_id, dice)
  select (select round from t_d), player_id, dice from public.player_dice
   where round_id = (select round from t_d);

  perform pg_temp.act3('f1000000-0000-0000-0000-000000000002');
  set local role authenticated;
  select count(*) into n from public.dice_reveals;
  if n <> 3 then
    raise exception 'FAIL: after a reveal Ben sees % hands, expected 3', n;
  end if;
  reset role;

  -- And an outsider still sees nothing, reveal or not.
  perform pg_temp.act3('f1000000-0000-0000-0000-0000000000ff');
  set local role authenticated;
  select count(*) into n from public.dice_reveals;
  if n <> 0 then raise exception 'FAIL: an outsider saw revealed dice'; end if;
  reset role;
end $$;
\echo 'PASS  a reveal opens dice to the room, and only to the room'

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_dice'
  ) then
    raise exception 'FAIL: player_dice is published to Realtime';
  end if;

  -- Replication is a second distribution channel. A table safe under RLS is not
  -- automatically safe when broadcast, so the values must never enter that path.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rounds'
  ) then
    raise exception 'FAIL: round state is not published, so play will not appear live';
  end if;
end $$;
\echo 'PASS  round state is broadcast; private dice never are'

-- -----------------------------------------------------------------------------
-- Shape constraints
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    insert into public.player_dice (round_id, player_id, dice)
    values ((select round from t_d), 'f1000000-0000-0000-0000-0000000000ff',
            array[0,7]::smallint[]);
    raise exception 'FAIL: impossible dice faces were stored';
  exception when check_violation then null;
  end;

  begin
    insert into public.player_dice (round_id, player_id, dice)
    values ((select round from t_d), 'f1000000-0000-0000-0000-0000000000ff',
            array[1,1,1,1,1,1]::smallint[]);
    raise exception 'FAIL: six dice were stored for one player';
  exception when check_violation then null;
  end;

  -- A bid is a quantity, a face and whoever said it, never a fragment.
  begin
    update public.rounds set bid_quantity = 3 where id = (select round from t_d);
    raise exception 'FAIL: half a bid was accepted';
  exception when check_violation then null;
  end;

  -- Bull re-reads an existing bid, so there must be one.
  begin
    update public.rounds set bull_player_id = 'f1000000-0000-0000-0000-000000000001'
     where id = (select round from t_d);
    raise exception 'FAIL: a Bull was declared with no bid to re-read';
  exception when check_violation then null;
  end;

  -- A locked face belongs to a Farewell Round and nowhere else.
  begin
    update public.rounds set locked_face = 4 where id = (select round from t_d);
    raise exception 'FAIL: a normal round was given a locked face';
  exception when check_violation then null;
  end;
end $$;
\echo 'PASS  impossible dice, half-bids and stray locked faces are refused'

drop table t_d;

\echo ''
\echo '================ PRIVATE DICE TESTS PASSED ================'
