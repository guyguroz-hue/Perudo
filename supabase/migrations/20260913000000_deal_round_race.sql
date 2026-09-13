-- -----------------------------------------------------------------------------
-- A LOST RACE TO DEAL THE FIRST ROUND IS A REFUSAL, NOT A FAULT
-- -----------------------------------------------------------------------------
-- Every client opens the first round, because every client is told the game
-- started at the same instant. That is not an unusual race — it is how every
-- game begins, and it runs once per player at the table.
--
-- The advisory check below narrows the window and cannot close it: two sessions
-- both read "no round yet" before either has inserted. One then loses on a
-- unique index, and it raised through to the client as
--
--   duplicate key value violates unique constraint "rounds_unique_number"
--
-- which the Edge Function does not recognise, so it reached the player as a
-- server fault — on a screen that asks once and never asks again. Losers
-- outnumber the winner at every table, so most players at a six-handed table
-- could see a broken game at the moment it began.
--
-- Measured, not reasoned about: scripts/test-round-race.sh runs six real
-- sessions into the same instant and fails against this function without the
-- handler below.
--
-- Which index is violated does not matter and is deliberately not inspected.
-- Inside this function every unique violation means the same thing: somebody
-- else dealt this round first, which is the answer the caller already handles.

create or replace function public.deal_round(
  p_game_id      uuid,
  p_type         text default 'normal',
  p_turn_player  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_id uuid;
  v_number   smallint;
  v_player   record;
  v_dice     smallint[];
begin
  if not exists (select 1 from public.games g where g.id = p_game_id and g.status = 'active') then
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  -- Cheap and usually right: it turns the common case into a named refusal
  -- without taking a lock. The handler below is what makes it correct.
  if exists (
    select 1 from public.rounds r where r.game_id = p_game_id and r.status <> 'resolved'
  ) then
    raise exception 'ROUND_ALREADY_OPEN';
  end if;

  select coalesce(max(r.round_number), 0) + 1 into v_number
    from public.rounds r where r.game_id = p_game_id;

  begin
    insert into public.rounds (game_id, round_number, type, turn_player_id)
    values (p_game_id, v_number, p_type, p_turn_player)
    returning id into v_round_id;
  exception
    when unique_violation then
      -- Two indexes can catch this: one live round per game, and one round per
      -- number per game. Both mean the same thing here.
      raise exception 'ROUND_ALREADY_OPEN';
  end;

  -- Everyone still holding dice gets exactly as many as they hold. The counts
  -- are the authority; this is where they become actual faces.
  for v_player in
    select gp.user_id, gp.dice_count
      from public.game_players gp
     where gp.game_id = p_game_id and gp.dice_count > 0
  loop
    v_dice := array(
      select public.roll_die() from generate_series(1, v_player.dice_count)
    );
    insert into public.player_dice (round_id, player_id, dice)
    values (v_round_id, v_player.user_id, v_dice);
  end loop;

  return v_round_id;
end;
$$;

comment on function public.deal_round(uuid, text, uuid) is
  'Opens a round and deals every active player as many dice as they hold. The '
  'values are created here and never leave the database except to their owner. '
  'Losing the race to open a round is reported as ROUND_ALREADY_OPEN.';

notify pgrst, 'reload schema';
