-- =============================================================================
-- Dealing, counting and revealing
-- =============================================================================

\set ON_ERROR_STOP on

\set a '''d9000000-0000-0000-0000-000000000001'''
\set b '''d9000000-0000-0000-0000-000000000002'''
\set c '''d9000000-0000-0000-0000-000000000003'''

insert into auth.users (id) values (:a),(:b),(:c);
insert into public.profiles (id, display_name) values (:a,'Ana'),(:b,'Ben'),(:c,'Cal');

create or replace function pg_temp.act4(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

do $$
declare v_room uuid; v_code text; v_game uuid;
begin
  perform pg_temp.act4('d9000000-0000-0000-0000-000000000001');
  set local role authenticated;
  select room_id, code into v_room, v_code from public.create_room();
  reset role;
  perform pg_temp.act4('d9000000-0000-0000-0000-000000000002');
  set local role authenticated; perform public.join_room_by_code(v_code); reset role;
  perform pg_temp.act4('d9000000-0000-0000-0000-000000000003');
  set local role authenticated; perform public.join_room_by_code(v_code); reset role;
  perform pg_temp.act4('d9000000-0000-0000-0000-000000000001');
  set local role authenticated; v_game := public.start_game(v_room); reset role;
  create temp table t_deal as select v_room as room, v_game as game;
end $$;
grant select on t_deal to authenticated;
\echo '--- a game with three players on five dice each ---'

-- -----------------------------------------------------------------------------
-- A fair die
-- -----------------------------------------------------------------------------

do $$
declare
  counts int[] := array[0,0,0,0,0,0];
  f int; n constant int := 12000; lo int; hi int;
begin
  for i in 1..n loop
    f := public.roll_die();
    if f < 1 or f > 6 then raise exception 'FAIL: rolled %', f; end if;
    counts[f] := counts[f] + 1;
  end loop;

  select min(x), max(x) into lo, hi from unnest(counts) x;

  -- Expect n/6 = 2000 each. A fair die stays well inside 15%; a byte taken
  -- modulo 6 without rejecting the tail would show 1-4 running about 20% ahead
  -- of 5 and 6, which this catches comfortably.
  if lo < n/6.0 * 0.85 or hi > n/6.0 * 1.15 then
    raise exception 'FAIL: distribution is skewed: %', counts;
  end if;
end $$;
\echo 'PASS  the die is fair across twelve thousand rolls'

-- -----------------------------------------------------------------------------
-- Dealing
-- -----------------------------------------------------------------------------

do $$
declare v_round uuid; n int;
begin
  v_round := public.deal_round((select game from t_deal), 'normal',
                               'd9000000-0000-0000-0000-000000000001');

  select count(*) into n from public.player_dice where round_id = v_round;
  if n <> 3 then raise exception 'FAIL: dealt % hands, expected 3', n; end if;

  -- Everyone gets exactly as many dice as they hold; the count is the authority.
  if exists (
    select 1 from public.player_dice pd
      join public.game_players gp on gp.user_id = pd.player_id
     where pd.round_id = v_round
       and gp.game_id = (select game from t_deal)
       and array_length(pd.dice, 1) <> gp.dice_count
  ) then
    raise exception 'FAIL: a hand does not match its dice count';
  end if;

  create temp table t_round as select v_round as id;
end $$;
grant select on t_round to authenticated;
\echo 'PASS  dealing gives every player exactly the dice they hold'

do $$
begin
  begin
    perform public.deal_round((select game from t_deal));
    raise exception 'FAIL: a second round was dealt while one was open';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'ROUND_ALREADY_OPEN' then raise exception 'FAIL: wrong error %', sqlerrm; end if;
  end;
end $$;
\echo 'PASS  a second deal cannot open while a round is live'

-- -----------------------------------------------------------------------------
-- Counting
-- -----------------------------------------------------------------------------

do $$
declare v_round uuid; v_expected int; v_got int; f smallint;
begin
  select id into v_round from t_round;

  -- Replace the dealt hands with known ones, so the arithmetic is checkable.
  delete from public.player_dice where round_id = v_round;
  insert into public.player_dice (round_id, player_id, dice) values
    (v_round, 'd9000000-0000-0000-0000-000000000001', array[5,5,1,3,2]::smallint[]),
    (v_round, 'd9000000-0000-0000-0000-000000000002', array[1,1,4,4,6]::smallint[]),
    (v_round, 'd9000000-0000-0000-0000-000000000003', array[5,2,2,6,3]::smallint[]);
  -- fives: 2 + 0 + 1 = 3, plus three ones wild = 6
  -- ones:  1 + 2 + 0 = 3, counted alone

  v_got := public.count_face(v_round, 5::smallint);
  if v_got <> 6 then raise exception 'FAIL: fives counted %, expected 6', v_got; end if;

  v_got := public.count_face(v_round, 1::smallint);
  if v_got <> 3 then
    raise exception 'FAIL: Perudo counted %, expected 3 — the wildcard counted itself twice', v_got;
  end if;

  -- Farewell: the one stops being wild, so fives drop to three.
  update public.rounds set type = 'farewell' where id = v_round;
  v_got := public.count_face(v_round, 5::smallint);
  if v_got <> 3 then
    raise exception 'FAIL: fives counted % in a Farewell Round, expected 3', v_got;
  end if;

  v_got := public.count_face(v_round, 1::smallint);
  if v_got <> 3 then raise exception 'FAIL: locked Perudo counted %, expected 3', v_got; end if;

  update public.rounds set type = 'normal' where id = v_round;
end $$;
\echo 'PASS  counting honours the wildcard, and drops it in a Farewell Round'

-- -----------------------------------------------------------------------------
-- Revealing
-- -----------------------------------------------------------------------------

do $$
declare v_round uuid; n int;
begin
  select id into v_round from t_round;

  perform public.reveal_round(v_round);
  select count(*) into n from public.dice_reveals where round_id = v_round;
  if n <> 3 then raise exception 'FAIL: revealed % hands, expected 3', n; end if;

  -- Revealing twice must not duplicate or error: a retried request is normal.
  perform public.reveal_round(v_round);
  select count(*) into n from public.dice_reveals where round_id = v_round;
  if n <> 3 then raise exception 'FAIL: a second reveal produced % rows', n; end if;

  -- The private rows survive, so a reveal cannot be undone by deleting them.
  select count(*) into n from public.player_dice where round_id = v_round;
  if n <> 3 then raise exception 'FAIL: revealing consumed the private hands'; end if;
end $$;
\echo 'PASS  revealing is repeatable and leaves the private hands intact'

-- -----------------------------------------------------------------------------
-- None of this is a client capability
-- -----------------------------------------------------------------------------

do $$
begin
  perform pg_temp.act4('d9000000-0000-0000-0000-000000000002');
  set local role authenticated;

  begin
    perform public.roll_die();
    raise exception 'FAIL: a client rolled a die';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.deal_round((select game from t_deal));
    raise exception 'FAIL: a client dealt a round';
  exception when insufficient_privilege then null;
  end;

  begin
    -- This is the dangerous one: counting the table before bidding would let a
    -- player see through every cup without ever reading a single die.
    perform public.count_face((select id from t_round), 5::smallint);
    raise exception 'FAIL: a client counted the table';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.reveal_round((select id from t_round));
    raise exception 'FAIL: a client forced a reveal';
  exception when insufficient_privilege then null;
  end;

  reset role;
end $$;
\echo 'PASS  no client may roll, deal, count or reveal'

drop table t_deal; drop table t_round;

\echo ''
\echo '================ DEALING TESTS PASSED ================'
