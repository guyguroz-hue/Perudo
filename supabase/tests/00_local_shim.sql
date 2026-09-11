-- =============================================================================
-- LOCAL TEST SHIM — emulates the parts of a Supabase database our migrations
-- depend on, so the schema and RLS policies can be verified on a throwaway
-- PostgreSQL instance.
--
-- THIS FILE IS NEVER APPLIED TO THE REAL PROJECT. It lives outside
-- supabase/migrations/ for exactly that reason.
--
-- Fidelity note: migrations are applied as a NON-SUPERUSER owner role
-- (app_owner) that lacks BYPASSRLS, mirroring how Supabase applies migrations.
-- Running them as a superuser would silently mask owner/RLS interaction bugs,
-- because superusers bypass RLS unconditionally.
-- =============================================================================

create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;
create role app_owner     nologin noinherit createrole;

grant anon, authenticated, service_role to app_owner;

create schema if not exists auth authorization app_owner;
grant usage on schema auth to anon, authenticated, service_role;

-- Minimal stand-in for auth.users. Only the columns our schema references.
create table auth.users (
  id           uuid primary key default gen_random_uuid(),
  email        text,
  is_anonymous boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table auth.users owner to app_owner;

-- Mirrors Supabase's auth.uid(): reads the subject from the request JWT claims
-- that PostgREST sets per request.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;
alter function auth.uid() owner to app_owner;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase ships this publication; Realtime streams whatever is added to it.
create publication supabase_realtime;
alter publication supabase_realtime owner to app_owner;

grant usage on schema public to anon, authenticated, service_role;
alter schema public owner to app_owner;
