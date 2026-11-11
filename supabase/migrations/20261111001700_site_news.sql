-- 最新消息: admin-written announcements (site news, events, partnerships, updates).
create table public.site_news (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(trim(title)) between 1 and 80),
  summary       text check (char_length(summary) <= 160),
  body          text not null check (char_length(trim(body)) between 1 and 8000),
  category      text not null default 'announcement' check (category in ('announcement', 'event', 'partnership', 'update')),
  cover_url     text check (cover_url is null or cover_url ~ '^https://'),
  link_url      text check (link_url is null or link_url ~ '^(https://|/)'),
  link_label    text check (char_length(link_label) <= 20),
  is_published  boolean not null default false,
  pinned        boolean not null default false,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index site_news_published_idx on public.site_news (published_at desc);
create trigger site_news_touch before update on public.site_news
  for each row execute function public.touch_updated_at();

alter table public.site_news enable row level security;
create policy "news: public reads published" on public.site_news
  for select to anon, authenticated using (is_published and published_at <= now());
create policy "news: admins manage" on public.site_news
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.site_news from anon, authenticated;
grant select on public.site_news to anon, authenticated;
grant insert, update, delete on public.site_news to authenticated;
