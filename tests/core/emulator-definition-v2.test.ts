import { describe, it, expect } from "vitest";
import {
  normalizeEmulatorDefinition,
  FLATPAK_PREFIX,
  isFlatpakRef,
  flatpakAppId,
} from "../../src/core/emulator-mapper.js";
import { isAllowedAcquisitionUrl } from "../../src/core/emulator-acquisition.js";
import type { EmulatorDefinitionSource } from "../../src/core/types.js";

const V2_SOURCE: EmulatorDefinitionSource = {
  id: "retroarch",
  name: "RetroArch",
  executable: {
    win32: "retroarch.exe",
    darwin: "RetroArch.app/Contents/MacOS/RetroArch",
    linux: "retroarch",
  },
  defaultPaths: {
    win32: ["C:\\RetroArch-Win64"],
    darwin: ["/Applications", "~/Applications"],
    linux: ["/usr/bin", "~/.local/bin"],
  },
  systems: ["nes"],
  launchTemplate: '"{executable}" -L "{args}" "{romPath}"',
  args: {
    win32: { nes: "cores\\fceumm_libretro.dll" },
    linux: { nes: "fceumm_libretro.so" },
  },
  defaultArgs: "",
  coreUrls: {
    win32: { "cores\\fceumm_libretro.dll": "https://buildbot.libretro.com/x.zip" },
    linux: { "fceumm_libretro.so": "{buildbot}/fceumm_libretro.so.zip" },
  },
  acquisition: {
    win32: { provider: "gdrive" },
    linux: { provider: "flatpak", appId: "org.libretro.RetroArch" },
  },
};

const LEGACY_SOURCE: EmulatorDefinitionSource = {
  id: "snes9x",
  name: "Snes9x",
  executable: "snes9x-x64.exe",
  defaultPaths: ["C:\\Snes9x"],
  systems: ["snes"],
  launchTemplate: '"{executable}" "{romPath}"',
  args: {},
  defaultArgs: "",
};

describe("normalizeEmulatorDefinition (emulators.json v2)", () => {
  it("flattens per-platform records for the requested platform", () => {
    const win = normalizeEmulatorDefinition(V2_SOURCE, "win32");
    expect(win?.executable).toBe("retroarch.exe");
    expect(win?.defaultPaths).toEqual(["C:\\RetroArch-Win64"]);
    expect(win?.args).toEqual({ nes: "cores\\fceumm_libretro.dll" });
    expect(win?.acquisition).toEqual({ provider: "gdrive" });

    const linux = normalizeEmulatorDefinition(V2_SOURCE, "linux", "/home/u");
    expect(linux?.executable).toBe("retroarch");
    expect(linux?.args).toEqual({ nes: "fceumm_libretro.so" });
    expect(linux?.acquisition).toEqual({
      provider: "flatpak",
      appId: "org.libretro.RetroArch",
    });
  });

  it("expands ~ in defaultPaths using the provided home", () => {
    const linux = normalizeEmulatorDefinition(V2_SOURCE, "linux", "/home/u");
    expect(linux?.defaultPaths).toContain("/home/u/.local/bin");

    const mac = normalizeEmulatorDefinition(V2_SOURCE, "darwin", "/Users/u");
    expect(mac?.defaultPaths).toContain("/Users/u/Applications");
  });

  it("returns null when the platform has no executable (Windows-only emulator)", () => {
    const winOnly: EmulatorDefinitionSource = {
      ...LEGACY_SOURCE,
      id: "project64",
      executable: { win32: "Project64.exe" },
      defaultPaths: { win32: ["C:\\Program Files\\Project64"] },
    };
    expect(normalizeEmulatorDefinition(winOnly, "linux")).toBeNull();
    expect(normalizeEmulatorDefinition(winOnly, "darwin")).toBeNull();
    expect(normalizeEmulatorDefinition(winOnly, "win32")).not.toBeNull();
  });

  it("keeps legacy plain-shape entries working on every platform", () => {
    const win = normalizeEmulatorDefinition(LEGACY_SOURCE, "win32");
    expect(win?.executable).toBe("snes9x-x64.exe");
    expect(win?.defaultPaths).toEqual(["C:\\Snes9x"]);
    // Plain strings/arrays apply everywhere (backward compatible).
    const linux = normalizeEmulatorDefinition(LEGACY_SOURCE, "linux");
    expect(linux?.executable).toBe("snes9x-x64.exe");
  });
});

describe("flatpak sentinel", () => {
  it("round-trips app ids through the sentinel", () => {
    const ref = FLATPAK_PREFIX + "org.DolphinEmu.dolphin-emu";
    expect(isFlatpakRef(ref)).toBe(true);
    expect(flatpakAppId(ref)).toBe("org.DolphinEmu.dolphin-emu");
    expect(isFlatpakRef("C:\\Dolphin\\Dolphin.exe")).toBe(false);
    expect(isFlatpakRef("/usr/bin/dolphin-emu")).toBe(false);
  });
});

describe("acquisition URL allowlist", () => {
  it("accepts only https URLs on known release hosts", () => {
    expect(
      isAllowedAcquisitionUrl("https://github.com/owner/repo/releases/x.zip")
    ).toBe(true);
    expect(
      isAllowedAcquisitionUrl(
        "https://buildbot.libretro.com/nightly/linux/x86_64/latest/x.zip"
      )
    ).toBe(true);
    expect(isAllowedAcquisitionUrl("http://github.com/x.zip")).toBe(false);
    expect(isAllowedAcquisitionUrl("https://evil.example.com/x.zip")).toBe(false);
    expect(isAllowedAcquisitionUrl("not a url")).toBe(false);
  });
});
