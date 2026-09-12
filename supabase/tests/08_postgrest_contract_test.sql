-- =============================================================================
-- THE CONTRACT WITH POSTGREST
--
-- Everything else in this directory tests PostgreSQL. This file tests the one
-- thing that sits between PostgreSQL and the game and cannot be run here: the
-- API layer that turns a JSON body into a function call.
--
-- It cannot call PostgREST, so it does the next best thing — it asserts the
-- properties a function must have to be reachable through it. Both of the
-- assertions below are here because the product broke on them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- No smallint parameters on anything the server calls
-- -----------------------------------------------------------------------------
-- PostgREST resolves an RPC from the JSON body by matching argument names and
-- checking each value can be coerced to the declared type. A JSON number does
-- not resolve to smallint, so the function is reported as missing from the
-- schema cache — and every bid in the game failed that way, live, while every
-- test in this directory passed. The tests call these functions directly in
-- SQL, where a literal is coerced at parse time; PostgREST never gets that
-- chance.
--
-- Storage may be smallint. Parameters may not.
do $$
declare
  v_bad text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('service_role', p.oid, 'execute')
     and 'smallint'::regtype::oid = any (p.proargtypes);

  if v_bad is not null then
    raise exception 'FAIL: smallint parameters are unreachable through PostgREST: %', v_bad;
  end if;
end $$;
\echo 'PASS  no server-callable function takes a smallint parameter'

-- -----------------------------------------------------------------------------
-- No overloads
-- -----------------------------------------------------------------------------
-- A parameter type is part of a function's identity, so `create or replace`
-- with a changed one leaves the old function in place and adds a second.
-- PostgREST then has two candidates and refuses to choose, which fails exactly
-- like the fault above and reads nothing like it. A migration that changes a
-- signature has to drop the old one.
do $$
declare
  v_dupes text;
begin
  select string_agg(label, ', ')
    into v_dupes
    from (
      select p.proname || ' (' || count(*) || ' versions)' as label
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and has_function_privilege('service_role', p.oid, 'execute')
       group by p.proname
      having count(*) > 1
    ) duplicated;

  if v_dupes is not null then
    raise exception 'FAIL: overloaded functions are ambiguous to PostgREST: %', v_dupes;
  end if;
end $$;
\echo 'PASS  no server-callable function is overloaded'

\echo '================ POSTGREST CONTRACT TESTS PASSED ================'
