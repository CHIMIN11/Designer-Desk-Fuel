-- 私房據點筆記: members share their own first-hand experience of any place they have
-- worked from, like a personal review. These are NOT directory listings: no business
-- authorization, no official info beyond name/area, always labelled as a member's
-- personal note, and businesses can ask for removal. Directory listings stay authorized-only.
create table public.place_notes (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  place_name  text not null check (char_length(trim(place_name)) between 1 and 80),
  city        text check (char_length(city) <= 20),
  district    text check (char_length(district) <= 20),
  map_link    text check (char_length(map_link) <= 300 and (map_link is null or map_link ~ '^https://')),
  body        text not null check (char_length(trim(body)) between 20 and 1000),
  tags        text[] not null default '{}' check (cardinality(tags) <= 8),
  photo_urls  text[] not null default '{}' check (cardinality(photo_urls) <= 3),
  status      text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index place_notes_created_idx on public.place_notes (created_at desc);

create trigger place_notes_touch before update on public.place_notes
  for each row execute function public.touch_updated_at();
-- photos must come from the author's own folder in review-photos (same rule as reviews)
create trigger place_notes_photos before insert or update of photo_urls on public.place_notes
  for each row execute function public.check_review_photos();

create or replace function public.place_note_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.place_notes
       where author_id = new.author_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many notes today';
  end if;
  return new;
end;
$$;
revoke execute on function public.place_note_rate_limit() from public, anon, authenticated;
create trigger place_notes_rate_limit before insert on public.place_notes
  for each row execute function public.place_note_rate_limit();

alter table public.place_notes enable row level security;

create policy "notes: authors insert own" on public.place_notes
  for insert to authenticated with check (author_id = (select auth.uid()) and status = 'visible');
create policy "notes: authors and admins read" on public.place_notes
  for select to authenticated using (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "notes: authors edit own, admins moderate" on public.place_notes
  for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()))
  with check (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "notes: authors delete own" on public.place_notes
  for delete to authenticated using (author_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.place_notes from anon, authenticated;
grant select, delete on public.place_notes to authenticated;
grant insert (place_name, city, district, map_link, body, tags, photo_urls) on public.place_notes to authenticated;
grant update (place_name, city, district, map_link, body, tags, photo_urls) on public.place_notes to authenticated;

-- Members cannot un-hide a note an admin hid: status changes go through this function.
create or replace function public.admin_set_note_status(p_note_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();
  if p_status not in ('visible', 'hidden') then raise exception 'unknown status'; end if;
  if p_status = 'hidden' and coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required'; end if;
  update public.place_notes set status = p_status where id = p_note_id;
  if not found then raise exception 'note not found'; end if;
  perform public.write_audit('admin', 'place_note_' || p_status, 'place_notes', p_note_id, p_reason, '{}'::jsonb);
end;
$$;
revoke execute on function public.admin_set_note_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_note_status(uuid, text, text) to authenticated;

create or replace function public.list_place_notes(p_limit integer default 30)
returns table (id uuid, place_name text, city text, district text, map_link text, body text, tags text[],
               photo_urls text[], author_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id, n.place_name, n.city, n.district, n.map_link, n.body, n.tags, n.photo_urls,
         coalesce(p.display_name, 'DDF 會員'), n.created_at
  from public.place_notes n
  left join public.profiles p on p.id = n.author_id
  where n.status = 'visible'
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 60);
$$;
revoke execute on function public.list_place_notes(integer) from public;
grant execute on function public.list_place_notes(integer) to anon, authenticated;
