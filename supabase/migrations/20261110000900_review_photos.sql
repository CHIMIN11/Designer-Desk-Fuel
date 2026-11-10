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
