/**
 * presenceModel — pure presence bookkeeping for the viewer side, independent of
 * Supabase so it can be unit-tested.
 *
 * Freshness is measured with the VIEWER's own clock: when a broadcast (a new
 * heartbeat value) first arrives we note the local time, and an entry goes
 * stale when nothing new has arrived from it for PRESENCE_STALE_MS. Comparing
 * the sender's `heartbeat` against our `Date.now()` (as this used to) breaks
 * whenever the two PCs' clocks differ by more than the stale window: a friend
 * whose clock runs behind was dropped on every sync and never showed online.
 */

import type { PresenceState } from "./socialTypes";

/** How often each client re-broadcasts its presence. */
export const PRESENCE_HEARTBEAT_MS = 20_000;
/** A client silent for this long (no new broadcast) is considered gone. */
export const PRESENCE_STALE_MS = 75_000;
/** How often the viewer re-evaluates staleness between syncs. */
export const PRESENCE_PRUNE_MS = 10_000;

/** One received presence meta (Realtime adds `presence_ref`). */
type Meta = PresenceState & { presence_ref?: string };

/** Identity of ONE broadcast: every heartbeat carries a new value. */
function broadcastId(s: Meta): string {
  return `${s.user_id}|${s.client_id ?? ""}|${s.heartbeat ?? s.presence_ref ?? ""}`;
}

/** Local arrival time of each broadcast currently in the lobby. */
export class ArrivalLog {
  private seen = new Map<string, number>();

  /** Stamp broadcasts not seen before with `now`; forget the ones that left. */
  observe(states: Meta[], now: number): void {
    const live = new Set<string>();
    for (const s of states) {
      if (!s?.user_id) continue;
      const id = broadcastId(s);
      live.add(id);
      if (!this.seen.has(id)) this.seen.set(id, now);
    }
    for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id);
  }

  arrivedAt(s: Meta): number | undefined {
    return this.seen.get(broadcastId(s));
  }
}

/** playing > online > away: what a friend should see when the same account is
 *  open on several machines. */
function activity(s: PresenceState): number {
  if (s.playing) return 2;
  return s.status === "away" ? 0 : 1;
}

/** `playing_since` re-expressed in the viewer's clock. The sender stamps both
 *  `heartbeat` and `playing_since` with ITS clock, so their difference is the
 *  true elapsed time at send no matter how far apart the two clocks are. */
function localPlayingSince(s: PresenceState, arrivedAt: number, now: number): number | null {
  if (s.playing_since == null) return null;
  if (s.heartbeat == null) return Math.min(s.playing_since, now);
  return arrivedAt - Math.max(0, s.heartbeat - s.playing_since);
}

/**
 * Collapse the raw lobby into one entry per user: stale broadcasts are dropped
 * (local clock), several machines on the same account are merged into the most
 * active one, and `playing_since` is converted to the viewer's clock.
 */
export function resolvePresence(
  states: Meta[],
  log: ArrivalLog,
  now: number
): Map<string, PresenceState> {
  const best = new Map<string, { s: Meta; at: number }>();
  for (const s of states) {
    if (!s?.user_id) continue;
    const at = log.arrivedAt(s) ?? now;
    // Builds without a heartbeat can't be aged; keep them (server leave only).
    if (s.heartbeat != null && now - at >= PRESENCE_STALE_MS) continue;
    const cur = best.get(s.user_id);
    if (!cur || activity(s) > activity(cur.s) || (activity(s) === activity(cur.s) && at > cur.at)) {
      best.set(s.user_id, { s, at });
    }
  }
  const out = new Map<string, PresenceState>();
  for (const [id, { s, at }] of best) {
    out.set(id, {
      user_id: s.user_id,
      status: s.status === "away" ? "away" : "online",
      playing: s.playing ?? null,
      playing_title: s.playing_title ?? null,
      playing_since: localPlayingSince(s, at, now),
      heartbeat: s.heartbeat,
      client_id: s.client_id,
      since: s.since,
    });
  }
  return out;
}

/** True when two resolved maps would render the same (ignores heartbeats), so
 *  the periodic prune doesn't re-render every consumer for nothing. */
export function samePresence(a: Map<string, PresenceState>, b: Map<string, PresenceState>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, x] of a) {
    const y = b.get(id);
    if (
      !y ||
      x.status !== y.status ||
      x.playing !== y.playing ||
      x.playing_title !== y.playing_title ||
      // Re-anchoring on each heartbeat jitters by network latency; ignore < 2 s.
      Math.abs((x.playing_since ?? 0) - (y.playing_since ?? 0)) > 2_000
    ) {
      return false;
    }
  }
  return true;
}
