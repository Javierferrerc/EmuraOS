import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import {
  detectGameId,
  readDolphinGameConfig,
  resolveDolphinUserDir,
  writeDolphinGameConfig,
} from "../../src/core/dolphin-game-config.js";

const TEST_ROOT = resolve(
  import.meta.dirname,
  "__test_dolphin_game_config__"
);

describe("dolphin-game-config", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });
  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  describe("detectGameId", () => {
    it("returns the 6-char id when the file starts with ASCII alnum", () => {
      const romPath = path.join(TEST_ROOT, "smg.iso");
      // Super Mario Galaxy US gameid followed by arbitrary bytes
      const buf = Buffer.concat([Buffer.from("RMGE01"), Buffer.alloc(64, 0)]);
      writeFileSync(romPath, buf);
      expect(detectGameId(romPath)).toBe("RMGE01");
    });

    it("returns null for compressed containers (non-ASCII header)", () => {
      const romPath = path.join(TEST_ROOT, "smg.rvz");
      writeFileSync(romPath, Buffer.from([0x52, 0x56, 0x5a, 0x01, 0, 0]));
      expect(detectGameId(romPath)).toBe(null);
    });

    it("returns null for missing files", () => {
      expect(detectGameId(path.join(TEST_ROOT, "nope.iso"))).toBe(null);
    });
  });

  describe("writeDolphinGameConfig + readDolphinGameConfig", () => {
    const gameId = "GMSE01";

    it("creates the GameSettings dir and writes the curated keys", () => {
      const userDir = path.join(TEST_ROOT, "DolphinUser");
      const { configPath } = writeDolphinGameConfig(userDir, gameId, {
        wideScreenHack: true,
        skipEFBAccess: true,
      });
      expect(existsSync(configPath)).toBe(true);
      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("[Video_Settings]");
      expect(content).toContain("wideScreenHack = True");
      expect(content).toContain("[Video_Hacks]");
      // skipEFBAccess = true means EFBAccessEnable = False
      expect(content).toContain("EFBAccessEnable = False");
    });

    it("round-trips via the curated reader", () => {
      const userDir = path.join(TEST_ROOT, "DolphinUser");
      writeDolphinGameConfig(userDir, gameId, {
        wideScreenHack: true,
        overclockEnable: true,
        overclockFactor: 1.5,
        aspectRatio: 2,
        disablePort2: true,
      });
      const result = readDolphinGameConfig(userDir, gameId);
      expect(result.wideScreenHack).toBe(true);
      expect(result.overclockEnable).toBe(true);
      expect(result.overclockFactor).toBe(1.5);
      expect(result.aspectRatio).toBe(2);
      expect(result.disablePort2).toBe(true);
    });

    it("preserves unknown keys on round trip", () => {
      const userDir = path.join(TEST_ROOT, "DolphinUser");
      const dir = path.join(userDir, "GameSettings");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, `${gameId}.ini`),
        "[Core]\nCustomKey = preserved\n\n[Video_Settings]\nAspectRatio = 1\n"
      );
      writeDolphinGameConfig(userDir, gameId, { wideScreenHack: true });
      const content = readFileSync(
        path.join(dir, `${gameId}.ini`),
        "utf-8"
      );
      expect(content).toContain("CustomKey = preserved");
      expect(content).toContain("AspectRatio = 1");
      expect(content).toContain("wideScreenHack = True");
    });

    it("removes a key when value is undefined / not present in subsequent write", () => {
      const userDir = path.join(TEST_ROOT, "DolphinUser");
      writeDolphinGameConfig(userDir, gameId, { wideScreenHack: true });
      writeDolphinGameConfig(userDir, gameId, {
        wideScreenHack: undefined,
      });
      const result = readDolphinGameConfig(userDir, gameId);
      expect(result.wideScreenHack).toBeUndefined();
    });
  });

  describe("resolveDolphinUserDir", () => {
    it("uses portable User dir when portable.txt is present", () => {
      const installDir = path.join(TEST_ROOT, "Dolphin-x64");
      mkdirSync(installDir, { recursive: true });
      writeFileSync(path.join(installDir, "portable.txt"), "");
      const exe = path.join(installDir, "Dolphin.exe");
      const result = resolveDolphinUserDir(
        exe,
        path.join(TEST_ROOT, "appdata"),
        path.join(TEST_ROOT, "docs")
      );
      expect(result).toBe(path.join(installDir, "User"));
    });

    it("falls back to Documents convention when nothing exists", () => {
      const docs = path.join(TEST_ROOT, "docs");
      const result = resolveDolphinUserDir(
        null,
        path.join(TEST_ROOT, "appdata"),
        docs
      );
      expect(result).toBe(path.join(docs, "Dolphin Emulator"));
    });
  });
});
