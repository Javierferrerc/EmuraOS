# EmuraOS — Social layer setup (Supabase)

This is the provisioning checklist for the social ecosystem (accounts, friends,
presence, activity). Code lives in `src/electron/renderer/social/` and the DB
schema in `supabase/migrations/0001_social.sql`. The launcher works fully
offline without any of this; social features only light up once it's configured
and the user signs in.

## 1. Create the Supabase project
1. Go to <https://supabase.com> → **New project** (pick a region close to your users).
2. Wait for it to provision.

## 2. Run the schema + RLS
- Open **SQL Editor** → paste the contents of `supabase/migrations/0001_social.sql` → **Run**.
- (Or, with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
- This creates `profiles`, `friendships`, `activity`, the helper functions, the
  `handle_new_user` trigger, and all **Row Level Security** policies.

## 3. Enable auth providers
**Authentication → Providers**:
- **Email**: enable (works immediately — good for the first end-to-end test).
- **Discord**: enable, then create an app at <https://discord.com/developers/applications>
  → OAuth2 → add the redirect, copy Client ID + Secret into Supabase.
- **Google**: enable, create OAuth credentials in Google Cloud Console, copy
  Client ID + Secret into Supabase.

**Redirect URLs** (Authentication → URL Configuration → Redirect URLs) — add the
desktop callback we'll use for OAuth (decided in the next phase), e.g.:
```
emuraos://auth-callback
http://localhost:54321/auth-callback
```

## 4. Wire the keys into the build
**Settings → API**, copy the **Project URL** and the **anon public** key into a
local `.env` at the repo root (it's gitignored):
```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLIC-ANON-KEY
```
> The anon key is **public** (safe to ship). Never put the `service_role` key in
> the app — it bypasses RLS and must stay server-side only.

## 5. Validate the spike
With `.env` set and the migration run, restart the app. Next implementation step
wires:
- Email sign-up / sign-in (no OAuth app needed) → confirms **auth** end-to-end.
- A Realtime **presence** channel → confirms **live online / now-playing**.

Once those work from Electron, we add the Discord/Google desktop OAuth redirect,
then the friends UI, presence in the profile, and the activity feed (phases 2–4).

## Security notes
- The desktop client is untrusted; **all** authorization is RLS. The functions in
  `socialApi.ts` are just convenience wrappers — they can't grant access the
  policies don't allow.
- Presence is ephemeral (Realtime channel, auto-clears on disconnect — no stale
  "online"). Per-friend presence privacy is a later refinement.
- Shared game data is **identity only** (system + title), never ROM files.
