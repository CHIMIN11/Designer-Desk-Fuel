-- DDF core: member profiles, admin roles and the immutable admin audit log.
-- Runs on Supabase (auth schema and auth.uid() are provided by Supabase).

-- ---------------------------------------------------------------------------
-- Profiles (public-facing member info lives here; email stays in auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 60),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner can read" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: owner can insert self" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles: owner can update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Roles. Members can never grant themselves a role: there are no write
-- policies, so only the SQL editor / service role can insert rows here.
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin', 'moderator')),
  granted_at timestamptz not null default now(),
  note       text
);

alter table public.user_roles enable row level security;

create policy "user_roles: read own role" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.user_roles from anon, authenticated;

-- SECURITY DEFINER so policies can call it without recursing into user_roles RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin audit log: append-only. Written only by SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id           bigint generated always as identity primary key,
  -- No foreign key on purpose: the log is append-only and must keep the actor id
  -- even after that account is deleted (deleting a user must not rewrite history).
  actor_id     uuid,
  actor_role   text not null check (actor_role in ('admin', 'merchant', 'system')),
  action       text not null,
  target_table text not null,
  target_id    uuid,
  reason       text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index admin_audit_log_target_idx on public.admin_audit_log (target_table, target_id, created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "audit: admins can read" on public.admin_audit_log
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.admin_audit_log from anon, authenticated;

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_log is append-only';
end;
$$;

create trigger admin_audit_log_no_update
  before update or delete on public.admin_audit_log
  for each row execute function public.prevent_audit_mutation();

create or replace function public.write_audit(
  p_actor_role text, p_action text, p_table text, p_target uuid, p_reason text, p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_audit_log (actor_id, actor_role, action, target_table, target_id, reason, details)
  values (auth.uid(), p_actor_role, p_action, p_table, p_target, p_reason, coalesce(p_details, '{}'::jsonb));
$$;

-- Internal helper only: never callable from the client.
revoke all on function public.write_audit(text, text, text, uuid, text, jsonb) from public, anon, authenticated;

-- updated_at helper
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a profile for every new account (display name from sign-up metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 60), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
