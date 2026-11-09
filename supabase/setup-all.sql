-- DDF 資料庫一次安裝檔：在 Supabase Dashboard → SQL Editor 貼上整份後按 Run（只需執行一次）

-- ===== supabase/migrations/20261109000100_core_roles_audit.sql =====
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

-- ===== supabase/migrations/20261109000200_workspace_directory.sql =====
-- DDF Authorized Workspace Directory.
-- A space is visible to the public ONLY through list_public_spaces() / get_public_space(),
-- and only when the business has an approved, unexpired, un-withdrawn authorization,
-- the data has been verified by an admin, and it is published and not DEMO data.
-- All client writes go through the functions below; tables have no client write policies.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.spaces (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid references auth.users (id) on delete set null,
  business_name        text not null check (char_length(business_name) between 1 and 120),
  address              text not null check (char_length(address) between 1 and 200),
  city                 text not null check (char_length(city) between 1 and 40),
  district             text check (char_length(district) <= 40),
  category             text not null check (category in ('cafe', 'coworking', 'studio', 'library', 'other')),
  price_range          text check (price_range in ('under_200', '200_400', 'over_400')),
  opening_hours        text check (char_length(opening_hours) <= 500),
  wifi_available       boolean,
  power_outlets        text check (power_outlets in ('none', 'some', 'most', 'all')),
  seating_information  text check (char_length(seating_information) <= 500),
  large_tables         boolean,  -- tables large enough for a laptop plus drawing tablet
  supports_events      boolean,  -- accepts talks / workshops / events
  event_capacity       integer check (event_capacity between 1 and 2000),
  group_friendly       boolean,  -- accepts group meetups
  official_website     text check (official_website ~ '^https://'),
  official_social_url  text check (official_social_url ~ '^https://'),
  contact_email        text not null check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  authorization_status text not null default 'pending'
                       check (authorization_status in ('pending', 'approved', 'rejected', 'withdrawn', 'expired')),
  publication_status   text not null default 'draft'
                       check (publication_status in ('draft', 'published', 'suspended', 'removed')),
  is_demo              boolean not null default false,
  last_verified_at     timestamptz,
  next_review_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index spaces_public_idx on public.spaces (publication_status, authorization_status, city, category);
create index spaces_owner_idx on public.spaces (owner_id);

create table public.space_authorizations (
  id                       uuid primary key default gen_random_uuid(),
  space_id                 uuid not null references public.spaces (id) on delete restrict,
  applicant_user_id        uuid references auth.users (id) on delete set null,
  applicant_name           text not null check (char_length(applicant_name) between 1 and 80),
  applicant_position       text not null check (char_length(applicant_position) between 1 and 80),
  applicant_email          text not null check (applicant_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  authorization_status     text not null default 'pending'
                           check (authorization_status in ('pending', 'approved', 'rejected', 'withdrawn', 'expired')),
  -- e.g. {"listing_info":true,"photos":true,"logo":false,"official_text":true,"terms_version":"2026-11-draft"}
  authorization_scope      jsonb not null,
  authorized_at            timestamptz,
  authorization_expires_at timestamptz,
  withdrawn_at             timestamptz,
  evidence_reference       text check (char_length(evidence_reference) <= 300),
  created_at               timestamptz not null default now()
);

create index space_authorizations_space_idx on public.space_authorizations (space_id, created_at desc);
-- At most one live (pending or approved, not withdrawn) authorization per space.
create unique index space_authorizations_one_live
  on public.space_authorizations (space_id)
  where authorization_status in ('pending', 'approved') and withdrawn_at is null;

create table public.space_assets (
  id                    uuid primary key default gen_random_uuid(),
  space_id              uuid not null references public.spaces (id) on delete restrict,
  uploaded_by           uuid references auth.users (id) on delete set null,
  asset_type            text not null check (asset_type in ('photo', 'logo', 'official_text')),
  asset_url             text not null check (asset_url ~ '^https://'),
  permission_status     text not null default 'pending' check (permission_status in ('pending', 'granted', 'revoked')),
  permission_scope      text check (char_length(permission_scope) <= 300),
  permission_expires_at timestamptz,
  created_at            timestamptz not null default now()
);

create index space_assets_space_idx on public.space_assets (space_id);

create table public.space_update_requests (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces (id) on delete restrict,
  requested_by uuid references auth.users (id) on delete set null,
  changes      jsonb not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references auth.users (id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now()
);

create index space_update_requests_space_idx on public.space_update_requests (space_id, status);

create table public.space_update_logs (
  id            bigint generated always as identity primary key,
  space_id      uuid not null references public.spaces (id) on delete restrict,
  updated_by    uuid references auth.users (id) on delete set null,
  field_name    text not null,
  old_value     text,
  new_value     text,
  update_source text not null check (update_source in ('admin', 'merchant', 'merchant_request', 'system')),
  created_at    timestamptz not null default now()
);

create index space_update_logs_space_idx on public.space_update_logs (space_id, created_at desc);

create trigger spaces_touch before update on public.spaces
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: owners see their own rows, admins see everything, nobody writes directly.
-- ---------------------------------------------------------------------------
alter table public.spaces                enable row level security;
alter table public.space_authorizations  enable row level security;
alter table public.space_assets          enable row level security;
alter table public.space_update_requests enable row level security;
alter table public.space_update_logs     enable row level security;

create policy "spaces: owner or admin can read" on public.spaces
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());

create policy "authorizations: applicant or admin can read" on public.space_authorizations
  for select to authenticated using (applicant_user_id = auth.uid() or public.is_admin());

create policy "assets: space owner or admin can read" on public.space_assets
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
  );

create policy "update requests: requester or admin can read" on public.space_update_requests
  for select to authenticated using (requested_by = auth.uid() or public.is_admin());

create policy "update logs: admin can read" on public.space_update_logs
  for select to authenticated using (public.is_admin());

revoke all on public.spaces, public.space_authorizations, public.space_assets,
              public.space_update_requests, public.space_update_logs from anon;
revoke insert, update, delete on public.spaces, public.space_authorizations, public.space_assets,
              public.space_update_requests, public.space_update_logs from authenticated;

-- ---------------------------------------------------------------------------
-- Field-level update history (every change to a space row is recorded)
-- ---------------------------------------------------------------------------
create or replace function public.log_space_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  col text;
  src text := coalesce(nullif(current_setting('ddf.update_source', true), ''), 'system');
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  foreach col in array array[
    'business_name','address','city','district','category','price_range','opening_hours',
    'wifi_available','power_outlets','seating_information','large_tables','supports_events','event_capacity',
    'group_friendly','official_website','official_social_url','contact_email','authorization_status','publication_status','last_verified_at','next_review_at','owner_id'
  ] loop
    if (o -> col) is distinct from (n -> col) then
      insert into public.space_update_logs (space_id, updated_by, field_name, old_value, new_value, update_source)
      values (new.id, auth.uid(), col, o ->> col, n ->> col, src);
    end if;
  end loop;
  return new;
end;
$$;

create trigger spaces_log_changes after update on public.spaces
  for each row execute function public.log_space_changes();

-- ---------------------------------------------------------------------------
-- Public visibility rule (single source of truth)
-- ---------------------------------------------------------------------------
create or replace function public.space_is_public(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.spaces s
    where s.id = p_space_id
      and s.is_demo = false
      and s.authorization_status = 'approved'
      and s.publication_status = 'published'
      and s.last_verified_at is not null
      and exists (
        select 1 from public.space_authorizations a
        where a.space_id = s.id
          and a.authorization_status = 'approved'
          and a.withdrawn_at is null
          and a.authorization_expires_at is not null
          and a.authorization_expires_at > now()
      )
  );
$$;

create or replace function public.list_public_spaces(
  p_city text default null,
  p_category text default null,
  p_price_range text default null,
  p_wifi boolean default null,
  p_power boolean default null,
  p_large_tables boolean default null,
  p_events boolean default null,
  p_group boolean default null
)
returns table (
  id uuid,
  business_name text,
  address text,
  city text,
  district text,
  category text,
  price_range text,
  opening_hours text,
  wifi_available boolean,
  power_outlets text,
  seating_information text,
  large_tables boolean,
  supports_events boolean,
  event_capacity integer,
  group_friendly boolean,
  official_website text,
  official_social_url text,
  last_verified_at timestamptz,
  data_stale boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id, s.business_name, s.address, s.city, s.district, s.category,
    -- Possibly outdated price / hours are withheld until the business re-confirms.
    case when s.next_review_at is null or s.next_review_at <= now() then null else s.price_range end,
    case when s.next_review_at is null or s.next_review_at <= now() then null else s.opening_hours end,
    s.wifi_available, s.power_outlets, s.seating_information,
    s.large_tables, s.supports_events, s.event_capacity, s.group_friendly,
    s.official_website, s.official_social_url, s.last_verified_at,
    (s.next_review_at is null or s.next_review_at <= now()) as data_stale
  from public.spaces s
  where public.space_is_public(s.id)
    and (p_city is null or s.city = p_city)
    and (p_category is null or s.category = p_category)
    and (p_price_range is null or (s.price_range = p_price_range and s.next_review_at > now()))
    and (p_wifi is null or s.wifi_available = p_wifi)
    and (p_power is null or (p_power = (coalesce(s.power_outlets, 'none') <> 'none')))
    and (p_large_tables is null or s.large_tables = p_large_tables)
    and (p_events is null or s.supports_events = p_events)
    and (p_group is null or s.group_friendly = p_group)
  order by s.city, s.district, s.business_name;
$$;

create or replace function public.list_public_space_assets(p_space_id uuid)
returns table (id uuid, asset_type text, asset_url text, permission_scope text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.asset_type, a.asset_url, a.permission_scope
  from public.space_assets a
  where a.space_id = p_space_id
    and public.space_is_public(p_space_id)
    and a.permission_status = 'granted'
    and (a.permission_expires_at is null or a.permission_expires_at > now());
$$;

-- ---------------------------------------------------------------------------
-- Merchant functions
-- ---------------------------------------------------------------------------
create or replace function public.require_login()
returns uuid
language plpgsql
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'login required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.submit_space_application(p_space jsonb, p_authorization jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := public.require_login();
  new_space uuid;
  scope jsonb;
begin
  if (select count(*) from public.spaces where owner_id = uid and authorization_status = 'pending') >= 3 then
    raise exception 'too many pending applications';
  end if;

  if coalesce((p_authorization ->> 'accepted_terms')::boolean, false) is not true
     or coalesce(p_authorization ->> 'terms_version', '') = '' then
    raise exception 'listing authorization terms must be accepted';
  end if;

  scope := jsonb_build_object(
    'listing_info',  true,
    'photos',        coalesce((p_authorization -> 'scope' ->> 'photos')::boolean, false),
    'logo',          coalesce((p_authorization -> 'scope' ->> 'logo')::boolean, false),
    'official_text', coalesce((p_authorization -> 'scope' ->> 'official_text')::boolean, false),
    'terms_version', p_authorization ->> 'terms_version'
  );

  insert into public.spaces (
    owner_id, business_name, address, city, district, category, price_range, opening_hours,
    wifi_available, power_outlets, seating_information, large_tables, supports_events, event_capacity, group_friendly,
    official_website, official_social_url, contact_email
  ) values (
    uid,
    trim(p_space ->> 'business_name'),
    trim(p_space ->> 'address'),
    trim(p_space ->> 'city'),
    nullif(trim(p_space ->> 'district'), ''),
    p_space ->> 'category',
    nullif(p_space ->> 'price_range', ''),
    nullif(trim(p_space ->> 'opening_hours'), ''),
    (p_space ->> 'wifi_available')::boolean,
    nullif(p_space ->> 'power_outlets', ''),
    nullif(trim(p_space ->> 'seating_information'), ''),
    (p_space ->> 'large_tables')::boolean,
    (p_space ->> 'supports_events')::boolean,
    nullif(p_space ->> 'event_capacity', '')::integer,
    (p_space ->> 'group_friendly')::boolean,
    nullif(trim(p_space ->> 'official_website'), ''),
    nullif(trim(p_space ->> 'official_social_url'), ''),
    trim(p_space ->> 'contact_email')
  ) returning id into new_space;

  insert into public.space_authorizations (
    space_id, applicant_user_id, applicant_name, applicant_position, applicant_email, authorization_scope
  ) values (
    new_space, uid,
    trim(p_authorization ->> 'applicant_name'),
    trim(p_authorization ->> 'applicant_position'),
    trim(p_authorization ->> 'applicant_email'),
    scope
  );

  perform public.write_audit('merchant', 'application_submitted', 'spaces', new_space, null, jsonb_build_object('scope', scope));
  return new_space;
end;
$$;

create or replace function public.assert_space_owner(p_space_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.spaces where id = p_space_id and owner_id = public.require_login()) then
    raise exception 'not the manager of this space' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.add_space_asset(p_space_id uuid, p_asset_type text, p_asset_url text, p_scope text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_asset uuid;
begin
  perform public.assert_space_owner(p_space_id);
  insert into public.space_assets (space_id, uploaded_by, asset_type, asset_url, permission_scope)
  values (p_space_id, auth.uid(), p_asset_type, p_asset_url, p_scope)
  returning id into new_asset;
  perform public.write_audit('merchant', 'asset_submitted', 'space_assets', new_asset, null,
    jsonb_build_object('space_id', p_space_id, 'asset_type', p_asset_type));
  return new_asset;
end;
$$;

create or replace function public.request_space_update(p_space_id uuid, p_changes jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed text[] := array[
    'business_name','address','city','district','category','price_range','opening_hours','wifi_available',
    'power_outlets','seating_information','large_tables','supports_events','event_capacity','group_friendly',
    'official_website','official_social_url','contact_email'
  ];
  k text;
  new_req uuid;
begin
  perform public.assert_space_owner(p_space_id);
  if jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'changes must be a non-empty object';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any (allowed)) then
      raise exception 'field % cannot be changed by the business', k;
    end if;
  end loop;
  if (select count(*) from public.space_update_requests where space_id = p_space_id and status = 'pending') >= 5 then
    raise exception 'too many pending update requests';
  end if;

  insert into public.space_update_requests (space_id, requested_by, changes)
  values (p_space_id, auth.uid(), p_changes)
  returning id into new_req;
  perform public.write_audit('merchant', 'update_requested', 'spaces', p_space_id, null, jsonb_build_object('request_id', new_req));
  return new_req;
end;
$$;

-- Pausing or withdrawing takes effect immediately (it only ever removes data from public view).
create or replace function public.merchant_set_listing(p_space_id uuid, p_action text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_space_owner(p_space_id);
  perform set_config('ddf.update_source', 'merchant', true);

  if p_action = 'pause' then
    update public.spaces set publication_status = 'suspended' where id = p_space_id;
    perform public.write_audit('merchant', 'listing_paused', 'spaces', p_space_id, p_reason);
  elsif p_action = 'withdraw' then
    update public.space_authorizations
       set authorization_status = 'withdrawn', withdrawn_at = now()
     where space_id = p_space_id and withdrawn_at is null and authorization_status in ('pending', 'approved');
    update public.spaces
       set authorization_status = 'withdrawn', publication_status = 'removed'
     where id = p_space_id;
    update public.space_assets set permission_status = 'revoked' where space_id = p_space_id;
    perform public.write_audit('merchant', 'authorization_withdrawn', 'spaces', p_space_id, p_reason);
  else
    raise exception 'unknown action %', p_action;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin functions (every call writes admin_audit_log)
-- ---------------------------------------------------------------------------
create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_review_authorization(
  p_authorization_id uuid, p_decision text, p_expires_at timestamptz, p_evidence_reference text, p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sid uuid;
begin
  perform public.require_admin();
  perform set_config('ddf.update_source', 'admin', true);
  select space_id into sid from public.space_authorizations where id = p_authorization_id and authorization_status = 'pending';
  if sid is null then
    raise exception 'authorization not found or not pending';
  end if;

  if p_decision = 'approved' then
    if coalesce(trim(p_evidence_reference), '') = '' then
      raise exception 'evidence reference is required to approve';
    end if;
    if p_expires_at is null or p_expires_at <= now() then
      raise exception 'a future expiry date is required';
    end if;
    update public.space_authorizations
       set authorization_status = 'approved', authorized_at = now(),
           authorization_expires_at = p_expires_at, evidence_reference = p_evidence_reference
     where id = p_authorization_id;
    update public.spaces set authorization_status = 'approved' where id = sid;
  elsif p_decision = 'rejected' then
    update public.space_authorizations set authorization_status = 'rejected' where id = p_authorization_id;
    update public.spaces set authorization_status = 'rejected', publication_status = 'draft' where id = sid;
  else
    raise exception 'decision must be approved or rejected';
  end if;

  perform public.write_audit('admin', 'authorization_' || p_decision, 'space_authorizations', p_authorization_id, p_reason,
    jsonb_build_object('space_id', sid, 'expires_at', p_expires_at));
end;
$$;

create or replace function public.admin_verify_space(p_space_id uuid, p_next_review_at timestamptz, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();
  perform set_config('ddf.update_source', 'admin', true);
  update public.spaces
     set last_verified_at = now(),
         next_review_at = coalesce(p_next_review_at, now() + interval '180 days')
   where id = p_space_id;
  if not found then
    raise exception 'space not found';
  end if;
  perform public.write_audit('admin', 'data_verified', 'spaces', p_space_id, p_note);
end;
$$;

create or replace function public.admin_set_publication(p_space_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.spaces;
begin
  perform public.require_admin();
  perform set_config('ddf.update_source', 'admin', true);
  select * into s from public.spaces where id = p_space_id;
  if s.id is null then
    raise exception 'space not found';
  end if;

  if p_status = 'published' then
    if s.is_demo then
      raise exception 'DEMO data can never be published';
    end if;
    if s.authorization_status <> 'approved' or not exists (
      select 1 from public.space_authorizations a
      where a.space_id = s.id and a.authorization_status = 'approved' and a.withdrawn_at is null
        and a.authorization_expires_at > now()
    ) then
      raise exception 'cannot publish without a valid approved authorization';
    end if;
    if s.last_verified_at is null or s.next_review_at is null or s.next_review_at <= now() then
      raise exception 'data must be verified before publishing';
    end if;
  elsif p_status in ('suspended', 'removed', 'draft') then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'a reason is required';
    end if;
  else
    raise exception 'unknown publication status %', p_status;
  end if;

  update public.spaces set publication_status = p_status where id = p_space_id;
  perform public.write_audit('admin', 'publication_' || p_status, 'spaces', p_space_id, p_reason,
    jsonb_build_object('from', s.publication_status, 'to', p_status));
end;
$$;

create or replace function public.admin_set_asset_permission(
  p_asset_id uuid, p_status text, p_expires_at timestamptz, p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();
  if p_status not in ('granted', 'revoked') then
    raise exception 'status must be granted or revoked';
  end if;
  update public.space_assets
     set permission_status = p_status, permission_expires_at = p_expires_at
   where id = p_asset_id;
  if not found then
    raise exception 'asset not found';
  end if;
  perform public.write_audit('admin', 'asset_' || p_status, 'space_assets', p_asset_id, p_reason,
    jsonb_build_object('expires_at', p_expires_at));
end;
$$;

create or replace function public.admin_review_update_request(p_request_id uuid, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.space_update_requests;
  c jsonb;
begin
  perform public.require_admin();
  select * into r from public.space_update_requests where id = p_request_id and status = 'pending';
  if r.id is null then
    raise exception 'request not found or not pending';
  end if;
  c := r.changes;

  if p_decision = 'approved' then
    perform set_config('ddf.update_source', 'merchant_request', true);
    update public.spaces set
      business_name       = case when c ? 'business_name' then c ->> 'business_name' else business_name end,
      address             = case when c ? 'address' then c ->> 'address' else address end,
      city                = case when c ? 'city' then c ->> 'city' else city end,
      district            = case when c ? 'district' then c ->> 'district' else district end,
      category            = case when c ? 'category' then c ->> 'category' else category end,
      price_range         = case when c ? 'price_range' then c ->> 'price_range' else price_range end,
      opening_hours       = case when c ? 'opening_hours' then c ->> 'opening_hours' else opening_hours end,
      wifi_available      = case when c ? 'wifi_available' then (c ->> 'wifi_available')::boolean else wifi_available end,
      power_outlets       = case when c ? 'power_outlets' then c ->> 'power_outlets' else power_outlets end,
      seating_information = case when c ? 'seating_information' then c ->> 'seating_information' else seating_information end,
      large_tables        = case when c ? 'large_tables' then (c ->> 'large_tables')::boolean else large_tables end,
      supports_events     = case when c ? 'supports_events' then (c ->> 'supports_events')::boolean else supports_events end,
      event_capacity      = case when c ? 'event_capacity' then (c ->> 'event_capacity')::integer else event_capacity end,
      group_friendly      = case when c ? 'group_friendly' then (c ->> 'group_friendly')::boolean else group_friendly end,
      official_website    = case when c ? 'official_website' then c ->> 'official_website' else official_website end,
      official_social_url = case when c ? 'official_social_url' then c ->> 'official_social_url' else official_social_url end,
      contact_email       = case when c ? 'contact_email' then c ->> 'contact_email' else contact_email end,
      last_verified_at    = now(),
      next_review_at      = now() + interval '180 days'
    where id = r.space_id;
  elsif p_decision <> 'rejected' then
    raise exception 'decision must be approved or rejected';
  end if;

  update public.space_update_requests
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_reason
   where id = p_request_id;
  perform public.write_audit('admin', 'update_request_' || p_decision, 'spaces', r.space_id, p_reason,
    jsonb_build_object('request_id', p_request_id, 'changes', c));
end;
$$;

-- Marks authorizations past their expiry date (optional housekeeping; public visibility
-- already checks the expiry date on every query, so this is never load-bearing).
create or replace function public.expire_space_authorizations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  perform set_config('ddf.update_source', 'system', true);
  with expired as (
    update public.space_authorizations
       set authorization_status = 'expired'
     where authorization_status = 'approved' and authorization_expires_at <= now()
    returning space_id
  )
  update public.spaces s set authorization_status = 'expired'
   where s.id in (select space_id from expired)
     and not exists (
       select 1 from public.space_authorizations a
       where a.space_id = s.id and a.authorization_status = 'approved' and a.authorization_expires_at > now()
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.space_is_public(uuid) from public;
revoke all on function public.list_public_spaces(text, text, text, boolean, boolean, boolean, boolean, boolean) from public;
revoke all on function public.list_public_space_assets(uuid) from public;
revoke all on function public.require_login() from public;
revoke all on function public.assert_space_owner(uuid) from public;
revoke all on function public.require_admin() from public;
revoke all on function public.submit_space_application(jsonb, jsonb) from public;
revoke all on function public.add_space_asset(uuid, text, text, text) from public;
revoke all on function public.request_space_update(uuid, jsonb) from public;
revoke all on function public.merchant_set_listing(uuid, text, text) from public;
revoke all on function public.admin_review_authorization(uuid, text, timestamptz, text, text) from public;
revoke all on function public.admin_verify_space(uuid, timestamptz, text) from public;
revoke all on function public.admin_set_publication(uuid, text, text) from public;
revoke all on function public.admin_set_asset_permission(uuid, text, timestamptz, text) from public;
revoke all on function public.admin_review_update_request(uuid, text, text) from public;
revoke all on function public.expire_space_authorizations() from public;
revoke all on function public.log_space_changes() from public;

grant execute on function public.list_public_spaces(text, text, text, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;
grant execute on function public.list_public_space_assets(uuid) to anon, authenticated;
grant execute on function public.submit_space_application(jsonb, jsonb) to authenticated;
grant execute on function public.add_space_asset(uuid, text, text, text) to authenticated;
grant execute on function public.request_space_update(uuid, jsonb) to authenticated;
grant execute on function public.merchant_set_listing(uuid, text, text) to authenticated;
grant execute on function public.admin_review_authorization(uuid, text, timestamptz, text, text) to authenticated;
grant execute on function public.admin_verify_space(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_set_publication(uuid, text, text) to authenticated;
grant execute on function public.admin_set_asset_permission(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.admin_review_update_request(uuid, text, text) to authenticated;

-- ===== supabase/migrations/20261109000300_space_reviews.sql =====
-- 設計師真實評價: first-hand notes written by signed-in members about PUBLIC spaces.
-- No star ratings, scores, averages or rankings (directory spec §6). Admins can hide
-- reviews; every moderation action is audited. Reviews disappear from public view
-- whenever the space itself is not public.

create table public.space_reviews (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 10 and 500),
  tags       text[] not null default '{}'
             check (tags <@ array['power_ok','wifi_ok','large_table','quiet','good_for_events','good_for_meetups']::text[]),
  status     text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, author_id)
);

create index space_reviews_space_idx on public.space_reviews (space_id, created_at desc);

create trigger space_reviews_touch before update on public.space_reviews
  for each row execute function public.touch_updated_at();

alter table public.space_reviews enable row level security;

create policy "reviews: author or admin can read" on public.space_reviews
  for select to authenticated using (author_id = auth.uid() or public.is_admin());

create policy "reviews: members post as themselves on public spaces" on public.space_reviews
  for insert to authenticated
  with check (author_id = auth.uid() and status = 'visible' and public.space_is_public(space_id));

create policy "reviews: authors edit their own" on public.space_reviews
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy "reviews: authors delete their own" on public.space_reviews
  for delete to authenticated using (author_id = auth.uid());

-- Authors may only change the text and tags of their review, never its status, author or space.
revoke all on public.space_reviews from anon;
revoke update on public.space_reviews from authenticated;
grant update (body, tags) on public.space_reviews to authenticated;

-- Public read: only visible reviews of public spaces, with a display name (never an email).
create or replace function public.list_public_reviews(p_space_id uuid default null, p_limit integer default 20)
returns table (id uuid, space_id uuid, business_name text, author_name text, body text, tags text[], created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.space_id, s.business_name,
         coalesce(p.display_name, 'DDF 會員') as author_name,
         r.body, r.tags, r.created_at
  from public.space_reviews r
  join public.spaces s on s.id = r.space_id
  left join public.profiles p on p.id = r.author_id
  where r.status = 'visible'
    and public.space_is_public(r.space_id)
    and (p_space_id is null or r.space_id = p_space_id)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.admin_set_review_status(p_review_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();
  if p_status not in ('visible', 'hidden') then
    raise exception 'status must be visible or hidden';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required';
  end if;
  update public.space_reviews set status = p_status where id = p_review_id;
  if not found then
    raise exception 'review not found';
  end if;
  perform public.write_audit('admin', 'review_' || p_status, 'space_reviews', p_review_id, p_reason);
end;
$$;

-- The insert policy evaluates space_is_public() as the calling member. It only reveals
-- whether a space is publicly listed, which list_public_spaces() already exposes.
grant execute on function public.space_is_public(uuid) to authenticated;

revoke all on function public.list_public_reviews(uuid, integer) from public;
revoke all on function public.admin_set_review_status(uuid, text, text) from public;
grant execute on function public.list_public_reviews(uuid, integer) to anon, authenticated;
grant execute on function public.admin_set_review_status(uuid, text, text) to authenticated;
