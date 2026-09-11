-- =============================================================================
-- Applying a decided action
-- =============================================================================
-- There is not a single game rule in this file, and that is the point.
--
-- The rules live in one place — `src/game`, in TypeScript, with the Edge
-- Function running exactly the module the client reads (D-002). What SQL is
-- for here is the thing an Edge Function cannot do: commit a resolution as one
-- transaction. A challenge reveals every hand, moves dice between five
-- players, eliminates some of them, may end the game and must open the next
-- round. Half of that applied is a broken game.
--
-- So the engine decides and hands the decision over; these functions write it.
-- Every one of them is given its answer and checks only two things: that the
-- caller is writing against the state it read (`p_version`), and that the
-- write is internally consistent. Neither decides anything.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- APPLY_BID
-- -----------------------------------------------------------------------------
-- The bid has already been judged legal by `checkBid`. This records it.
--
-- The new bid clears any Bull hanging off the old one, which is GAME_RULES §8.2
-- falling out of the data model rather than being implemented: a Bull is a
-- reading of a particular bid, and that bid is gone.

create or replace function public.apply_bid(
  p_round_id  uuid,
  p_version   integer,
  p_player    uuid,
  p_quantity  smallint,
  p_face      smallint,
  p_burst     boolean,
  p_next_turn uuid,
  p_lock_face boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  update public.rounds r
     set bid_quantity  = p_quantity,
         bid_face      = p_face,
         bid_player_id = p_player,
         -- A new bid supersedes the Bull entirely (GAME_RULES §8.2).
         bull_player_id = null,
         locked_face   = case
                           when p_lock_face and r.locked_face is null then p_face
                           else r.locked_face
                         end,
         turn_player_id = p_next_turn,
         last_burst_player_id = case when p_burst then p_player else r.last_burst_player_id end,
         version       = r.version + 1
   where r.id = p_round_id
     and r.version = p_version
     and r.status = 'bidding'
  returning r.version into v_version;

  if not found then
    raise exception 'STALE_STATE';
  end if;

  insert into public.game_events (game_id, round_id, actor_id, kind, payload)
  select r.game_id, r.id, p_player,
         case when p_burst then 'burst_bid' else 'bid' end,
         jsonb_build_object('quantity', p_quantity, 'face', p_face)
    from public.rounds r where r.id = p_round_id;

  return v_version;
end;
$$;

-- -----------------------------------------------------------------------------
-- APPLY_BULL
-- -----------------------------------------------------------------------------
-- A Bull introduces no quantity and no face. It changes how the bid already on
-- the table is read, so it writes one column.

create or replace function public.apply_bull(
  p_round_id  uuid,
  p_version   integer,
  p_player    uuid,
  p_burst     boolean,
  p_next_turn uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  update public.rounds r
     set bull_player_id = p_player,
         turn_player_id = p_next_turn,
         last_burst_player_id = case when p_burst then p_player else r.last_burst_player_id end,
         version = r.version + 1
   where r.id = p_round_id
     and r.version = p_version
     and r.status = 'bidding'
     and r.bid_quantity is not null
     -- Refused rather than overwritten. What a second Bull would mean is not
     -- decided, and it decides who pays (R-010).
     and r.bull_player_id is null
  returning r.version into v_version;

  if not found then
    raise exception 'STALE_STATE';
  end if;

  insert into public.game_events (game_id, round_id, actor_id, kind, payload)
  select r.game_id, r.id, p_player,
         case when p_burst then 'burst_bull' else 'bull' end,
         jsonb_build_object('quantity', r.bid_quantity, 'face', r.bid_face)
    from public.rounds r where r.id = p_round_id;

  return v_version;
end;
$$;

-- -----------------------------------------------------------------------------
-- APPLY_CHALLENGE
-- -----------------------------------------------------------------------------
-- The whole resolution, in one transaction.
--
-- Everything it is given was decided by the engine: the count, the verdict, who
-- loses or gains a die, who is out, whether the game is over, who opens next
-- and under what round type. It writes all of it or none of it.
--
-- The version check is the lock. Burst means any active player may act at any
-- moment, so two challenges can genuinely arrive at once; the first to claim
-- the round resolves it and the second is told the state moved.

create or replace function public.apply_challenge(
  p_round_id     uuid,
  p_version      integer,
  p_challenger   uuid,
  p_kind         text,
  p_actual_count integer,
  p_claim_holds  boolean,
  -- { "<player uuid>": -1, "<player uuid>": 1 }
  p_deltas       jsonb,
  p_eliminated   uuid[],
  p_game_over    boolean,
  p_winner       uuid,
  p_next_starter uuid,
  p_next_type    text,
  p_next_queue   uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id      uuid;
  v_new_round_id uuid;
  v_reveals      jsonb;
  v_standings    jsonb;
begin
  update public.rounds r
     set status = 'resolved',
         resolved_at = now(),
         version = r.version + 1
   where r.id = p_round_id
     and r.version = p_version
     and r.status = 'bidding'
  returning r.game_id into v_game_id;

  if not found then
    raise exception 'STALE_STATE';
  end if;

  -- The one legitimate path from private dice to public, taken now that a
  -- challenge has actually been resolved.
  perform public.reveal_round(p_round_id);

  update public.game_players gp
     set dice_count = gp.dice_count + (d.value #>> '{}')::int,
         eliminated_at = case
                           when gp.dice_count + (d.value #>> '{}')::int = 0
                             then coalesce(gp.eliminated_at, now())
                           else gp.eliminated_at
                         end
    from jsonb_each(p_deltas) as d(key, value)
   where gp.game_id = v_game_id
     and gp.user_id = d.key::uuid;

  insert into public.game_events (game_id, round_id, actor_id, kind, payload)
  values (
    v_game_id, p_round_id, p_challenger, p_kind,
    jsonb_build_object(
      'actual_count', p_actual_count,
      'claim_holds', p_claim_holds,
      'eliminated', to_jsonb(p_eliminated)
    )
  );

  if p_game_over then
    update public.games g
       set status = 'completed',
           winner_id = p_winner,
           completed_at = now(),
           version = g.version + 1
     where g.id = v_game_id;
  else
    v_new_round_id := public.deal_round(v_game_id, p_next_type, p_next_starter);
    update public.rounds r
       set farewell_queue = p_next_queue
     where r.id = v_new_round_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', dr.player_id, 'dice', dr.dice)), '[]'::jsonb)
    into v_reveals
    from public.dice_reveals dr
   where dr.round_id = p_round_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', gp.user_id, 'dice_count', gp.dice_count,
           'seat', gp.seat) order by gp.seat), '[]'::jsonb)
    into v_standings
    from public.game_players gp
   where gp.game_id = v_game_id;

  return jsonb_build_object(
    'reveals', v_reveals,
    'standings', v_standings,
    'new_round_id', v_new_round_id,
    'game_over', p_game_over,
    'winner_id', p_winner
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Who may call these
-- -----------------------------------------------------------------------------
-- Nobody holding a browser. A client that could call apply_bid directly would
-- be writing bids without them ever meeting checkBid.

revoke execute on function public.apply_bid(uuid, integer, uuid, smallint, smallint, boolean, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.apply_bull(uuid, integer, uuid, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.apply_challenge(uuid, integer, uuid, text, integer, boolean, jsonb, uuid[], boolean, uuid, uuid, text, uuid[]) from public, anon, authenticated;

grant execute on function public.apply_bid(uuid, integer, uuid, smallint, smallint, boolean, uuid, boolean) to service_role;
grant execute on function public.apply_bull(uuid, integer, uuid, boolean, uuid) to service_role;
grant execute on function public.apply_challenge(uuid, integer, uuid, text, integer, boolean, jsonb, uuid[], boolean, uuid, uuid, text, uuid[]) to service_role;
