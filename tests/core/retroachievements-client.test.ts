import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RetroAchievementsClient } from "../../src/core/retroachievements-client.js";

/** Build a JSON Response like the global fetch returns. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("RetroAchievementsClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: RetroAchievementsClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new RetroAchievementsClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("login", () => {
    it("returns the token on success and hits the login2 endpoint", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ Success: true, User: "Mario", Token: "abc123" })
      );
      const result = await client.login("Mario", "secret");
      expect(result.success).toBe(true);
      expect(result.token).toBe("abc123");
      expect(result.username).toBe("Mario");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("dorequest.php?r=login2");
      expect(url).toContain("u=Mario");
      expect(url).toContain("p=secret");
    });

    it("surfaces a clean error on failed credentials", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ Success: false, Error: "Invalid User/Password" })
      );
      const result = await client.login("Mario", "wrong");
      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
      expect(result.error).toBe("Invalid User/Password");
    });

    it("url-encodes credentials with special characters", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ Success: true, User: "a b", Token: "t" })
      );
      await client.login("a b", "p@ss&x");
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("u=a%20b");
      expect(url).toContain("p=p%40ss%26x");
    });
  });

  describe("resolveGameId", () => {
    it("returns the game id when the hash is known", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ Success: true, GameID: 1234 })
      );
      expect(await client.resolveGameId("deadbeef")).toBe(1234);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("r=gameid");
      expect(url).toContain("m=deadbeef");
    });

    it("returns null when the hash maps to GameID 0 (unknown)", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ Success: true, GameID: 0 })
      );
      expect(await client.resolveGameId("00000000")).toBeNull();
    });

    it("returns null when Success is false", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ Success: false }));
      expect(await client.resolveGameId("x")).toBeNull();
    });
  });

  describe("getGameProgress", () => {
    it("parses achievements and distinguishes earned vs locked", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          Title: "Super Mario World",
          ConsoleName: "SNES",
          ImageIcon: "/Images/abc.png",
          NumAchievements: 2,
          NumAwardedToUser: 1,
          NumAwardedToUserHardcore: 1,
          UserCompletion: "50.00%",
          Achievements: {
            "7": {
              ID: 7,
              Title: "First Win",
              Description: "Win a level",
              Points: 5,
              BadgeName: "12345",
              DateEarned: "2024-01-02 10:00:00",
              DateEarnedHardcore: "2024-01-02 10:00:00",
            },
            "9": {
              ID: 9,
              Title: "Hard One",
              Description: "Beat the game",
              Points: 50,
              BadgeName: "67890",
            },
          },
        })
      );

      const progress = await client.getGameProgress("Mario", "KEY", 567);
      expect(progress).not.toBeNull();
      expect(progress!.title).toBe("Super Mario World");
      expect(progress!.numAwarded).toBe(1);
      expect(progress!.iconUrl).toBe(
        "https://media.retroachievements.org/Images/abc.png"
      );

      // Sorted by points asc → "First Win" (5) before "Hard One" (50).
      expect(progress!.achievements.map((a) => a.id)).toEqual([7, 9]);
      const earned = progress!.achievements[0];
      const locked = progress!.achievements[1];
      expect(earned.dateEarned).toBe("2024-01-02 10:00:00");
      expect(locked.dateEarned).toBeNull();
      expect(earned.badgeUrl).toBe(
        "https://media.retroachievements.org/Badge/12345.png"
      );
      expect(locked.badgeUrlLocked).toBe(
        "https://media.retroachievements.org/Badge/67890_lock.png"
      );

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("API_GetGameInfoAndUserProgress.php");
      expect(url).toContain("y=KEY");
      expect(url).toContain("u=Mario");
      expect(url).toContain("g=567");
    });

    it("returns null on an auth failure (401)", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "bad key" }, 401));
      expect(await client.getGameProgress("Mario", "BAD", 1)).toBeNull();
    });
  });

  describe("retry", () => {
    it("retries on 500 then succeeds", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: "oops" }, 500))
        .mockResolvedValueOnce(jsonResponse({ Success: true, GameID: 5 }));
      const id = await client.resolveGameId("h");
      expect(id).toBe(5);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
