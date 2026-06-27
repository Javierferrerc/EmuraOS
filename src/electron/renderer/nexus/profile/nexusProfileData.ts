/**
 * NEXUS profile data — real stats derived from the library + a small persisted
 * layer for the editable fields. The handoff's social graph (friends / feed /
 * requests) has no backend in this local launcher, so those tabs are deferred;
 * here we only model the profile owner.
 *
 * Real sources: playHistory (time + sessions), scanResult/library (owned),
 * favorites, collections, RetroAchievements connection. Level/XP are derived
 * from play activity. Fields with no real source (credits, friend code, streak,
 * screenshots) are intentionally omitted.
 */

import type { PlayRecord } from "../../../../core/types";
import { loadActiveId } from "../profileselect/nexusProfileSelectData";

export interface NexusProfileStats {
  totalSeconds: number;
  hours: number;
  minutes: number;
  playtimeLabel: string;
  playedGames: number; // distinct games actually launched
  ownedGames: number;
  favorites: number;
  collections: number;
  level: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  xpTotal: number;
}

const XP_PER_LEVEL = 1000;

interface BuildArgs {
  playHistory: Record<string, PlayRecord>;
  ownedGames: number;
  favorites: number;
  collections: number;
}

export function buildProfileStats({
  playHistory,
  ownedGames,
  favorites,
  collections,
}: BuildArgs): NexusProfileStats {
  let totalSeconds = 0;
  let playCountTotal = 0;
  let playedGames = 0;
  for (const rec of Object.values(playHistory)) {
    totalSeconds += rec.totalPlayTime ?? 0;
    playCountTotal += rec.playCount ?? 0;
    if ((rec.playCount ?? 0) > 0) playedGames += 1;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  // Derived XP: playtime (minutes) weighted by sessions + a small library bonus.
  const xpTotal = Math.round(totalSeconds / 60) + playCountTotal * 8 + favorites * 15;
  const level = Math.floor(xpTotal / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xpTotal % XP_PER_LEVEL;

  return {
    totalSeconds,
    hours,
    minutes,
    playtimeLabel: hours > 0 ? `${hours}` : `${minutes}`,
    playedGames,
    ownedGames,
    favorites,
    collections,
    level,
    xpIntoLevel,
    xpPerLevel: XP_PER_LEVEL,
    xpTotal,
  };
}

// ── Persisted editable profile (name / status / pinned game keys) ──────
// Each profile keeps its OWN edit layer, keyed by its profile id, so that two
// local profiles (or accounts) on the same device never clobber each other's
// name/avatar/status/pinned. `nx.profile` (no id) is the legacy single-profile
// key, still read as a one-time fallback so existing data isn't lost.
const LS_PROFILE_LEGACY = "nx.profile";
const LS_PROFILE_PREFIX = "nx.profile:";

/** Storage key for a given profile. Falls back to the currently-active profile
 * (set by the selector on enter) when no id is passed, and to the legacy
 * single-profile key only when there is no active profile at all. */
function profileKey(profileId?: string | null): string {
  const id = profileId ?? loadActiveId();
  return id ? LS_PROFILE_PREFIX + id : LS_PROFILE_LEGACY;
}

export interface NexusProfileEdit {
  name: string;
  status: string;
  pinned: string[]; // game keys "systemId:fileName"
  /** Chosen banner image URL (SteamGridDB hero/grid), or null to use the
   * pinned game's cover as the banner. */
  bannerUrl?: string | null;
  /** Chosen avatar image URL (SteamGridDB), or null to use the initials. */
  avatarUrl?: string | null;
}

export const MAX_PINNED = 6;

export function loadProfileEdit(fallbackName: string, profileId?: string | null): NexusProfileEdit {
  const base: NexusProfileEdit = {
    name: fallbackName,
    status: "",
    pinned: [],
    bannerUrl: null,
    avatarUrl: null,
  };
  try {
    const id = profileId ?? loadActiveId();
    // Read ONLY this profile's own key. The legacy global blob is inherited
    // (one-time migration) by the DEFAULT "local" profile only — otherwise every
    // not-yet-saved profile would read the same global data and appear to share
    // pins / avatar / status.
    let raw = localStorage.getItem(profileKey(profileId));
    if (raw === null && (id === "local" || id == null)) {
      raw = localStorage.getItem(LS_PROFILE_LEGACY);
    }
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NexusProfileEdit>;
      return {
        name: parsed.name || fallbackName,
        status: parsed.status ?? "",
        pinned: Array.isArray(parsed.pinned) ? parsed.pinned.slice(0, MAX_PINNED) : [],
        bannerUrl: typeof parsed.bannerUrl === "string" ? parsed.bannerUrl : null,
        avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null,
      };
    }
  } catch {
    /* ignore corrupt store */
  }
  return base;
}

export function saveProfileEdit(edit: NexusProfileEdit, profileId?: string | null): void {
  try {
    localStorage.setItem(
      profileKey(profileId),
      JSON.stringify({
        name: edit.name,
        status: edit.status,
        pinned: edit.pinned,
        bannerUrl: edit.bannerUrl ?? null,
        avatarUrl: edit.avatarUrl ?? null,
      })
    );
    // Let other components (e.g. the status-bar profile chip) react live to
    // name/avatar changes — the native "storage" event only fires cross-tab.
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
}

/** Window event dispatched whenever the local profile edit is saved. */
export const PROFILE_UPDATED_EVENT = "nx-profile-updated";

/** Two-letter initials from a display name. */
export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "NX";
}
