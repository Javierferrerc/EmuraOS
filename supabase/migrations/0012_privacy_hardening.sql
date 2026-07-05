-- EmuraOS — privacy hardening (security review follow-ups).
--
-- Closes three residual exposures found in the security review:
--   #A  `screenshots` table was world-readable (`using (true)`), letting any
--       anon bulk-enumerate every user's screenshot rows + storage paths.
--   #B  The anon-callable public-profile RPCs returned `friend_code`, letting
--       anyone harvest friend codes for any user.
--   #C  `email_for_username` was still anon-callable (username → account email
--       enumeration). 0011 closed `email_for_handle` but left this one because
--       password-reset-by-username resolved it client-side.
--
-- DEPLOY ORDER (like 0011): deploy the `password-reset` Edge Function AND ship
-- the client build that calls it BEFORE running this migration — otherwise
-- password reset by username breaks. The public showcase still works: profile
-- screenshots are read through the SECURITY DEFINER `list_public_screenshots`
-- RPC, which bypasses the tightened table policy.

-- ── #A  screenshots: restrict direct table reads to the owner ───────────
-- The per-profile showcase reads through list_public_screenshots() (definer),
-- so this only removes the bulk-enumeration vector, not the showcase.
drop policy if exists screenshots_select on public.screenshots;
create policy screenshots_select on public.screenshots
  for select using (user_id = auth.uid());

-- ── #B  drop friend_code from the anon-facing profile RPCs ──────────────
-- Keep the column in the result signature (so the client mapping is unchanged)
-- but always return NULL — a user's own friend_code is still available to them
-- via ensure_my_profile / their own profile row.
create or replace function public.get_public_profile(p_user_id uuid)
returns table (
  id uuid, username citext, user_tag citext, display_name text,
  avatar_url text, banner_url text, status text,
  pinned jsonb, stats jsonb, friend_code text,
  first_name text, last_name text, age int, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.user_tag, p.display_name,
         p.avatar_url, p.banner_url, p.status,
         p.pinned, p.stats, null::text as friend_code,
         case when coalesce(p.show_name, false) then p.first_name end,
         case when coalesce(p.show_name, false) then p.last_name  end,
         case when coalesce(p.show_age,  false) then p.age        end,
         p.created_at
  from public.profiles p
  where p.id = p_user_id;
$$;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

create or replace function public.get_public_profile_by_handle(p_username text, p_tag text)
returns table (
  id uuid, username citext, user_tag citext, display_name text,
  avatar_url text, banner_url text, status text,
  pinned jsonb, stats jsonb, friend_code text,
  first_name text, last_name text, age int, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.user_tag, p.display_name,
         p.avatar_url, p.banner_url, p.status,
         p.pinned, p.stats, null::text as friend_code,
         case when coalesce(p.show_name, false) then p.first_name end,
         case when coalesce(p.show_name, false) then p.last_name  end,
         case when coalesce(p.show_age,  false) then p.age        end,
         p.created_at
  from public.profiles p
  where p.username = trim(p_username) and p.user_tag = upper(trim(p_tag));
$$;
grant execute on function public.get_public_profile_by_handle(text, text) to anon, authenticated;

-- ── #C  close the username → email enumeration ──────────────────────────
-- Password reset by username now runs through the `password-reset` Edge
-- Function (service_role), so anon no longer needs this RPC. Revoke from anon
-- AND public; keep authenticated + service_role (the Edge Function calls it as
-- service_role, which bypasses grants anyway).
revoke execute on function public.email_for_username(text) from anon, public;
grant  execute on function public.email_for_username(text) to authenticated, service_role;
