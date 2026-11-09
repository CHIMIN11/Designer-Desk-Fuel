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
