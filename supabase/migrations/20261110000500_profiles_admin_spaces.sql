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
