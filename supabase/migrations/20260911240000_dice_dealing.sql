-- =============================================================================
-- Dealing, counting and revealing
-- =============================================================================
-- The three things that must happen where the dice live.
--
-- Dice are generated in the database and stay there. They are never sent to a
-- client that does not own them, and — deliberately — never sent to the server
-- action layer either. That is not protection against a compromised server,
-- which would hold the key anyway; it is protection against the way hidden
-- information really escapes, which is a log line or an error report that
-- happens to carry a function's inputs.
--
-- So the engine asks "how many of this face are on the table" and gets a
-- number. It never sees a hand.
--
-- None of these are client capabilities. They are revoked from every client
-- role and reachable only by the server action layer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A fair die
-- -----------------------------------------------------------------------------
-- pgcrypto's random bytes rather than random(), which is a per-connection PRNG
-- and therefore in principle predictable. Values of 252 and above are rejected
-- before taking the remainder: 252 is 6 x 42, so every face is equally likely.
-- Taking a byte modulo 6 without that step would quietly favour 1 to 4.

create or replace function public.roll_die()
returns smallint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b int;
begin
  loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    exit when b < 252;
  end loop;
  return (b % 6) + 1;
end;
$$;

comment on function public.roll_die() is
  'One fair die, from cryptographic randomness with the modulo bias removed.';

-- -----------------------------------------------------------------------------
-- DEAL_ROUND
-- -----------------------------------------------------------------------------

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

  -- One live round per game is a unique index, so a second concurrent deal
  -- fails rather than quietly handing out two sets of dice.
  if exists (
    select 1 from public.rounds r where r.game_id = p_game_id and r.status <> 'resolved'
  ) then
    raise exception 'ROUND_ALREADY_OPEN';
  end if;

  select coalesce(max(r.round_number), 0) + 1 into v_number
    from public.rounds r where r.game_id = p_game_id;

  insert into public.rounds (game_id, round_number, type, turn_player_id)
  values (p_game_id, v_number, p_type, p_turn_player)
  returning id into v_round_id;

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
  'values are created here and never leave the database except to their owner.';

-- -----------------------------------------------------------------------------
-- COUNT_FACE
-- -----------------------------------------------------------------------------

create or replace function public.count_face(p_round_id uuid, p_face smallint)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text;
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
       d = p_face
       or (v_type = 'normal' and p_face <> 1 and d = 1)
     );

  return v_total;
end;
$$;

comment on function public.count_face(uuid, smallint) is
  'How many dice count toward a face this round, wildcard rules included. The '
  'only thing about the dice that ever leaves the database as a whole: a '
  'number, not a hand.';

-- -----------------------------------------------------------------------------
-- REVEAL_ROUND
-- -----------------------------------------------------------------------------

create or replace function public.reveal_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The one legitimate path from private to public, and it copies rather than
  -- moves: the private row stays, so a reveal cannot be undone by deleting it.
  insert into public.dice_reveals (round_id, player_id, dice)
  select pd.round_id, pd.player_id, pd.dice
    from public.player_dice pd
   where pd.round_id = p_round_id
  on conflict (round_id, player_id) do nothing;
end;
$$;

comment on function public.reveal_round(uuid) is
  'Publishes every hand in the round to the room. Called only when a challenge '
  'has actually been resolved.';

-- -----------------------------------------------------------------------------
-- Who may call these
-- -----------------------------------------------------------------------------
-- Nobody holding a browser. A client that could deal itself dice, or count the
-- table before bidding, would not be playing the same game as everyone else.

revoke execute on function public.roll_die()                     from public, anon, authenticated;
revoke execute on function public.deal_round(uuid, text, uuid)   from public, anon, authenticated;
revoke execute on function public.count_face(uuid, smallint)     from public, anon, authenticated;
revoke execute on function public.reveal_round(uuid)             from public, anon, authenticated;

grant execute on function public.deal_round(uuid, text, uuid)    to service_role;
grant execute on function public.count_face(uuid, smallint)      to service_role;
grant execute on function public.reveal_round(uuid)              to service_role;
