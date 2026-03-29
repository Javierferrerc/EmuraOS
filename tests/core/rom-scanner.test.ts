import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { RomScanner } from "../../src/core/rom-scanner.js";
import { SystemsRegistry } from "../../src/core/systems-registry.js";

const TEST_ROMS_DIR = resolve(import.meta.dirname, "__test_roms__");

describe("RomScanner", () => {
  let registry: SystemsRegistry;
  let scanner: RomScanner;

  beforeEach(() => {
    registry = new SystemsRegistry();
    scanner = new RomScanner(registry);

    // Create test ROM directories and dummy files
    mkdirSync(resolve(TEST_ROMS_DIR, "nes"), { recursive: true });
    mkdirSync(resolve(TEST_ROMS_DIR, "snes"), { recursive: true });
    mkdirSync(resolve(TEST_ROMS_DIR, "gba"), { recursive: true });

    writeFileSync(resolve(TEST_ROMS_DIR, "nes", "Super Mario Bros.nes"), "fake-rom-data");
    writeFileSync(resolve(TEST_ROMS_DIR, "nes", "Zelda.nes"), "fake-rom-data-2");
    writeFileSync(resolve(TEST_ROMS_DIR, "snes", "Super Mario World.sfc"), "fake-snes-rom");
    writeFileSync(resolve(TEST_ROMS_DIR, "nes", "readme.txt"), "not a rom");
  });

  afterEach(() => {
    rmSync(TEST_ROMS_DIR, { recursive: true, force: true });
  });

  it("should detect ROMs in system folders", () => {
    const result = scanner.scan(TEST_ROMS_DIR);

    expect(result.totalRoms).toBe(3);
    expect(result.systems).toHaveLength(2);
  });

  it("should group ROMs by system", () => {
    const result = scanner.scan(TEST_ROMS_DIR);

    const nes = result.systems.find((s) => s.systemId === "nes");
    const snes = result.systems.find((s) => s.systemId === "snes");

    expect(nes).toBeDefined();
    expect(nes!.roms).toHaveLength(2);
    expect(snes).toBeDefined();
    expect(snes!.roms).toHaveLength(1);
  });

  it("should ignore files with non-matching extensions", () => {
    const result = scanner.scan(TEST_ROMS_DIR);
    const nes = result.systems.find((s) => s.systemId === "nes");

    const filenames = nes!.roms.map((r) => r.fileName);
    expect(filenames).not.toContain("readme.txt");
  });

  it("should skip empty system directories", () => {
    const result = scanner.scan(TEST_ROMS_DIR);
    const gba = result.systems.find((s) => s.systemId === "gba");

    expect(gba).toBeUndefined();
  });

  it("should handle non-existent roms path gracefully", () => {
    const result = scanner.scan("/non/existent/path");

    expect(result.totalRoms).toBe(0);
    expect(result.systems).toHaveLength(0);
  });

  it("should include correct file metadata", () => {
    const result = scanner.scan(TEST_ROMS_DIR);
    const nes = result.systems.find((s) => s.systemId === "nes");
    const mario = nes!.roms.find((r) => r.fileName === "Super Mario Bros.nes");

    expect(mario).toBeDefined();
    expect(mario!.systemId).toBe("nes");
    expect(mario!.systemName).toBe("Nintendo Entertainment System");
    expect(mario!.sizeBytes).toBeGreaterThan(0);
    expect(mario!.filePath).toContain("Super Mario Bros.nes");
  });
});
