-- EmuraOS — allow signing in with username OR email. Supabase Auth only accepts
-- email/phone, so we resolve a username to its account email before calling
-- signInWithPassword. SECURITY DEFINER + anon grant because the lookup happens
-- pre-authentication.
--
-- ⚠️ Privacy tradeoff: this lets a caller map a known username to its account
-- email (enumeration). Usernames are already semi-public (friends are added by
-- usuario#TAG), so for this launcher it's acceptable; if you need emails kept
-- fully private, replace this with an Edge Function that verifies the password
-- server-side (using the service_role key) and never returns the email.
-- Run AFTER 0004_find_by_handle.sql.

create or replace function public.email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = trim(p_username)
  limit 1;
$$;
grant execute on function public.email_for_username(text) to anon, authenticated;
