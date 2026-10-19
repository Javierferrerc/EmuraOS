-- EmuraOS — server clock for presence heartbeats.
-- Run AFTER 0014_profile_visibility.sql.
--
-- Clients broadcast their presence heartbeat in SERVER time (epoch ms) so a
-- PC whose clock is off doesn't look "stale" to friends. The client measures
-- its offset against this function; until it's applied, clients fall back to
-- their local clock (presence still works, just without that correction).

create or replace function public.server_now()
returns bigint
language sql volatile set search_path = public as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
