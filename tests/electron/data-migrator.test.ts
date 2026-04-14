import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { migrateDataIfNeeded } from "../../src/electron/main/data-migrator.js";

const TEST_DIR = resolve(import.meta.dirname, "__test_migration__");
const OLD_ROOT = join(TEST_DIR, "old");
const NEW_ROOT = join(TEST_DIR, "new");

function writeJson(filePath: string, data: unknown): void {
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data), "utf-8");
}

describe("migrateDataIfNeeded", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("skips if sentinel already exists", () => {
    // Old root has config
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), {
      romsPath: "./roms",
    });
    // Sentinel already present
    mkdirSync(NEW_ROOT, { recursive: true });
    writeFileSync(join(NEW_ROOT, ".migrated"), "done", "utf-8");

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    // Config should NOT have been copied
    expect(existsSync(join(NEW_ROOT, "config", "retro-launcher.json"))).toBe(
      false
    );
  });

  it("skips if no old data exists (fresh install)", () => {
    mkdirSync(OLD_ROOT, { recursive: true });

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    // Nothing created — not even the sentinel
    expect(existsSync(NEW_ROOT)).toBe(false);
  });

  it("writes sentinel without copying if new location already has config", () => {
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), {
      romsPath: "./roms",
    });
    writeJson(join(NEW_ROOT, "config", "retro-launcher.json"), {
      romsPath: "./my-roms",
    });

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    expect(existsSync(join(NEW_ROOT, ".migrated"))).toBe(true);
    // Original new config should be untouched
    const cfg = JSON.parse(
      readFileSync(join(NEW_ROOT, "config", "retro-launcher.json"), "utf-8")
    );
    expect(cfg.romsPath).toBe("./my-roms");
  });

  it("copies config/ correctly", () => {
    const config = { romsPath: "./roms", emulatorsPath: "./emulators" };
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), config);

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    expect(existsSync(join(NEW_ROOT, "config", "retro-launcher.json"))).toBe(
      true
    );
    const copied = JSON.parse(
      readFileSync(join(NEW_ROOT, "config", "retro-launcher.json"), "utf-8")
    );
    expect(copied.romsPath).toBe("./roms");
  });

  it("copies roms/ when path is relative", () => {
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), {
      romsPath: "./roms",
      emulatorsPath: "./emulators",
    });
    mkdirSync(join(OLD_ROOT, "roms", "snes"), { recursive: true });
    writeFileSync(join(OLD_ROOT, "roms", "snes", "game.sfc"), "rom-data");

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    expect(existsSync(join(NEW_ROOT, "roms", "snes", "game.sfc"))).toBe(true);
  });

  it("does NOT copy roms/ when path is absolute", () => {
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), {
      romsPath: "D:\\Games\\Roms",
      emulatorsPath: "./emulators",
    });
    mkdirSync(join(OLD_ROOT, "roms", "snes"), { recursive: true });
    writeFileSync(join(OLD_ROOT, "roms", "snes", "game.sfc"), "rom-data");

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    // roms/ should not exist in the new root
    expect(existsSync(join(NEW_ROOT, "roms"))).toBe(false);
    // But config was still copied
    expect(existsSync(join(NEW_ROOT, "config", "retro-launcher.json"))).toBe(
      true
    );
  });

  it("does NOT copy emulators/ when path is absolute", () => {
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), {
      romsPath: "./roms",
      emulatorsPath: "C:\\Emulators",
    });
    mkdirSync(join(OLD_ROOT, "emulators", "retroarch"), { recursive: true });
    writeFileSync(
      join(OLD_ROOT, "emulators", "retroarch", "retroarch.exe"),
      "exe"
    );

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    expect(existsSync(join(NEW_ROOT, "emulators"))).toBe(false);
  });

  it("copies metadata/ and covers/ if they exist", () => {
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), {
      romsPath: "./roms",
    });
    mkdirSync(join(OLD_ROOT, "metadata", "snes"), { recursive: true });
    writeFileSync(
      join(OLD_ROOT, "metadata", "snes", "game.json"),
      '{"title":"Game"}'
    );
    mkdirSync(join(OLD_ROOT, "covers", "snes"), { recursive: true });
    writeFileSync(join(OLD_ROOT, "covers", "snes", "game.png"), "png-data");

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    expect(existsSync(join(NEW_ROOT, "metadata", "snes", "game.json"))).toBe(
      true
    );
    expect(existsSync(join(NEW_ROOT, "covers", "snes", "game.png"))).toBe(
      true
    );
  });

  it("copies user-library.json if present", () => {
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), {
      romsPath: "./roms",
    });
    writeFileSync(
      join(OLD_ROOT, "user-library.json"),
      '{"favorites":[]}'
    );

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    expect(existsSync(join(NEW_ROOT, "user-library.json"))).toBe(true);
  });

  it("writes sentinel after successful migration", () => {
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), {
      romsPath: "./roms",
    });

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    expect(existsSync(join(NEW_ROOT, ".migrated"))).toBe(true);
  });

  it("handles undefined romsPath/emulatorsPath as relative (default)", () => {
    // Config with no romsPath/emulatorsPath at all
    writeJson(join(OLD_ROOT, "config", "retro-launcher.json"), {});
    mkdirSync(join(OLD_ROOT, "roms", "nes"), { recursive: true });
    writeFileSync(join(OLD_ROOT, "roms", "nes", "mario.nes"), "data");
    mkdirSync(join(OLD_ROOT, "emulators", "fceux"), { recursive: true });
    writeFileSync(join(OLD_ROOT, "emulators", "fceux", "fceux.exe"), "exe");

    migrateDataIfNeeded(OLD_ROOT, NEW_ROOT);

    expect(existsSync(join(NEW_ROOT, "roms", "nes", "mario.nes"))).toBe(true);
    expect(
      existsSync(join(NEW_ROOT, "emulators", "fceux", "fceux.exe"))
    ).toBe(true);
  });
});
