-- EmuraOS — user discovery (search by partial name/handle) + user reports.
-- Run AFTER 0007_public_profiles_media.sql.

-- ── Search public profiles by partial name or handle ───────────────────
-- SECURITY DEFINER so it bypasses the friends-only profiles SELECT policy and
-- returns ONLY safe public-card fields. Excludes the caller and anyone in a
-- block relationship with the caller (either direction). Prefix matches first.
create or replace function public.search_public_profiles(p_query text, p_limit int default 20)
returns table (
  id uuid, username citext, user_tag citext, display_name text,
  avatar_url text, status text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.user_tag, p.display_name, p.avatar_url, p.status
  from public.profiles p
  where length(trim(p_query)) >= 2
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      p.display_name ilike '%' || trim(p_query) || '%'
      or p.username::text ilike '%' || trim(p_query) || '%'
    )
    and not exists (
      select 1 from public.friendships f
      where f.status = 'blocked'
        and ((f.requester_id = auth.uid() and f.addressee_id = p.id)
          or (f.requester_id = p.id and f.addressee_id = auth.uid()))
    )
  order by
    (case
       when p.username::text ilike trim(p_query) || '%' then 0
       when p.display_name ilike trim(p_query) || '%' then 1
       else 2
     end),
    p.display_name
  limit least(coalesce(p_limit, 20), 50);
$$;
grant execute on function public.search_public_profiles(text, int) to authenticated;

-- ── User reports ───────────────────────────────────────────────────────
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_id   uuid not null references public.profiles (id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  constraint reports_distinct check (reporter_id <> target_id)
);
create index if not exists reports_target_idx on public.reports (target_id, created_at desc);

alter table public.reports enable row level security;
-- A user files reports as themselves and can read back only their own.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (reporter_id = auth.uid());
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select using (reporter_id = auth.uid());
