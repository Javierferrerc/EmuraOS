-- EmuraOS — perfiles públicos + media en la nube.
-- Permite que cualquier cuenta vea el perfil de un usuario (foto, portada,
-- estado, juegos destacados, stats y capturas). La privacidad se respeta vía
-- RPCs que devuelven SOLO campos públicos (nunca recovery_email) y honran los
-- toggles show_name / show_age. Run AFTER 0006_handle_pair_unique.sql.

-- ── Columnas nuevas en profiles ────────────────────────────────────────
alter table public.profiles
  add column if not exists banner_url text,
  -- Juegos destacados (showcase): array de objetos {title, cover_url, system}
  -- en vez de claves locales, para que otra cuenta pueda renderizarlos.
  add column if not exists pinned     jsonb not null default '[]'::jsonb,
  -- Stats agregadas que el cliente sincroniza: {play_seconds, games, level, xp}.
  add column if not exists stats      jsonb not null default '{}'::jsonb;

-- ── Capturas de pantalla del perfil ────────────────────────────────────
create table if not exists public.screenshots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,            -- ruta dentro del bucket 'screenshots'
  caption      text,
  game_ref     text,                     -- identidad estable del juego (no ROM)
  created_at   timestamptz not null default now()
);
create index if not exists screenshots_user_created_idx
  on public.screenshots (user_id, created_at desc);

alter table public.screenshots enable row level security;
-- Lectura pública; el dueño inserta/borra las suyas.
drop policy if exists screenshots_select on public.screenshots;
create policy screenshots_select on public.screenshots
  for select using (true);
drop policy if exists screenshots_insert on public.screenshots;
create policy screenshots_insert on public.screenshots
  for insert with check (user_id = auth.uid());
drop policy if exists screenshots_delete on public.screenshots;
create policy screenshots_delete on public.screenshots
  for delete using (user_id = auth.uid());

-- ── RPCs de perfil público (SOLO campos seguros) ───────────────────────
-- SECURITY DEFINER: saltan la policy "solo amigos" de profiles, pero nunca
-- exponen recovery_email; nombre/edad solo si el usuario los hizo visibles.
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
         p.pinned, p.stats, p.friend_code,
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
         p.pinned, p.stats, p.friend_code,
         case when coalesce(p.show_name, false) then p.first_name end,
         case when coalesce(p.show_name, false) then p.last_name  end,
         case when coalesce(p.show_age,  false) then p.age        end,
         p.created_at
  from public.profiles p
  where p.username = trim(p_username) and p.user_tag = upper(trim(p_tag));
$$;
grant execute on function public.get_public_profile_by_handle(text, text) to anon, authenticated;

create or replace function public.list_public_screenshots(p_user_id uuid)
returns table (id uuid, storage_path text, caption text, game_ref text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.storage_path, s.caption, s.game_ref, s.created_at
  from public.screenshots s
  where s.user_id = p_user_id
  order by s.created_at desc;
$$;
grant execute on function public.list_public_screenshots(uuid) to anon, authenticated;

-- ── Buckets de Storage (lectura pública) ───────────────────────────────
insert into storage.buckets (id, name, public) values
  ('avatars',     'avatars',     true),
  ('banners',     'banners',     true),
  ('screenshots', 'screenshots', true)
on conflict (id) do nothing;

-- Convención de ruta: "<uid>/<archivo>" — el primer segmento debe ser el uid.
drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select using (bucket_id in ('avatars', 'banners', 'screenshots'));

drop policy if exists media_owner_insert on storage.objects;
create policy media_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'banners', 'screenshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists media_owner_update on storage.objects;
create policy media_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'banners', 'screenshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists media_owner_delete on storage.objects;
create policy media_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'banners', 'screenshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
