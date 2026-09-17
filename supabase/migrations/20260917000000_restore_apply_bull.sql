-- =============================================================================
-- Put apply_bull back, and re-assert every server grant around it.
--
-- Safe to re-run.
-- =============================================================================
--
-- `apply_bull` was missing from the live database. Every bid worked and every
-- Bull came back "Something broke at our end" — the Edge Function catching a
-- PostgREST error it has no name for — because the migrations here are pasted
-- into the SQL editor by hand and a paste can stop in the middle of a file.
-- `20260911250000_action_writes.sql` creates apply_bid, then apply_bull, then
-- apply_challenge; a paste that stopped after the first leaves a database where
-- almost everything works. `apply_bid` is created a second time in a later
-- migration, so it came back on its own and hid the gap.
--
-- This is that file's apply_bull, unchanged, plus the revokes and grants from
-- its foot. Those are repeated for all five server-side functions rather than
-- for this one alone: they are cheap, they are idempotent, and the same half-
-- finished paste that loses a function loses the grants that follow it. The
-- check in supabase/DIAGNOSE.sql reports on exactly this and every row should
-- read ok once this has run.

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

comment on function public.apply_bull(uuid, integer, uuid, boolean, uuid) is
  'Declares Bull on the bid already on the table (GAME_RULES 8.1). Refuses a '
  'second Bull on the same bid (R-010) and refuses a stale version. Callable '
  'only by the service role.';

-- -----------------------------------------------------------------------------
-- Who may call the server's functions
-- -----------------------------------------------------------------------------
-- Postgres grants EXECUTE on every new function to PUBLIC, so a SECURITY
-- DEFINER function that is not explicitly revoked is callable by any signed-in
-- client. Every one of these writes a round, and a round is the one thing in
-- this system no client may touch.

revoke execute on function public.apply_bid(uuid, integer, uuid, integer, integer, boolean, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.apply_bull(uuid, integer, uuid, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.apply_challenge(uuid, integer, uuid, text, integer, boolean, jsonb, uuid[], boolean, uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke execute on function public.deal_round(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.count_face(uuid, integer) from public, anon, authenticated;

grant execute on function public.apply_bid(uuid, integer, uuid, integer, integer, boolean, uuid, boolean) to service_role;
grant execute on function public.apply_bull(uuid, integer, uuid, boolean, uuid) to service_role;
grant execute on function public.apply_challenge(uuid, integer, uuid, text, integer, boolean, jsonb, uuid[], boolean, uuid, uuid, text, uuid[]) to service_role;
grant execute on function public.deal_round(uuid, text, uuid) to service_role;
grant execute on function public.count_face(uuid, integer) to service_role;
