/**
 * useGhostCovers — box art for games that live on another machine.
 *
 * Their cover normally arrives as a cloud URL uploaded by the machine that owns
 * the ROM. When it didn't (older build on that machine, or not uploaded yet),
 * fetch it here instead — libretro-thumbnails first (no credentials), then
 * SteamGridDB when a key is configured — and store it in THIS machine's
 * metadata cache, so buildGhostGames picks it up as `coverPath` and the lookup
 * isn't repeated on every launch.
 *
 * The queue outlives re-renders: the ghost list is rebuilt often (sync, play
 * history, metadata reloads), and restarting the batch on every change would
 * drop games mid-way. Each found cover shows up as soon as it lands (metadata
 * reloads are debounced), not only after the whole — possibly slow — batch.
 */

import { useEffect, useRef } from "react";
import type { NexusGame } from "./nexusModel";

const CONCURRENCY = 3;
const RELOAD_DEBOUNCE_MS = 1000;

async function fetchCover(game: NexusGame): Promise<boolean> {
  const { systemId, fileName } = game.rom;
  try {
    const lr = await window.electronAPI.fetchCoverFromLibretro(systemId, fileName);
    if (lr.success) return true;
  } catch {
    /* try SteamGridDB */
  }
  try {
    const sg = await window.electronAPI.listSteamGridDbCandidates(systemId, fileName);
    const first = sg.success ? sg.candidates[0] : undefined;
    if (first) {
      const applied = await window.electronAPI.applySteamGridDbCandidate(systemId, fileName, first.fullUrl);
      return applied.success;
    }
  } catch {
    /* no cover available */
  }
  return false;
}

export function useGhostCovers(ghostGames: NexusGame[], reloadMetadata: () => Promise<void>): void {
  // Keys queued this session (found or not) — never retried until the next
  // launch, so a game with no cover anywhere doesn't loop.
  const seen = useRef(new Set<string>());
  const queue = useRef<NexusGame[]>([]);
  const workers = useRef(0);
  const reloadTimer = useRef<number | undefined>(undefined);
  const reloadRef = useRef(reloadMetadata);
  reloadRef.current = reloadMetadata;

  useEffect(() => {
    for (const g of ghostGames) {
      if (g.coverPath || g.coverUrl || seen.current.has(g.key)) continue;
      seen.current.add(g.key);
      queue.current.push(g);
    }

    const scheduleReload = () => {
      window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => void reloadRef.current(), RELOAD_DEBOUNCE_MS);
    };
    const work = async () => {
      workers.current++;
      try {
        let game: NexusGame | undefined;
        while ((game = queue.current.shift())) {
          if (await fetchCover(game)) scheduleReload();
        }
      } finally {
        workers.current--;
      }
    };
    // Each worker takes its first game synchronously, so this stops once the
    // pool is full or the queue is drained.
    while (workers.current < CONCURRENCY && queue.current.length > 0) void work();
  }, [ghostGames]);

  useEffect(() => () => window.clearTimeout(reloadTimer.current), []);
}
