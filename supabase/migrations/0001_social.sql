-- EmuraOS social ecosystem — schema + Row Level Security.
-- Run this in the Supabase SQL editor (or `supabase db push`) on a fresh project.
-- Security model: the desktop client is UNTRUSTED; all authorization is enforced
-- here via RLS. The anon key shipped in the app is public by design.

-- ── Extensions ─────────────────────────────────────────────────────────
create extension if not exists pgcrypto;      -- gen_random_uuid / gen_random_bytes
create extension if not exists citext;         -- case-insensitive usernames

-- ── profiles ───────────────────────────────────────────────────────────
-- One row per authenticated user. id == auth.users.id.
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      citext unique,
  display_name  text not null default 'Jugador',
  avatar_url    text,
  status        text not null default '',
  friend_code   text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- friendships: one row per relationship (requester -> addressee).
do $$ begin
  create type public.friendship_status as enum ('pending', 'accepted', 'blocked');
exception when duplicate_object then null; end $$;

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint friendships_distinct check (requester_id <> addressee_id),
  constraint friendships_unique unique (requester_id, addressee_id)
);
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

-- activity feed: events a user produces; friends read recent ones.
create table if not exists public.activity (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,                 -- achievement | playing | completed | newgame | screenshot
  game_ref   text,                          -- stable game identity (system + title hash), never a ROM
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_user_created_idx on public.activity (user_id, created_at desc);

-- ── Helpers ────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it bypasses RLS internally and never recurses into the
-- policies that call it.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- Any relationship (pending/accepted/blocked) — used so a user can see the
-- basic profile of someone who sent them a pending request.
create or replace function public.has_friendship(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where (f.requester_id = a and f.addressee_id = b)
       or (f.requester_id = b and f.addressee_id = a)
  );
$$;

-- random friend code like NX-4827-9931
create or replace function public.gen_friend_code()
returns text
language plpgsql
as $$
declare code text;
begin
  loop
    code := 'NX-' || lpad((floor(random()*10000))::int::text, 4, '0')
                  || '-' || lpad((floor(random()*10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;

-- Auto-create a profile when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, friend_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email, '@', 1),
             'Jugador'),
    public.gen_friend_code()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists friendships_touch on public.friendships;
create trigger friendships_touch before update on public.friendships
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────
alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.activity    enable row level security;

-- profiles: read own + accepted friends; everyone can look up by exact
-- friend_code/username for adding (handled via a SECURITY DEFINER RPC below,
-- so the broad table SELECT stays friends-only).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.has_friendship(id, auth.uid()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

-- friendships: visible to either party; create as requester; the addressee
-- updates status (accept/reject/block); either party may delete (remove).
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert with check (requester_id = auth.uid());

drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete using (requester_id = auth.uid() or addressee_id = auth.uid());

-- activity: read own + accepted friends; write only your own.
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select using (user_id = auth.uid() or public.are_friends(user_id, auth.uid()));

drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity
  for insert with check (user_id = auth.uid());

-- ── Lookup RPC (add-by-code without exposing the whole table) ──────────
-- Returns a minimal public card for a user found by exact friend code, so the
-- profiles SELECT policy can stay friends-only.
create or replace function public.find_profile_by_code(p_code text)
returns table (id uuid, display_name text, username citext, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.username, p.avatar_url
  from public.profiles p
  where p.friend_code = upper(trim(p_code))
    and p.id <> auth.uid()
  limit 1;
$$;
grant execute on function public.find_profile_by_code(text) to authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────
-- Presence (online / now-playing) uses Realtime Presence channels (ephemeral,
-- no table). Optionally broadcast friends' profile/friendship changes:
alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.activity;
