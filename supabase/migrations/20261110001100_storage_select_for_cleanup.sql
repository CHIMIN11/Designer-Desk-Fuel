-- Storage "remove" first looks the file up, so owners (and admins for banners) also need
-- SELECT on their own objects for cleanup of replaced/removed images to work.
create policy "space-assets: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'space-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "review-photos: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "site-banners: admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'site-banners' and (select public.is_admin()));
