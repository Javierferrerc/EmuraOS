/**
 * Social API — thin, typed wrappers over the Supabase client for the EmuraOS
 * social layer. All authorization is enforced server-side by RLS; these are
 * just the calls the UI/AppContext make. Every function throws if the social
 * layer isn't configured (build without Supabase creds) — callers should gate
 * on `isSocialConfigured()` first.
 *
 * Spike scope: email auth (no OAuth app needed to validate) + OAuth URL helper
 * for the desktop redirect flow, profile, friend graph, activity, and Realtime
 * presence. The desktop OAuth redirect handling + secure session storage land
 * in the next phase.
 */

import type { RealtimeChannel, Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabaseClient";
import * as vault from "./sessionVault";
import type {
  ActivityItem,
  FriendEdge,
  Friendship,
  PresenceState,
  Profile,
  ProfileScreenshot,
} from "./socialTypes";

function db() {
  const c = getSupabase();
  if (!c) throw new Error("Social layer not configured (missing Supabase credentials).");
  return c;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guard an id that will be interpolated into a PostgREST filter string. */
function assertUuid(id: string): void {
  if (!UUID_RE.test(id)) throw new Error("Invalid user id.");
}

/** functions.invoke turns a non-2xx into an error whose `context` is the
 *  Response — surface the Edge Function's friendly `error` message when we can,
 *  falling back to `fallback`. */
async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* keep the fallback */
    }
  }
  return fallback;
}

// ── Cloud media (avatars / banners / screenshots) ──────────────────────────
export type MediaBucket = "avatars" | "banners" | "screenshots";

/** Public URL for an object in a public Storage bucket. */
export function publicMediaUrl(bucket: MediaBucket, path: string): string {
  return db().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Decode a `data:` URL into a Blob WITHOUT `fetch()`. The renderer CSP's
 *  connect-src doesn't allow `data:`, so `fetch(dataUrl)` throws "Failed to
 *  fetch" — this manual decode sidesteps that entirely. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const type = /^data:([^;,]+)/.exec(head)?.[1] || "application/octet-stream";
  if (/;base64/i.test(head)) {
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type });
  }
  return new Blob([decodeURIComponent(body)], { type });
}

/** Upload an image into the caller's folder ("<uid>/…") in a public bucket and
 *  return its path + public URL. The path prefix is enforced by Storage RLS. */
export async function uploadProfileImage(
  bucket: MediaBucket,
  file: Blob,
  ext = "png"
): Promise<{ path: string; url: string }> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db().storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext}`,
  });
  if (error) throw error;
  return { path, url: publicMediaUrl(bucket, path) };
}

/**
 * Resolve a profile image value to a shareable cloud URL so every surface
 * (selector, in-app profile, others' views) can render it from ONE source:
 *  - data: URL (uploaded / dragged file) → upload to Storage, return public URL
 *  - http(s) URL (e.g. SteamGridDB) → keep as-is
 *  - null → null
 * Requires an active session (upload is owner-scoped). Shared by NexusProfile
 * (in-app editor) and NexusProfileSelect (account create/login avatar).
 */
export async function resolveProfileImageUrl(
  bucket: MediaBucket,
  value: string | null
): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("data:")) {
    const blob = dataUrlToBlob(value);
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
    const { url } = await uploadProfileImage(bucket, blob, ext);
    return url;
  }
  return value;
}

/** Read any user's PUBLIC profile (safe fields only; honors show_name/age). */
export async function getPublicProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db().rpc("get_public_profile", { p_user_id: userId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Profile) ?? null;
}

/** Read any user's PUBLIC profile by handle (username + #tag). */
export async function getPublicProfileByHandle(
  username: string,
  tag: string
): Promise<Profile | null> {
  const { data, error } = await db().rpc("get_public_profile_by_handle", {
    p_username: username,
    p_tag: tag,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Profile) ?? null;
}

/** List a user's screenshots (public), with resolved public URLs. */
export async function listScreenshots(userId: string): Promise<ProfileScreenshot[]> {
  const { data, error } = await db().rpc("list_public_screenshots", { p_user_id: userId });
  if (error) throw error;
  const rows = (data ?? []) as ProfileScreenshot[];
  return rows.map((r) => ({ ...r, url: publicMediaUrl("screenshots", r.storage_path) }));
}

/** Upload a screenshot to the caller's gallery and return the stored row. */
export async function addScreenshot(
  file: Blob,
  caption?: string,
  gameRef?: string
): Promise<ProfileScreenshot> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const { path } = await uploadProfileImage("screenshots", file, "png");
  const { data, error } = await db()
    .from("screenshots")
    .insert({
      user_id: u.user.id,
      storage_path: path,
      caption: caption ?? null,
      game_ref: gameRef ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  const row = data as ProfileScreenshot;
  return { ...row, url: publicMediaUrl("screenshots", row.storage_path) };
}

/** Delete one of the caller's screenshots (row + stored file). */
export async function deleteScreenshot(id: string, storagePath: string): Promise<void> {
  await db().storage.from("screenshots").remove([storagePath]);
  const { error } = await db().from("screenshots").delete().eq("id", id);
  if (error) throw error;
}

// ── Auth ─────────────────────────────────────────────────────────────────
export async function getSession(): Promise<Session | null> {
  const { data } = await db().auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (user: User | null) => void): () => void {
  const { data } = db().auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

// ── Multi-account session vault ────────────────────────────────────────────
/** Persist the CURRENT session into the multi-account vault (keyed by user id)
 *  so this account can be re-entered later without a password. Call on sign-in
 *  and on token refresh. */
export async function rememberCurrentSession(): Promise<void> {
  const { data } = await db().auth.getSession();
  const s = data.session;
  if (s?.user && s.access_token && s.refresh_token) {
    vault.rememberSession(s.user.id, {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
    });
  }
}

/** Restore a remembered account's session (no password). Returns its user, or
 *  null if there is no stored session or its refresh token is no longer valid
 *  (in which case the stale entry is dropped). */
export async function restoreSession(userId: string): Promise<User | null> {
  const stored = vault.getRememberedSession(userId);
  if (!stored) return null;
  const { data, error } = await db().auth.setSession(stored);
  if (error || !data.session?.user) {
    vault.forgetSession(userId);
    return null;
  }
  // Tokens may have rotated on refresh — persist the fresh pair.
  vault.rememberSession(data.session.user.id, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  return data.session.user;
}

/** Drop a single account from the vault (explicit "Cerrar sesión"). */
export function forgetRememberedSession(userId: string): void {
  vault.forgetSession(userId);
}

/** Ids of accounts with a remembered session on this machine. */
export function listRememberedAccounts(): string[] {
  return vault.listRememberedUserIds();
}

/** Does this account have a password-less session stored? */
export function hasRememberedSession(userId: string): boolean {
  return vault.hasRememberedSession(userId);
}

export async function signUpEmail(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signUp({ email, password });
  if (error) throw error;
}

/** Registration fields carried in the auth metadata so the `handle_new_user`
 *  trigger can populate the profile atomically with the auth user. */
export interface SignUpProfile {
  username: string;
  /** Short "#AX12" handle (3–5 alphanumerics); stored upper-cased. */
  user_tag: string;
  first_name: string;
  last_name: string;
  /** Public display name (real name or username, per the privacy toggle). */
  full_name: string;
  age: number;
  show_name: boolean;
  show_age: boolean;
  recovery_email: string;
}

/** Result of a sign-up: the new auth user id (present even when email
 *  confirmation is pending) and whether Supabase returned a live session
 *  (true only when email confirmation is disabled / auto-confirm). */
export interface SignUpResult {
  userId: string | null;
  hasSession: boolean;
}

/** Full sign-up from the registration modal: creates the auth user and lets the
 *  trigger build the profile from the supplied metadata. */
export async function signUpWithProfile(
  email: string,
  password: string,
  profile: SignUpProfile
): Promise<SignUpResult> {
  const { data, error } = await db().auth.signUp({
    email,
    password,
    options: { data: { ...profile, user_tag: profile.user_tag.toUpperCase() } },
  });
  if (error) throw error;
  return { userId: data.user?.id ?? null, hasSession: !!data.session };
}

/** Live availability check for a username (anon-callable). True = free. */
export async function isUsernameAvailable(name: string): Promise<boolean> {
  const { data, error } = await db().rpc("username_available", { p_name: name });
  if (error) throw error;
  return Boolean(data);
}

/** Live availability check for a user tag / "#ID" (anon-callable). True = free. */
export async function isUserTagAvailable(tag: string): Promise<boolean> {
  const { data, error } = await db().rpc("user_tag_available", { p_tag: tag });
  if (error) throw error;
  return Boolean(data);
}

/** Availability of a full handle (username + #ID). Riot-style: the PAIR must be
 *  free — the username and tag may each repeat on their own. True = free. */
export async function isHandleAvailable(name: string, tag: string): Promise<boolean> {
  const { data, error } = await db().rpc("handle_available", { p_name: name, p_tag: tag });
  if (error) throw error;
  return Boolean(data);
}

/** Resolve a handle (username + tag) to its account email (for handle sign-in). */
export async function emailForHandle(username: string, tag: string): Promise<string | null> {
  const { data, error } = await db().rpc("email_for_handle", {
    p_username: username,
    p_tag: tag,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function signInEmail(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Sign in with an email, a `usuario#ID` handle, or a bare username + password.
 *  Bare username is ambiguous now that usernames can repeat, so prefer email or
 *  the full `usuario#ID`; the bare-username path stays as a best-effort. */
export async function signInWithIdentifier(identifier: string, password: string): Promise<void> {
  // Resolution (username/handle → email) + the password check happen server-side
  // in the `signin` Edge Function, so the client never maps an identifier to an
  // account email (security finding #3). It returns only the session tokens.
  const { data, error } = await db().functions.invoke("signin", {
    body: { identifier: identifier.trim(), password },
  });
  if (error) {
    throw new Error(await functionErrorMessage(error, "No se pudo iniciar sesión."));
  }
  const tokens = data as { access_token?: string; refresh_token?: string } | null;
  if (!tokens?.access_token || !tokens?.refresh_token) {
    throw new Error("Respuesta de inicio de sesión inválida.");
  }
  const { error: sErr } = await db().auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (sErr) throw sErr;
}

/** Desktop OAuth: returns the provider authorization URL WITHOUT navigating, so
 *  the main process can open it in the system browser and catch the redirect. */
export async function getOAuthUrl(
  provider: "discord" | "google",
  redirectTo: string
): Promise<string> {
  const { data, error } = await db().auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  return data.url;
}

/** Complete a desktop OAuth/magic-link redirect by setting the returned tokens. */
export async function setSessionFromTokens(access_token: string, refresh_token: string): Promise<void> {
  const { error } = await db().auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await db().auth.signOut();
}

/** Start password recovery: send a recovery code to the account email. Accepts
 *  a username or an email; returns the resolved email so the verify step can
 *  use it. The Supabase "Reset Password" email template must expose `{{ .Token }}`
 *  for the 6-digit code to appear. */
export async function requestPasswordReset(identifier: string): Promise<void> {
  // Resolution (username → email) and the recovery email happen server-side in
  // the `password-reset` Edge Function, so the client never learns the account
  // email (closes the username → email enumeration; see migration 0012).
  const { error } = await db().functions.invoke("password-reset", {
    body: { action: "request", identifier: identifier.trim() },
  });
  if (error) throw new Error(await functionErrorMessage(error, "No se pudo enviar el código."));
}

/** Finish recovery: the Edge Function verifies the emailed code, sets the new
 *  password server-side, and returns the session tokens. On success the user
 *  ends up signed in. `identifier` (not the email) drives the server-side
 *  resolution, so the email is never handled by the client. */
export async function resetPasswordWithOtp(
  identifier: string,
  token: string,
  newPassword: string
): Promise<void> {
  const { data, error } = await db().functions.invoke("password-reset", {
    body: {
      action: "verify",
      identifier: identifier.trim(),
      token: token.trim(),
      newPassword,
    },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Código o cuenta no válidos."));
  const tokens = data as { access_token?: string; refresh_token?: string } | null;
  if (!tokens?.access_token || !tokens?.refresh_token) {
    throw new Error("Respuesta de restablecimiento inválida.");
  }
  const { error: sErr } = await db().auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (sErr) throw sErr;
}

// ── Profile ──────────────────────────────────────────────────────────────
export async function getMyProfile(): Promise<Profile | null> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return null;
  const { data, error } = await db().from("profiles").select("*").eq("id", u.user.id).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** Create the profile if missing (covers auth users predating the trigger),
 *  then return it. Idempotent. */
export async function ensureMyProfile(): Promise<Profile | null> {
  const { data, error } = await db().rpc("ensure_my_profile");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Profile) ?? null;
}

export async function updateMyProfile(
  patch: Partial<
    Pick<
      Profile,
      "display_name" | "username" | "status" | "avatar_url" | "banner_url" | "pinned" | "stats"
    >
  >
): Promise<Profile> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const { data, error } = await db()
    .from("profiles")
    .update(patch)
    .eq("id", u.user.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Profile;
}

/** Look up someone to add by their exact friend code (NX-0000-0000). */
export async function findByCode(code: string): Promise<Profile | null> {
  const { data, error } = await db().rpc("find_profile_by_code", { p_code: code });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Profile) ?? null;
}

/** Look up someone by their handle: username + user_tag (e.g. "alexvega#AX12"). */
export async function findByHandle(username: string, tag: string): Promise<Profile | null> {
  const { data, error } = await db().rpc("find_profile_by_handle", {
    p_username: username,
    p_tag: tag,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Profile) ?? null;
}

// ── Friends ──────────────────────────────────────────────────────────────
/** All friendship rows touching me, resolved into edges from my perspective. */
export async function listFriends(): Promise<FriendEdge[]> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return [];
  const myId = u.user.id;

  const { data: rows, error } = await db()
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);
  if (error) throw error;
  const friendships = (rows ?? []) as Friendship[];

  const otherIds = friendships.map((f) => (f.requester_id === myId ? f.addressee_id : f.requester_id));
  if (otherIds.length === 0) return [];

  // profiles is owner-only at the table level; read the OTHER parties' cards
  // through the safe RPC (public fields only, honors show_name/show_age).
  const { data: profiles, error: pErr } = await db().rpc("get_public_profiles", {
    p_ids: otherIds,
  });
  if (pErr) throw pErr;
  const byId = new Map((profiles as Profile[]).map((p) => [p.id, p]));

  return friendships
    .map((f) => {
      const otherId = f.requester_id === myId ? f.addressee_id : f.requester_id;
      const profile = byId.get(otherId);
      if (!profile) return null;
      return {
        friendship: f,
        profile,
        status: f.status,
        direction: f.requester_id === myId ? "outgoing" : "incoming",
      } satisfies FriendEdge;
    })
    .filter((e): e is FriendEdge => e !== null);
}

export async function sendFriendRequest(addresseeId: string): Promise<void> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const { error } = await db()
    .from("friendships")
    .insert({ requester_id: u.user.id, addressee_id: addresseeId, status: "pending" });
  if (error) throw error;
}

export async function respondToRequest(friendshipId: string, accept: boolean): Promise<void> {
  if (accept) {
    const { error } = await db().from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
    if (error) throw error;
  } else {
    const { error } = await db().from("friendships").delete().eq("id", friendshipId);
    if (error) throw error;
  }
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await db().from("friendships").delete().eq("id", friendshipId);
  if (error) throw error;
}

/** Block a user by id: clears any existing relationship in either direction,
 *  then records a directional block (me → target). Works friend or not. */
export async function blockUser(targetId: string): Promise<void> {
  // targetId is interpolated into a PostgREST filter string below, so validate
  // it is a plain UUID before use (RLS still constrains the delete, but this
  // removes any filter-injection surface).
  assertUuid(targetId);
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const me = u.user.id;
  await db()
    .from("friendships")
    .delete()
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${me})`
    );
  const { error } = await db()
    .from("friendships")
    .insert({ requester_id: me, addressee_id: targetId, status: "blocked" });
  if (error) throw error;
}

/** Lift a block I placed on a user. */
export async function unblockUser(targetId: string): Promise<void> {
  assertUuid(targetId);
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const { error } = await db()
    .from("friendships")
    .delete()
    .eq("requester_id", u.user.id)
    .eq("addressee_id", targetId)
    .eq("status", "blocked");
  if (error) throw error;
}

/** File a report against a user, with an optional free-text reason. */
export async function reportUser(targetId: string, reason: string): Promise<void> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const { error } = await db()
    .from("reports")
    .insert({ reporter_id: u.user.id, target_id: targetId, reason: reason.trim() || null });
  if (error) throw error;
}

/** Search users by partial name or handle (discovery). Returns safe cards. */
export async function searchProfiles(query: string, limit = 20): Promise<Profile[]> {
  const { data, error } = await db().rpc("search_public_profiles", {
    p_query: query,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

// ── Showcase cover sharing ────────────────────────────────────────────────
// Pinned-game covers are LOCAL thumbnails (data URLs), so other accounts can't
// see them. We upload each pinned cover once to a stable per-game path in the
// public 'screenshots' bucket and cache the resulting URL by game key, so the
// showcase renders real box art for everyone. (Covers live in the screenshots
// bucket but never appear in the captures gallery — that reads the screenshots
// TABLE, not the bucket.)
const COVER_CACHE_KEY = "nx.coverCloud";

function loadCoverCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(COVER_CACHE_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function saveCoverCache(c: Record<string, string>): void {
  try {
    localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* non-fatal */
  }
}
function coverHash(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Upload a pinned game's cover (a data URL) to Storage and return its public
 *  URL, caching by game key so repeat syncs don't re-upload. */
export async function uploadCoverDataUrl(key: string, dataUrl: string): Promise<string | null> {
  if (!dataUrl.startsWith("data:")) return dataUrl; // already a shareable URL
  const cache = loadCoverCache();
  if (cache[key]) return cache[key];
  const { data: u } = await db().auth.getUser();
  if (!u.user) return null;
  const blob = dataUrlToBlob(dataUrl);
  const path = `${u.user.id}/cover-${coverHash(key)}.png`;
  const { error } = await db()
    .storage.from("screenshots")
    .upload(path, blob, { upsert: true, contentType: blob.type || "image/png" });
  if (error) throw error;
  const url = publicMediaUrl("screenshots", path);
  cache[key] = url;
  saveCoverCache(cache);
  return url;
}

/** Best-effort delete of a Storage object from its public URL. No-op for
 *  non-Storage URLs (e.g. SteamGridDB) so callers can pass any image value. */
export async function deleteMediaByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!m) return;
  const bucket = m[1];
  const path = decodeURIComponent(m[2]);
  if (bucket !== "avatars" && bucket !== "banners" && bucket !== "screenshots") return;
  try {
    await db().storage.from(bucket).remove([path]);
  } catch {
    /* non-fatal: orphan cleanup is best-effort */
  }
}

// ── Activity ─────────────────────────────────────────────────────────────
export async function postActivity(
  type: ActivityItem["type"],
  gameRef: string | null,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const { data: u } = await db().auth.getUser();
  if (!u.user) return;
  const { error } = await db()
    .from("activity")
    .insert({ user_id: u.user.id, type, game_ref: gameRef, payload });
  if (error) throw error;
}

/** Recent activity from me + accepted friends (RLS-scoped), newest first. */
export async function listActivity(limit = 40): Promise<ActivityItem[]> {
  const { data, error } = await db()
    .from("activity")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityItem[];
}

// ── Presence (Realtime) ──────────────────────────────────────────────────
/**
 * Join the shared presence channel and broadcast my state. `onSync` fires with
 * the full list of present users whenever presence changes. The caller updates
 * `playing` when a game session starts/ends. Friend filtering is applied by the
 * consumer (only show presence of accepted friends); per-friend channel privacy
 * is a later refinement.
 *
 * IMPORTANT: the `sync` listener is registered BEFORE `subscribe()` — the order
 * Supabase Realtime requires. Registering it afterwards (as this used to) can
 * drop the INITIAL snapshot, so a friend who was already online never shows up
 * and no later `sync` arrives to correct it.
 */
export function joinPresence(
  state: PresenceState,
  onSync: (states: PresenceState[]) => void
): RealtimeChannel {
  const channel = db().channel("presence:lobby", {
    config: { presence: { key: state.user_id } },
  });
  channel.on("presence", { event: "sync" }, () => {
    const raw = channel.presenceState<PresenceState>();
    const flat = Object.values(raw).flat() as PresenceState[];
    onSync(flat);
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") await channel.track(state);
  });
  return channel;
}

export async function updatePresence(channel: RealtimeChannel, state: PresenceState): Promise<void> {
  await channel.track(state);
}

export async function leavePresence(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
  await db().removeChannel(channel);
}
