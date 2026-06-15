/** Shared types for the EmuraOS social layer (mirrors the Supabase schema). */

export type FriendStatus = "pending" | "accepted" | "blocked";
export type Presence = "online" | "away" | "offline";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  status: string;
  friend_code: string | null;
  /** Short "#AX12" handle chosen at sign-up (distinct from friend_code). */
  user_tag?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  age?: number | null;
  show_name?: boolean;
  show_age?: boolean;
  created_at?: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendStatus;
  created_at: string;
}

/** A friendship resolved against the current user's perspective. */
export interface FriendEdge {
  friendship: Friendship;
  /** The OTHER party's profile. */
  profile: Profile;
  status: FriendStatus;
  /** Relative to me: did I send it (outgoing) or receive it (incoming)? */
  direction: "incoming" | "outgoing";
}

export interface ActivityItem {
  id: string;
  user_id: string;
  type: "achievement" | "playing" | "completed" | "newgame" | "screenshot" | string;
  game_ref: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Ephemeral presence broadcast over a Realtime channel (never persisted). */
export interface PresenceState {
  user_id: string;
  status: Presence;
  /** Stable game identity the user is playing, or null. */
  playing: string | null;
  since: string;
}
