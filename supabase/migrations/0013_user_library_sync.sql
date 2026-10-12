-- EmuraOS — cloud sync of each account's library activity.
--
-- One row per account holding the synced document built by the client
-- (src/core/library-sync.ts): per-device play time / sessions + library keys,
-- favourites, collections, pinned showcase games and a small game catalog
-- (title / system / cover) so another machine can show games it doesn't have.
--
-- Private: only the owner can read or write their row. Friends/public see the
-- aggregate `profiles.stats` / `profiles.pinned`, never this document.
--
-- `rev` is an optimistic-concurrency counter: the client updates
-- `where rev = <rev it read>` and sets rev + 1, retrying on a miss, so two
-- machines syncing at once merge instead of overwriting each other.

create table if not exists public.user_library (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now(),
  -- Bound the row (a 20k-game library is well under 2 MB).
  constraint user_library_data_size check (octet_length(data::text) < 4000000),
  constraint user_library_data_object check (jsonb_typeof(data) = 'object')
);

drop trigger if exists user_library_touch on public.user_library;
create trigger user_library_touch before update on public.user_library
  for each row execute function public.touch_updated_at();

alter table public.user_library enable row level security;

drop policy if exists user_library_select on public.user_library;
create policy user_library_select on public.user_library
  for select using (user_id = auth.uid());

drop policy if exists user_library_insert on public.user_library;
create policy user_library_insert on public.user_library
  for insert with check (user_id = auth.uid());

drop policy if exists user_library_update on public.user_library;
create policy user_library_update on public.user_library
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_library_delete on public.user_library;
create policy user_library_delete on public.user_library
  for delete using (user_id = auth.uid());

revoke all on public.user_library from anon;
grant select, insert, update, delete on public.user_library to authenticated;
