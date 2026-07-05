import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  getPlatform,
  isWindows,
  isMac,
  isLinux,
  appDataDir,
  userDataDir,
  documentsDir,
  resolveConfigTokens,
  normalizePathForCompare,
  pathsEqual,
  toNativePath,
  forPlatform,
  executableExtension,
  libretroCoreExtension,
  libretroBuildbotBase,
} from "../../src/core/platform.js";

describe("platform", () => {
  describe("getPlatform / predicates", () => {
    it("passes through the three supported platforms", () => {
      expect(getPlatform("win32")).toBe("win32");
      expect(getPlatform("darwin")).toBe("darwin");
      expect(getPlatform("linux")).toBe("linux");
    });

    it("treats exotic platforms as linux (POSIX semantics)", () => {
      expect(getPlatform("freebsd" as NodeJS.Platform)).toBe("linux");
    });

    it("predicates match their platform", () => {
      expect(isWindows("win32")).toBe(true);
      expect(isWindows("darwin")).toBe(false);
      expect(isMac("darwin")).toBe(true);
      expect(isLinux("linux")).toBe(true);
      expect(isLinux("win32")).toBe(false);
    });
  });

  describe("well-known directories", () => {
    const HOME = "/home/user";
    const MAC_HOME = "/Users/user";

    it("appDataDir per platform", () => {
      expect(appDataDir("win32", { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "C:\\Users\\u")).toBe(
        "C:\\Users\\u\\AppData\\Roaming"
      );
      expect(appDataDir("darwin", {}, MAC_HOME)).toBe(
        path.join(MAC_HOME, "Library", "Application Support")
      );
      expect(appDataDir("linux", {}, HOME)).toBe(path.join(HOME, ".config"));
      expect(appDataDir("linux", { XDG_CONFIG_HOME: "/xdg/config" }, HOME)).toBe(
        "/xdg/config"
      );
    });

    it("appDataDir falls back to home-derived path when APPDATA is unset", () => {
      expect(appDataDir("win32", {}, "C:\\Users\\u")).toBe(
        path.join("C:\\Users\\u", "AppData", "Roaming")
      );
    });

    it("userDataDir only differs on linux", () => {
      expect(userDataDir("linux", {}, HOME)).toBe(
        path.join(HOME, ".local", "share")
      );
      expect(userDataDir("linux", { XDG_DATA_HOME: "/xdg/data" }, HOME)).toBe(
        "/xdg/data"
      );
      expect(userDataDir("darwin", {}, MAC_HOME)).toBe(
        appDataDir("darwin", {}, MAC_HOME)
      );
    });

    it("documentsDir per platform", () => {
      expect(
        documentsDir("win32", { USERPROFILE: "C:\\Users\\u" }, "C:\\Users\\u")
      ).toBe(path.join("C:\\Users\\u", "Documents"));
      expect(documentsDir("linux", {}, HOME)).toBe(path.join(HOME, "Documents"));
    });
  });

  describe("resolveConfigTokens", () => {
    it("expands emuDir, appdata, docs and home", () => {
      const resolved = resolveConfigTokens(
        "{appdata}/RetroArch/retroarch.cfg",
        { platform: "linux", env: {}, home: "/home/user" }
      );
      expect(resolved).toBe(
        path.join("/home/user", ".config") + "/RetroArch/retroarch.cfg"
      );

      expect(
        resolveConfigTokens("{emuDir}/settings.xml", { emuDir: "/opt/cemu" })
      ).toBe("/opt/cemu/settings.xml");

      expect(
        resolveConfigTokens("{home}/.var/app/x", {
          platform: "linux",
          env: {},
          home: "/home/user",
        })
      ).toBe("/home/user/.var/app/x");
    });
  });

  describe("path comparison", () => {
    it("is case-insensitive on Windows only", () => {
      expect(pathsEqual("C:\\Roms\\Game.NES", "c:\\roms\\game.nes", "win32")).toBe(
        true
      );
      expect(pathsEqual("/roms/Game.NES", "/roms/game.nes", "linux")).toBe(false);
    });

    it("normalizePathForCompare keeps case on POSIX", () => {
      expect(normalizePathForCompare("/Roms/A", "linux")).toBe(
        path.resolve("/Roms/A")
      );
    });
  });

  describe("toNativePath", () => {
    it("uses backslashes only on Windows", () => {
      expect(toNativePath("C:/games/roms", "win32")).toBe("C:\\games\\roms");
      // On POSIX the path is resolved as-is (forward slashes preserved).
      expect(toNativePath("/games/roms", "linux")).toBe(path.resolve("/games/roms"));
    });
  });

  describe("forPlatform", () => {
    it("returns plain values verbatim (legacy shape)", () => {
      expect(forPlatform("retroarch.exe", "linux")).toBe("retroarch.exe");
      expect(forPlatform(["a", "b"], "darwin")).toEqual(["a", "b"]);
    });

    it("picks the platform entry from a record", () => {
      const value = { win32: "a.exe", linux: "a" };
      expect(forPlatform(value, "win32")).toBe("a.exe");
      expect(forPlatform(value, "linux")).toBe("a");
      expect(forPlatform(value, "darwin")).toBeUndefined();
    });

    it("returns undefined for undefined input", () => {
      expect(forPlatform(undefined, "win32")).toBeUndefined();
    });
  });

  describe("libretro helpers", () => {
    it("executable and core extensions per platform", () => {
      expect(executableExtension("win32")).toBe(".exe");
      expect(executableExtension("linux")).toBe("");
      expect(libretroCoreExtension("win32")).toBe(".dll");
      expect(libretroCoreExtension("darwin")).toBe(".dylib");
      expect(libretroCoreExtension("linux")).toBe(".so");
    });

    it("buildbot base per platform/arch", () => {
      expect(libretroBuildbotBase("win32", "x64")).toContain("windows/x86_64");
      expect(libretroBuildbotBase("darwin", "arm64")).toContain("apple/osx/arm64");
      expect(libretroBuildbotBase("darwin", "x64")).toContain("apple/osx/x86_64");
      expect(libretroBuildbotBase("linux", "x64")).toContain("linux/x86_64");
    });
  });
});
