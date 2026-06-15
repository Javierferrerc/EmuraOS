/**
 * SocialContext — auth + profile + friends + live presence for EmuraOS,
 * backed by Supabase. Mounted inside AppProvider so it can report "now playing"
 * from the real game session. When the social layer isn't configured (no
 * Supabase creds), it stays inert and the UI shows the sign-in / offline state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { useApp } from "../context/AppContext";
import { getSupabase, isSocialConfigured } from "./supabaseClient";
import * as api from "./socialApi";
import type { FriendEdge, PresenceState, Profile } from "./socialTypes";

interface SocialContextValue {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  friends: FriendEdge[];
  /** Live presence keyed by user id (includes self). */
  presence: Map<string, PresenceState>;
  error: string | null;

  signUpEmail: (email: string, password: string) => Promise<void>;
  /** Full registration from the modal (creates auth user + profile via trigger). */
  registerAccount: (email: string, password: string, profile: api.SignUpProfile) => Promise<void>;
  /** Live uniqueness checks used while the registration form is filled. */
  checkUsername: (name: string) => Promise<boolean>;
  checkUserTag: (tag: string) => Promise<boolean>;
  signInEmail: (email: string, password: string) => Promise<void>;
  /** Sign in with either a username or an email + password. */
  signIn: (identifier: string, password: string) => Promise<void>;
  /** Start password recovery; returns the resolved account email. */
  requestPasswordReset: (identifier: string) => Promise<string>;
  /** Verify the emailed code and set a new password (ends up signed in). */
  resetPassword: (email: string, token: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, "display_name" | "status">>) => Promise<void>;
  addFriendByCode: (code: string) => Promise<{ ok: boolean; message: string }>;
  /** Add by either a handle ("usuario#TAG") or a friend code ("NX-0000-0000"). */
  addFriend: (input: string) => Promise<{ ok: boolean; message: string }>;
  respondRequest: (friendshipId: string, accept: boolean) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
}

const Ctx = createContext<SocialContextValue | null>(null);

/** Stable game identity reported in presence. */
function gameRefOf(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  return fileName.replace(/\.[^.]+$/, "");
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const configured = isSocialConfigured();

  const [loading, setLoading] = useState(configured);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<FriendEdge[]>([]);
  const [presence, setPresence] = useState<Map<string, PresenceState>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  // Current "now playing" gameRef from the real game session.
  const playing = useMemo(
    () => (app.isGameRunning ? gameRefOf(app.currentGame?.rom?.fileName) : null),
    [app.isGameRunning, app.currentGame]
  );

  const loadFriends = useCallback(async () => {
    try {
      setFriends(await api.listFriends());
    } catch (e) {
      console.warn("[social] listFriends failed:", e);
    }
  }, []);

  // ── Auth bootstrap + listener ────────────────────────────────────
  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .getSession()
      .then((s) => {
        if (!cancelled) setUser(s?.user ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const off = api.onAuthChange((u) => setUser(u));
    return () => {
      cancelled = true;
      off();
    };
  }, [configured]);

  // ── On sign-in: ensure profile, load friends, subscribe to changes ──
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setFriends([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await api.ensureMyProfile();
        if (!cancelled) setProfile(p);
      } catch (e) {
        console.warn("[social] ensureMyProfile failed:", e);
      }
      await loadFriends();
    })();

    // Realtime: refresh friends whenever a friendship row touching me changes.
    const sb = getSupabase();
    const sub = sb
      ?.channel("db:friendships")
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void loadFriends();
      })
      .subscribe();

    return () => {
      cancelled = true;
      if (sub) void sb?.removeChannel(sub);
    };
  }, [user, loadFriends]);

  // ── Presence: join on sign-in, update on game change, leave on out ──
  useEffect(() => {
    if (!user) return;
    let channel: RealtimeChannel | null = null;
    try {
      const state: PresenceState = {
        user_id: user.id,
        status: "online",
        playing,
        since: new Date().toISOString(),
      };
      channel = api.joinPresence(state);
      api.onPresenceSync(channel, (states) => {
        setPresence(new Map(states.map((s) => [s.user_id, s])));
      });
      channelRef.current = channel;
    } catch (e) {
      console.warn("[social] presence join failed:", e);
    }
    return () => {
      channelRef.current = null;
      if (channel) void api.leavePresence(channel);
    };
    // Re-join only when the user changes; `playing` updates via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Push "now playing" updates onto the existing presence channel.
  useEffect(() => {
    const channel = channelRef.current;
    const u = userRef.current;
    if (!channel || !u) return;
    void api.updatePresence(channel, {
      user_id: u.id,
      status: "online",
      playing,
      since: new Date().toISOString(),
    });
  }, [playing]);

  // ── Actions ──────────────────────────────────────────────────────
  const signUpEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await api.signUpEmail(email, password);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      throw e;
    }
  }, []);

  const registerAccount = useCallback(
    async (email: string, password: string, profile: api.SignUpProfile) => {
      setError(null);
      try {
        await api.signUpWithProfile(email, password, profile);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        setError(m);
        throw e;
      }
    },
    []
  );

  const checkUsername = useCallback((name: string) => api.isUsernameAvailable(name), []);
  const checkUserTag = useCallback((tag: string) => api.isUserTagAvailable(tag), []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await api.signInEmail(email, password);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      throw e;
    }
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    setError(null);
    try {
      await api.signInWithIdentifier(identifier, password);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
  }, []);

  const requestPasswordReset = useCallback(
    (identifier: string) => api.requestPasswordReset(identifier),
    []
  );
  const resetPassword = useCallback(
    (email: string, token: string, newPassword: string) =>
      api.resetPasswordWithOtp(email, token, newPassword),
    []
  );

  const refresh = useCallback(async () => {
    try {
      setProfile(await api.getMyProfile());
    } catch {
      /* ignore */
    }
    await loadFriends();
  }, [loadFriends]);

  const updateProfile = useCallback(
    async (patch: Partial<Pick<Profile, "display_name" | "status">>) => {
      const p = await api.updateMyProfile(patch);
      setProfile(p);
    },
    []
  );

  // Shared: send a request to a found profile, with friendly error mapping.
  const requestFriend = useCallback(
    async (
      found: Profile | null,
      notFoundMsg: string
    ): Promise<{ ok: boolean; message: string }> => {
      try {
        if (!found) return { ok: false, message: notFoundMsg };
        if (found.id === userRef.current?.id) return { ok: false, message: "Ese eres tú mismo." };
        await api.sendFriendRequest(found.id);
        await loadFriends();
        return { ok: true, message: `Solicitud enviada a ${found.display_name}.` };
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        // Unique-violation = a request/friendship already exists.
        if (/duplicate key|unique/i.test(m))
          return { ok: false, message: "Ya existe una solicitud o amistad con ese usuario." };
        return { ok: false, message: m };
      }
    },
    [loadFriends]
  );

  const addFriendByCode = useCallback(
    async (code: string) => requestFriend(await api.findByCode(code), "No se encontró ese código."),
    [requestFriend]
  );

  const addFriend = useCallback(
    async (input: string): Promise<{ ok: boolean; message: string }> => {
      const raw = input.trim();
      if (!raw) return { ok: false, message: "Introduce un usuario#ID o un código." };
      try {
        if (raw.includes("#")) {
          const hash = raw.indexOf("#");
          const username = raw.slice(0, hash).trim();
          const tag = raw.slice(hash + 1).trim();
          if (!username || !tag)
            return { ok: false, message: "Formato no válido. Usa usuario#ID (p. ej. alex#AX12)." };
          return requestFriend(
            await api.findByHandle(username, tag),
            "No se encontró ese usuario#ID."
          );
        }
        return requestFriend(await api.findByCode(raw), "No se encontró ese código.");
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        return { ok: false, message: m };
      }
    },
    [requestFriend]
  );

  const respondRequest = useCallback(
    async (friendshipId: string, accept: boolean) => {
      await api.respondToRequest(friendshipId, accept);
      await loadFriends();
    },
    [loadFriends]
  );

  const removeFriend = useCallback(
    async (friendshipId: string) => {
      await api.removeFriend(friendshipId);
      await loadFriends();
    },
    [loadFriends]
  );

  const value: SocialContextValue = {
    configured,
    loading,
    user,
    profile,
    friends,
    presence,
    error,
    signUpEmail,
    registerAccount,
    checkUsername,
    checkUserTag,
    signInEmail,
    signIn,
    requestPasswordReset,
    resetPassword,
    signOut,
    refresh,
    updateProfile,
    addFriendByCode,
    addFriend,
    respondRequest,
    removeFriend,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSocial(): SocialContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSocial must be used within a SocialProvider");
  return ctx;
}
