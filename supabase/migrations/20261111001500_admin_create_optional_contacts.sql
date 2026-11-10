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
