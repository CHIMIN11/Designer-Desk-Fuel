-- Admins can correct a member suggestion (name, city, link, reason). The update policy
-- already limits every UPDATE on this table to admins.
grant update (name, city, link, reason) on public.space_suggestions to authenticated;
