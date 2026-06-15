-- EmuraOS registration — extend profiles with the sign-up form fields and add
-- anon-callable availability checks (username / user tag) used live while the
-- registration modal is filled (the user isn't authenticated yet).
--
-- Run AFTER 0001_social.sql and 0002_ensure_profile.sql.

-- ── New profile columns ────────────────────────────────────────────────
-- user_tag is the short "#AX12" handle (3–5 alphanumerics, case-insensitive,
-- globally unique) — distinct from the friend_code (NX-0000-0000).
alter table public.profiles
  add column if not exists first_name     text,
  add column if not exists last_name      text,
  add column if not exists user_tag       citext,
  add column if not exists age            int,
  add column if not exists show_name      boolean not null default true,
  add column if not exists show_age       boolean not null default false,
  add column if not exists recovery_email text;

-- Unique handle (only enforced when present — older rows have NULL).
create unique index if not exists profiles_user_tag_key
  on public.profiles (user_tag)
  where user_tag is not null;

-- ── Availability RPCs (callable by anon, before sign-up) ───────────────
-- SECURITY DEFINER so they bypass the friends-only profiles SELECT policy and
-- never leak more than a yes/no. They return true when the value is free.
create or replace function public.username_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select length(trim(p_name)) >= 3
     and not exists (
       select 1 from public.profiles p where p.username = trim(p_name)
     );
$$;
grant execute on function public.username_available(text) to anon, authenticated;

create or replace function public.user_tag_available(p_tag text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select upper(trim(p_tag)) ~ '^[A-Z0-9]{3,5}$'
     and not exists (
       select 1 from public.profiles p where p.user_tag = upper(trim(p_tag))
     );
$$;
grant execute on function public.user_tag_available(text) to anon, authenticated;

-- ── Populate the new fields from sign-up metadata ──────────────────────
-- Replaces the 0001 trigger function: reads the extra registration fields
-- from raw_user_meta_data when present and falls back to the old behaviour.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id, display_name, friend_code,
    username, user_tag, first_name, last_name, age,
    show_name, show_age, recovery_email
  )
  values (
    new.id,
    coalesce(nullif(meta->>'full_name', ''),
             nullif(meta->>'name', ''),
             split_part(new.email, '@', 1),
             'Jugador'),
    public.gen_friend_code(),
    nullif(meta->>'username', ''),
    upper(nullif(meta->>'user_tag', '')),
    nullif(meta->>'first_name', ''),
    nullif(meta->>'last_name', ''),
    nullif(meta->>'age', '')::int,
    coalesce((meta->>'show_name')::boolean, true),
    coalesce((meta->>'show_age')::boolean, false),
    nullif(meta->>'recovery_email', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
