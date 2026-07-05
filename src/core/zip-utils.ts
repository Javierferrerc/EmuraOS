/**
 * Minimal, dependency-free ZIP reader for extracting a single entry. Used to
 * pull `openvgdb.sqlite` out of the OpenVGDB release zip without pulling in a
 * third-party unzip library. Handles STORE (0) and DEFLATE (8) entries, which
 * is all a standard zip uses; no ZIP64 (entries here are well under 4 GB).
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve, sep, isAbsolute, normalize } from "node:path";
import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/**
 * Extract one named entry from a zip file and write it to `outPath`.
 * Returns true on success, false if the entry wasn't found.
 */
export function extractFileFromZip(zipPath: string, entryName: string, outPath: string): boolean {
  const buf = readFileSync(zipPath);

  // Locate the End Of Central Directory record by scanning backwards.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: EOCD not found");

  const cdOffset = buf.readUInt32LE(eocd + 16);
  const totalEntries = buf.readUInt16LE(eocd + 10);

  let p = cdOffset;
  for (let n = 0; n < totalEntries; n++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break;
    const compMethod = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    if (name === entryName) {
      // Jump to the local file header to find where the data actually starts
      // (its name/extra lengths can differ from the central directory copy).
      if (buf.readUInt32LE(localOffset) !== LOC_SIG) throw new Error("zip: bad local header");
      const locNameLen = buf.readUInt16LE(localOffset + 26);
      const locExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + locNameLen + locExtraLen;
      const compData = buf.subarray(dataStart, dataStart + compSize);
      const out = compMethod === 0 ? compData : inflateRawSync(compData);
      writeFileSync(outPath, out);
      return true;
    }

    p += 46 + nameLen + extraLen + commentLen;
  }
  return false;
}

/**
 * Extract EVERY entry of a zip buffer under `destDir`. Zip-slip safe: any
 * entry whose resolved path would escape `destDir` throws. On POSIX the
 * unix mode bits stored in the central directory (external attributes) are
 * honoured for the execute bit, so .app binaries and Linux executables
 * extracted from official release zips stay runnable.
 *
 * Returns the list of extracted entry names (directories excluded).
 */
export function extractZipBufferTo(buf: Buffer, destDir: string): string[] {
  // Locate the End Of Central Directory record by scanning backwards.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: EOCD not found");

  const cdOffset = buf.readUInt32LE(eocd + 16);
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const destResolved = resolve(destDir);
  const extracted: string[] = [];

  let p = cdOffset;
  for (let n = 0; n < totalEntries; n++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break;
    const compMethod = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttrs = buf.readUInt32LE(p + 38);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    // Directory entries end with "/" — created implicitly via mkdirSync.
    if (name.endsWith("/")) continue;

    // Zip-slip guard: refuse absolute names and any resolved path outside
    // destDir. Entry names are attacker-influenced (remote archive).
    const cleaned = normalize(name).replace(/^([/\\])+/, "");
    const outPath = resolve(destResolved, cleaned);
    if (
      isAbsolute(name) ||
      (outPath !== destResolved && !outPath.startsWith(destResolved + sep))
    ) {
      throw new Error(`zip: unsafe entry path rejected: ${name}`);
    }

    if (buf.readUInt32LE(localOffset) !== LOC_SIG) {
      throw new Error("zip: bad local header");
    }
    const locNameLen = buf.readUInt16LE(localOffset + 26);
    const locExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + locNameLen + locExtraLen;
    const compData = buf.subarray(dataStart, dataStart + compSize);
    const out = compMethod === 0 ? compData : inflateRawSync(compData);

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, out);

    // Unix mode lives in the high 16 bits of the external attributes when
    // the archive was produced on a unix host. Preserve the execute bit.
    if (process.platform !== "win32") {
      const unixMode = (externalAttrs >>> 16) & 0o7777;
      if (unixMode & 0o111) {
        try {
          chmodSync(outPath, unixMode);
        } catch {
          // Best effort — extraction already succeeded.
        }
      }
    }

    extracted.push(cleaned);
  }

  return extracted;
}
