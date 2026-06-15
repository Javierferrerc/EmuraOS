-- Ensure a profile exists for the current user (covers auth users created
-- BEFORE the handle_new_user trigger existed — e.g. the shared blog admin).
-- Idempotent; safe to call on every sign-in.

create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare result public.profiles;
begin
  select * into result from public.profiles where id = auth.uid();
  if not found then
    insert into public.profiles (id, display_name, friend_code)
    values (
      auth.uid(),
      coalesce(
        (select nullif(split_part(email, '@', 1), '') from auth.users where id = auth.uid()),
        'Jugador'
      ),
      public.gen_friend_code()
    )
    returning * into result;
  end if;
  return result;
end;
$$;

grant execute on function public.ensure_my_profile() to authenticated;
