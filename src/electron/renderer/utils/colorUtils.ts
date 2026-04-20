/**
 * Pure color-derivation utilities.
 *
 * Given a single hex base color the user picks, we derive `darkColor` and
 * `iconColor` automatically so users only need to choose one color per system.
 */

export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [h * 360, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const hNorm = ((h % 360) + 360) % 360;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (hNorm < 60) { r = c; g = x; }
  else if (hNorm < 120) { r = x; g = c; }
  else if (hNorm < 180) { g = c; b = x; }
  else if (hNorm < 240) { g = x; b = c; }
  else if (hNorm < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function darkenColor(hex: string, amount = 0.35): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, clamp(l - amount, 0, 1));
}

export function brightenColor(hex: string, amount = 0.12): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, clamp(s + 0.1, 0, 1), clamp(l + amount, 0, 1));
}

export function deriveSystemColors(baseHex: string): {
  color: string;
  darkColor: string;
  iconColor: string;
} {
  return {
    color: baseHex,
    darkColor: darkenColor(baseHex, 0.35),
    iconColor: brightenColor(baseHex, 0.12),
  };
}
