import { describe, it, expect } from "vitest";
import {
  ArrivalLog,
  PRESENCE_STALE_MS,
  resolvePresence,
  samePresence,
} from "../../src/electron/renderer/social/presenceModel";
import type { PresenceState } from "../../src/electron/renderer/social/socialTypes";

const HOUR = 3_600_000;

function meta(p: Partial<PresenceState> & { user_id: string }): PresenceState {
  return { status: "online", playing: null, since: "", ...p };
}

/** Observe `states` at `now` and resolve them, like SocialContext does. */
function run(log: ArrivalLog, states: PresenceState[], now: number) {
  log.observe(states, now);
  return resolvePresence(states, log, now);
}

describe("resolvePresence — clock skew", () => {
  it("shows a friend whose clock runs hours behind", () => {
    const log = new ArrivalLog();
    const now = 1_000 * HOUR;
    const friend = meta({ user_id: "f", client_id: "a", heartbeat: now - 3 * HOUR });
    expect(run(log, [friend], now).has("f")).toBe(true);
  });

  it("shows a friend whose clock runs ahead, and still ages them out", () => {
    const log = new ArrivalLog();
    const now = 1_000 * HOUR;
    const friend = meta({ user_id: "f", client_id: "a", heartbeat: now + 2 * HOUR });
    expect(run(log, [friend], now).has("f")).toBe(true);
    // Nothing new arrives from them (crash): gone after the stale window.
    expect(resolvePresence([friend], log, now + PRESENCE_STALE_MS + 1).has("f")).toBe(false);
  });

  it("stays online while new heartbeats keep arriving", () => {
    const log = new ArrivalLog();
    let now = 1_000 * HOUR;
    const skew = -5 * HOUR;
    for (let i = 0; i < 20; i++) {
      now += 20_000;
      const m = meta({ user_id: "f", client_id: "a", heartbeat: now + skew });
      expect(run(log, [m], now).has("f")).toBe(true);
    }
  });

  it("keeps entries without heartbeat (older builds)", () => {
    const log = new ArrivalLog();
    const now = 1_000 * HOUR;
    const old = meta({ user_id: "f" });
    run(log, [old], now);
    expect(resolvePresence([old], log, now + 10 * HOUR).has("f")).toBe(true);
  });

  it("computes playing time independently of the sender's clock", () => {
    const log = new ArrivalLog();
    const now = 1_000 * HOUR;
    const skew = 7 * HOUR; // sender's clock is 7 h ahead
    const m = meta({
      user_id: "f",
      client_id: "a",
      playing: "pokemon",
      heartbeat: now + skew,
      playing_since: now + skew - 23 * 60_000, // 23 min into the session
    });
    const r = run(log, [m], now).get("f")!;
    expect(now - r.playing_since!).toBe(23 * 60_000);
  });
});

describe("resolvePresence — same account on several machines", () => {
  it("prefers the machine that is playing", () => {
    const log = new ArrivalLog();
    const now = 1_000 * HOUR;
    const idle = meta({ user_id: "me", client_id: "pc1", status: "away", heartbeat: now });
    const play = meta({
      user_id: "me",
      client_id: "pc2",
      playing: "zelda",
      playing_title: "Zelda",
      heartbeat: now - 4 * HOUR, // and its clock is off
    });
    for (const order of [[idle, play], [play, idle]]) {
      const r = run(new ArrivalLog(), order, now).get("me")!;
      expect(r.playing).toBe("zelda");
      expect(r.status).toBe("online");
    }
    expect(run(log, [idle], now).get("me")!.status).toBe("away");
  });

  it("online on one machine wins over away on the other", () => {
    const now = 1_000 * HOUR;
    const r = run(
      new ArrivalLog(),
      [
        meta({ user_id: "me", client_id: "pc1", status: "away", heartbeat: now }),
        meta({ user_id: "me", client_id: "pc2", status: "online", heartbeat: now }),
      ],
      now
    );
    expect(r.get("me")!.status).toBe("online");
  });

  it("a crashed machine doesn't hide the live one", () => {
    const log = new ArrivalLog();
    let now = 1_000 * HOUR;
    const dead = meta({ user_id: "me", client_id: "pc1", playing: "x", heartbeat: now });
    run(log, [dead], now);
    // pc2 keeps beating, pc1 never sends again.
    let r = new Map<string, PresenceState>();
    for (let i = 0; i < 6; i++) {
      now += 20_000;
      r = run(log, [dead, meta({ user_id: "me", client_id: "pc2", heartbeat: now })], now);
    }
    expect(r.get("me")!.playing).toBeNull();
    expect(r.get("me")!.client_id).toBe("pc2");
  });
});

describe("samePresence", () => {
  it("ignores heartbeat churn but sees real changes", () => {
    const a = new Map([["f", meta({ user_id: "f", heartbeat: 1 })]]);
    const b = new Map([["f", meta({ user_id: "f", heartbeat: 2 })]]);
    const c = new Map([["f", meta({ user_id: "f", status: "away" })]]);
    expect(samePresence(a, b)).toBe(true);
    expect(samePresence(a, c)).toBe(false);
    expect(samePresence(a, new Map())).toBe(false);
  });
});
