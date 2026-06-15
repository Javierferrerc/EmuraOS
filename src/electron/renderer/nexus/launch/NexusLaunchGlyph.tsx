/**
 * NexusLaunchGlyph — animated family glyphs for the launch sequence
 * (stroke-draw friendly). Ported from the handoff (launch-glyph.jsx).
 * Uses --len for the dash length per shape.
 */

export type GlyphShape = "circle" | "hex" | "square" | "tri";

export function NexusLaunchGlyph({ glyph }: { glyph: GlyphShape }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  if (glyph === "hex") {
    return (
      <svg viewBox="0 0 100 100" style={{ ["--len" as string]: 360 }}>
        <polygon points="50,8 84,28 84,72 50,92 16,72 16,28" {...common} />
        <polygon points="50,26 68,37 68,63 50,74 32,63 32,37" {...common} strokeWidth="1" opacity="0.6" />
      </svg>
    );
  }
  if (glyph === "square") {
    return (
      <svg viewBox="0 0 100 100" style={{ ["--len" as string]: 320 }}>
        <rect x="16" y="16" width="68" height="68" rx="20" {...common} />
        <circle cx="50" cy="50" r="11" {...common} strokeWidth="1.2" />
      </svg>
    );
  }
  if (glyph === "tri") {
    return (
      <svg viewBox="0 0 100 100" style={{ ["--len" as string]: 300 }}>
        <polygon points="50,12 88,80 12,80" {...common} />
        <polygon points="50,34 70,72 30,72" {...common} strokeWidth="1" opacity="0.6" />
      </svg>
    );
  }
  // circle (default)
  return (
    <svg viewBox="0 0 100 100" style={{ ["--len" as string]: 270 }}>
      <circle cx="50" cy="50" r="40" {...common} />
      <circle cx="50" cy="50" r="11" {...common} strokeWidth="1.2" />
      <circle cx="50" cy="50" r="24" {...common} strokeWidth="0.8" opacity="0.5" />
    </svg>
  );
}
