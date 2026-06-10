import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * RetroAchievements-compatible ROM hashing.
 *
 * RA identifies a game by hashing the ROM with a console-specific method
 * (the same rules the rcheevos C library uses) and looking the resulting
 * MD5 up in its database. We implement the cartridge-based methods here —
 * those are pure byte operations on a single file:
 *
 *   - full-md5 : MD5 of the entire file (GB/GBC/GBA, Mega Drive, Master System)
 *   - nes      : if the file starts with the iNES magic `NES\x1a`, drop the
 *                16-byte header first, then MD5 the rest
 *   - snes     : if the file size is exactly 512 bytes past a multiple of
 *                8 KB, drop the 512-byte copier header first, then MD5
 *   - n64      : normalize byte order to big-endian (.z64) then MD5; .v64
 *                (byteswapped) and .n64 (little-endian) dumps hash as their
 *                big-endian counterpart
 *
 * Disc-based systems (PSX/PS2/PSP/GameCube/Wii/Dreamcast) use far more
 * involved methods (parsing SYSTEM.CNF, hashing a specific executable, etc.)
 * and are intentionally left as `hashMethod: null` in
 * retroachievements-systems.json — callers get `null` and surface a
 * "not hashable yet" hint rather than a wrong hash.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

export type HashMethod = "full-md5" | "nes" | "snes" | "n64";

interface RaSystemEntry {
  consoleId: number;
  hashMethod: HashMethod | null;
}

let systemsCache: Record<string, RaSystemEntry> | null = null;

function loadSystems(): Record<string, RaSystemEntry> {
  if (systemsCache) return systemsCache;
  // Resolve relative to the compiled module so it works from dist/ too.
  const dataPath = join(__dirname, "..", "data", "retroachievements-systems.json");
  const raw = JSON.parse(readFileSync(dataPath, "utf-8")) as Record<string, unknown>;
  const out: Record<string, RaSystemEntry> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue; // skip the _comment field
    out[key] = value as RaSystemEntry;
  }
  systemsCache = out;
  return out;
}

/** RA numeric console id for a launcher systemId, or null if RA doesn't
 *  support that system. */
export function consoleIdForSystem(systemId: string): number | null {
  return loadSystems()[systemId]?.consoleId ?? null;
}

/** The hash method for a system, or null when local hashing isn't
 *  implemented (disc systems) or the system is unsupported. */
export function hashMethodForSystem(systemId: string): HashMethod | null {
  return loadSystems()[systemId]?.hashMethod ?? null;
}

function md5(buf: Buffer | Uint8Array): string {
  return createHash("md5").update(buf).digest("hex");
}

const INES_MAGIC = Buffer.from([0x4e, 0x45, 0x53, 0x1a]); // "NES\x1a"

/** NES: drop the 16-byte iNES header when the magic is present. */
export function hashNes(buf: Buffer): string {
  if (buf.length >= 16 && buf.subarray(0, 4).equals(INES_MAGIC)) {
    return md5(buf.subarray(16));
  }
  return md5(buf);
}

/** SNES: drop a 512-byte copier header when the size is 512 past a multiple
 *  of 8 KB (8192 bytes). */
export function hashSnes(buf: Buffer): string {
  if (buf.length > 512 && buf.length % 8192 === 512) {
    return md5(buf.subarray(512));
  }
  return md5(buf);
}

/** N64: normalize to big-endian (.z64) byte order before hashing. The dump
 *  format is detected from the 4-byte magic:
 *    z64 (big-endian)      80 37 12 40  → hash as-is
 *    v64 (byteswapped, 16) 37 80 40 12  → swap every 2 bytes
 *    n64 (little-endian)   40 12 37 80  → reverse every 4 bytes
 */
export function hashN64(buf: Buffer): string {
  if (buf.length < 4) return md5(buf);
  const b0 = buf[0];
  const b1 = buf[1];
  if (b0 === 0x80 && b1 === 0x37) {
    return md5(buf); // already z64
  }
  if (b0 === 0x37 && b1 === 0x80) {
    return md5(swap16(buf)); // v64 → z64
  }
  if (b0 === 0x40 && b1 === 0x12) {
    return md5(swap32(buf)); // n64 → z64
  }
  // Unknown magic — hash as-is rather than corrupt it.
  return md5(buf);
}

/** Swap each adjacent byte pair (16-bit byteswap). Operates on a copy. */
function swap16(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  for (let i = 0; i + 1 < out.length; i += 2) {
    const t = out[i];
    out[i] = out[i + 1];
    out[i + 1] = t;
  }
  return out;
}

/** Reverse each 4-byte group (32-bit little-endian → big-endian). Copy. */
function swap32(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  for (let i = 0; i + 3 < out.length; i += 4) {
    const a = out[i];
    const b = out[i + 1];
    out[i] = out[i + 3];
    out[i + 1] = out[i + 2];
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return out;
}

/** Apply a hash method to an in-memory buffer. Exposed for unit testing
 *  without touching the filesystem. */
export function hashBuffer(buf: Buffer, method: HashMethod): string {
  switch (method) {
    case "full-md5":
      return md5(buf);
    case "nes":
      return hashNes(buf);
    case "snes":
      return hashSnes(buf);
    case "n64":
      return hashN64(buf);
  }
}

/**
 * Compute the RetroAchievements hash for a ROM file. Returns null when the
 * system has no local hash method (disc-based / unsupported) or the file
 * can't be read. Reads the whole file into memory — fine for cartridge
 * ROMs (a few MB at most); the disc systems that would be large are exactly
 * the ones we skip.
 */
export function hashRomFile(filePath: string, systemId: string): string | null {
  const method = hashMethodForSystem(systemId);
  if (!method) return null;
  try {
    const buf = readFileSync(filePath);
    return hashBuffer(buf, method);
  } catch {
    return null;
  }
}
