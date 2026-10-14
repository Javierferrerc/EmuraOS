-- EmuraOS — per-section profile visibility + public library / likes showcase.
-- Run AFTER 0013_user_library_sync.sql.
--
-- Each profile section has its own audience: 'everyone' (any signed-in EMURA
-- user), 'friends' (accepted friends only) or 'nobody'. Defaults keep today's
-- behaviour for pinned games (public) and keep what was private private:
--   vis_pinned    = 'everyone'  (pinned was already public via get_public_profile)
--   vis_library   = 'nobody'    (lived only in the owner-only user_library doc)
--   vis_favorites = 'nobody'
-- A block (either direction) hides every section regardless of the setting.
--
-- The library / likes come from the owner-only `user_library` document through
-- a SECURITY DEFINER RPC that returns ONLY a safe projection (title, system,
-- cover) of the sections the caller may see — never the raw document (play
-- sessions, devices, collections, ...).

-- ── columns ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists vis_library   text not null default 'nobody',
  add column if not exists vis_pinned    text not null default 'everyone',
  add column if not exists vis_favorites text not null default 'nobody';

alter table public.profiles drop constraint if exists profiles_vis_library_check;
alter table public.profiles add constraint profiles_vis_library_check
  check (vis_library in ('everyone', 'friends', 'nobody'));
alter table public.profiles drop constraint if exists profiles_vis_pinned_check;
alter table public.profiles add constraint profiles_vis_pinned_check
  check (vis_pinned in ('everyone', 'friends', 'nobody'));
alter table public.profiles drop constraint if exists profiles_vis_favorites_check;
alter table public.profiles add constraint profiles_vis_favorites_check
  check (vis_favorites in ('everyone', 'friends', 'nobody'));

-- ── who may see a section ───────────────────────────────────────────────
-- The owner always sees everything. Anyone else: blocked → never; then the
-- section's audience. 'everyone' still requires a signed-in caller.
create or replace function public.can_view_section(p_owner uuid, p_level text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is not null and auth.uid() = p_owner then true
    when auth.uid() is null then false
    when exists (
      select 1 from public.friendships f
      where f.status = 'blocked'
        and ((f.requester_id = auth.uid() and f.addressee_id = p_owner)
          or (f.requester_id = p_owner and f.addressee_id = auth.uid()))
    ) then false
    when p_level = 'everyone' then true
    when p_level = 'friends' then public.are_friends(auth.uid(), p_owner)
    else false
  end;
$$;
revoke execute on function public.can_view_section(uuid, text) from public, anon;
grant execute on function public.can_view_section(uuid, text) to authenticated;

-- ── gate `pinned` in the existing profile RPCs ──────────────────────────
-- Same signatures as 0010/0012 (client mapping unchanged); pinned comes back
-- as [] when the caller may not see it.
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
         case when public.can_view_section(p.id, p.vis_pinned) then p.pinned else '[]'::jsonb end,
         p.stats, null::text as friend_code,
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
         case when public.can_view_section(p.id, p.vis_pinned) then p.pinned else '[]'::jsonb end,
         p.stats, null::text as friend_code,
         case when coalesce(p.show_name, false) then p.first_name end,
         case when coalesce(p.show_name, false) then p.last_name  end,
         case when coalesce(p.show_age,  false) then p.age        end,
         p.created_at
  from public.profiles p
  where p.username = trim(p_username) and p.user_tag = upper(trim(p_tag));
$$;
grant execute on function public.get_public_profile_by_handle(text, text) to anon, authenticated;

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
         case when public.can_view_section(p.id, p.vis_pinned) then p.pinned else '[]'::jsonb end,
         p.stats, p.friend_code,
         case when coalesce(p.show_name, false) then p.first_name end,
         case when coalesce(p.show_name, false) then p.last_name  end,
         case when coalesce(p.show_age,  false) then p.age        end,
         p.created_at
  from public.profiles p
  where p.id = any (p_ids);
$$;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;

-- ── library + likes showcase ────────────────────────────────────────────
-- Safe {title, system, system_id, cover} for one "systemId:fileName" key: from
-- the doc's game catalog when present, else the file name without extension.
create or replace function public.showcase_game(p_doc jsonb, p_key text)
returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'title', coalesce(
      nullif(p_doc->'games'->p_key->>'t', ''),
      regexp_replace(substring(p_key from position(':' in p_key) + 1), '\.[A-Za-z0-9]{1,5}$', '')
    ),
    'system', coalesce(nullif(p_doc->'games'->p_key->>'s', ''), split_part(p_key, ':', 1)),
    'system_id', split_part(p_key, ':', 1),
    'cover',  case when (p_doc->'games'->p_key->>'c') like 'https://%'
                   then p_doc->'games'->p_key->>'c' end
  );
$$;

-- For each section: whether the caller may see it and, if so, its games as
-- {title, system, cover} — never the raw document (play sessions, devices,
-- collections...). Capped so a huge library can't blow up the response.
create or replace function public.get_profile_showcase(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_prof public.profiles%rowtype;
  v_doc  jsonb;
  v_lib_ok boolean;
  v_fav_ok boolean;
  v_library jsonb := '[]'::jsonb;
  v_favorites jsonb := '[]'::jsonb;
begin
  select * into v_prof from public.profiles where id = p_user_id;
  if not found then
    return null;
  end if;

  v_lib_ok := public.can_view_section(p_user_id, v_prof.vis_library);
  v_fav_ok := public.can_view_section(p_user_id, v_prof.vis_favorites);

  if v_lib_ok or v_fav_ok then
    select data into v_doc from public.user_library where user_id = p_user_id;
  end if;

  if v_doc is not null and v_lib_ok then
    select coalesce(jsonb_agg(g order by lower(g->>'title')), '[]'::jsonb) into v_library
    from (
      select public.showcase_game(v_doc, k) as g
      from (
        select distinct jsonb_array_elements_text(d.value->'lib') as k
        from jsonb_each(coalesce(v_doc->'devices', '{}'::jsonb)) d
        where jsonb_typeof(d.value->'lib') = 'array'
        limit 3000
      ) keys
    ) s;
  end if;

  if v_doc is not null and v_fav_ok then
    select coalesce(jsonb_agg(g order by at desc), '[]'::jsonb) into v_favorites
    from (
      select public.showcase_game(v_doc, f.key) as g,
             coalesce((f.value->>'at')::bigint, 0) as at
      from jsonb_each(coalesce(v_doc->'fav', '{}'::jsonb)) f
      where jsonb_typeof(f.value) = 'object'
        and coalesce((f.value->>'on')::boolean, false)
      order by at desc
      limit 1000
    ) s;
  end if;

  return jsonb_build_object(
    'library',   jsonb_build_object('visible', v_lib_ok, 'games', v_library),
    'favorites', jsonb_build_object('visible', v_fav_ok, 'games', v_favorites),
    'pinned',    jsonb_build_object('visible', public.can_view_section(p_user_id, v_prof.vis_pinned))
  );
end;
$$;

revoke execute on function public.get_profile_showcase(uuid) from public, anon;
grant execute on function public.get_profile_showcase(uuid) to authenticated;

