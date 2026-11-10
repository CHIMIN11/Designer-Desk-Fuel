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
