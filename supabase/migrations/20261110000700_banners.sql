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
