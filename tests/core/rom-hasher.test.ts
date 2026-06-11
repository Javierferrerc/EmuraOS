import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  hashBuffer,
  hashNes,
  hashSnes,
  hashN64,
  hashRomFile,
  consoleIdForSystem,
  hashMethodForSystem,
} from "../../src/core/rom-hasher.js";

const TEST_DIR = resolve(import.meta.dirname, "__test_rom_hasher__");

/** Reference MD5 computed independently of the module under test. */
function md5(buf: Buffer): string {
  return createHash("md5").update(buf).digest("hex");
}

describe("rom-hasher", () => {
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("system mapping", () => {
    it("maps known systems to RA console ids", () => {
      expect(consoleIdForSystem("nes")).toBe(7);
      expect(consoleIdForSystem("snes")).toBe(3);
      expect(consoleIdForSystem("megadrive")).toBe(1);
      expect(consoleIdForSystem("psx")).toBe(12);
    });

    it("returns null for systems RA doesn't support", () => {
      expect(consoleIdForSystem("switch")).toBeNull();
      expect(consoleIdForSystem("wiiu")).toBeNull();
      expect(consoleIdForSystem("ps3")).toBeNull();
    });

    it("exposes hash methods, null for disc systems", () => {
      expect(hashMethodForSystem("gb")).toBe("full-md5");
      expect(hashMethodForSystem("nes")).toBe("nes");
      expect(hashMethodForSystem("n64")).toBe("n64");
      expect(hashMethodForSystem("psx")).toBeNull(); // disc, not implemented
      expect(hashMethodForSystem("switch")).toBeNull(); // unsupported
    });
  });

  describe("full-md5", () => {
    it("hashes the whole buffer", () => {
      const buf = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(hashBuffer(buf, "full-md5")).toBe(md5(buf));
    });
  });

  describe("nes", () => {
    it("strips the 16-byte iNES header when the magic is present", () => {
      const header = Buffer.concat([
        Buffer.from([0x4e, 0x45, 0x53, 0x1a]), // "NES\x1a"
        Buffer.alloc(12),
      ]);
      const body = Buffer.from(new Array(64).fill(0xab));
      const rom = Buffer.concat([header, body]);
      expect(hashNes(rom)).toBe(md5(body));
    });

    it("hashes the whole file when no iNES magic", () => {
      const rom = Buffer.from(new Array(64).fill(0xcd));
      expect(hashNes(rom)).toBe(md5(rom));
    });
  });

  describe("snes", () => {
    it("strips a 512-byte copier header when size is 512 past an 8KB multiple", () => {
      const header = Buffer.alloc(512, 0x11);
      const body = Buffer.alloc(8192, 0x22); // 8 KB body → total 8704 = 8192+512
      const rom = Buffer.concat([header, body]);
      expect(rom.length % 8192).toBe(512);
      expect(hashSnes(rom)).toBe(md5(body));
    });

    it("hashes the whole file when there's no copier header", () => {
      const rom = Buffer.alloc(8192, 0x33); // exact 8KB multiple → no header
      expect(hashSnes(rom)).toBe(md5(rom));
    });
  });

  describe("n64", () => {
    // Build a tiny 8-byte ROM in each byte order whose big-endian form is
    // a known sequence, and assert all three normalize to the same hash.
    const z64 = Buffer.from([0x80, 0x37, 0x12, 0x40, 0xde, 0xad, 0xbe, 0xef]);
    const expected = md5(z64);

    it("hashes a z64 (big-endian) dump as-is", () => {
      expect(hashN64(z64)).toBe(expected);
    });

    it("normalizes a v64 (byteswapped) dump to z64", () => {
      const v64 = Buffer.from([0x37, 0x80, 0x40, 0x12, 0xad, 0xde, 0xef, 0xbe]);
      expect(hashN64(v64)).toBe(expected);
    });

    it("normalizes an n64 (little-endian) dump to z64", () => {
      const n64 = Buffer.from([0x40, 0x12, 0x37, 0x80, 0xef, 0xbe, 0xad, 0xde]);
      expect(hashN64(n64)).toBe(expected);
    });
  });

  describe("hashRomFile", () => {
    it("hashes a cartridge ROM from disk", () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const rom = Buffer.from(new Array(128).fill(0x5a));
      const p = join(TEST_DIR, "game.gb");
      writeFileSync(p, rom);
      expect(hashRomFile(p, "gb")).toBe(md5(rom));
    });

    it("returns null for disc systems (no local hash method)", () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const p = join(TEST_DIR, "game.chd");
      writeFileSync(p, Buffer.alloc(16));
      expect(hashRomFile(p, "psx")).toBeNull();
    });

    it("returns null when the file can't be read", () => {
      expect(hashRomFile(join(TEST_DIR, "nope.gb"), "gb")).toBeNull();
    });
  });
});
