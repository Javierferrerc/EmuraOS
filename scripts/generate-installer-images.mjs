/**
 * Generate branded BMP images for the NSIS installer.
 *
 * Sidebar:  164 x 314  (welcome & finish pages)
 * Header:   150 x 57   (directory / options pages)
 *
 * Uses the EmuraOS colour palette and embeds the circle-icon from the logo SVG.
 */

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "assets", "installer");

// ── Brand palette ──────────────────────────────────────────────────────
const BG_TOP = "#111238";
const BG_BOTTOM = "#070816";
const ACCENT = "#0A61E3";

// ── Circle-icon SVG (extracted from logo-emura.svg) ────────────────────
const circleSvg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 106 124" fill="none"
     xmlns="http://www.w3.org/2000/svg">
  <circle cx="53" cy="62" r="53" fill="${ACCENT}"/>
  <path d="M78.918 78.8675C80.3297 78.8675 81.5155 79.3735 82.4754 80.3855
    C83.4918 81.3414 84 82.5221 84 83.9277C84 85.2771 83.52 86.4859
    82.5601 87.5542C79.9627 90.3092 76.3206 92.5863 71.6339 94.3855
    C66.9472 96.1285 62.2887 97 57.6585 97C50.939 97 44.8689 95.5381
    39.4481 92.6145C34.0273 89.6908 29.7641 85.5863 26.6585 80.3012
    C23.5528 75.0161 22 68.9438 22 62.0843C22 55.2811 23.5528 49.2088
    26.6585 43.8675C29.7641 38.5261 34.0273 34.3936 39.4481 31.4699
    C44.8689 28.49 50.939 27 57.6585 27C62.2887 27 66.9189 27.9277
    71.5492 29.7831C76.1794 31.6386 79.8215 34.0843 82.4754 37.1205
    C83.4353 38.245 83.9153 39.4538 83.9153 40.747C83.9153 42.1526
    83.4071 43.3614 82.3907 44.3735C81.3743 45.3293 80.1603 45.8072
    78.7486 45.8072C78.071 45.8072 77.3934 45.6667 76.7158 45.3855
    C76.0383 45.1044 75.5018 44.7108 75.1066 44.2048C73.469 42.2369
    71.041 40.6908 67.8224 39.5663C64.6038 38.4418 61.2158 37.8795
    57.6585 37.8795C51.3907 37.8795 46.1111 39.4538 41.8197 42.6024
    C35.269 47.3857 41.2908 55.6747 49.402 55.6747H60.0301
    C61.4417 55.6747 62.6275 56.1807 63.5874 57.1928C64.6038 58.1486
    65.112 59.3293 65.112 60.7349C65.112 62.1406 64.6038 63.3494
    63.5874 64.3614C62.6275 65.3173 61.4417 65.7952 60.0301 65.7952
    H50.4953C41.2721 65.7952 33.7901 74.9176 40.888 80.8072
    C45.3488 84.4056 50.939 86.2048 57.6585 86.2048C61.5546 86.2048
    65.112 85.6988 68.3306 84.6867C71.5492 83.6747 73.8078 82.3534
    75.1066 80.7229C75.5583 80.1606 76.123 79.7108 76.8005 79.3735
    C77.5346 79.0361 78.2404 78.8675 78.918 78.8675Z"
    fill="white" fill-opacity="0.2"/>
  <path d="M78.1803 81.2771C79.7969 81.2771 81.1548 81.8554 82.2541 83.012
    C83.418 84.1044 84 85.4538 84 87.0602C84 88.6024 83.4504 89.9839
    82.3511 91.2048C79.3766 94.3534 75.2058 96.9558 69.8388 99.012
    C64.4718 101.004 59.1371 102 53.8347 102C46.1398 102 39.1885 100.329
    32.9809 96.9879C26.7732 93.6466 21.8912 88.9558 18.3347 82.9157
    C14.7782 76.8755 13 69.9357 13 62.0964C13 54.3213 14.7782 47.3815
    18.3347 41.2771C21.8912 35.1727 26.7732 30.4498 32.9809 27.1084
    C39.1885 23.7028 46.1398 22 53.8347 22C59.1371 22 64.4394 23.0602
    69.7418 25.1807C75.0442 27.3012 79.2149 30.0964 82.2541 33.5663
    C83.3534 34.8514 83.903 36.2329 83.903 37.7108C83.903 39.3173
    83.321 40.6988 82.1571 41.8554C80.9932 42.9478 79.6029 43.494
    77.9863 43.494C77.2104 43.494 76.4344 43.3333 75.6585 43.012
    C74.8825 42.6908 74.2682 42.241 73.8156 41.6626C71.9403 39.4137
    69.1598 37.6466 65.474 36.3614C61.7882 35.0763 57.9085 34.4337
    53.8347 34.4337C46.6571 34.4337 40.6111 36.2329 35.6967 39.8313
    C28.2016 45.2932 35.0802 54.7711 44.3543 54.7711H56.5505
    C58.1671 54.7711 59.525 55.3494 60.6243 56.506C61.7882 57.5984
    62.3702 58.9478 62.3702 60.5542C62.3702 62.1606 61.7882 63.5422
    60.6243 64.6988C59.525 65.7912 58.1671 66.3373 56.5505 66.3373
    H45.6013C35.0563 66.3373 26.508 76.7683 34.6298 83.494
    C39.7382 87.6064 46.1398 89.6626 53.8347 89.6626C58.2964 89.6626
    62.3702 89.0843 66.056 87.9277C69.7418 86.7711 72.3283 85.261
    73.8156 83.3976C74.3329 82.755 74.9795 82.241 75.7555 81.8554
    C76.5961 81.4699 77.4044 81.2771 78.1803 81.2771Z"
    fill="white"/>
</svg>`;

// ── Helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function lerpColor(c1, c2, t) {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
  };
}

/** Create a vertical-gradient RGBA buffer. */
function gradient(w, h, topHex, bottomHex) {
  const top = hexToRgb(topHex);
  const bot = hexToRgb(bottomHex);
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const c = lerpColor(top, bot, y / (h - 1));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      buf[i] = c.r;
      buf[i + 1] = c.g;
      buf[i + 2] = c.b;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

/** Write a 24-bit BMP from an RGBA buffer (top-to-bottom). */
function writeBmp(filePath, w, h, rgba) {
  const rowBytes = w * 3;
  const rowPad = (4 - (rowBytes % 4)) % 4;
  const rowSize = rowBytes + rowPad;
  const dataSize = rowSize * h;
  const fileSize = 54 + dataSize;
  const buf = Buffer.alloc(fileSize);

  // File header
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);

  // DIB header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(dataSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);

  // Pixel data — BMP stores rows bottom-to-top, BGR
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < w; x++) {
      const si = srcRow + x * 4;
      const di = dstRow + x * 3;
      buf[di] = rgba[si + 2];     // B
      buf[di + 1] = rgba[si + 1]; // G
      buf[di + 2] = rgba[si];     // R
    }
  }

  writeFileSync(filePath, buf);
}

// ── Sidebar (164 x 314) ───────────────────────────────────────────────

async function generateSidebar() {
  const W = 164, H = 314;
  const STRIP = 4; // accent strip width
  const accentRgb = hexToRgb(ACCENT);

  // 1. Base gradient
  const raw = gradient(W, H, BG_TOP, BG_BOTTOM);

  // Paint accent strip on the left edge
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < STRIP; x++) {
      const i = (y * W + x) * 4;
      raw[i] = accentRgb.r;
      raw[i + 1] = accentRgb.g;
      raw[i + 2] = accentRgb.b;
    }
  }

  // 2. Render the circle icon SVG
  const iconSize = 80;
  const iconPng = await sharp(Buffer.from(circleSvg(iconSize)))
    .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // 3. Composite icon onto the gradient
  const result = await sharp(raw, { raw: { width: W, height: H, channels: 4 } })
    .composite([
      {
        input: iconPng,
        left: Math.round((W - iconSize) / 2),
        top: Math.round(H * 0.35 - iconSize / 2),
      },
    ])
    .raw()
    .toBuffer();

  writeBmp(path.join(OUT_DIR, "installerSidebar.bmp"), W, H, result);
  console.log("  installerSidebar.bmp  (164x314)");
}

// ── Header (150 x 57) ─────────────────────────────────────────────────

async function generateHeader() {
  const W = 150, H = 57;
  const LINE = 2; // accent line at bottom
  const accentRgb = hexToRgb(ACCENT);

  // 1. Base gradient
  const raw = gradient(W, H, BG_TOP, BG_BOTTOM);

  // Paint accent line at bottom
  for (let y = H - LINE; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      raw[i] = accentRgb.r;
      raw[i + 1] = accentRgb.g;
      raw[i + 2] = accentRgb.b;
    }
  }

  // 2. Small circle icon
  const iconSize = 36;
  const iconPng = await sharp(Buffer.from(circleSvg(iconSize)))
    .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // 3. Composite
  const result = await sharp(raw, { raw: { width: W, height: H, channels: 4 } })
    .composite([
      {
        input: iconPng,
        left: Math.round((W - iconSize) / 2),
        top: Math.round((H - LINE - iconSize) / 2),
      },
    ])
    .raw()
    .toBuffer();

  writeBmp(path.join(OUT_DIR, "installerHeader.bmp"), W, H, result);
  console.log("  installerHeader.bmp   (150x57)");
}

// ── Main ───────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });
console.log("Generating installer images...");
await Promise.all([generateSidebar(), generateHeader()]);
console.log("Done! Images saved to assets/installer/");
