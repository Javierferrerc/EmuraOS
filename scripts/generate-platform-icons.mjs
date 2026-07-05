/**
 * Generate the macOS (.icns) and Linux (.png) app icons from assets/icon.ico.
 *
 * Usage: npm run generate:platform-icons
 *
 * The .icns is assembled by hand: modern icns files are just a container of
 * PNG-encoded images tagged by size (ic07=128, ic08=256, ic09=512,
 * ic10=1024, ic11-ic14 = retina variants), so no mac-only tooling is needed
 * and the script runs on any OS.
 */

import sharp from "sharp";
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "..", "assets");
const icoPath = path.join(assetsDir, "icon.ico");

/** Extract the largest image from a .ico container as a PNG buffer. ICO
 *  entries are either embedded PNGs (returned as-is) or headerless BMPs
 *  (BITMAPINFOHEADER + bottom-up BGRA rows + AND mask) which we decode to
 *  raw RGBA and re-encode with sharp. */
async function largestPngFromIco(buf) {
  const count = buf.readUInt16LE(4);
  let best = null; // { area, data }
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const width = buf[entry] || 256; // 0 means 256
    const height = buf[entry + 1] || 256;
    const size = buf.readUInt32LE(entry + 8);
    const offset = buf.readUInt32LE(entry + 12);
    const area = width * height;
    if (!best || area > best.area) {
      best = { area, width, height, data: buf.subarray(offset, offset + size) };
    }
  }
  if (!best) throw new Error("icon.ico contains no images");

  const { data, width, height } = best;
  const isPng =
    data.length > 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47;
  if (isPng) return Buffer.from(data);

  // Headerless BMP: 40-byte BITMAPINFOHEADER, then pixel rows bottom-up.
  const bitCount = data.readUInt16LE(14);
  if (bitCount !== 32) {
    throw new Error(`largest ICO layer is ${bitCount}bpp — expected 32bpp`);
  }
  const headerSize = data.readUInt32LE(0);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = headerSize + (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = (y * width + x) * 4;
      rgba[d] = data[s + 2]; // R ← BGRA
      rgba[d + 1] = data[s + 1];
      rgba[d + 2] = data[s];
      rgba[d + 3] = data[s + 3];
    }
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/** Pack PNG buffers into an .icns container. */
function buildIcns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const body = Buffer.concat(chunks);
  const fileHeader = Buffer.alloc(8);
  fileHeader.write("icns", 0, "ascii");
  fileHeader.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([fileHeader, body]);
}

const sourcePng = await largestPngFromIco(readFileSync(icoPath));

const resize = (px) =>
  sharp(sourcePng)
    .resize(px, px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

// Linux: single 512px PNG (electron-builder derives the smaller sizes).
const png512 = await resize(512);
writeFileSync(path.join(assetsDir, "icon.png"), png512);
console.log("wrote assets/icon.png (512px)");

// macOS: icns with the standard size ladder.
const [png1024, png256, png128] = await Promise.all([
  resize(1024),
  resize(256),
  resize(128),
]);
const icns = buildIcns([
  { type: "ic07", png: png128 }, // 128
  { type: "ic08", png: png256 }, // 256
  { type: "ic09", png: png512 }, // 512
  { type: "ic10", png: png1024 }, // 1024 (512@2x)
  { type: "ic13", png: png512 }, // 256@2x
  { type: "ic14", png: png1024 }, // 512@2x
]);
writeFileSync(path.join(assetsDir, "icon.icns"), icns);
console.log("wrote assets/icon.icns");
