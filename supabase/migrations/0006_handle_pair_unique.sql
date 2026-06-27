-- EmuraOS — Riot-style handles: the (username, user_tag) PAIR is unique, not
-- each part on its own. Several people can share a username, differentiated by
-- their #tag (e.g. alex#AX12 vs alex#9Q2). The tag is a discriminator, not a
-- globally-unique handle. Run AFTER 0005_login_by_username.sql.

-- ── Drop the standalone uniqueness on username and user_tag ─────────────
alter table public.profiles drop constraint if exists profiles_username_key;
drop index if exists public.profiles_user_tag_key;

-- ── Enforce uniqueness on the handle PAIR (only when both present) ───────
create unique index if not exists profiles_handle_key
  on public.profiles (username, user_tag)
  where username is not null and user_tag is not null;

-- ── Availability of a full handle (username#tag). True = free + valid ────
-- Replaces username_available / user_tag_available for the registration form:
-- only the combination matters now.
create or replace function public.handle_available(p_name text, p_tag text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select length(trim(p_name)) >= 3
     and upper(trim(p_tag)) ~ '^[A-Z0-9]{3,5}$'
     and not exists (
       select 1 from public.profiles p
       where p.username = trim(p_name)
         and p.user_tag = upper(trim(p_tag))
     );
$$;
grant execute on function public.handle_available(text, text) to anon, authenticated;

-- ── Resolve a handle (username + tag) to its account email for sign-in ──
-- Bare username is no longer unique, so username-only login is ambiguous;
-- sign-in uses email or username#tag.
create or replace function public.email_for_handle(p_username text, p_tag text)
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
    and p.user_tag = upper(trim(p_tag))
  limit 1;
$$;
grant execute on function public.email_for_handle(text, text) to anon, authenticated;
