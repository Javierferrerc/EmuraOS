import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isAllowedAcquisitionUrl,
  flattenSingleRootDir,
  archiveFormatOf,
  resolveGithubAssetUrl,
} from "../../src/core/emulator-acquisition.js";
import { extractZipBufferTo } from "../../src/core/zip-utils.js";
import { isSafeEntryName } from "../../src/core/archive-utils.js";
import emulators from "../../src/data/emulators.json";
import type { EmulatorDefinition } from "../../src/core/types.js";

/** Build a minimal in-memory zip with STORED (uncompressed) entries. */
function buildZip(entries: Array<{ name: string; data: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const dataBuf = Buffer.from(data, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt32LE(dataBuf.length, 18); // compressed size
    local.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    localParts.push(local, nameBuf, dataBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0, 10); // method: stored
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42); // local header offset
    centralParts.push(central, nameBuf);

    offset += 30 + nameBuf.length + dataBuf.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16); // central dir offset

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

describe("isAllowedAcquisitionUrl", () => {
  it("accepts https URLs on allowlisted hosts", () => {
    expect(
      isAllowedAcquisitionUrl(
        "https://github.com/cemu-project/Cemu/releases/download/v2.6/cemu-2.6-windows-x64.zip"
      )
    ).toBe(true);
    expect(
      isAllowedAcquisitionUrl(
        "https://buildbot.libretro.com/stable/whatever.zip"
      )
    ).toBe(true);
  });

  it("accepts the official non-GitHub release hosts", () => {
    expect(
      isAllowedAcquisitionUrl("https://dl.dolphin-emu.org/releases/2512/dolphin-2512-x64.7z")
    ).toBe(true);
    expect(
      isAllowedAcquisitionUrl("https://www.pj64-emu.com/file/project64-3-0-1-5664-2df3434/")
    ).toBe(true);
    expect(
      isAllowedAcquisitionUrl("https://www.carpeludum.com/wp-content/files/Fusion364.zip")
    ).toBe(true);
  });

  it("rejects non-allowlisted hosts, http, and garbage", () => {
    expect(isAllowedAcquisitionUrl("https://evil.example.com/a.zip")).toBe(false);
    expect(isAllowedAcquisitionUrl("http://github.com/a.zip")).toBe(false);
    expect(isAllowedAcquisitionUrl("https://github.com.evil.com/a.zip")).toBe(false);
    expect(isAllowedAcquisitionUrl("not a url")).toBe(false);
    expect(isAllowedAcquisitionUrl("")).toBe(false);
  });
});

describe("emulators.json acquisitions", () => {
  const defs = emulators as EmulatorDefinition[];

  it("every emulator declares how it is obtained, none via Drive", () => {
    for (const def of defs) {
      expect(def.acquisition, def.id).toBeDefined();
      expect(def.acquisition!.provider, def.id).not.toBe("gdrive");
    }
  });

  it("direct downloads point at allowlisted hosts; github ones are well-formed", () => {
    for (const def of defs) {
      const acq = def.acquisition!;
      if (acq.provider === "https" || acq.provider === "github") {
        expect(isAllowedAcquisitionUrl(acq.url ?? ""), def.id).toBe(true);
      }
      if (acq.provider === "github") {
        expect(acq.repo, def.id).toMatch(/^[\w.-]+\/[\w.-]+$/);
        // The pinned fallback must itself match the asset pattern.
        const fallbackName = decodeURIComponent(acq.url!.split("/").pop()!);
        expect(new RegExp(acq.asset!, "i").test(fallbackName), def.id).toBe(true);
      }
      if (acq.provider === "manual") {
        expect(acq.pageUrl, def.id).toMatch(/^https:\/\//);
      }
    }
  });

  it("Azahar replaces Citra and still detects legacy citra-qt installs", () => {
    expect(defs.find((d) => d.id === "citra")).toBeUndefined();
    const azahar = defs.find((d) => d.id === "azahar")!;
    expect(azahar.executable).toBe("azahar.exe");
    expect(azahar.altExecutables).toContain("citra-qt.exe");
    expect(azahar.systems).toEqual(["3ds"]);
  });
});

describe("archiveFormatOf", () => {
  it("infers 7z from the extension and honours an explicit format", () => {
    expect(archiveFormatOf(undefined, "https://x/a.7z")).toBe("7z");
    expect(archiveFormatOf(undefined, "https://x/a.zip")).toBe("zip");
    expect(archiveFormatOf({ provider: "https", archive: "zip" }, "https://x/file/abc/")).toBe("zip");
  });
});

describe("resolveGithubAssetUrl", () => {
  const acq = {
    provider: "github" as const,
    repo: "mgba-emu/mgba",
    asset: "^mGBA-[\\d.]+-win64\\.7z$",
  };
  const fakeFetch = (body: unknown, ok = true) =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it("picks the asset matching the pattern", async () => {
    const url = await resolveGithubAssetUrl(
      acq,
      undefined,
      fakeFetch({
        assets: [
          { name: "mGBA-0.11.0-win64-installer.exe", browser_download_url: "https://github.com/x/installer.exe" },
          { name: "mGBA-0.11.0-win64.7z", browser_download_url: "https://github.com/x/mGBA-0.11.0-win64.7z" },
        ],
      })
    );
    expect(url).toBe("https://github.com/x/mGBA-0.11.0-win64.7z");
  });

  it("returns null on API failure, no match, or a non-allowlisted asset host", async () => {
    expect(await resolveGithubAssetUrl(acq, undefined, fakeFetch({}, false))).toBeNull();
    expect(await resolveGithubAssetUrl(acq, undefined, fakeFetch({ assets: [] }))).toBeNull();
    expect(
      await resolveGithubAssetUrl(
        acq,
        undefined,
        fakeFetch({ assets: [{ name: "mGBA-1.0-win64.7z", browser_download_url: "https://evil.example.com/a.7z" }] })
      )
    ).toBeNull();
  });

  it("refuses malformed repos without calling the API", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;
    expect(await resolveGithubAssetUrl({ ...acq, repo: "../../evil" }, undefined, spy)).toBeNull();
    expect(called).toBe(false);
  });
});

describe("isSafeEntryName", () => {
  it("accepts nested relative entries and rejects traversal/absolute ones", () => {
    const dest = join(tmpdir(), "emura-dest");
    expect(isSafeEntryName("RetroArch-Win64/retroarch.exe", dest)).toBe(true);
    expect(isSafeEntryName("../evil.exe", dest)).toBe(false);
    expect(isSafeEntryName("a/../../evil.exe", dest)).toBe(false);
    expect(isSafeEntryName("C:\\Windows\\evil.exe", dest)).toBe(false);
    expect(isSafeEntryName("/etc/passwd", dest)).toBe(false);
  });
});

describe("extractZipBufferTo", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "emura-zip-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("extracts stored entries preserving subdirectories", () => {
    const zip = buildZip([
      { name: "app.exe", data: "MZ..." },
      { name: "plugins/core.dll", data: "DLL" },
    ]);
    const extracted = extractZipBufferTo(zip, dir);
    expect(extracted.sort()).toEqual(["app.exe", join("plugins", "core.dll")].sort());
    expect(readFileSync(join(dir, "app.exe"), "utf8")).toBe("MZ...");
    expect(readFileSync(join(dir, "plugins", "core.dll"), "utf8")).toBe("DLL");
  });

  it("rejects zip-slip entry names", () => {
    const zip = buildZip([{ name: "../evil.exe", data: "x" }]);
    expect(() => extractZipBufferTo(zip, dir)).toThrow(/unsafe entry path/);
    expect(existsSync(join(dir, "..", "evil.exe"))).toBe(false);
  });

  it("handles backslash separators (Compress-Archive zips like Azahar's)", () => {
    const zip = buildZip([
      { name: "root\\plugins\\", data: "" },
      { name: "root\\plugins\\generic\\a.dll", data: "DLL" },
    ]);
    const extracted = extractZipBufferTo(zip, dir);
    expect(extracted).toEqual([join("root", "plugins", "generic", "a.dll")]);
    expect(readFileSync(join(dir, "root", "plugins", "generic", "a.dll"), "utf8")).toBe("DLL");
  });

  it("rejects backslash zip-slip entry names", () => {
    const zip = buildZip([{ name: "..\\evil.exe", data: "x" }]);
    expect(() => extractZipBufferTo(zip, dir)).toThrow(/unsafe entry path/);
  });

  it("skips directory entries", () => {
    const zip = buildZip([
      { name: "sub/", data: "" },
      { name: "sub/file.txt", data: "hi" },
    ]);
    const extracted = extractZipBufferTo(zip, dir);
    expect(extracted).toEqual([join("sub", "file.txt")]);
  });
});

describe("flattenSingleRootDir", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "emura-flatten-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("hoists a single wrapper folder (Cemu-style zip)", () => {
    mkdirSync(join(dir, "Cemu_2.6", "resources"), { recursive: true });
    writeFileSync(join(dir, "Cemu_2.6", "Cemu.exe"), "exe");
    writeFileSync(join(dir, "Cemu_2.6", "resources", "a.bin"), "bin");
    flattenSingleRootDir(dir, [
      join("Cemu_2.6", "Cemu.exe"),
      join("Cemu_2.6", "resources", "a.bin"),
    ]);
    expect(existsSync(join(dir, "Cemu.exe"))).toBe(true);
    expect(existsSync(join(dir, "resources", "a.bin"))).toBe(true);
    expect(existsSync(join(dir, "Cemu_2.6"))).toBe(false);
  });

  it("leaves flat archives untouched", () => {
    writeFileSync(join(dir, "melonDS.exe"), "exe");
    flattenSingleRootDir(dir, ["melonDS.exe"]);
    expect(existsSync(join(dir, "melonDS.exe"))).toBe(true);
  });

  it("leaves multi-root archives untouched", () => {
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "app.exe"), "exe");
    writeFileSync(join(dir, "assets", "a.bin"), "bin");
    flattenSingleRootDir(dir, ["app.exe", join("assets", "a.bin")]);
    expect(existsSync(join(dir, "app.exe"))).toBe(true);
    expect(existsSync(join(dir, "assets", "a.bin"))).toBe(true);
  });
});
