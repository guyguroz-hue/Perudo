-- =============================================================================
-- Applying a decided action
-- =============================================================================
-- These functions contain no game rules, so nothing here tests a rule. What it
-- tests is the two things they do claim: that a write lands against the state
-- it was computed from, and that a resolution lands whole or not at all.

\set ON_ERROR_STOP on

\set a '''da000000-0000-0000-0000-000000000001'''
\set b '''da000000-0000-0000-0000-000000000002'''
\set c '''da000000-0000-0000-0000-000000000003'''

insert into auth.users (id) values (:a),(:b),(:c);
insert into public.profiles (id, display_name) values (:a,'Ana'),(:b,'Ben'),(:c,'Cal');

create or replace function pg_temp.act7(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

do $$
declare v_room uuid; v_code text; v_game uuid; v_round uuid;
begin
  perform pg_temp.act7('da000000-0000-0000-0000-000000000001');
  set local role authenticated;
  select room_id, code into v_room, v_code from public.create_room();
  reset role;
  perform pg_temp.act7('da000000-0000-0000-0000-000000000002');
  set local role authenticated; perform public.join_room_by_code(v_code); reset role;
  perform pg_temp.act7('da000000-0000-0000-0000-000000000003');
  set local role authenticated; perform public.join_room_by_code(v_code); reset role;
  perform pg_temp.act7('da000000-0000-0000-0000-000000000001');
  set local role authenticated; v_game := public.start_game(v_room); reset role;

  v_round := public.deal_round(v_game, 'normal', 'da000000-0000-0000-0000-000000000001');
  create temp table t_act as select v_game as game, v_round as round;
end $$;
\echo '--- three players, five dice each, one round open ---'

-- -----------------------------------------------------------------------------
-- A write lands against the state it was computed from
-- -----------------------------------------------------------------------------

do $$
declare v_round uuid := (select round from t_act); v_v integer; n int;
begin
  select version into v_v from public.rounds where id = v_round;

  perform public.apply_bid(
    v_round, v_v, 'da000000-0000-0000-0000-000000000001',
    4::smallint, 5::smallint, false,
    'da000000-0000-0000-0000-000000000002', false);

  select count(*) into n from public.rounds
   where id = v_round and bid_quantity = 4 and bid_face = 5
     and turn_player_id = 'da000000-0000-0000-0000-000000000002'
     and version = v_v + 1;
  if n <> 1 then raise exception 'FAIL: the bid did not land'; end if;

  -- The same call again, with the version it read the first time. Two players
  -- bursting at once is not hypothetical here: it is the normal case.
  begin
    perform public.apply_bid(
      v_round, v_v, 'da000000-0000-0000-0000-000000000003',
      5::smallint, 5::smallint, true,
      'da000000-0000-0000-0000-000000000001', false);
    raise exception 'FAIL: a stale write was accepted';
  exception when raise_exception then
    if sqlerrm <> 'STALE_STATE' then raise; end if;
  end;

  select count(*) into n from public.rounds where id = v_round and bid_quantity = 4;
  if n <> 1 then raise exception 'FAIL: the loser of the race changed the bid'; end if;
end $$;
\echo 'PASS  a write against a version that has moved on is refused'

-- -----------------------------------------------------------------------------
-- Bull
-- -----------------------------------------------------------------------------

do $$
declare v_round uuid := (select round from t_act); v_v integer; n int;
begin
  select version into v_v from public.rounds where id = v_round;
  perform public.apply_bull(v_round, v_v, 'da000000-0000-0000-0000-000000000003',
                            true, 'da000000-0000-0000-0000-000000000001');

  select count(*) into n from public.rounds
   where id = v_round
     and bull_player_id = 'da000000-0000-0000-0000-000000000003'
     and last_burst_player_id = 'da000000-0000-0000-0000-000000000003';
  if n <> 1 then raise exception 'FAIL: the Bull did not land'; end if;

  -- What a second Bull would mean is undecided, and it decides who pays
  -- (R-010). Refused in the write as well as in the action layer.
  select version into v_v from public.rounds where id = v_round;
  begin
    perform public.apply_bull(v_round, v_v, 'da000000-0000-0000-0000-000000000002',
                              true, 'da000000-0000-0000-0000-000000000003');
    raise exception 'FAIL: a second Bull was accepted';
  exception when raise_exception then
    if sqlerrm <> 'STALE_STATE' then raise; end if;
  end;
end $$;
\echo 'PASS  a Bull lands once, and a second is refused'

do $$
declare v_round uuid := (select round from t_act); v_v integer; n int;
begin
  select version into v_v from public.rounds where id = v_round;
  perform public.apply_bid(
    v_round, v_v, 'da000000-0000-0000-0000-000000000001',
    5::smallint, 5::smallint, false,
    'da000000-0000-0000-0000-000000000002', false);

  -- GAME_RULES §8.2: a later bid supersedes the Bull entirely. Here that is not
  -- an implementation but the shape of the row — the Bull hung off a bid that
  -- no longer exists.
  select count(*) into n from public.rounds where id = v_round and bull_player_id is null;
  if n <> 1 then raise exception 'FAIL: the Bull survived a new bid'; end if;
end $$;
\echo 'PASS  a new bid clears the Bull hanging off the old one'

-- -----------------------------------------------------------------------------
-- A resolution lands whole
-- -----------------------------------------------------------------------------

do $$
declare
  v_game  uuid := (select game from t_act);
  v_round uuid := (select round from t_act);
  v_v     integer;
  v_out   jsonb;
  v_new   uuid;
  n int;
begin
  select version into v_v from public.rounds where id = v_round;

  v_out := public.apply_challenge(
    v_round, v_v,
    'da000000-0000-0000-0000-000000000002', 'dudo',
    3, false,
    jsonb_build_object('da000000-0000-0000-0000-000000000001', -1),
    array[]::uuid[],
    false, null,
    'da000000-0000-0000-0000-000000000002', 'normal', array[]::uuid[]);

  select count(*) into n from public.rounds where id = v_round and status = 'resolved';
  if n <> 1 then raise exception 'FAIL: the round was not closed'; end if;

  select count(*) into n from public.dice_reveals where round_id = v_round;
  if n <> 3 then raise exception 'FAIL: the hands were not revealed'; end if;

  select dice_count into n from public.game_players
   where game_id = v_game and user_id = 'da000000-0000-0000-0000-000000000001';
  if n <> 4 then raise exception 'FAIL: the die was not taken, got %', n; end if;

  -- The log is how every player who did not press the button learns what
  -- happened, so it has to carry the whole public result and not just that a
  -- challenge occurred.
  select count(*) into n from public.game_events
   where round_id = v_round and kind = 'dudo'
     and (payload -> 'deltas' ->> 'da000000-0000-0000-0000-000000000001')::int = -1
     and (payload ->> 'actual_count')::int = 3
     and (payload ->> 'claim_holds')::boolean = false;
  if n <> 1 then raise exception 'FAIL: the challenge was not logged in full'; end if;

  v_new := (v_out ->> 'new_round_id')::uuid;
  if v_new is null then raise exception 'FAIL: no next round was opened'; end if;

  select count(*) into n from public.rounds
   where id = v_new and status = 'bidding'
     and turn_player_id = 'da000000-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'FAIL: the next round did not open on the winner'; end if;

  -- Four dice for the player who lost one, five each for the others: the deal
  -- follows the counts the same resolution wrote.
  select count(*) into n from public.player_dice pd
   where pd.round_id = v_new
     and array_length(pd.dice, 1) = (
       select gp.dice_count from public.game_players gp
        where gp.game_id = v_game and gp.user_id = pd.player_id);
  if n <> 3 then raise exception 'FAIL: the next round was dealt the wrong hands'; end if;

  if jsonb_array_length(v_out -> 'reveals') <> 3 then
    raise exception 'FAIL: the reveal was not returned to the caller';
  end if;

  create temp table t_act2 as select v_new as round;
end $$;
\echo 'PASS  a challenge reveals, pays, logs and deals the next round together'

-- -----------------------------------------------------------------------------
-- Ending the game
-- -----------------------------------------------------------------------------

do $$
declare
  v_game  uuid := (select game from t_act);
  v_round uuid := (select round from t_act2);
  v_v integer; n int;
begin
  select version into v_v from public.rounds where id = v_round;

  perform public.apply_challenge(
    v_round, v_v,
    'da000000-0000-0000-0000-000000000001', 'dudo',
    2, false,
    jsonb_build_object(
      'da000000-0000-0000-0000-000000000002', -5,
      'da000000-0000-0000-0000-000000000003', -5),
    array['da000000-0000-0000-0000-000000000002',
          'da000000-0000-0000-0000-000000000003']::uuid[],
    true, 'da000000-0000-0000-0000-000000000001',
    null, 'normal', array[]::uuid[]);

  select count(*) into n from public.games
   where id = v_game and status = 'completed'
     and winner_id = 'da000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FAIL: the game did not end'; end if;

  -- No round is dealt into a finished game.
  select count(*) into n from public.rounds where game_id = v_game and status <> 'resolved';
  if n <> 0 then raise exception 'FAIL: a round was opened after the game ended'; end if;

  select count(*) into n from public.game_players
   where game_id = v_game and is_eliminated
     and eliminated_at is not null;
  if n <> 2 then raise exception 'FAIL: eliminations were not recorded'; end if;
end $$;
\echo 'PASS  the last resolution ends the game and opens nothing'

-- -----------------------------------------------------------------------------
-- None of this is a client capability
-- -----------------------------------------------------------------------------

do $$
declare v_round uuid := (select round from t_act);
begin
  perform pg_temp.act7('da000000-0000-0000-0000-000000000002');
  set local role authenticated;

  begin
    -- A client that could call this would be writing bids that never met
    -- checkBid.
    perform public.apply_bid(v_round, 0, 'da000000-0000-0000-0000-000000000002',
                             9::smallint, 6::smallint, false,
                             'da000000-0000-0000-0000-000000000001', false);
    raise exception 'FAIL: a client wrote a bid';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.apply_bull(v_round, 0, 'da000000-0000-0000-0000-000000000002',
                              false, 'da000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a client wrote a Bull';
  exception when insufficient_privilege then null;
  end;

  begin
    -- And this one hands out dice and ends games.
    perform public.apply_challenge(
      v_round, 0, 'da000000-0000-0000-0000-000000000002', 'dudo', 0, false,
      '{}'::jsonb, array[]::uuid[], false, null, null, 'normal', array[]::uuid[]);
    raise exception 'FAIL: a client resolved a challenge';
  exception when insufficient_privilege then null;
  end;

  reset role;
end $$;
\echo 'PASS  no client may apply a bid, a Bull or a resolution'

drop table t_act; drop table t_act2;

\echo ''
\echo '================ ACTION WRITE TESTS PASSED ================'
