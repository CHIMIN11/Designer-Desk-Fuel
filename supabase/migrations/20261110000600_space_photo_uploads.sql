-- Business photo / logo uploads for listings (Supabase Storage).
-- Files live in the public bucket "space-assets" under <user id>/<space id>/<file>.
-- A file being stored is NOT permission to show it: the public directory only
-- returns assets an admin has granted (list_public_space_assets), as before.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('space-assets', 'space-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Members may only write inside their own folder.
create policy "space-assets: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'space-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "space-assets: update own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'space-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "space-assets: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'space-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- At most 3 photos and 1 logo per listing (revoked ones do not count).
create or replace function public.add_space_asset(p_space_id uuid, p_asset_type text, p_asset_url text, p_scope text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_asset uuid;
  used integer;
begin
  perform public.assert_space_owner(p_space_id);
  select count(*) into used from public.space_assets
   where space_id = p_space_id and asset_type = p_asset_type and permission_status <> 'revoked';
  if p_asset_type = 'photo' and used >= 3 then
    raise exception 'a listing can have at most 3 photos';
  end if;
  if p_asset_type = 'logo' and used >= 1 then
    raise exception 'a listing can have only 1 logo';
  end if;
  insert into public.space_assets (space_id, uploaded_by, asset_type, asset_url, permission_scope)
  values (p_space_id, auth.uid(), p_asset_type, p_asset_url, p_scope)
  returning id into new_asset;
  perform public.write_audit('merchant', 'asset_submitted', 'space_assets', new_asset, null,
    jsonb_build_object('space_id', p_space_id, 'asset_type', p_asset_type));
  return new_asset;
end;
$$;

-- Businesses can withdraw one of their own assets (it stops being shown immediately).
create or replace function public.merchant_remove_asset(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sid uuid;
begin
  select space_id into sid from public.space_assets where id = p_asset_id;
  if sid is null then
    raise exception 'asset not found';
  end if;
  perform public.assert_space_owner(sid);
  update public.space_assets set permission_status = 'revoked' where id = p_asset_id;
  perform public.write_audit('merchant', 'asset_withdrawn', 'space_assets', p_asset_id, null, jsonb_build_object('space_id', sid));
end;
$$;

revoke all on function public.merchant_remove_asset(uuid) from public;
grant execute on function public.merchant_remove_asset(uuid) to authenticated;
