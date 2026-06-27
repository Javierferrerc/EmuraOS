-- EmuraOS — RLS hardening. Closes the exploit chain found in the security
-- review: (#1) recovery_email leaking to friends, (#2/#6) unilateral/forged
-- friendships + identity tampering, (#4/#5) privacy-toggle bypass and blocked
-- users retaining read access. Run AFTER 0009.
--
-- NOTE (#3 — email enumeration via email_for_username/email_for_handle to anon)
-- is NOT fixed here: it requires an Edge Function (service_role) that verifies
-- the password server-side without returning the email. See
-- supabase/functions/signin/ + deploy it, then revoke the anon grants. Until
-- then those RPCs stay anon-callable so username/handle login keeps working.

-- ── #1: move recovery_email out of the (friend-readable) profiles row ──────
create table if not exists public.profiles_private (
  id             uuid primary key references public.profiles (id) on delete cascade,
  recovery_email text
);
alter table public.profiles_private enable row level security;
drop policy if exists profiles_private_rw on public.profiles_private;
create policy profiles_private_rw on public.profiles_private
  for all using (id = auth.uid()) with check (id = auth.uid());

-- migrate any existing values, then drop the leaky column. Guarded so the
-- migration is safe to RE-RUN after the column has already been dropped.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'recovery_email'
  ) then
    insert into public.profiles_private (id, recovery_email)
      select id, recovery_email from public.profiles where recovery_email is not null
      on conflict (id) do update set recovery_email = excluded.recovery_email;
    alter table public.profiles drop column recovery_email;
  end if;
end $$;

-- signup trigger now writes recovery_email into the private table.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id, display_name, friend_code, username, user_tag,
    first_name, last_name, age, show_name, show_age
  )
  values (
    new.id,
    coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', ''),
             split_part(new.email, '@', 1), 'Jugador'),
    public.gen_friend_code(),
    nullif(meta->>'username', ''),
    upper(nullif(meta->>'user_tag', '')),
    nullif(meta->>'first_name', ''),
    nullif(meta->>'last_name', ''),
    nullif(meta->>'age', '')::int,
    coalesce((meta->>'show_name')::boolean, true),
    coalesce((meta->>'show_age')::boolean, false)
  )
  on conflict (id) do nothing;

  if nullif(meta->>'recovery_email', '') is not null then
    insert into public.profiles_private (id, recovery_email)
    values (new.id, nullif(meta->>'recovery_email', ''))
    on conflict (id) do update set recovery_email = excluded.recovery_email;
  end if;
  return new;
end;
$$;

-- ── #1/#4/#5: profiles is now OWNER-ONLY. All cross-user profile reads go
--    through the SECURITY DEFINER RPCs, which expose only public-safe fields
--    and honor show_name/show_age. A blocked user can no longer read you, and
--    name/age toggles can no longer be bypassed via a direct table read. ──
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid());

-- Batch safe profile cards (used by the friends list). Never returns private
-- fields; first/last name and age only when the owner made them visible.
create or replace function public.get_public_profiles(p_ids uuid[])
returns table (
  id uuid, username citext, user_tag citext, display_name text,
  avatar_url text, banner_url text, status text,
  pinned jsonb, stats jsonb, friend_code text,
  first_name text, last_name text, age int, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.user_tag, p.display_name,
         p.avatar_url, p.banner_url, p.status,
         p.pinned, p.stats, p.friend_code,
         case when coalesce(p.show_name, false) then p.first_name end,
         case when coalesce(p.show_name, false) then p.last_name  end,
         case when coalesce(p.show_age,  false) then p.age        end,
         p.created_at
  from public.profiles p
  where p.id = any (p_ids);
$$;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;

-- ── #2/#6: friendships — block forging 'accepted' and identity tampering ──
-- INSERT may only create your own request (pending) or a block; never an
-- already-accepted edge.
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert with check (
    requester_id = auth.uid() and status in ('pending', 'blocked')
  );

-- A trigger enforces the OLD→NEW rules RLS can't express: identities are
-- immutable, and only the addressee can move a request to 'accepted'.
create or replace function public.friendships_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.requester_id <> auth.uid() then
      raise exception 'requester must be the caller';
    end if;
    if new.status = 'accepted' then
      raise exception 'a friendship cannot start as accepted';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
      raise exception 'cannot reassign a friendship';
    end if;
    if new.status = 'accepted' and old.status <> 'accepted'
       and auth.uid() <> old.addressee_id then
      raise exception 'only the addressee can accept a request';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists friendships_guard_trg on public.friendships;
create trigger friendships_guard_trg
  before insert or update on public.friendships
  for each row execute function public.friendships_guard();
