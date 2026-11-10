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
