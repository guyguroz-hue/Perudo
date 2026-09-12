-- =============================================================================
-- TWO-PLAYER GAMES
--
-- The minimum drops from three to two.
--
-- It was never a rule of the game: GAME_RULES says nothing about how many
-- people are needed, and three was a product judgement about what makes a good
-- table. Two is a worse game — with one opponent, every bid is a claim about
-- one hand you cannot see plus your own, and there is no table to read — but it
-- is a playable one, and it is the only way to sit down and test a change
-- without finding a third person first.
--
-- Everything downstream already handles it. The turn ring wraps at any size, a
-- Burst against a single opponent is simply acting out of their turn, and the
-- dice ceiling and elimination rules never counted players.
-- =============================================================================

create or replace function public.start_game(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player  uuid := public.require_player();
  v_room    public.rooms%rowtype;
  v_seated  int;
  v_game_id uuid;
  v_dice    constant smallint := 5;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for update;

  if not found then
    raise exception 'INVALID_ROOM';
  end if;
  if v_room.host_id is distinct from v_player then
    raise exception 'NOT_HOST';
  end if;

  -- The whole of double-tap protection, in one condition. A second caller -
  -- another tap, a retried request, a second device - finds the room no longer
  -- in the lobby and is told so rather than starting a second game.
  if v_room.status <> 'lobby' then
    raise exception 'GAME_ALREADY_STARTED';
  end if;

  select count(*) into v_seated
    from public.room_members m
   where m.room_id = p_room_id and m.left_at is null;

  if v_seated < 2 then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  insert into public.games (room_id, status, starting_dice, round_start_rule, started_at)
  values (p_room_id, 'active', v_dice, v_room.round_start_rule, now())
  returning id into v_game_id;

  -- Seats carry over from the room, so where someone sat while waiting is where
  -- they sit to play.
  insert into public.game_players (game_id, user_id, seat, dice_count)
  select v_game_id, m.user_id, m.seat, v_dice
    from public.room_members m
   where m.room_id = p_room_id and m.left_at is null;

  update public.rooms set status = 'in_game' where id = p_room_id;

  return v_game_id;
end;
$$;

comment on function public.start_game(uuid) is
  'Host-only. Seats everyone present into a new game and locks the room to '
  'newcomers. Two players minimum; a second call is refused, not obeyed.';

comment on table public.rooms is
  'A private table for up to six players. Two are required to start a game; '
  'the six-seat limit is the unique seat index, not a check the application '
  'makes.';
