-- =============================================================================
-- The five-dice ceiling (R-007)
-- =============================================================================
-- No player may ever hold more than five dice, in any situation. Burst Dudo is
-- the only move that hands a die back, and it stops at five rather than taking
-- a player beyond it.
--
-- The earlier migration left dice_count deliberately unbounded because the
-- ceiling was an open rule and guessing one would have invented it. It is
-- settled now, so the database can enforce it: a bug in the action layer that
-- tried to mint a sixth die would be rejected here rather than quietly
-- corrupting a game.
--
-- Safe on a live database: every existing row already satisfies both checks,
-- so validation passes without rewriting anything.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'game_players_dice_ceiling'
  ) then
    alter table public.game_players
      add constraint game_players_dice_ceiling check (dice_count <= 5);
  end if;
end;
$$;

-- starting_dice allowed up to 6 before the ceiling was decided. Nothing may
-- start a game above the maximum a player is allowed to hold.
alter table public.games drop constraint if exists games_starting_dice_range;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'games_starting_dice_range'
  ) then
    alter table public.games
      add constraint games_starting_dice_range check (starting_dice between 1 and 5);
  end if;
end;
$$;

comment on column public.game_players.dice_count is
  'PUBLIC information: every player may see how many dice every other player '
  'holds. The dice VALUES are private and live in a separate table. Capped at '
  'five — no situation in the game produces a sixth die (R-007).';
