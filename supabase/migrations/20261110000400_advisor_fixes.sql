-- Fixes for Supabase Security / Performance Advisor warnings:
-- 1) auth_rls_initplan: wrap auth.uid() / is_admin() in (select …) so they run once per query, not per row.
-- 2) function_search_path_mutable: pin search_path on the remaining helper functions.
-- Behaviour is unchanged; the same 35 security tests cover it.

alter function public.require_login() set search_path = public, pg_temp;
alter function public.prevent_audit_mutation() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;

-- profiles
drop policy "profiles: owner can read" on public.profiles;
drop policy "profiles: owner can insert self" on public.profiles;
drop policy "profiles: owner can update self" on public.profiles;
create policy "profiles: owner can read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner can insert self" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: owner can update self" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles / audit
drop policy "user_roles: read own role" on public.user_roles;
create policy "user_roles: read own role" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy "audit: admins can read" on public.admin_audit_log;
create policy "audit: admins can read" on public.admin_audit_log
  for select to authenticated using ((select public.is_admin()));

-- directory
drop policy "spaces: owner or admin can read" on public.spaces;
create policy "spaces: owner or admin can read" on public.spaces
  for select to authenticated using (owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy "authorizations: applicant or admin can read" on public.space_authorizations;
create policy "authorizations: applicant or admin can read" on public.space_authorizations
  for select to authenticated using (applicant_user_id = (select auth.uid()) or (select public.is_admin()));

drop policy "assets: space owner or admin can read" on public.space_assets;
create policy "assets: space owner or admin can read" on public.space_assets
  for select to authenticated using (
    (select public.is_admin())
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = (select auth.uid()))
  );

drop policy "update requests: requester or admin can read" on public.space_update_requests;
create policy "update requests: requester or admin can read" on public.space_update_requests
  for select to authenticated using (requested_by = (select auth.uid()) or (select public.is_admin()));

drop policy "update logs: admin can read" on public.space_update_logs;
create policy "update logs: admin can read" on public.space_update_logs
  for select to authenticated using ((select public.is_admin()));

-- reviews
drop policy "reviews: author or admin can read" on public.space_reviews;
drop policy "reviews: members post as themselves on public spaces" on public.space_reviews;
drop policy "reviews: authors edit their own" on public.space_reviews;
drop policy "reviews: authors delete their own" on public.space_reviews;
create policy "reviews: author or admin can read" on public.space_reviews
  for select to authenticated using (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "reviews: members post as themselves on public spaces" on public.space_reviews
  for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'visible' and public.space_is_public(space_id));
create policy "reviews: authors edit their own" on public.space_reviews
  for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "reviews: authors delete their own" on public.space_reviews
  for delete to authenticated using (author_id = (select auth.uid()));
