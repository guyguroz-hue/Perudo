-- =============================================================================
-- Round start rule (R-002)
-- =============================================================================
-- Who opens the next round once a challenge has been resolved.
--
-- 'winner_starts' is the house rule and the default: whoever was proved right
-- opens. A Farewell Round takes precedence over this — the player knocked down
-- to a single die opens instead, and the winner's turn follows.
--
-- 'loser_starts' and 'free_for_all' are stored but NOT yet implemented. The
-- column exists now so the setting has a home and no further migration is
-- needed later; the action layer must reject anything but the default until
-- those paths are built (TODO T-25).
--
-- Safe to apply to a live database: additive, with a default, so existing rows
-- are filled in place and nothing is rewritten.
-- =============================================================================

alter table public.rooms
  add column if not exists round_start_rule text not null default 'winner_starts';

alter table public.games
  add column if not exists round_start_rule text not null default 'winner_starts';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_round_start_rule_valid'
  ) then
    alter table public.rooms add constraint rooms_round_start_rule_valid
      check (round_start_rule in ('winner_starts', 'loser_starts', 'free_for_all'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'games_round_start_rule_valid'
  ) then
    alter table public.games add constraint games_round_start_rule_valid
      check (round_start_rule in ('winner_starts', 'loser_starts', 'free_for_all'));
  end if;
end;
$$;

comment on column public.rooms.round_start_rule is
  'Lobby setting: the rule new games in this room are created with.';

-- Deliberately a copy rather than a lookup through the room. A game is played
-- under the rule that was in force when it started, so changing the lobby
-- setting mid-game must not alter the game already in progress.
comment on column public.games.round_start_rule is
  'Snapshot of the room setting taken when the game started. Authoritative for '
  'this game; later changes to the room do not reach back into it.';
