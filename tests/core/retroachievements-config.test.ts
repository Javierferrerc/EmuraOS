import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  parseIni,
  parseKeyValue,
} from "../../src/core/config-parsers.js";
import {
  isRaInjectable,
  injectRetroArch,
  injectDolphin,
  injectDuckStation,
  type RaCredentials,
} from "../../src/core/retroachievements-config.js";

const TEST_DIR = resolve(import.meta.dirname, "__test_ra_config__");

const CREDS: RaCredentials = {
  username: "Mario",
  token: "tok-123",
  enabled: true,
  hardcore: false,
};

describe("retroachievements-config", () => {
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("isRaInjectable", () => {
    it("supports the 3 emulators whose token lives in the config file", () => {
      expect(isRaInjectable("retroarch")).toBe(true);
      expect(isRaInjectable("dolphin")).toBe(true);
      expect(isRaInjectable("duckstation")).toBe(true);
    });

    it("excludes pcsx2 and ppsspp (token in secret storage)", () => {
      expect(isRaInjectable("pcsx2")).toBe(false);
      expect(isRaInjectable("ppsspp")).toBe(false);
      expect(isRaInjectable("dolphin-x")).toBe(false);
    });
  });

  describe("injectRetroArch", () => {
    it("writes the cheevos_* keys, preserving existing ones", () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const cfg = join(TEST_DIR, "retroarch.cfg");
      writeFileSync(cfg, 'video_smooth = "true"\n');

      injectRetroArch(cfg, CREDS);
      const kv = parseKeyValue(readFileSync(cfg, "utf-8"));
      expect(kv.cheevos_enable).toBe("true");
      expect(kv.cheevos_username).toBe("Mario");
      expect(kv.cheevos_token).toBe("tok-123");
      expect(kv.cheevos_hardcore_mode_enable).toBe("false");
      // Untouched key survives the round-trip.
      expect(kv.video_smooth).toBe("true");
    });

    it("creates the file when it doesn't exist", () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const cfg = join(TEST_DIR, "sub", "retroarch.cfg");
      injectRetroArch(cfg, { ...CREDS, hardcore: true });
      const kv = parseKeyValue(readFileSync(cfg, "utf-8"));
      expect(kv.cheevos_hardcore_mode_enable).toBe("true");
    });
  });

  describe("injectDolphin", () => {
    it("writes the [Achievements] section with True/False booleans", () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const ini = join(TEST_DIR, "Dolphin.ini");
      writeFileSync(ini, "[Core]\nCPUThread = True\n");

      injectDolphin(ini, { ...CREDS, hardcore: true });
      const data = parseIni(readFileSync(ini, "utf-8"));
      expect(data.Achievements.Enabled).toBe("True");
      expect(data.Achievements.Username).toBe("Mario");
      expect(data.Achievements.ApiToken).toBe("tok-123");
      expect(data.Achievements.HardcoreEnabled).toBe("True");
      // Existing section preserved.
      expect(data.Core.CPUThread).toBe("True");
    });
  });

  describe("injectDuckStation", () => {
    it("writes the [Cheevos] section with lowercase booleans", () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const ini = join(TEST_DIR, "settings.ini");
      injectDuckStation(ini, CREDS);
      const data = parseIni(readFileSync(ini, "utf-8"));
      expect(data.Cheevos.Enabled).toBe("true");
      expect(data.Cheevos.Username).toBe("Mario");
      expect(data.Cheevos.Token).toBe("tok-123");
      expect(data.Cheevos.ChallengeMode).toBe("false");
    });
  });
});
