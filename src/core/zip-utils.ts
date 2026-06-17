/**
 * Minimal, dependency-free ZIP reader for extracting a single entry. Used to
 * pull `openvgdb.sqlite` out of the OpenVGDB release zip without pulling in a
 * third-party unzip library. Handles STORE (0) and DEFLATE (8) entries, which
 * is all a standard zip uses; no ZIP64 (entries here are well under 4 GB).
 */

import { readFileSync, writeFileSync } from "node:fs";
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
