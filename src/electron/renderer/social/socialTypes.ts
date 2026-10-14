/** Shared types for the EmuraOS social layer (mirrors the Supabase schema). */

export type FriendStatus = "pending" | "accepted" | "blocked";
export type Presence = "online" | "away" | "offline";

/** A game shown in a profile's showcase. Stored denormalized (title + cover)
 *  so another account can render it without owning the ROM. */
export interface PinnedGame {
  title: string;
  cover_url?: string | null;
  system?: string | null;
}

/** Audience of a profile section: any signed-in user, accepted friends, or
 *  only the owner. */
export type ProfileVisibility = "everyone" | "friends" | "nobody";

/** A game in another user's library / likes, as returned by
 *  get_profile_showcase (safe projection of their synced library). */
export interface ShowcaseGame {
  title: string;
  /** System display name (or id when the catalog has no name). */
  system: string | null;
  system_id: string;
  cover: string | null;
}

/** What the viewer may see of a profile's library / likes / pinned. */
export interface ProfileShowcase {
  library: { visible: boolean; games: ShowcaseGame[] };
  favorites: { visible: boolean; games: ShowcaseGame[] };
  pinned: { visible: boolean };
}

/** Aggregate stats the client syncs so others can see them. */
export interface ProfileStats {
  play_seconds?: number;
  games?: number;
  level?: number;
  xp?: number;
}

export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  /** Cloud banner/portada image (Supabase Storage public URL or SteamGridDB). */
  banner_url?: string | null;
  status: string;
  friend_code: string | null;
  /** Short "#AX12" handle chosen at sign-up (distinct from friend_code). */
  user_tag?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  age?: number | null;
  show_name?: boolean;
  show_age?: boolean;
  /** Who can see each profile section (0014). Only present on the owner's own
   *  row; other viewers get the already-filtered data instead. */
  vis_library?: ProfileVisibility;
  vis_pinned?: ProfileVisibility;
  vis_favorites?: ProfileVisibility;
  /** Showcase games + aggregate stats, shared so other accounts can view them. */
  pinned?: PinnedGame[];
  stats?: ProfileStats;
  created_at?: string;
}

/** A profile screenshot stored in the cloud (public 'screenshots' bucket). */
export interface ProfileScreenshot {
  id: string;
  storage_path: string;
  /** Resolved public URL (filled by the client from storage_path). */
  url?: string;
  caption: string | null;
  game_ref: string | null;
  created_at: string;
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
  /** Human-readable title of the game in progress. Broadcast by the player
   *  because a viewer can't resolve `playing` (they may not own the ROM). */
  playing_title?: string | null;
  /** Epoch ms when the current game session started, for a live "00:23:45"
   *  timer on the viewer side. Stable across away/online toggles. */
  playing_since?: number | null;
  /** Epoch ms of the last heartbeat. Refreshed periodically while the client is
   *  alive; viewers drop a friend whose heartbeat goes stale (crash / force-quit
   *  / frozen socket) without waiting on Supabase's server-side leave timeout. */
  heartbeat?: number;
  since: string;
}
