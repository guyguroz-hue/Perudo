-- =============================================================================
-- SMALLINT PARAMETERS ARE INVISIBLE TO POSTGREST
--
-- Every bid failed with:
--
--   Could not find the function public.apply_bid(p_burst, p_face, p_lock_face,
--   p_next_turn, p_player, p_quantity, p_round_id, p_version) in the schema
--   cache
--
-- PostgREST resolves an RPC from the JSON body by matching the argument names
-- and checking that each value can be coerced to the declared parameter type.
-- A JSON number does not resolve to `smallint`, so no candidate matched and it
-- reported the function as missing — which is true of the function it was
-- looking for and misleading about the one that exists.
--
-- The evidence was exact: every function in this schema with a smallint
-- parameter failed, and every function without one worked. `deal_round` and
-- `start_game` were fine; `apply_bid` and `count_face` were not, and
-- `count_face` had simply not been reached yet because it takes a challenge to
-- call it.
--
-- The parameters become `integer` and are narrowed inside. The columns stay
-- `smallint` — they are storage, and storage was never the problem.
--
-- Dropped before they are recreated, because a parameter type is part of a
-- function's identity: `create or replace` with a different one leaves the old
-- function in place and adds a second. Two candidates is the other half of this
-- same failure, reported as "could not choose the best candidate function".
--
-- This is the class of fault the local harness cannot see, like B-3 before it:
-- the tests call these functions directly in SQL, where a literal is coerced at
-- parse time. It is PostgREST's behaviour, not PostgreSQL's.
-- =============================================================================

drop function if exists public.apply_bid(uuid, integer, uuid, smallint, smallint, boolean, uuid, boolean);
drop function if exists public.count_face(uuid, smallint);

-- -----------------------------------------------------------------------------
-- COUNT_FACE
-- -----------------------------------------------------------------------------

create or replace function public.count_face(p_round_id uuid, p_face integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_face  smallint := p_face::smallint;
  v_type  text;
  v_total int;
begin
  select r.type into v_type from public.rounds r where r.id = p_round_id;
  if v_type is null then
    raise exception 'INVALID_ROUND';
  end if;

  -- In a normal round the one is wild, so a bid on a normal face is satisfied
  -- by that face plus every one. A bid on Perudo itself counts only actual
  -- ones: the wildcard cannot count itself twice.
  --
  -- In a Farewell Round the one is NOT wild, and only exact matches count —
  -- including when the locked face is Perudo (GAME_RULES §3, §10).
  select count(*) into v_total
    from public.player_dice pd, unnest(pd.dice) d
   where pd.round_id = p_round_id
     and (
       d = v_face
       or (v_type = 'normal' and v_face <> 1 and d = 1)
     );

  return v_total;
end;
$$;

comment on function public.count_face(uuid, integer) is
  'How many dice count toward a face this round, wildcard rules included. The '
  'only thing about the dice that ever leaves the database as a whole: a '
  'number, not a hand.';

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
  p_quantity  integer,
  p_face      integer,
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
  v_quantity smallint := p_quantity::smallint;
  v_face     smallint := p_face::smallint;
  v_version  integer;
begin
  update public.rounds r
     set bid_quantity  = v_quantity,
         bid_face      = v_face,
         bid_player_id = p_player,
         -- A new bid supersedes the Bull entirely (GAME_RULES §8.2).
         bull_player_id = null,
         locked_face   = case
                           when p_lock_face and r.locked_face is null then v_face
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
         jsonb_build_object('quantity', v_quantity, 'face', v_face)
    from public.rounds r where r.id = p_round_id;

  return v_version;
end;
$$;

comment on function public.apply_bid(uuid, integer, uuid, integer, integer, boolean, uuid, boolean) is
  'Records a bid already judged legal, under optimistic concurrency. Integer '
  'parameters rather than smallint: PostgREST cannot resolve a JSON number to '
  'a smallint parameter, and the function becomes unreachable.';

-- -----------------------------------------------------------------------------
-- Reachable only by the server, exactly as before.
-- -----------------------------------------------------------------------------

revoke execute on function public.count_face(uuid, integer) from public, anon, authenticated;
revoke execute on function public.apply_bid(uuid, integer, uuid, integer, integer, boolean, uuid, boolean) from public, anon, authenticated;

grant execute on function public.count_face(uuid, integer) to service_role;
grant execute on function public.apply_bid(uuid, integer, uuid, integer, integer, boolean, uuid, boolean) to service_role;

-- PostgREST keeps the list of callable functions in memory. Without this it
-- would carry on looking for the signatures this migration just replaced.
notify pgrst, 'reload schema';
