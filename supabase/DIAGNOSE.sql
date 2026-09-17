-- =============================================================================
-- Is this database the one the code expects?
--
-- Read-only. Safe to run at any time, on a live project, mid-game.
-- =============================================================================
--
-- The migrations in this repo are pasted into the Supabase SQL editor by hand,
-- and a paste can stop in the middle of a file. When it does the result is not
-- an obviously broken database: it is a database where most things work. One
-- function is missing, or one grant at the foot of a file never ran, and the
-- game keeps playing until somebody presses the one button that needed it.
--
-- That is the shape of a real fault this was written for: every bid worked and
-- Bull came back "Something broke at our end", which is the server catching
-- something it has no name for. `apply_bid` is created twice across two
-- migrations and `apply_bull` only once, so a paste that stopped in the middle
-- of the first of them leaves exactly that.
--
-- Two questions, then, and neither can be answered from outside the database:
-- does each function the game calls exist with the arguments it is called with,
-- and may its caller actually call it. Every row should read `ok`. Anything
-- else names a migration that did not finish.
--
--   Supabase -> SQL Editor -> paste -> Run.

with expected(name, caller) as (
  values
    -- Called by the Edge Function, which holds the service key. Nothing else
    -- may touch a round.
    ('apply_bid',          'service_role'),
    ('apply_bull',         'service_role'),
    ('apply_challenge',    'service_role'),
    ('deal_round',         'service_role'),
    ('count_face',         'service_role'),
    -- Called by the player's own browser, as themselves.
    ('join_room_by_code',  'authenticated'),
    ('start_game',         'authenticated'),
    ('leave_room',         'authenticated'),
    -- Called by nothing: it runs inside another function, and being reachable
    -- from a browser would let a stranger mint room codes.
    ('generate_room_code', 'nobody')
)
select
  e.name                                                     as function,
  case when p.oid is null then '>> MISSING' else 'ok' end    as present,
  coalesce(pg_get_function_identity_arguments(p.oid), '-')   as arguments,
  case
    when p.oid is null then '-'
    when e.caller = 'nobody' then
      case when has_function_privilege('authenticated', p.oid, 'EXECUTE')
           then '>> REACHABLE (should not be)' else 'ok' end
    when has_function_privilege(e.caller, p.oid, 'EXECUTE') then 'ok'
    else '>> NO GRANT for ' || e.caller
  end                                                        as callable,
  -- Two functions of one name is its own failure: PostgREST refuses to choose
  -- between them, and every call through the API fails with PGRST203.
  case
    when (select count(*) from pg_proc d
            join pg_namespace dn on dn.oid = d.pronamespace
           where dn.nspname = 'public' and d.proname = e.name) > 1
    then '>> DUPLICATED'
    else 'ok'
  end                                                        as one_version
from expected e
left join pg_proc p
  on p.proname = e.name
 and p.pronamespace = (select oid from pg_namespace where nspname = 'public')
order by e.name;
