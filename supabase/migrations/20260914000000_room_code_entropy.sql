-- =============================================================================
-- Room codes get a sixth character, and the last trigger function gets locked.
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A sixth character
-- -----------------------------------------------------------------------------
-- Five characters from a twenty-nine letter alphabet is twenty million codes,
-- and nothing throttles `join_room_by_code`. Anonymous sign-up is free and
-- instant, so per-user throttling is not the answer either — the number of
-- guesses is the only thing actually standing between a stranger and a seat at
-- somebody's table. With a hundred rooms live, twenty million codes is a hit
-- every two hundred thousand tries, which is half an hour of a script. A sixth
-- character makes it twenty-nine times that, on a code that is still read aloud
-- across a room in one breath.
--
-- What this is not is a secrecy boundary. A stranger who lands in a room sees
-- display names and can take a seat; they cannot see a die, because that is
-- guarded by a policy naming one player and not by whether they got in. This
-- raises the cost of a nuisance, and the host can still remove them.
--
-- The constraint widens rather than moves. Codes already minted are still being
-- passed around in links right now, and a migration that reissued them would
-- break every one of those to fix a problem that expires by itself — rooms are
-- short-lived, so the five-character generation dies out on its own within a
-- day of this landing.
alter table public.rooms drop constraint if exists rooms_code_format;
alter table public.rooms
  add constraint rooms_code_format
  check (code ~ '^[2346789ABCDEFGHJKMNPQRTUVWXYZ]{5,6}$');

create or replace function public.generate_room_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('2346789ABCDEFGHJKMNPQRTUVWXYZ',
           1 + floor(random() * 29)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$;

revoke execute on function public.generate_room_code() from public, anon, authenticated;

comment on function public.generate_room_code() is
  'Six characters from an alphabet with no 0/O/1/I/5/S, so a code read aloud '
  'or typed off a screen cannot be heard or written as a different one.';

-- -----------------------------------------------------------------------------
-- The one definer function that was never revoked
-- -----------------------------------------------------------------------------
-- Postgres grants EXECUTE on every new function to PUBLIC, so a SECURITY
-- DEFINER function that is not explicitly revoked is callable by any signed-in
-- client. Every other one in this schema is revoked; these three were missed
-- because they are trigger functions and trigger functions cannot be called
-- directly — Postgres refuses with "trigger functions can only be called as
-- triggers", which is why nothing was ever exposed by it.
--
-- They are revoked anyway. The argument for leaving them is a fact about
-- Postgres that a reader has to already know and then re-derive for each one,
-- and "every definer function in this file is revoked" is a property worth
-- being able to check by looking. Triggers are unaffected: EXECUTE is checked
-- when a trigger is created, not each time it fires.
revoke execute on function public.room_follows_game() from public, anon, authenticated;
revoke execute on function public.set_updated_at()    from public, anon, authenticated;
revoke execute on function public.set_room_expiry()   from public, anon, authenticated;
