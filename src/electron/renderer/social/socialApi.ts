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
import type {
  ActivityItem,
  FriendEdge,
  Friendship,
  PresenceState,
  Profile,
} from "./socialTypes";

function db() {
  const c = getSupabase();
  if (!c) throw new Error("Social layer not configured (missing Supabase credentials).");
  return c;
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

/** Full sign-up from the registration modal: creates the auth user and lets the
 *  trigger build the profile from the supplied metadata. */
export async function signUpWithProfile(
  email: string,
  password: string,
  profile: SignUpProfile
): Promise<void> {
  const { error } = await db().auth.signUp({
    email,
    password,
    options: { data: { ...profile, user_tag: profile.user_tag.toUpperCase() } },
  });
  if (error) throw error;
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

export async function signInEmail(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Resolve a username to its account email (for username-based sign-in). */
export async function emailForUsername(username: string): Promise<string | null> {
  const { data, error } = await db().rpc("email_for_username", { p_username: username });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Sign in with either an email or a username + password. */
export async function signInWithIdentifier(identifier: string, password: string): Promise<void> {
  const id = identifier.trim();
  let email = id;
  if (!id.includes("@")) {
    const resolved = await emailForUsername(id);
    if (!resolved) throw new Error("No existe una cuenta con ese usuario.");
    email = resolved;
  }
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
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
export async function requestPasswordReset(identifier: string): Promise<string> {
  let email = identifier.trim();
  if (!email.includes("@")) {
    const resolved = await emailForUsername(email);
    if (!resolved) throw new Error("No existe una cuenta con ese usuario o email.");
    email = resolved;
  }
  const { error } = await db().auth.resetPasswordForEmail(email);
  if (error) throw error;
  return email;
}

/** Finish recovery: verify the emailed code (establishes a session) and set the
 *  new password. On success the user ends up signed in. */
export async function resetPasswordWithOtp(
  email: string,
  token: string,
  newPassword: string
): Promise<void> {
  const { error: vErr } = await db().auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "recovery",
  });
  if (vErr) throw vErr;
  const { error: uErr } = await db().auth.updateUser({ password: newPassword });
  if (uErr) throw uErr;
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
  patch: Partial<Pick<Profile, "display_name" | "username" | "status" | "avatar_url">>
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

  const { data: profiles, error: pErr } = await db()
    .from("profiles")
    .select("*")
    .in("id", otherIds);
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

export async function blockUser(friendshipId: string): Promise<void> {
  const { error } = await db().from("friendships").update({ status: "blocked" }).eq("id", friendshipId);
  if (error) throw error;
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
 * Join the shared presence channel and broadcast my state. The caller updates
 * `playing` when a game session starts/ends. Friend filtering is applied by the
 * consumer (only show presence of accepted friends); per-friend channel privacy
 * is a later refinement.
 */
export function joinPresence(state: PresenceState): RealtimeChannel {
  const channel = db().channel("presence:lobby", {
    config: { presence: { key: state.user_id } },
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") await channel.track(state);
  });
  return channel;
}

export async function updatePresence(channel: RealtimeChannel, state: PresenceState): Promise<void> {
  await channel.track(state);
}

/** Subscribe to presence sync; returns the flattened list of present states. */
export function onPresenceSync(channel: RealtimeChannel, cb: (states: PresenceState[]) => void): void {
  channel.on("presence", { event: "sync" }, () => {
    const raw = channel.presenceState<PresenceState>();
    const flat = Object.values(raw).flat() as PresenceState[];
    cb(flat);
  });
}

export async function leavePresence(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
  await db().removeChannel(channel);
}
