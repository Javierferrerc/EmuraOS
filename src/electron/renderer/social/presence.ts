/**
 * presence — the live "en línea / jugando" broadcast over Supabase Realtime.
 *
 * One PresenceSession per signed-in renderer owns the shared `presence:lobby`
 * channel and keeps it alive on its own, whatever happens to the socket:
 *
 *  - supabase-js hands back the ALREADY-REGISTERED channel when a topic is
 *    reused. A re-join started before the previous leave finished (token
 *    refresh, INITIAL_SESSION, StrictMode, account switch) got the dying channel
 *    and went silently dead: no heartbeat, no syncs, "offline" for everyone.
 *    A new channel is only created once every previous lobby channel is gone.
 *  - every (re)subscribe tracks the CURRENT state, not the one from the join.
 *  - a watchdog rebuilds the channel when it isn't joined, when track() keeps
 *    failing, or when our own entry stops showing up in the lobby; waking up
 *    (network back, window focus) checks right away.
 *  - heartbeats go out in Supabase server time, so a viewer whose build still
 *    compares them with its own clock doesn't drop us if this PC's clock is off.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabaseClient";
import { PRESENCE_HEARTBEAT_MS } from "./presenceModel";
import type { PresenceState } from "./socialTypes";

const TOPIC = "presence:lobby";
const REALTIME_TOPIC = `realtime:${TOPIC}`;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
/** A channel still not joined after this long is considered stuck. */
const JOIN_GRACE_MS = 20_000;
/** Our own entry must show up in the lobby at least this often. */
const SELF_MISSING_MS = PRESENCE_HEARTBEAT_MS * 3 + 5_000;
const CLOCK_RESYNC_MS = 10 * 60_000;
const WAKE_THROTTLE_MS = 5_000;

// ── Server clock ────────────────────────────────────────────────────────
let serverOffsetMs = 0;
let lastClockSync = 0;

/** Local epoch ms expressed in the Supabase server clock (offset 0 until
 *  server_now() answers, e.g. before migration 0015 is applied). */
export function toServerTime(localMs: number): number {
  return localMs + serverOffsetMs;
}

async function syncServerClock(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  lastClockSync = Date.now();
  try {
    const t0 = Date.now();
    const { data, error } = await sb.rpc("server_now");
    const t1 = Date.now();
    const server = Number(data);
    // A slow round trip makes the midpoint estimate useless; keep the old one.
    if (error || !Number.isFinite(server) || server <= 0 || t1 - t0 > 5_000) return;
    serverOffsetMs = server - (t0 + t1) / 2;
  } catch {
    /* keep the previous offset */
  }
}

// ── Channel disposal ────────────────────────────────────────────────────
// Serialized across sessions: a new lobby channel is created only after this
// chain has removed every older one (see the header).
let disposing: Promise<void> = Promise.resolve();

async function removeLobbyChannels(untrack: boolean): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  for (const ch of sb.getChannels().filter((c) => c.topic === REALTIME_TOPIC)) {
    try {
      if (untrack && ch.state === "joined") await ch.untrack();
    } catch {
      /* socket already gone */
    }
    try {
      await sb.removeChannel(ch);
    } catch {
      /* closes on timeout too */
    }
  }
}

/** Upper bound for one disposal step, so a hung leave can't block every
 *  future join behind it. */
const DISPOSE_TIMEOUT_MS = 8_000;

function queueDisposal(untrack: boolean): Promise<void> {
  disposing = disposing.then(() =>
    Promise.race([
      removeLobbyChannels(untrack),
      new Promise<void>((resolve) => window.setTimeout(resolve, DISPOSE_TIMEOUT_MS)),
    ])
  );
  return disposing;
}

/** What the app reports; identity + heartbeat are added by the session. */
export type LocalPresence = Pick<
  PresenceState,
  "status" | "playing" | "playing_title" | "playing_since"
>;

let active: PresenceSession | null = null;

export class PresenceSession {
  /** Distinguishes this app instance from the same account on another PC. */
  readonly clientId = crypto.randomUUID();
  private readonly since = new Date().toISOString();
  private channel: RealtimeChannel | null = null;
  private gen = 0;
  private stopped = false;
  private reconnectTimer: number | undefined;
  private beatTimer: number | undefined;
  private backoff = RECONNECT_MIN_MS;
  private createdAt = 0;
  private joinedAt = 0;
  private lastSelfSeen = 0;
  private trackFailures = 0;
  private lastWake = 0;

  constructor(
    private readonly userId: string,
    private readonly getLocal: () => LocalPresence,
    private readonly onSync: (states: PresenceState[]) => void
  ) {}

  start(): void {
    if (active && active !== this) active.stop();
    active = this;
    window.addEventListener("online", this.wake);
    window.addEventListener("focus", this.wake);
    document.addEventListener("visibilitychange", this.wake);
    this.beatTimer = window.setInterval(this.beat, PRESENCE_HEARTBEAT_MS);
    if (Date.now() - lastClockSync > CLOCK_RESYNC_MS) {
      void syncServerClock().then(() => this.push());
    }
    this.connect();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.gen++;
    if (active === this) active = null;
    window.removeEventListener("online", this.wake);
    window.removeEventListener("focus", this.wake);
    document.removeEventListener("visibilitychange", this.wake);
    window.clearInterval(this.beatTimer);
    window.clearTimeout(this.reconnectTimer);
    this.channel = null;
    void queueDisposal(true);
  }

  /** Fire-and-forget leave while the window is closing (React cleanup doesn't
   *  run when the renderer is destroyed). Friends' staleness prune backs it up. */
  leaveNow(): void {
    try {
      void this.channel?.untrack();
    } catch {
      /* window is tearing down */
    }
  }

  /** Broadcast the current state now (also the heartbeat). */
  push = (): void => {
    const ch = this.channel;
    if (this.stopped || !ch || ch.state !== "joined") return;
    const payload: PresenceState = {
      ...this.getLocal(),
      user_id: this.userId,
      client_id: this.clientId,
      heartbeat: toServerTime(Date.now()),
      since: this.since,
    };
    if (payload.playing_since != null) payload.playing_since = toServerTime(payload.playing_since);
    const failed = (why: string) => {
      if (ch !== this.channel) return;
      if (++this.trackFailures >= 2) this.reconnect(`track ${why}`);
    };
    ch.track(payload).then(
      (res) => {
        if (res === "ok") this.trackFailures = 0;
        else failed(String(res));
      },
      () => failed("error")
    );
  };

  private connect(): void {
    const sb = getSupabase();
    if (!sb || this.stopped) return;
    const gen = ++this.gen;
    this.channel = null;
    void queueDisposal(false).then(() => {
      if (this.stopped || gen !== this.gen) return;
      const ch = sb.channel(TOPIC, { config: { presence: { key: this.userId } } });
      if (ch.joinedOnce) {
        // Still got a recycled channel (someone else registered it meanwhile):
        // never adopt it, dispose and try again.
        this.scheduleReconnect();
        return;
      }
      this.channel = ch;
      this.createdAt = Date.now();
      this.joinedAt = 0;
      this.lastSelfSeen = 0;
      this.trackFailures = 0;
      ch.on("presence", { event: "sync" }, () => {
        if (gen === this.gen) this.handleSync(ch);
      });
      ch.subscribe((status, err) => {
        if (gen !== this.gen || this.stopped) return;
        if (status === "SUBSCRIBED") {
          this.backoff = RECONNECT_MIN_MS;
          window.clearTimeout(this.reconnectTimer);
          this.reconnectTimer = undefined;
          this.joinedAt = Date.now();
          this.push();
        } else {
          console.warn("[presence]", status, err ?? "");
          this.scheduleReconnect();
        }
      });
    });
  }

  private handleSync(ch: RealtimeChannel): void {
    const flat = Object.values(ch.presenceState<PresenceState>()).flat() as PresenceState[];
    if (flat.some((s) => s.client_id === this.clientId)) this.lastSelfSeen = Date.now();
    this.onSync(flat);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== undefined) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private reconnect(reason: string): void {
    if (this.stopped) return;
    console.warn("[presence] rebuilding channel:", reason);
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.connect();
  }

  /** Heartbeat + watchdog. */
  private beat = (): void => {
    if (this.stopped) return;
    if (Date.now() - lastClockSync > CLOCK_RESYNC_MS) void syncServerClock();
    const ch = this.channel;
    if (!ch) return; // (re)connect in progress
    const now = Date.now();
    if (ch.state !== "joined") {
      if (this.reconnectTimer === undefined && now - this.createdAt > JOIN_GRACE_MS) {
        this.reconnect(`stuck in "${ch.state}"`);
      }
      return;
    }
    this.push();
    if (now - Math.max(this.lastSelfSeen, this.joinedAt) > SELF_MISSING_MS) {
      this.reconnect("own presence missing from the lobby");
    }
  };

  /** Network back / window focused: check immediately instead of waiting. */
  private wake = (): void => {
    if (this.stopped || document.visibilityState === "hidden") return;
    const now = Date.now();
    if (now - this.lastWake < WAKE_THROTTLE_MS) return;
    this.lastWake = now;
    const ch = this.channel;
    const stuck =
      !!ch &&
      ch.state !== "joined" &&
      (ch.state !== "joining" || now - this.createdAt > JOIN_GRACE_MS);
    if (stuck) {
      this.backoff = RECONNECT_MIN_MS;
      this.reconnect("wake while not joined");
    } else {
      this.push();
    }
  };
}
