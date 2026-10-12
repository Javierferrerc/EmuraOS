import { describe, it, expect } from "vitest";
import {
  mergeLibrarySync,
  sanitizeCloudDoc,
  emptyCloudDoc,
  type MergeInput,
} from "../../src/core/library-sync.js";
import type { CloudLibraryDoc, UserLibraryFile } from "../../src/core/types.js";

function lib(over: Partial<UserLibraryFile> = {}): UserLibraryFile {
  return { version: 1, favorites: [], collections: [], recentlyPlayed: [], playHistory: {}, ...over };
}

function input(over: Partial<MergeInput> = {}): MergeInput {
  return {
    local: lib(),
    remote: null,
    deviceId: "B",
    deviceName: "PC-B",
    localLibKeys: [],
    localGames: {},
    localPinned: { keys: [], at: "" },
    now: "2026-10-12T10:00:00.000Z",
    ...over,
  };
}

/** Simulate device A having synced its data into the cloud. */
function docFromA(aLocal: UserLibraryFile, libKeys: string[], games = {}): CloudLibraryDoc {
  return mergeLibrarySync(
    input({ local: aLocal, deviceId: "A", deviceName: "PC-A", localLibKeys: libKeys, localGames: games, now: "2026-10-11T00:00:00.000Z" })
  ).doc;
}

describe("mergeLibrarySync", () => {
  it("brings another device's playtime, favourites and library to a fresh machine", () => {
    const remote = docFromA(
      lib({
        favorites: ["snes:zelda.sfc"],
        playHistory: { "snes:zelda.sfc": { lastPlayed: "2026-10-01T00:00:00Z", playCount: 3, totalPlayTime: 3600 } },
      }),
      ["snes:zelda.sfc", "nes:mario.nes"],
      { "snes:zelda.sfc": { t: "Zelda", s: "SNES" } }
    );
    const r = mergeLibrarySync(input({ remote, localLibKeys: ["gba:metroid.gba"] }));
    expect(r.local.playHistory["snes:zelda.sfc"]).toMatchObject({ playCount: 3, totalPlayTime: 3600 });
    expect(r.local.favorites).toEqual(["snes:zelda.sfc"]);
    expect(r.local.recentlyPlayed).toEqual(["snes:zelda.sfc"]);
    expect(r.local.cloud?.remoteLib.sort()).toEqual(["nes:mario.nes", "snes:zelda.sfc"]);
    expect(r.local.cloud?.games["snes:zelda.sfc"].t).toBe("Zelda");
    // The fresh machine contributes nothing of its own yet.
    expect(r.doc.devices.B.play).toEqual({});
    expect(r.doc.devices.A.play["snes:zelda.sfc"].c).toBe(3);
  });

  it("adds play time from two devices instead of overwriting", () => {
    const remote = docFromA(
      lib({ playHistory: { "nes:mario.nes": { lastPlayed: "2026-10-01T00:00:00Z", playCount: 2, totalPlayTime: 600 } } }),
      ["nes:mario.nes"]
    );
    const local = lib({ playHistory: { "nes:mario.nes": { lastPlayed: "2026-10-05T00:00:00Z", playCount: 1, totalPlayTime: 100 } } });
    const r = mergeLibrarySync(input({ local, remote, localLibKeys: ["nes:mario.nes"] }));
    expect(r.local.playHistory["nes:mario.nes"]).toEqual({
      playCount: 3,
      totalPlayTime: 700,
      lastPlayed: "2026-10-05T00:00:00Z",
    });
    // Own slice holds only this device's part — re-merging is idempotent.
    expect(r.local.ownPlay?.["nes:mario.nes"].totalPlayTime).toBe(100);
    const again = mergeLibrarySync(input({ local: r.local, remote: r.doc, localLibKeys: ["nes:mario.nes"] }));
    expect(again.local.playHistory["nes:mario.nes"].totalPlayTime).toBe(700);
    expect(again.docChanged).toBe(false);
  });

  it("a fresh empty machine never wipes cloud data", () => {
    const remote = docFromA(
      lib({ favorites: ["nes:a.nes"], playHistory: { "nes:a.nes": { lastPlayed: "2026-10-01T00:00:00Z", playCount: 1, totalPlayTime: 50 } } }),
      ["nes:a.nes"]
    );
    const r = mergeLibrarySync(input({ remote }));
    expect(r.doc.fav["nes:a.nes"].on).toBe(true);
    expect(r.doc.devices.A.play["nes:a.nes"].t).toBe(50);
  });

  it("favourite removals win when newer (LWW)", () => {
    const remote = emptyCloudDoc();
    remote.fav["nes:a.nes"] = { on: false, at: "2026-10-10T00:00:00Z" };
    const local = lib({ favorites: ["nes:a.nes"], favoriteTimes: { "nes:a.nes": { on: true, at: "2026-10-01T00:00:00Z" } } });
    expect(mergeLibrarySync(input({ local, remote })).local.favorites).toEqual([]);
  });

  it("collection deletions are not resurrected by an older remote copy", () => {
    const remote = emptyCloudDoc();
    remote.collections = [{ id: "col_1", name: "RPG", roms: [], createdAt: "x", updatedAt: "2026-10-01T00:00:00Z" }];
    const local = lib({ collectionTombstones: { col_1: "2026-10-02T00:00:00Z" } });
    const r = mergeLibrarySync(input({ local, remote }));
    expect(r.local.collections).toEqual([]);
    expect(r.doc.colDel.col_1).toBe("2026-10-02T00:00:00Z");
  });

  it("a reset tombstone drops older contributions from every device", () => {
    const remote = docFromA(
      lib({ playHistory: { "nes:a.nes": { lastPlayed: "2026-10-01T00:00:00Z", playCount: 4, totalPlayTime: 400 } } }),
      ["nes:a.nes"]
    );
    const local = lib({ playResets: { "nes:a.nes": "2026-10-05T00:00:00Z" }, ownPlay: {} });
    const r = mergeLibrarySync(input({ local, remote }));
    expect(r.local.playHistory["nes:a.nes"]).toBeUndefined();
  });

  it("aliases map another device's file name onto the local ROM, both ways", () => {
    const remote = docFromA(
      lib({
        favorites: ["snes:Zelda (USA).sfc"],
        playHistory: { "snes:Zelda (USA).sfc": { lastPlayed: "2026-10-01T00:00:00Z", playCount: 1, totalPlayTime: 60 } },
      }),
      ["snes:Zelda (USA).sfc"]
    );
    const local = lib({ keyAliases: { "snes:Zelda (USA).sfc": "snes:zelda.zip" } });
    const r = mergeLibrarySync(input({ local, remote, localLibKeys: ["snes:zelda.zip"] }));
    expect(r.local.playHistory["snes:zelda.zip"].totalPlayTime).toBe(60);
    expect(r.local.favorites).toEqual(["snes:zelda.zip"]);
    expect(r.local.cloud?.remoteLib).toEqual(["snes:zelda.zip"]);
    // Uploaded under the cloud name so device A keeps matching its own file.
    expect(r.doc.devices.B.lib).toEqual(["snes:Zelda (USA).sfc"]);
    expect(r.doc.fav["snes:Zelda (USA).sfc"].on).toBe(true);
  });

  it("pinned showcase is last-writer-wins", () => {
    const remote = emptyCloudDoc();
    remote.pinned = { keys: ["nes:a.nes"], at: "2026-10-10T00:00:00Z" };
    const r = mergeLibrarySync(input({ remote, localPinned: { keys: ["nes:b.nes"], at: "2026-10-01T00:00:00Z" } }));
    expect(r.pinned.keys).toEqual(["nes:a.nes"]);
  });
});

describe("sanitizeCloudDoc", () => {
  it("drops malformed parts and non-https cover URLs", () => {
    const doc = sanitizeCloudDoc({
      devices: { A: { name: "x", play: { "nes:a.nes": { c: -1, t: "9", l: 5 }, bad: {} }, lib: ["nes:a.nes", 7, "nokey"] } },
      fav: { "nes:a.nes": { on: true, at: "t" } },
      games: { "nes:a.nes": { t: "A", c: "javascript:alert(1)" } },
      collections: [{ id: "c", name: "n", roms: ["nes:a.nes"] }, "junk"],
    });
    expect(doc.devices.A.play).toEqual({ "nes:a.nes": { c: 0, t: 0, l: "" } });
    expect(doc.devices.A.lib).toEqual(["nes:a.nes"]);
    expect(doc.games["nes:a.nes"].c).toBeUndefined();
    expect(doc.collections).toHaveLength(1);
    expect(sanitizeCloudDoc(null)).toEqual(emptyCloudDoc());
  });
});
