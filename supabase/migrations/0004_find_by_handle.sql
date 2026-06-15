-- EmuraOS — look up a profile by its handle (username + user_tag, e.g.
-- "alexvega#AX12") so friends can be added by handle as well as by friend_code.
-- SECURITY DEFINER so it bypasses the friends-only profiles SELECT policy and
-- returns only the minimal public card. Run AFTER 0003_registration.sql.

create or replace function public.find_profile_by_handle(p_username text, p_tag text)
returns table (id uuid, display_name text, username citext, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.username, p.avatar_url
  from public.profiles p
  where p.username = trim(p_username)
    and p.user_tag = upper(trim(p_tag))
    and p.id <> auth.uid()
  limit 1;
$$;
grant execute on function public.find_profile_by_handle(text, text) to authenticated;
