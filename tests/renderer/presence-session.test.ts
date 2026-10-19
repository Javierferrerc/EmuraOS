import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PresenceState } from "../../src/electron/renderer/social/socialTypes";

// ── Minimal Realtime fake with supabase-js's topic de-duplication ──────────
class FakeChannel {
  state = "closed";
  joinedOnce = false;
  tracked: unknown = null;
  private syncs: (() => void)[] = [];
  private statusCb: ((s: string) => void) | null = null;
  constructor(public topic: string, private client: FakeClient) {}
  on(_t: string, _f: unknown, cb: () => void) {
    this.syncs.push(cb);
    return this;
  }
  subscribe(cb: (s: string) => void) {
    if (this.state !== "closed") return this; // like realtime-js: no-op
    this.statusCb = cb;
    this.state = "joining";
    setTimeout(() => {
      if (this.state !== "joining") return;
      this.state = "joined";
      this.joinedOnce = true;
      cb("SUBSCRIBED");
    }, 10);
    return this;
  }
  async track(payload: unknown) {
    if (this.state !== "joined") return "error";
    this.tracked = payload;
    this.client.broadcast();
    return "ok";
  }
  async untrack() {
    this.tracked = null;
    this.client.broadcast();
    return "ok";
  }
  presenceState() {
    const out: Record<string, unknown[]> = {};
    for (const c of this.client.channels) {
      const t = c.tracked as PresenceState | null;
      if (t && c.state === "joined") (out[t.user_id] ??= []).push(t);
    }
    return out;
  }
  emitSync() {
    this.syncs.forEach((f) => f());
  }
  /** Simulate the server killing the channel (socket drop, token expiry...). */
  fail() {
    this.state = "errored";
    this.statusCb?.("CHANNEL_ERROR");
  }
}

class FakeClient {
  channels: FakeChannel[] = [];
  channel(topic: string) {
    const t = `realtime:${topic}`;
    const existing = this.channels.find((c) => c.topic === t);
    if (existing) return existing; // the behaviour that broke presence
    const ch = new FakeChannel(t, this);
    this.channels.push(ch);
    return ch;
  }
  getChannels() {
    return this.channels;
  }
  async removeChannel(ch: FakeChannel) {
    await new Promise((r) => setTimeout(r, 30));
    ch.state = "closed";
    this.channels = this.channels.filter((c) => c !== ch);
    return "ok";
  }
  broadcast() {
    this.channels.forEach((c) => c.state === "joined" && c.emitSync());
  }
  async rpc() {
    return { data: null, error: { message: "not applied" } };
  }
}

let fake: FakeClient;
vi.mock("../../src/electron/renderer/social/supabaseClient", () => ({
  getSupabase: () => fake,
  isSocialConfigured: () => true,
}));

const { PresenceSession } = await import("../../src/electron/renderer/social/presence");

const local = () => ({ status: "online" as const, playing: null });

beforeEach(() => {
  vi.useFakeTimers();
  fake = new FakeClient();
  const noop = () => {};
  vi.stubGlobal("window", {
    addEventListener: noop,
    removeEventListener: noop,
    setInterval: (f: () => void, ms: number) => setInterval(f, ms),
    clearInterval: (id: number) => clearInterval(id),
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  });
  vi.stubGlobal("document", {
    addEventListener: noop,
    removeEventListener: noop,
    visibilityState: "visible",
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  // Let pending disposals settle before the next test (module-level chain).
  await vi.advanceTimersByTimeAsync(10_000);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function lobby() {
  return fake.channels.filter((c) => c.topic === "realtime:presence:lobby");
}

describe("PresenceSession", () => {
  it("joins and tracks with a heartbeat", async () => {
    const s = new PresenceSession("me", local, () => {});
    s.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(lobby()).toHaveLength(1);
    expect(lobby()[0].state).toBe("joined");
    expect((lobby()[0].tracked as PresenceState).heartbeat).toBeTypeOf("number");
    s.stop();
  });

  it("an immediate re-join (token refresh / StrictMode) never adopts the dying channel", async () => {
    const a = new PresenceSession("me", local, () => {});
    a.start();
    await vi.advanceTimersByTimeAsync(100);
    const first = lobby()[0];
    a.stop();
    const b = new PresenceSession("me", local, () => {});
    b.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(lobby()).toHaveLength(1);
    expect(lobby()[0]).not.toBe(first);
    expect(lobby()[0].state).toBe("joined");
    expect((lobby()[0].tracked as PresenceState).user_id).toBe("me");
    b.stop();
  });

  it("rebuilds the channel after the server kills it and re-sends the CURRENT state", async () => {
    let playing: string | null = null;
    const seen: PresenceState[][] = [];
    const s = new PresenceSession(
      "me",
      () => ({ status: "online", playing }),
      (st) => seen.push(st)
    );
    s.start();
    await vi.advanceTimersByTimeAsync(100);
    const first = lobby()[0];
    playing = "zelda";
    first.fail();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(lobby()).toHaveLength(1);
    expect(lobby()[0]).not.toBe(first);
    expect(lobby()[0].state).toBe("joined");
    expect((lobby()[0].tracked as PresenceState).playing).toBe("zelda");
    s.stop();
  });

  it("watchdog recovers a channel that silently stopped working", async () => {
    const s = new PresenceSession("me", local, () => {});
    s.start();
    await vi.advanceTimersByTimeAsync(100);
    const first = lobby()[0];
    // Socket died without any status callback.
    first.state = "errored";
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lobby()[0]).not.toBe(first);
    expect(lobby()[0].state).toBe("joined");
    s.stop();
  });

  it("keeps heartbeating while healthy", async () => {
    const s = new PresenceSession("me", local, () => {});
    s.start();
    await vi.advanceTimersByTimeAsync(100);
    const ch = lobby()[0];
    const hb1 = (ch.tracked as PresenceState).heartbeat!;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(lobby()[0]).toBe(ch); // no needless rebuilds
    expect((ch.tracked as PresenceState).heartbeat!).toBeGreaterThan(hb1);
    s.stop();
  });

  it("stop() leaves the lobby", async () => {
    const s = new PresenceSession("me", local, () => {});
    s.start();
    await vi.advanceTimersByTimeAsync(100);
    s.stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(lobby()).toHaveLength(0);
  });
});
