/**
 * useLibrarySync — keeps the signed-in account's library activity (play time,
 * sessions, favourites, collections, pinned games, which games it owns) in sync
 * with Supabase so it follows the account to any machine.
 *
 * The renderer only moves the doc (it owns the Supabase session); the merge
 * itself runs in main (`library:sync-merge` → core/library-sync.ts) so the
 * on-disk store and the doc are updated atomically. Runs only when the active
 * profile IS the signed-in account — a local profile never syncs into it.
 *
 * Triggers: on mount, ~4s after any local change, on window focus (throttled)
 * and every few minutes, so edits made on another machine show up here too.
 */

import { useCallback, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { useSocial } from "../social/SocialContext";
import {
  fetchCloudLibrary,
  pushCloudLibrary,
  getCachedCoverUrl,
  uploadCoverDataUrl,
} from "../social/socialApi";
import { loadActiveId } from "./profileselect/nexusProfileSelectData";
import {
  buildProfileStats,
  loadProfileEdit,
  saveProfileEdit,
  PROFILE_UPDATED_EVENT,
} from "./profile/nexusProfileData";
import { titleMatchKey, type NexusGame } from "./nexusModel";
import type { CloudGameEntry, UserLibraryFile } from "../../../core/types";

const CHANGE_DEBOUNCE_MS = 4000;
const FOCUS_THROTTLE_MS = 60_000;
const PERIODIC_MS = 5 * 60_000;
const MAX_COVER_UPLOADS_PER_PASS = 12;

export function useLibrarySync(localGames: NexusGame[], scanReady: boolean): void {
  const app = useApp();
  const social = useSocial();
  const userId = social.configured ? social.user?.id ?? null : null;
  const enabled = !!userId && scanReady && loadActiveId() === userId;

  // Latest inputs, read by the async sync without re-creating it.
  const gamesRef = useRef(localGames);
  gamesRef.current = localGames;
  const appRef = useRef(app);
  appRef.current = app;
  const socialRef = useRef(social);
  socialRef.current = social;
  // Name used only if this profile has no saved edit layer yet (so writing the
  // synced pins never stamps a placeholder name over the account's).
  const nameRef = useRef("Jugador");
  nameRef.current = social.profile?.display_name?.trim() || "Jugador";

  const running = useRef(false);
  const again = useRef(false);
  const lastRun = useRef(0);
  const lastSig = useRef("");
  const linked = useRef(new Set<string>());

  /** Fingerprint of everything that gets synced, as it is right now. */
  const currentSig = useCallback((): string => {
    const a = appRef.current;
    const pinned = userId ? loadProfileEdit(nameRef.current, userId).pinned : [];
    return signature(a.favorites, a.collections, a.playHistory, pinned, gamesRef.current.length);
  }, [userId]);

  const runSync = useCallback(async () => {
    if (!enabled || !userId) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    lastRun.current = Date.now();
    try {
      const games = gamesRef.current;
      const localLibKeys = games.map((g) => g.key);
      const localGames: Record<string, CloudGameEntry> = {};
      for (const g of games) {
        const c = getCachedCoverUrl(g.key);
        localGames[g.key] = c ? { t: g.title, s: g.systemName, c } : { t: g.title, s: g.systemName };
      }
      const edit = loadProfileEdit(nameRef.current, userId);
      const localPinned = { keys: edit.pinned, at: edit.pinnedAt ?? "" };

      // Read → merge → conditional write; a concurrent write from another
      // machine makes the write miss, so re-read and merge again.
      let merged: UserLibraryFile | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const row = await fetchCloudLibrary();
        const res = await window.electronAPI.syncLibraryMerge({
          remote: (row?.data ?? null) as never,
          localLibKeys,
          localGames,
          localPinned,
        });
        appRef.current.applyUserLibrary(res.library);
        merged = res.library;
        lastSig.current = signature(
          res.library.favorites,
          res.library.collections,
          res.library.playHistory,
          res.pinned.keys,
          localLibKeys.length
        );
        if (res.pinned.at !== localPinned.at || res.pinned.keys.join("|") !== localPinned.keys.join("|")) {
          const cur = loadProfileEdit(nameRef.current, userId);
          saveProfileEdit({ ...cur, pinned: res.pinned.keys, pinnedAt: res.pinned.at }, userId);
        }
        if (!res.docChanged) break;
        if (await pushCloudLibrary(res.doc, row ? row.rev : null)) break;
      }

      // Public totals that friends see (profiles.stats) — refreshed from the
      // merged view (every machine summed) whenever they change, not only when
      // the user happens to open their own profile page.
      if (merged) {
        const st = buildProfileStats({
          playHistory: merged.playHistory,
          ownedGames: 0,
          favorites: merged.favorites.length,
          collections: merged.collections.length,
        });
        const next = { play_seconds: st.totalSeconds, games: st.playedGames, level: st.level, xp: st.xpTotal };
        const prev = socialRef.current.profile?.stats;
        if (
          !prev ||
          prev.play_seconds !== next.play_seconds ||
          prev.games !== next.games ||
          prev.level !== next.level ||
          prev.xp !== next.xp
        ) {
          await socialRef.current.updateProfile({ stats: next });
        }
      }

      // Games known from another machine that are here under a different file
      // name (same system + title): link them so their history follows the ROM.
      const lib = appRef.current;
      const cloud = (await window.electronAPI.getUserLibrary()).cloud;
      const byTitle = new Map<string, string[]>();
      for (const g of games) {
        const tk = titleMatchKey(g.systemId, g.title);
        byTitle.set(tk, [...(byTitle.get(tk) ?? []), g.key]);
      }
      const localSet = new Set(localLibKeys);
      const remoteSet = new Set(cloud?.remoteLib ?? []);
      let didLink = false;
      for (const key of remoteSet) {
        if (localSet.has(key) || linked.current.has(key)) continue;
        const sys = key.slice(0, key.indexOf(":"));
        const title = cloud?.games[key]?.t;
        if (!title) continue;
        const matches = byTitle.get(titleMatchKey(sys, title));
        // Only an unambiguous match, and never onto a file the other machine
        // also has under that exact name (then they're two separate dumps).
        if (matches?.length !== 1 || remoteSet.has(matches[0])) continue;
        linked.current.add(key);
        await window.electronAPI.linkLibraryKey(key, matches[0]);
        didLink = true;
      }
      if (didLink) again.current = true;

      // Upload the cover of EVERY library game so other machines (and other
      // users viewing this library) show real box art instead of a blank card.
      // Games that matter on the profile (played, favourites, collections,
      // pinned) go first. Cached by key; a few per pass to stay light — the
      // pass re-runs while it keeps uploading, so the backlog drains over time.
      const wanted = new Set<string>([...lib.favorites, ...lib.recentlyPlayed, ...edit.pinned]);
      lib.collections.forEach((c) => c.roms.forEach((k) => wanted.add(k)));
      const ordered = [...games].sort((a, b) => Number(wanted.has(b.key)) - Number(wanted.has(a.key)));
      let uploaded = 0;
      for (const g of ordered) {
        if (uploaded >= MAX_COVER_UPLOADS_PER_PASS) break;
        if (!g.coverPath || g.missing || getCachedCoverUrl(g.key)) continue;
        try {
          const dataUrl = await window.electronAPI.readThumbnailDataUrl(g.rom.systemId, g.rom.fileName);
          if (dataUrl && (await uploadCoverDataUrl(g.key, dataUrl))) uploaded++;
        } catch (e) {
          console.warn("[library-sync] cover upload failed:", e);
          break;
        }
      }
      if (uploaded > 0) again.current = true;
    } catch (e) {
      console.warn("[library-sync] sync failed:", e);
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        window.setTimeout(() => void runSync(), 1500);
      }
    }
  }, [enabled, userId]);

  // Initial sync (and again whenever the account / profile changes).
  useEffect(() => {
    if (enabled) void runSync();
  }, [enabled, runSync]);

  // Debounced sync after local changes (a game session, favourite, collection
  // edit, new ROMs…). Skipped when the state is what the last sync produced.
  const sig = signature(app.favorites, app.collections, app.playHistory, [], localGames.length);
  useEffect(() => {
    if (!enabled || currentSig() === lastSig.current) return;
    const t = window.setTimeout(() => void runSync(), CHANGE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [sig, enabled, currentSig, runSync]);

  // Pinned games live in profile storage (not app state); sync when edited.
  useEffect(() => {
    if (!enabled) return;
    let t: number | undefined;
    const onEdit = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (currentSig() !== lastSig.current) void runSync();
      }, CHANGE_DEBOUNCE_MS);
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onEdit);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(PROFILE_UPDATED_EVENT, onEdit);
    };
  }, [enabled, runSync, currentSig]);

  // Pick up changes made on another machine.
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => {
      if (Date.now() - lastRun.current > FOCUS_THROTTLE_MS) void runSync();
    };
    window.addEventListener("focus", onFocus);
    const iv = window.setInterval(() => void runSync(), PERIODIC_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(iv);
    };
  }, [enabled, runSync]);
}

/** Cheap fingerprint of the synced state, to skip no-op syncs. */
function signature(
  favorites: Iterable<string>,
  collections: { id: string; updatedAt: string }[],
  playHistory: Record<string, { playCount: number; totalPlayTime?: number; lastPlayed: string }>,
  pinned: string[],
  libCount: number
): string {
  let plays = 0;
  let secs = 0;
  let last = "";
  for (const r of Object.values(playHistory)) {
    plays += r.playCount ?? 0;
    secs += r.totalPlayTime ?? 0;
    if (r.lastPlayed > last) last = r.lastPlayed;
  }
  return [
    [...favorites].sort().join(","),
    collections.map((c) => c.id + "@" + c.updatedAt).join(","),
    `${Object.keys(playHistory).length}/${plays}/${secs}/${last}`,
    pinned.join(","),
    libCount,
  ].join("§");
}
