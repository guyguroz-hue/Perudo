-- =============================================================================
-- A display name may not carry characters that rewrite the sentence it is in.
--
-- Safe to re-run.
-- =============================================================================

-- This game renders moves as prose with a player-supplied noun in them — "Alice
-- bid 4 fives", "Carl called Lie" — and with Burst in the rules, who said what
-- is most of what a player is reasoning about.
--
-- Bidi overrides and isolates (U+202A-202E, U+2066-2069) draw nothing. They
-- change the direction of the text around them, so one dropped into a display
-- name reaches out of the badge and reorders the move it is sitting in. That is
-- a way to cheat, not a way to be rude. The zero-width characters are the same
-- trick more quietly: invisible, so two players can hold names that read
-- identically and compare differently. The control characters are in for
-- completeness — none of them is a letter in any script.
--
-- The client already strips all of these before it writes, which is what an
-- honest player gets. This is for the one who opens the console: the length
-- rule beside it has always been enforced here rather than trusted from the
-- browser, and this belongs in the same place for the same reason.
--
-- Ordinary right-to-left text is untouched, and has to be — this game is played
-- in Hebrew. Hebrew letters carry their own direction; an override is a
-- separate thing that exists to lie about it.
alter table public.profiles drop constraint if exists profiles_display_name_plain;
alter table public.profiles
  add constraint profiles_display_name_plain
  check (
    display_name !~ '[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]'
  );

comment on constraint profiles_display_name_plain on public.profiles is
  'No control, zero-width or bidi-override characters. A name is rendered '
  'inside a sentence about who did what, and these reorder the sentence '
  'around them or make two different names look like one.';
