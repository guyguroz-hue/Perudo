-- =============================================================================
-- Joining the game that is being played (R-014)
-- =============================================================================
-- Safe to re-run.
--
-- A seat used to be for the NEXT game, which is correct and is also, at a table
-- playing a long one, half an hour of sitting still. So an approved player now
-- joins the game in progress — at the start of the next round, with five dice.
--
-- Both halves are decided rules rather than derived ones; see GAME_RULES §11 and
-- DECISIONS R-014. The short of it:
--
--   WHEN. Never inside a round. A round is a set of claims about a fixed number
--   of dice, and adding one mid-round makes every bid already on the table a
--   claim about something else. So admission happens in `deal_round` and
--   nowhere else — the one place in this system that is, by construction,
--   between rounds.
--
--   HOW MANY. The game's own `starting_dice`, which is five. Late in a game
--   that is a commanding position, and it is not the number that keeps this
--   fair: the host admits nobody without deciding to, is told what admitting
--   them means before they answer, and can refuse in one tap.
--
-- Nothing here decides WHO may join. That is `answer_seat_request`, unchanged:
-- this admits whoever the host has already seated.
-- =============================================================================

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
  v_room     uuid;
  v_start    smallint;
  v_seat     smallint;
  v_joiner   record;
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

  -- ---------------------------------------------------------------------------
  -- Anybody the host has seated who is not in this game yet (R-014)
  -- ---------------------------------------------------------------------------
  -- After the round exists and before a single die is rolled, so a newcomer is
  -- dealt to by the ordinary loop below rather than by a special case.
  --
  -- The seat is chosen among the seats this GAME is using, not among the room's.
  -- They are usually the same; they come apart when somebody leaves the room
  -- mid-game — their game_players row stays, because they are still in the game
  -- — and their room seat is handed to the next person through the door. A
  -- newcomer taking that seat number would collide with a player who is still
  -- holding dice at it.
  --
  -- A game with six seats already spoken for admits nobody. They keep their
  -- room seat and play the next game, which is what used to happen to everyone.
  select g.room_id, g.starting_dice into v_room, v_start
    from public.games g where g.id = p_game_id;

  for v_joiner in
    select m.user_id
      from public.room_members m
     where m.room_id = v_room
       and m.left_at is null
       and m.role = 'player'
       and not exists (
         select 1 from public.game_players gp
          where gp.game_id = p_game_id and gp.user_id = m.user_id
       )
     order by m.seat
  loop
    select min(s)::smallint into v_seat
      from generate_series(0, 5) s
     where not exists (
       select 1 from public.game_players gp
        where gp.game_id = p_game_id and gp.seat = s
     );
    exit when v_seat is null;

    insert into public.game_players (game_id, user_id, seat, dice_count)
    values (p_game_id, v_joiner.user_id, v_seat, v_start);

    -- Said out loud, to the whole table. Somebody arriving with a full hand in
    -- round nine changes the game for five other people, and they should see it
    -- happen rather than work it out from a cup that was not there before.
    insert into public.game_events (game_id, round_id, actor_id, kind, payload)
    values (p_game_id, v_round_id, v_joiner.user_id, 'joined',
            jsonb_build_object('dice', v_start));
  end loop;

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
  'Opens a round, admits anybody the host has seated since the last one (R-014) '
  'and deals every active player as many dice as they hold. The values are '
  'created here and never leave the database except to their owner. Losing the '
  'race to open a round is reported as ROUND_ALREADY_OPEN.';

notify pgrst, 'reload schema';
