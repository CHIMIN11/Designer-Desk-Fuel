-- DDF 資料庫一次安裝檔（全新專案用）：依序包含 supabase/migrations 內所有檔案。

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
  no_time_limit        boolean,  -- no dining time limit (as stated by the business)
  minimum_charge       integer check (minimum_charge between 0 and 10000), -- NT$, 0 = none; null = not provided
  has_restroom         boolean,
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
    'group_friendly','no_time_limit','minimum_charge','has_restroom',
    'official_website','official_social_url','contact_email','authorization_status','publication_status','last_verified_at','next_review_at','owner_id'
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
  p_group boolean default null,
  p_no_time_limit boolean default null,
  p_clear_minimum boolean default null,
  p_restroom boolean default null
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
  no_time_limit boolean,
  minimum_charge integer,
  has_restroom boolean,
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
    s.no_time_limit,
    case when s.next_review_at is null or s.next_review_at <= now() then null else s.minimum_charge end,
    s.has_restroom,
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
    and (p_no_time_limit is null or s.no_time_limit = p_no_time_limit)
    and (p_clear_minimum is null or (p_clear_minimum = (s.minimum_charge is not null and s.next_review_at > now())))
    and (p_restroom is null or s.has_restroom = p_restroom)
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
    no_time_limit, minimum_charge, has_restroom,
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
    (p_space ->> 'no_time_limit')::boolean,
    nullif(p_space ->> 'minimum_charge', '')::integer,
    (p_space ->> 'has_restroom')::boolean,
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
    'no_time_limit','minimum_charge','has_restroom',
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
      no_time_limit       = case when c ? 'no_time_limit' then (c ->> 'no_time_limit')::boolean else no_time_limit end,
      minimum_charge      = case when c ? 'minimum_charge' then (c ->> 'minimum_charge')::integer else minimum_charge end,
      has_restroom        = case when c ? 'has_restroom' then (c ->> 'has_restroom')::boolean else has_restroom end,
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
revoke all on function public.list_public_spaces(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public;
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

grant execute on function public.list_public_spaces(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;
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

-- ===== supabase/migrations/20261110000400_advisor_fixes.sql =====
-- Fixes for Supabase Security / Performance Advisor warnings:
-- 1) auth_rls_initplan: wrap auth.uid() / is_admin() in (select …) so they run once per query, not per row.
-- 2) function_search_path_mutable: pin search_path on the remaining helper functions.
-- Behaviour is unchanged; the same 35 security tests cover it.

alter function public.require_login() set search_path = public, pg_temp;
alter function public.prevent_audit_mutation() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;

-- profiles
drop policy "profiles: owner can read" on public.profiles;
drop policy "profiles: owner can insert self" on public.profiles;
drop policy "profiles: owner can update self" on public.profiles;
create policy "profiles: owner can read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner can insert self" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: owner can update self" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles / audit
drop policy "user_roles: read own role" on public.user_roles;
create policy "user_roles: read own role" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy "audit: admins can read" on public.admin_audit_log;
create policy "audit: admins can read" on public.admin_audit_log
  for select to authenticated using ((select public.is_admin()));

-- directory
drop policy "spaces: owner or admin can read" on public.spaces;
create policy "spaces: owner or admin can read" on public.spaces
  for select to authenticated using (owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy "authorizations: applicant or admin can read" on public.space_authorizations;
create policy "authorizations: applicant or admin can read" on public.space_authorizations
  for select to authenticated using (applicant_user_id = (select auth.uid()) or (select public.is_admin()));

drop policy "assets: space owner or admin can read" on public.space_assets;
create policy "assets: space owner or admin can read" on public.space_assets
  for select to authenticated using (
    (select public.is_admin())
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = (select auth.uid()))
  );

drop policy "update requests: requester or admin can read" on public.space_update_requests;
create policy "update requests: requester or admin can read" on public.space_update_requests
  for select to authenticated using (requested_by = (select auth.uid()) or (select public.is_admin()));

drop policy "update logs: admin can read" on public.space_update_logs;
create policy "update logs: admin can read" on public.space_update_logs
  for select to authenticated using ((select public.is_admin()));

-- reviews
drop policy "reviews: author or admin can read" on public.space_reviews;
drop policy "reviews: members post as themselves on public spaces" on public.space_reviews;
drop policy "reviews: authors edit their own" on public.space_reviews;
drop policy "reviews: authors delete their own" on public.space_reviews;
create policy "reviews: author or admin can read" on public.space_reviews
  for select to authenticated using (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "reviews: members post as themselves on public spaces" on public.space_reviews
  for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'visible' and public.space_is_public(space_id));
create policy "reviews: authors edit their own" on public.space_reviews
  for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "reviews: authors delete their own" on public.space_reviews
  for delete to authenticated using (author_id = (select auth.uid()));

-- ===== supabase/migrations/20261110000500_profiles_admin_spaces.sql =====
-- Designer profiles, admin-created listings, and a member review dashboard.

-- ---------------------------------------------------------------------------
-- 1. Designer / member profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column username text unique check (username ~ '^[a-z0-9_]{3,30}$'),
  add column member_type text not null default 'designer' check (member_type in ('designer', 'merchant', 'other')),
  add column profession text check (char_length(profession) <= 60),
  add column bio text check (char_length(bio) <= 500),
  add column location text check (char_length(location) <= 40),
  add column skills text[] not null default '{}' check (cardinality(skills) <= 12),
  add column portfolio_url text check (portfolio_url ~ '^https://'),
  add column avatar_url text check (avatar_url ~ '^https://'),
  -- private by default: nothing is shown publicly until the member chooses to
  add column profile_visibility text not null default 'private' check (profile_visibility in ('public', 'members', 'private')),
  add column show_portfolio boolean not null default true;

-- Members edit their own profile, but only these columns (not created_at etc.).
revoke update on public.profiles from authenticated;
grant update (display_name, username, member_type, profession, bio, location, skills, portfolio_url,
              avatar_url, profile_visibility, show_portfolio) on public.profiles to authenticated;

create policy "profiles: admin can read all" on public.profiles
  for select to authenticated using ((select public.is_admin()));

-- Public directory of designers: only profiles the member made public
-- (or members-only ones when the viewer is signed in). Never returns email.
create or replace function public.list_designers(p_search text default null, p_limit integer default 60)
returns table (
  id uuid, username text, display_name text, profession text, bio text, location text,
  skills text[], portfolio_url text, avatar_url text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.username, p.display_name, p.profession, p.bio, p.location, p.skills,
         case when p.show_portfolio then p.portfolio_url else null end,
         p.avatar_url, p.created_at
  from public.profiles p
  where p.member_type = 'designer'
    and p.display_name is not null
    and (p.profile_visibility = 'public' or (p.profile_visibility = 'members' and auth.uid() is not null))
    and (
      p_search is null or p_search = ''
      or p.display_name ilike '%' || p_search || '%'
      or p.profession ilike '%' || p_search || '%'
      or p.location ilike '%' || p_search || '%'
      or exists (select 1 from unnest(p.skills) s where s ilike '%' || p_search || '%')
    )
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

-- Admin edits a member's profile (e.g. fixing a reported profile); always audited.
create or replace function public.admin_update_profile(p_user_id uuid, p_changes jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c jsonb := p_changes;
  k text;
  allowed text[] := array['display_name','username','member_type','profession','bio','location','skills',
                          'portfolio_url','avatar_url','profile_visibility','show_portfolio'];
begin
  perform public.require_admin();
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required';
  end if;
  for k in select jsonb_object_keys(c) loop
    if not (k = any (allowed)) then
      raise exception 'field % cannot be changed here', k;
    end if;
  end loop;
  update public.profiles set
    display_name       = case when c ? 'display_name' then nullif(c ->> 'display_name', '') else display_name end,
    username           = case when c ? 'username' then nullif(c ->> 'username', '') else username end,
    member_type        = case when c ? 'member_type' then c ->> 'member_type' else member_type end,
    profession         = case when c ? 'profession' then nullif(c ->> 'profession', '') else profession end,
    bio                = case when c ? 'bio' then nullif(c ->> 'bio', '') else bio end,
    location           = case when c ? 'location' then nullif(c ->> 'location', '') else location end,
    skills             = case when c ? 'skills' then array(select jsonb_array_elements_text(c -> 'skills')) else skills end,
    portfolio_url      = case when c ? 'portfolio_url' then nullif(c ->> 'portfolio_url', '') else portfolio_url end,
    avatar_url         = case when c ? 'avatar_url' then nullif(c ->> 'avatar_url', '') else avatar_url end,
    profile_visibility = case when c ? 'profile_visibility' then c ->> 'profile_visibility' else profile_visibility end,
    show_portfolio     = case when c ? 'show_portfolio' then (c ->> 'show_portfolio')::boolean else show_portfolio end
  where id = p_user_id;
  if not found then
    raise exception 'profile not found';
  end if;
  perform public.write_audit('admin', 'profile_updated', 'profiles', p_user_id, p_reason, jsonb_build_object('fields', (select jsonb_agg(x) from jsonb_object_keys(c) x)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Admin creates / edits a listing on behalf of a business
--    (e.g. the business authorised by email). Authorization evidence is still
--    required before it can be approved; publishing still needs verification.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_space(p_space jsonb, p_authorization jsonb, p_owner_email text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_space uuid;
  owner uuid;
  evidence text := nullif(trim(p_authorization ->> 'evidence_reference'), '');
  expires timestamptz := nullif(p_authorization ->> 'expires_at', '')::timestamptz;
  approve boolean := evidence is not null and expires is not null and expires > now();
  scope jsonb;
begin
  perform public.require_admin();
  perform set_config('ddf.update_source', 'admin', true);

  if nullif(trim(p_owner_email), '') is not null then
    select id into owner from auth.users where lower(email) = lower(trim(p_owner_email));
    if owner is null then
      raise exception 'no member account uses that email';
    end if;
  end if;

  scope := jsonb_build_object(
    'listing_info', true,
    'photos', coalesce((p_authorization -> 'scope' ->> 'photos')::boolean, false),
    'logo', coalesce((p_authorization -> 'scope' ->> 'logo')::boolean, false),
    'official_text', coalesce((p_authorization -> 'scope' ->> 'official_text')::boolean, false),
    'terms_version', coalesce(p_authorization ->> 'terms_version', 'admin-entered'),
    'entered_by_admin', true
  );

  insert into public.spaces (
    owner_id, business_name, address, city, district, category, price_range, opening_hours,
    wifi_available, power_outlets, seating_information, large_tables, supports_events, event_capacity, group_friendly,
    no_time_limit, minimum_charge, has_restroom, official_website, official_social_url, contact_email,
    authorization_status
  ) values (
    owner,
    trim(p_space ->> 'business_name'), trim(p_space ->> 'address'), trim(p_space ->> 'city'),
    nullif(trim(p_space ->> 'district'), ''), p_space ->> 'category', nullif(p_space ->> 'price_range', ''),
    nullif(trim(p_space ->> 'opening_hours'), ''), (p_space ->> 'wifi_available')::boolean,
    nullif(p_space ->> 'power_outlets', ''), nullif(trim(p_space ->> 'seating_information'), ''),
    (p_space ->> 'large_tables')::boolean, (p_space ->> 'supports_events')::boolean,
    nullif(p_space ->> 'event_capacity', '')::integer, (p_space ->> 'group_friendly')::boolean,
    (p_space ->> 'no_time_limit')::boolean, nullif(p_space ->> 'minimum_charge', '')::integer,
    (p_space ->> 'has_restroom')::boolean,
    nullif(trim(p_space ->> 'official_website'), ''), nullif(trim(p_space ->> 'official_social_url'), ''),
    trim(p_space ->> 'contact_email'),
    case when approve then 'approved' else 'pending' end
  ) returning id into new_space;

  insert into public.space_authorizations (
    space_id, applicant_user_id, applicant_name, applicant_position, applicant_email, authorization_scope,
    authorization_status, authorized_at, authorization_expires_at, evidence_reference
  ) values (
    new_space, owner,
    trim(p_authorization ->> 'applicant_name'), trim(p_authorization ->> 'applicant_position'),
    trim(p_authorization ->> 'applicant_email'), scope,
    case when approve then 'approved' else 'pending' end,
    case when approve then now() end, case when approve then expires end, evidence
  );

  perform public.write_audit('admin', 'space_created_by_admin', 'spaces', new_space, null,
    jsonb_build_object('approved', approve, 'owner_assigned', owner is not null));
  return new_space;
end;
$$;

create or replace function public.admin_update_space(p_space_id uuid, p_changes jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c jsonb := p_changes;
  k text;
  allowed text[] := array[
    'business_name','address','city','district','category','price_range','opening_hours','wifi_available',
    'power_outlets','seating_information','large_tables','supports_events','event_capacity','group_friendly',
    'no_time_limit','minimum_charge','has_restroom','official_website','official_social_url','contact_email'
  ];
begin
  perform public.require_admin();
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required';
  end if;
  for k in select jsonb_object_keys(c) loop
    if not (k = any (allowed)) then
      raise exception 'field % cannot be changed here', k;
    end if;
  end loop;
  perform set_config('ddf.update_source', 'admin', true);
  update public.spaces set
    business_name       = case when c ? 'business_name' then c ->> 'business_name' else business_name end,
    address             = case when c ? 'address' then c ->> 'address' else address end,
    city                = case when c ? 'city' then c ->> 'city' else city end,
    district            = case when c ? 'district' then nullif(c ->> 'district', '') else district end,
    category            = case when c ? 'category' then c ->> 'category' else category end,
    price_range         = case when c ? 'price_range' then nullif(c ->> 'price_range', '') else price_range end,
    opening_hours       = case when c ? 'opening_hours' then nullif(c ->> 'opening_hours', '') else opening_hours end,
    wifi_available      = case when c ? 'wifi_available' then (c ->> 'wifi_available')::boolean else wifi_available end,
    power_outlets       = case when c ? 'power_outlets' then nullif(c ->> 'power_outlets', '') else power_outlets end,
    seating_information = case when c ? 'seating_information' then nullif(c ->> 'seating_information', '') else seating_information end,
    large_tables        = case when c ? 'large_tables' then (c ->> 'large_tables')::boolean else large_tables end,
    supports_events     = case when c ? 'supports_events' then (c ->> 'supports_events')::boolean else supports_events end,
    event_capacity      = case when c ? 'event_capacity' then nullif(c ->> 'event_capacity', '')::integer else event_capacity end,
    group_friendly      = case when c ? 'group_friendly' then (c ->> 'group_friendly')::boolean else group_friendly end,
    no_time_limit       = case when c ? 'no_time_limit' then (c ->> 'no_time_limit')::boolean else no_time_limit end,
    minimum_charge      = case when c ? 'minimum_charge' then nullif(c ->> 'minimum_charge', '')::integer else minimum_charge end,
    has_restroom        = case when c ? 'has_restroom' then (c ->> 'has_restroom')::boolean else has_restroom end,
    official_website    = case when c ? 'official_website' then nullif(c ->> 'official_website', '') else official_website end,
    official_social_url = case when c ? 'official_social_url' then nullif(c ->> 'official_social_url', '') else official_social_url end,
    contact_email       = case when c ? 'contact_email' then c ->> 'contact_email' else contact_email end
  where id = p_space_id;
  if not found then
    raise exception 'space not found';
  end if;
  perform public.write_audit('admin', 'space_edited', 'spaces', p_space_id, p_reason,
    jsonb_build_object('fields', (select jsonb_agg(x) from jsonb_object_keys(c) x)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Member review dashboard: my reviews with the space name
-- ---------------------------------------------------------------------------
create or replace function public.list_my_reviews()
returns table (id uuid, space_id uuid, business_name text, body text, tags text[], status text,
               space_public boolean, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.space_id, s.business_name, r.body, r.tags, r.status,
         public.space_is_public(r.space_id), r.created_at, r.updated_at
  from public.space_reviews r
  join public.spaces s on s.id = r.space_id
  where r.author_id = auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.list_designers(text, integer) from public;
revoke all on function public.admin_update_profile(uuid, jsonb, text) from public;
revoke all on function public.admin_create_space(jsonb, jsonb, text) from public;
revoke all on function public.admin_update_space(uuid, jsonb, text) from public;
revoke all on function public.list_my_reviews() from public;
grant execute on function public.list_designers(text, integer) to anon, authenticated;
grant execute on function public.admin_update_profile(uuid, jsonb, text) to authenticated;
grant execute on function public.admin_create_space(jsonb, jsonb, text) to authenticated;
grant execute on function public.admin_update_space(uuid, jsonb, text) to authenticated;
grant execute on function public.list_my_reviews() to authenticated;

-- ===== supabase/migrations/20261110000600_space_photo_uploads.sql =====
-- Business photo / logo uploads for listings (Supabase Storage).
-- Files live in the public bucket "space-assets" under <user id>/<space id>/<file>.
-- A file being stored is NOT permission to show it: the public directory only
-- returns assets an admin has granted (list_public_space_assets), as before.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('space-assets', 'space-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Members may only write inside their own folder.
create policy "space-assets: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'space-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "space-assets: update own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'space-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "space-assets: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'space-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- At most 3 photos and 1 logo per listing (revoked ones do not count).
create or replace function public.add_space_asset(p_space_id uuid, p_asset_type text, p_asset_url text, p_scope text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_asset uuid;
  used integer;
begin
  perform public.assert_space_owner(p_space_id);
  select count(*) into used from public.space_assets
   where space_id = p_space_id and asset_type = p_asset_type and permission_status <> 'revoked';
  if p_asset_type = 'photo' and used >= 3 then
    raise exception 'a listing can have at most 3 photos';
  end if;
  if p_asset_type = 'logo' and used >= 1 then
    raise exception 'a listing can have only 1 logo';
  end if;
  insert into public.space_assets (space_id, uploaded_by, asset_type, asset_url, permission_scope)
  values (p_space_id, auth.uid(), p_asset_type, p_asset_url, p_scope)
  returning id into new_asset;
  perform public.write_audit('merchant', 'asset_submitted', 'space_assets', new_asset, null,
    jsonb_build_object('space_id', p_space_id, 'asset_type', p_asset_type));
  return new_asset;
end;
$$;

-- Businesses can withdraw one of their own assets (it stops being shown immediately).
create or replace function public.merchant_remove_asset(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sid uuid;
begin
  select space_id into sid from public.space_assets where id = p_asset_id;
  if sid is null then
    raise exception 'asset not found';
  end if;
  perform public.assert_space_owner(sid);
  update public.space_assets set permission_status = 'revoked' where id = p_asset_id;
  perform public.write_audit('merchant', 'asset_withdrawn', 'space_assets', p_asset_id, null, jsonb_build_object('space_id', sid));
end;
$$;

revoke all on function public.merchant_remove_asset(uuid) from public;
grant execute on function public.merchant_remove_asset(uuid) to authenticated;

-- ===== supabase/migrations/20261110000700_banners.sql =====
-- Homepage banner carousel managed by admins.
create table public.site_banners (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 60),
  subtitle    text check (char_length(subtitle) <= 120),
  image_url   text not null check (image_url ~ '^https://'),
  link_url    text check (link_url ~ '^(https://|/)'),
  link_label  text check (char_length(link_label) <= 20),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create trigger site_banners_touch before update on public.site_banners
  for each row execute function public.touch_updated_at();

alter table public.site_banners enable row level security;

create policy "banners: admins manage" on public.site_banners
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.site_banners from anon;

-- Public: only active banners inside their schedule.
create or replace function public.list_active_banners()
returns table (id uuid, title text, subtitle text, image_url text, link_url text, link_label text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id, b.title, b.subtitle, b.image_url, b.link_url, b.link_label
  from public.site_banners b
  where b.is_active
    and (b.starts_at is null or b.starts_at <= now())
    and (b.ends_at is null or b.ends_at > now())
  order by b.sort_order, b.created_at
  limit 8;
$$;

revoke all on function public.list_active_banners() from public;
grant execute on function public.list_active_banners() to anon, authenticated;

-- Admin-only uploads for banner images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-banners', 'site-banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "site-banners: admins upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-banners' and (select public.is_admin()));
create policy "site-banners: admins delete" on storage.objects
  for delete to authenticated using (bucket_id = 'site-banners' and (select public.is_admin()));

-- ===== supabase/migrations/20261110000800_lounge_chat.sql =====
-- DDF Lounge: members-only realtime chat channels with reports and moderation.

create table public.chat_channels (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(name) between 1 and 40),
  description text check (char_length(description) <= 120),
  sort_order  integer not null default 0,
  is_active   boolean not null default true
);

insert into public.chat_channels (slug, name, description, sort_order) values
  ('general-lounge', 'General Lounge', '大廳交流，自我介紹與日常聊天', 1),
  ('workspace', 'Workspace', '工作空間分享與詢問', 2),
  ('design-talk', 'Design Talk', '設計討論、作品回饋', 3),
  ('ai-technology', 'AI & Technology', 'AI 工具與科技', 4),
  ('collaboration', 'Collaboration', '接案與合作', 5),
  ('events', 'Events', '活動與聚會資訊', 6);

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.chat_channels (id) on delete cascade,
  sender_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 500),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid
);

create index chat_messages_channel_idx on public.chat_messages (channel_id, created_at desc);
create index chat_messages_sender_idx on public.chat_messages (sender_id, created_at desc);

create table public.chat_reports (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.chat_messages (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_type text not null check (report_type in ('spam', 'harassment', 'scam', 'impersonation', 'copyright', 'privacy', 'other')),
  description text check (char_length(description) <= 500),
  status      text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (message_id, reporter_id)
);

alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reports  enable row level security;

-- Channels: visible to signed-in members.
create policy "channels: members read" on public.chat_channels
  for select to authenticated using (is_active or (select public.is_admin()));

-- Messages: members read non-deleted messages of active channels; admins read all.
create policy "messages: members read" on public.chat_messages
  for select to authenticated using (deleted_at is null or (select public.is_admin()));

-- Members post only as themselves into active channels (sender cannot be forged).
create policy "messages: members post as themselves" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid()) and deleted_at is null and deleted_by is null
    and exists (select 1 from public.chat_channels c where c.id = channel_id and c.is_active)
  );

-- Reports: reporters file and read their own; admins read all.
create policy "reports: file own" on public.chat_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()) and status = 'pending');
create policy "reports: read own or admin" on public.chat_reports
  for select to authenticated using (reporter_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.chat_channels, public.chat_messages, public.chat_reports from anon;
revoke update, delete on public.chat_messages, public.chat_reports from authenticated;
revoke insert, update, delete on public.chat_channels from authenticated;

-- Anti-spam: at most 5 messages per 30 seconds, and no identical repeat within 60 seconds.
create or replace function public.chat_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.chat_messages
      where sender_id = new.sender_id and created_at > now() - interval '30 seconds') >= 5 then
    raise exception 'sending too fast';
  end if;
  if exists (select 1 from public.chat_messages
             where sender_id = new.sender_id and body = new.body and created_at > now() - interval '60 seconds') then
    raise exception 'duplicate message';
  end if;
  new.body := trim(new.body);
  new.created_at := now();
  return new;
end;
$$;

create trigger chat_messages_rate_limit before insert on public.chat_messages
  for each row execute function public.chat_rate_limit();

-- Soft delete: members delete their own, admins delete any (audited).
create or replace function public.delete_chat_message(p_message_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.chat_messages;
begin
  select * into m from public.chat_messages where id = p_message_id;
  if m.id is null then
    raise exception 'message not found';
  end if;
  if m.sender_id = auth.uid() then
    update public.chat_messages set deleted_at = now(), deleted_by = auth.uid() where id = p_message_id;
  elsif public.is_admin() then
    update public.chat_messages set deleted_at = now(), deleted_by = auth.uid() where id = p_message_id;
    update public.chat_reports set status = 'resolved', reviewed_at = now() where message_id = p_message_id and status = 'pending';
    perform public.write_audit('admin', 'chat_message_deleted', 'chat_messages', p_message_id, p_reason,
      jsonb_build_object('sender_id', m.sender_id));
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_dismiss_report(p_report_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();
  update public.chat_reports set status = 'dismissed', reviewed_at = now() where id = p_report_id;
  perform public.write_audit('admin', 'chat_report_dismissed', 'chat_reports', p_report_id, p_reason);
end;
$$;

-- Display names for chat (members only; never email).
create or replace function public.chat_display_names(p_ids uuid[])
returns table (id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, coalesce(p.display_name, 'DDF 會員'), p.avatar_url
  from public.profiles p
  where auth.uid() is not null and p.id = any (p_ids);
$$;

revoke all on function public.chat_rate_limit() from public;
revoke all on function public.delete_chat_message(uuid, text) from public;
revoke all on function public.admin_dismiss_report(uuid, text) from public;
revoke all on function public.chat_display_names(uuid[]) from public;
grant execute on function public.delete_chat_message(uuid, text) to authenticated;
grant execute on function public.admin_dismiss_report(uuid, text) to authenticated;
grant execute on function public.chat_display_names(uuid[]) to authenticated;

-- Realtime: stream new messages to subscribed members (RLS still applies).
alter publication supabase_realtime add table public.chat_messages;

-- ===== supabase/migrations/20261110000900_review_photos.sql =====
-- 評價照片: members can attach up to 3 photos to their own review.
-- Files live in the public bucket "review-photos" under <user id>/<file>; a review may only
-- reference files inside its author's own folder. Hidden reviews hide their photos too,
-- because photos are only ever returned together with a visible review.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "review-photos: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "review-photos: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.space_reviews
  add column photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 3);

create or replace function public.check_review_photos()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  u text;
begin
  foreach u in array new.photo_urls loop
    if u !~ ('^https://[^/]+/storage/v1/object/public/review-photos/' || new.author_id::text || '/[^/]+$') then
      raise exception 'review photos must be uploaded by the author';
    end if;
  end loop;
  return new;
end;
$$;

create trigger space_reviews_photos before insert or update of photo_urls on public.space_reviews
  for each row execute function public.check_review_photos();

grant update (photo_urls) on public.space_reviews to authenticated;

-- Return photos with public and own reviews (return type changes, so drop first).
drop function public.list_public_reviews(uuid, integer);
create function public.list_public_reviews(p_space_id uuid default null, p_limit integer default 20)
returns table (id uuid, space_id uuid, business_name text, author_name text, body text, tags text[],
               photo_urls text[], created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.space_id, s.business_name,
         coalesce(p.display_name, 'DDF 會員') as author_name,
         r.body, r.tags, r.photo_urls, r.created_at
  from public.space_reviews r
  join public.spaces s on s.id = r.space_id
  left join public.profiles p on p.id = r.author_id
  where r.status = 'visible'
    and public.space_is_public(r.space_id)
    and (p_space_id is null or r.space_id = p_space_id)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

drop function public.list_my_reviews();
create function public.list_my_reviews()
returns table (id uuid, space_id uuid, business_name text, body text, tags text[], photo_urls text[], status text,
               space_public boolean, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.space_id, s.business_name, r.body, r.tags, r.photo_urls, r.status,
         public.space_is_public(r.space_id), r.created_at, r.updated_at
  from public.space_reviews r
  join public.spaces s on s.id = r.space_id
  where r.author_id = (select auth.uid())
  order by r.created_at desc;
$$;

revoke all on function public.list_public_reviews(uuid, integer) from public;
revoke all on function public.list_my_reviews() from public;
grant execute on function public.list_public_reviews(uuid, integer) to anon, authenticated;
grant execute on function public.list_my_reviews() to authenticated;

-- ===== supabase/migrations/20261110001000_contact_inquiries.sql =====
-- 聯絡我們／合作方案: anyone may send a partnership inquiry; only admins can read it.
-- Inquiries never affect directory listing or ordering (directory spec: no paid ranking).

create table public.contact_inquiries (
  id          uuid primary key default gen_random_uuid(),
  plan        text not null check (plan in ('space_listing', 'brand_sponsor', 'event', 'tool', 'media', 'other')),
  name        text not null check (char_length(trim(name)) between 1 and 60),
  company     text check (char_length(company) <= 100),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone       text check (char_length(phone) <= 30),
  message     text not null check (char_length(trim(message)) between 20 and 1000),
  consent     boolean not null check (consent),
  status      text not null default 'new' check (status in ('new', 'replied', 'closed')),
  admin_note  text check (char_length(admin_note) <= 500),
  created_at  timestamptz not null default now()
);

create index contact_inquiries_created_idx on public.contact_inquiries (created_at desc);

alter table public.contact_inquiries enable row level security;

create policy "inquiries: anyone can send" on public.contact_inquiries
  for insert to anon, authenticated
  with check (status = 'new' and admin_note is null);

create policy "inquiries: admins read" on public.contact_inquiries
  for select to authenticated using ((select public.is_admin()));

create policy "inquiries: admins update" on public.contact_inquiries
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.contact_inquiries from anon, authenticated;
grant insert (plan, name, company, email, phone, message, consent) on public.contact_inquiries to anon, authenticated;
grant select on public.contact_inquiries to authenticated;
grant update (status, admin_note) on public.contact_inquiries to authenticated;

-- Basic abuse limits: 3 inquiries per email per day, 30 in total per hour.
create or replace function public.contact_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.contact_inquiries
       where lower(email) = lower(new.email) and created_at > now() - interval '1 day') >= 3 then
    raise exception 'too many inquiries from this email';
  end if;
  if (select count(*) from public.contact_inquiries where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many inquiries, try later';
  end if;
  return new;
end;
$$;

create trigger contact_inquiries_rate_limit before insert on public.contact_inquiries
  for each row execute function public.contact_rate_limit();

-- ===== supabase/migrations/20261110001100_storage_select_for_cleanup.sql =====
-- Storage "remove" first looks the file up, so owners (and admins for banners) also need
-- SELECT on their own objects for cleanup of replaced/removed images to work.
create policy "space-assets: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'space-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "review-photos: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "site-banners: admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'site-banners' and (select public.is_admin()));

-- ===== supabase/migrations/20261110001200_tighten_function_grants.sql =====
-- Supabase grants EXECUTE on new functions to anon/authenticated directly, so the earlier
-- "revoke ... from public" did not remove them. Every function already checks the caller
-- inside (require_admin / auth.uid()), but signed-out visitors should not be able to call
-- member/admin functions at all. Public read functions stay open.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname not in ('list_public_spaces', 'list_public_space_assets', 'list_public_reviews',
                            'list_designers', 'list_active_banners', 'is_admin', 'space_is_public', 'rls_auto_enable')
  loop
    execute format('revoke execute on function %s from anon', f.sig);
  end loop;

  -- Internal helpers and trigger functions: nobody calls these over the API.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('require_admin', 'assert_space_owner', 'expire_space_authorizations',
                        'chat_rate_limit', 'contact_rate_limit', 'log_space_changes')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;

-- ===== supabase/migrations/20261111001300_space_suggestions.sql =====
-- 會員推薦空間: members suggest places they have worked from. Suggestions are private
-- leads for the admin to contact the business for authorization — they are never shown
-- in the public directory (directory spec: authorized listings only).
create table public.space_suggestions (
  id           uuid primary key default gen_random_uuid(),
  suggested_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 80),
  city         text check (char_length(city) <= 20),
  link         text check (char_length(link) <= 300 and (link is null or link ~ '^https://')),
  reason       text not null check (char_length(trim(reason)) between 10 and 500),
  status       text not null default 'new' check (status in ('new', 'contacted', 'listed', 'declined')),
  admin_note   text check (char_length(admin_note) <= 500),
  created_at   timestamptz not null default now()
);
create index space_suggestions_created_idx on public.space_suggestions (created_at desc);

alter table public.space_suggestions enable row level security;

create policy "suggestions: members add their own" on public.space_suggestions
  for insert to authenticated
  with check (suggested_by = (select auth.uid()) and status = 'new' and admin_note is null);
create policy "suggestions: read own or admin" on public.space_suggestions
  for select to authenticated
  using (suggested_by = (select auth.uid()) or (select public.is_admin()));
create policy "suggestions: admin updates" on public.space_suggestions
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.space_suggestions from anon, authenticated;
grant insert (name, city, link, reason) on public.space_suggestions to authenticated;
grant select on public.space_suggestions to authenticated;
grant update (status, admin_note) on public.space_suggestions to authenticated;

create or replace function public.suggestion_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.space_suggestions
       where suggested_by = new.suggested_by and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many suggestions today';
  end if;
  return new;
end;
$$;
revoke execute on function public.suggestion_rate_limit() from public, anon, authenticated;

create trigger space_suggestions_rate_limit before insert on public.space_suggestions
  for each row execute function public.suggestion_rate_limit();

-- ===== supabase/migrations/20261111001400_suggestion_admin_edit.sql =====
-- Admins can correct a member suggestion (name, city, link, reason). The update policy
-- already limits every UPDATE on this table to admins.
grant update (name, city, link, reason) on public.space_suggestions to authenticated;

-- ===== supabase/migrations/20261111001500_admin_create_optional_contacts.sql =====
-- Admin-entered listings: contact person, title and emails are optional (kept for later).
create or replace function public.admin_create_space(p_space jsonb, p_authorization jsonb, p_owner_email text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_space uuid;
  owner uuid;
  evidence text := nullif(trim(p_authorization ->> 'evidence_reference'), '');
  expires timestamptz := nullif(p_authorization ->> 'expires_at', '')::timestamptz;
  approve boolean := evidence is not null and expires is not null and expires > now();
  scope jsonb;
  fallback_email text;
begin
  perform public.require_admin();
  perform set_config('ddf.update_source', 'admin', true);

  if nullif(trim(p_owner_email), '') is not null then
    select id into owner from auth.users where lower(email) = lower(trim(p_owner_email));
    if owner is null then
      raise exception 'no member account uses that email';
    end if;
  end if;

  -- Contact details are optional when an admin enters the listing: fall back to the
  -- space contact email, then to the admin's own account email (never shown publicly).
  fallback_email := coalesce(
    nullif(trim(p_authorization ->> 'applicant_email'), ''),
    nullif(trim(p_space ->> 'contact_email'), ''),
    (select email from auth.users where id = (select auth.uid())));

  scope := jsonb_build_object(
    'listing_info', true,
    'photos', coalesce((p_authorization -> 'scope' ->> 'photos')::boolean, false),
    'logo', coalesce((p_authorization -> 'scope' ->> 'logo')::boolean, false),
    'official_text', coalesce((p_authorization -> 'scope' ->> 'official_text')::boolean, false),
    'terms_version', coalesce(p_authorization ->> 'terms_version', 'admin-entered'),
    'entered_by_admin', true
  );

  insert into public.spaces (
    owner_id, business_name, address, city, district, category, price_range, opening_hours,
    wifi_available, power_outlets, seating_information, large_tables, supports_events, event_capacity, group_friendly,
    no_time_limit, minimum_charge, has_restroom, official_website, official_social_url, contact_email,
    authorization_status
  ) values (
    owner,
    trim(p_space ->> 'business_name'), trim(p_space ->> 'address'), trim(p_space ->> 'city'),
    nullif(trim(p_space ->> 'district'), ''), p_space ->> 'category', nullif(p_space ->> 'price_range', ''),
    nullif(trim(p_space ->> 'opening_hours'), ''), (p_space ->> 'wifi_available')::boolean,
    nullif(p_space ->> 'power_outlets', ''), nullif(trim(p_space ->> 'seating_information'), ''),
    (p_space ->> 'large_tables')::boolean, (p_space ->> 'supports_events')::boolean,
    nullif(p_space ->> 'event_capacity', '')::integer, (p_space ->> 'group_friendly')::boolean,
    (p_space ->> 'no_time_limit')::boolean, nullif(p_space ->> 'minimum_charge', '')::integer,
    (p_space ->> 'has_restroom')::boolean,
    nullif(trim(p_space ->> 'official_website'), ''), nullif(trim(p_space ->> 'official_social_url'), ''),
    coalesce(nullif(trim(p_space ->> 'contact_email'), ''), fallback_email),
    case when approve then 'approved' else 'pending' end
  ) returning id into new_space;

  insert into public.space_authorizations (
    space_id, applicant_user_id, applicant_name, applicant_position, applicant_email, authorization_scope,
    authorization_status, authorized_at, authorization_expires_at, evidence_reference
  ) values (
    new_space, owner,
    coalesce(nullif(trim(p_authorization ->> 'applicant_name'), ''), '未提供（管理員代填）'),
    coalesce(nullif(trim(p_authorization ->> 'applicant_position'), ''), '未提供'),
    fallback_email, scope,
    case when approve then 'approved' else 'pending' end,
    case when approve then now() end, case when approve then expires end, evidence
  );

  perform public.write_audit('admin', 'space_created_by_admin', 'spaces', new_space, null,
    jsonb_build_object('approved', approve, 'owner_assigned', owner is not null));
  return new_space;
end;
$$;
