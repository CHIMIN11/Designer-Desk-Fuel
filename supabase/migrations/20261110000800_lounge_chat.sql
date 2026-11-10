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
