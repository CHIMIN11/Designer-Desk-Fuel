-- Minimal stand-in for the parts of Supabase the migrations rely on, so the
-- migrations and their RLS can be tested on a real Postgres engine (PGlite).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id    uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Supabase grants table privileges to anon/authenticated by default; RLS is what
-- actually protects the data. Reproduce that so tests prove RLS does the job.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
