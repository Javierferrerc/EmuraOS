// cover-art.jsx — procedural "box art" for fictional games. Exposes window.CoverArt.
// No external images: a tuned gradient base + one geometric motif + title typography.
// Deterministic per game so a cover always looks the same.

function CoverArt({ game, rounded = 14, showTitle = true, compact = false }) {
  const { hue, style, motif } = game.art;
  const h = hue;
  const h2 = (h + 45) % 360;
  const base = `oklch(0.30 0.085 ${h})`;
  const mid = `oklch(0.22 0.08 ${h})`;
  const deep = `oklch(0.14 0.055 ${h})`;
  // alpha MUST live inside oklch(... / a) — never append hex to an oklch() string.
  const g = (a) => `oklch(0.68 0.20 ${h} / ${a})`;
  const g2 = (a) => `oklch(0.74 0.18 ${h2} / ${a})`;
  const line = `oklch(0.62 0.13 ${h} / 0.5)`;

  // Layered backgrounds per style.
  let layers = [];
  if (style === "rings") {
    layers = [
      `radial-gradient(130% 100% at 72% 16%, ${g(0.8)}, transparent 58%)`,
      `radial-gradient(80% 70% at 24% 96%, ${g2(0.55)}, transparent 62%)`,
      `repeating-radial-gradient(circle at 72% 20%, transparent 0 15px, ${line} 15px 16.5px)`,
      `linear-gradient(150deg, ${base}, ${deep})`,
    ];
  } else if (style === "beam") {
    layers = [
      `linear-gradient(115deg, transparent 30%, ${g(0.8)} 50%, transparent 66%)`,
      `radial-gradient(85% 75% at 82% 8%, ${g2(0.6)}, transparent 60%)`,
      `linear-gradient(160deg, ${base}, ${deep})`,
    ];
  } else if (style === "grid") {
    layers = [
      `radial-gradient(100% 85% at 50% -5%, ${g(0.8)}, transparent 58%)`,
      `linear-gradient(${line} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${line} 1px, transparent 1px)`,
      `linear-gradient(160deg, ${base}, ${deep})`,
    ];
  } else if (style === "wave") {
    layers = [
      `radial-gradient(110% 65% at 18% 102%, ${g(0.8)}, transparent 60%)`,
      `radial-gradient(85% 55% at 92% 16%, ${g2(0.55)}, transparent 62%)`,
      `linear-gradient(165deg, ${base}, ${deep})`,
    ];
  } else if (style === "split") {
    layers = [
      `linear-gradient(58deg, ${g(0.8)} 0%, transparent 48%)`,
      `linear-gradient(238deg, ${g2(0.65)} 0%, transparent 52%)`,
      `linear-gradient(160deg, ${mid}, ${deep})`,
    ];
  } else { // orb
    layers = [
      `radial-gradient(46% 46% at 50% 40%, ${g(1)}, transparent 68%)`,
      `radial-gradient(130% 100% at 50% 122%, ${g2(0.55)}, transparent 60%)`,
      `linear-gradient(160deg, ${mid}, ${deep})`,
    ];
  }

  const bgSize = style === "grid"
    ? "auto, 22px 22px, 22px 22px, auto"
    : undefined;

  const titleSize = compact ? 15 : 22;

  return (
    <div className="cover" style={{
      borderRadius: rounded,
      background: layers.join(", "),
      backgroundSize: bgSize,
    }}>
      {/* motif accents */}
      {motif === 2 && style !== "grid" && (
        <div className="cover-diag" style={{ background:
          `repeating-linear-gradient(135deg, ${line} 0 2px, transparent 2px 12px)` }} />
      )}
      {style === "orb" && (
        <div className="cover-orb-ring" style={{ borderColor: g(0.55) }} />
      )}
      {/* sheen + vignette */}
      <div className="cover-sheen" />
      <div className="cover-vig" />
      {showTitle && (
        <div className="cover-meta">
          <div className="cover-genre" style={{ color: `oklch(0.85 0.06 ${h})` }}>
            {game.genre}
          </div>
          <div className="cover-title" style={{ fontSize: titleSize }}>{game.title}</div>
        </div>
      )}
    </div>
  );
}

window.CoverArt = CoverArt;
