-- EmuraOS — (re)assert Storage RLS so signed-in users can upload their own
-- avatars / banners / screenshots. Run if 0007's storage policy block didn't
-- take (a common Supabase gotcha: CREATE POLICY ON storage.objects can fail
-- silently when the SQL editor isn't the table owner). Safe to re-run.
--
-- If "must be owner of table objects" appears when running this, create the
-- same policies from the dashboard: Storage → Policies → New policy on each of
-- the avatars/banners/screenshots buckets (INSERT/UPDATE/DELETE for
-- authenticated where (storage.foldername(name))[1] = auth.uid()::text, and
-- SELECT for everyone).

-- Buckets (idempotent) — public read.
insert into storage.buckets (id, name, public) values
  ('avatars',     'avatars',     true),
  ('banners',     'banners',     true),
  ('screenshots', 'screenshots', true)
on conflict (id) do update set public = true;

-- Public read for all three media buckets.
drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select using (bucket_id in ('avatars', 'banners', 'screenshots'));

-- Owner writes — the first path segment must be the caller's uid
-- ("<uid>/<file>"), which is exactly how the client builds upload paths.
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
