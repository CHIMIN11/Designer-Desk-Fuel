-- Supabase grants EXECUTE on new functions to anon/authenticated directly, so the earlier
-- "revoke ... from public" did not remove them. Every function already checks the caller
-- inside (require_admin / auth.uid()), but signed-out visitors should not be able to call
-- member/admin functions at all. Public read functions stay open.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname not in ('list_public_spaces', 'list_public_space_assets', 'list_public_reviews',
                            'list_designers', 'list_active_banners', 'is_admin', 'space_is_public', 'rls_auto_enable')
  loop
    execute format('revoke execute on function %s from anon', f.sig);
  end loop;

  -- Internal helpers and trigger functions: nobody calls these over the API.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('require_admin', 'assert_space_owner', 'expire_space_authorizations',
                        'chat_rate_limit', 'contact_rate_limit', 'log_space_changes')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;
