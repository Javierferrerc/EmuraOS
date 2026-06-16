/**
 * NexusGameDetail — the full game detail page ("ficha") for the NEXUS theme.
 *
 * Pixel-faithful React/TS port of the handoff `game-detail.jsx`, shipped with
 * the chosen defaults: cinematic header, cozy density, info-first section order
 * and a visible compatibility seal. Section order:
 *   Información → (Emulación + Tu actividad) → Capturas → Valoraciones.
 *
 * Wired to real data where the launcher tracks it (metadata, play history,
 * favourites, assigned emulator/core, hero + screenshot art); the panels with
 * no backend yet (compatibility seal, ratings distribution, save-state slots)
 * use deterministic placeholders from gameDetailData.ts — clearly marked there.
 *
 * Gamepad + mouse navigation via useGameDetailFocus (geometric focus, hover,
 * `.focused::after` ring). Every interactive element keeps `data-foc`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { NexusGame } from "../nexusModel";
import { NexusGameShot } from "./NexusGameShot";
import { useGameDetailFocus, type GameDetailFocusHandle } from "./useGameDetailFocus";
import {
  hasPlayed,
  oklchHueFromHex,
  formatSize,
  playersLabel,
  relativeTime,
  formatHours,
  compatOf,
  ratingDist,
  savesOf,
  type Compat,
} from "./gameDetailData";
import { SYSTEM_ICONS } from "../../utils/sliderItems";
import {
  PlayIcon,
  ClockIcon,
  RefreshIcon,
  HeartIcon,
  CheckIcon,
  GridIcon,
  ImageIcon,
  DotsIcon,
  StarIcon,
  CpuIcon,
  LibraryIcon,
  BackIcon,
} from "../NexusIcons";
import "./nexus-game-detail.css";

export type PlayMode = "play" | "resume" | "new";

interface NexusGameDetailProps {
  game: NexusGame;
  density?: "dense" | "normal" | "cozy";
  showCompat?: boolean;
  sectionOrder?: "media-first" | "info-first";
  isFavorite: boolean;
  onBack: () => void;
  onPlay: (mode: PlayMode) => void;
  onToggleFavorite: () => void;
  /** Opens settings/emulator config (the "Cambiar" core action). */
  onChangeEmulator: () => void;
  /** Lets the shell's unified gamepad layer drive the ficha's spatial focus. */
  focusHandleRef: MutableRefObject<GameDetailFocusHandle | null>;
}

const SHOT_COUNT = 5;

// ── small bits ──────────────────────────────────────────────
function Stars({ value }: { value: number }) {
  return (
    <span className="gd-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={"s" + (i <= Math.round(value) ? " on" : "")}>
          <StarIcon size={15} />
        </span>
      ))}
    </span>
  );
}

function Seal({ compat }: { compat: Compat }) {
  return (
    <span className={"gd-seal " + compat.id}>
      <span className="d" /> {compat.label}
    </span>
  );
}

function SecHead({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) {
  return (
    <div className="gd-sec-head">
      <span className="gd-sec-ico">{icon}</span>
      <h2>{title}</h2>
      {extra && <span className="gd-sec-extra">{extra}</span>}
    </div>
  );
}

// ── resolved emulator/core (real) ───────────────────────────
interface CoreInfo {
  name: string;
  sub: string;
  ready: boolean;
}

function useResolvedCore(game: NexusGame): CoreInfo | null {
  const [core, setCore] = useState<CoreInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    setCore(null);
    void (async () => {
      try {
        const key = `${game.rom.systemId}:${game.rom.fileName}`;
        const [overrides, emus] = await Promise.all([
          window.electronAPI.getGameOverrides(),
          window.electronAPI.getEmulatorsForSystem(game.rom.systemId),
        ]);
        if (cancelled) return;
        const overrideId = overrides[key]?.emulatorId;
        const chosen = emus.find((e) => e.emulatorId === overrideId) ?? emus[0];
        if (!chosen) {
          setCore({ name: "Sin emulador asignado", sub: "Configura un emulador", ready: false });
          return;
        }
        let sub = "Emulador asignado";
        try {
          const coreId = await window.electronAPI.resolveRetroArchCore(game.rom.systemId);
          if (!cancelled && coreId) sub = `Núcleo ${coreId}`;
        } catch {
          /* not a RetroArch system — keep the generic sub */
        }
        if (!cancelled) setCore({ name: chosen.emulatorName, sub, ready: true });
      } catch {
        if (!cancelled) setCore(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.key, game.rom.systemId, game.rom.fileName]);
  return core;
}

// ── real stills (hero + screenshot) ─────────────────────────
function useGameStills(game: NexusGame): string[] {
  const [stills, setStills] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    setStills([]);
    void (async () => {
      const urls: string[] = [];
      try {
        const res = await window.electronAPI.ensureGameHero(game.rom.systemId, game.rom.fileName);
        if (res?.heroPath) {
          const u = await window.electronAPI.readBackgroundDataUrl(res.heroPath);
          if (u) urls.push(u);
        }
      } catch {
        /* no hero — fall back to procedural */
      }
      try {
        const meta = await window.electronAPI.getMetadata(game.rom.systemId, game.rom.fileName);
        if (meta?.screenshotPath) {
          const u = await window.electronAPI.readBackgroundDataUrl(meta.screenshotPath);
          if (u) urls.push(u);
        }
      } catch {
        /* no screenshot */
      }
      if (!cancelled) setStills(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [game.key, game.rom.systemId, game.rom.fileName]);
  return stills;
}

// ── action cluster ──────────────────────────────────────────
function Actions({
  game,
  fav,
  pinned,
  setPin,
  onToggleFavorite,
  onPlay,
}: {
  game: NexusGame;
  fav: boolean;
  pinned: boolean;
  setPin: (fn: (v: boolean) => boolean) => void;
  onToggleFavorite: () => void;
  onPlay: (mode: PlayMode) => void;
}) {
  const playing = hasPlayed(game);
  const lastWhen = relativeTime(game.play?.lastPlayed).toLowerCase();
  const hours = formatHours(game.play?.totalPlayTime);
  return (
    <div className="gd-actions">
      <button className="gd-play foc-ring" data-foc onClick={() => onPlay("play")}>
        <PlayIcon size={20} />
        <span className="gd-play-main">
          <span>{playing ? "Continuar" : "Jugar"}</span>
          {playing && game.play?.lastPlayed && <span className="gd-play-sub">desde {lastWhen}</span>}
        </span>
      </button>
      {playing && (
        <button className="gd-secondary foc-ring" data-foc onClick={() => onPlay("resume")}>
          <ClockIcon size={17} />
          <span>
            Reanudar sesión <span className="sub">· {hours}</span>
          </span>
        </button>
      )}
      <button className="gd-secondary foc-ring" data-foc onClick={() => onPlay("new")}>
        <RefreshIcon size={16} /> {playing ? "Nueva partida" : "Opciones"}
      </button>
      <button
        className={"gd-iconbtn foc-ring" + (fav ? " on" : "")}
        data-foc
        title="Favorito"
        onClick={onToggleFavorite}
      >
        <HeartIcon size={20} />
      </button>
      <button
        className={"gd-iconbtn foc-ring" + (pinned ? " on" : "")}
        data-foc
        title="Fijar"
        onClick={() => setPin((v) => !v)}
      >
        <CheckIcon size={20} />
      </button>
      <button className="gd-iconbtn foc-ring" data-foc title="Añadir a colección">
        <GridIcon size={19} />
      </button>
    </div>
  );
}

// ── sections ────────────────────────────────────────────────
function ShotsSection({ game, stills }: { game: NexusGame; stills: string[] }) {
  const shots = Array.from({ length: SHOT_COUNT }, (_, i) => i);
  return (
    <section className="gd-section">
      <SecHead icon={<ImageIcon size={18} />} title="Capturas" extra={`${shots.length} imágenes`} />
      <div className="gd-shots">
        {shots.map((i) => (
          <div key={i} className="gd-shot foc-ring" data-foc tabIndex={-1}>
            <NexusGameShot game={game} idx={i} imageUrl={stills[i] ?? null} />
          </div>
        ))}
      </div>
    </section>
  );
}

function MetaSection({ game }: { game: NexusGame }) {
  const cells = [
    { l: "Desarrolladora", v: game.developer || "—" },
    { l: "Año", v: game.year || "—" },
    { l: "Género", v: game.genre || "—" },
    { l: "Jugadores", v: playersLabel(game) },
    { l: "Sistema", v: game.systemName || "—" },
    { l: "Tamaño", v: formatSize(game.rom.sizeBytes) },
  ];
  return (
    <section className="gd-section">
      <SecHead icon={<DotsIcon size={18} />} title="Información" />
      <div className="gd-meta-grid">
        {cells.map((c) => (
          <div key={c.l} className="gd-meta-cell">
            <span className="l">{c.l}</span>
            <span className="v">{c.v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CoreSection({ game, onChangeEmulator }: { game: NexusGame; onChangeEmulator: () => void }) {
  const core = useResolvedCore(game);
  return (
    <section className="gd-section">
      <SecHead icon={<CpuIcon size={18} />} title="Emulación" />
      <div className="gd-core">
        <span className="gd-core-badge">
          <CpuIcon size={22} />
        </span>
        <span className="gd-core-txt">
          <span className="gd-core-name">{core ? core.name : "Resolviendo…"}</span>
          <span className="gd-core-sub">{core ? core.sub : " "}</span>
        </span>
        {core &&
          (core.ready ? (
            <span className="gd-core-bios ok">
              <CheckIcon size={13} /> Listo
            </span>
          ) : (
            <span className="gd-core-bios warn">Sin emulador</span>
          ))}
        <button className="gd-core-change foc-ring" data-foc onClick={onChangeEmulator}>
          Cambiar
        </button>
      </div>
    </section>
  );
}

function ActivitySection({
  game,
  stills,
  onPlay,
}: {
  game: NexusGame;
  stills: string[];
  onPlay: (mode: PlayMode) => void;
}) {
  const saves = savesOf(game);
  const playing = hasPlayed(game);
  return (
    <section className="gd-section">
      <SecHead icon={<ClockIcon size={18} />} title="Tu actividad" />
      <div className="gd-activity">
        <div className="gd-act-row">
          <div className="gd-act-stat">
            <div className="n">{formatHours(game.play?.totalPlayTime)}</div>
            <div className="l">Tiempo jugado</div>
          </div>
          <div className="gd-act-stat">
            <div className="n">{relativeTime(game.play?.lastPlayed)}</div>
            <div className="l">Última sesión</div>
          </div>
          <div className="gd-act-stat">
            <div className="n">{game.play?.playCount ?? 0}</div>
            <div className="l">Partidas</div>
          </div>
        </div>
        {saves.length > 0 && (
          <div className="gd-saves">
            {saves.map((s) => (
              <button key={s.idx} className="gd-save foc-ring" data-foc onClick={() => onPlay("resume")}>
                <span className="gd-save-thumb">
                  <NexusGameShot game={game} idx={s.idx + 1} imageUrl={stills[s.idx] ?? null} />
                </span>
                <span className="gd-save-txt">
                  <span className="gd-save-slot">
                    {s.slot}
                    {s.auto && <span className="gd-save-auto">AUTO</span>}
                  </span>
                  <span className="gd-save-when">{s.when}</span>
                </span>
                <span className="gd-save-load">Cargar</span>
              </button>
            ))}
          </div>
        )}
        {!playing && <div className="gd-prog-lbl">Aún no has jugado a este título.</div>}
      </div>
    </section>
  );
}

function RatingsSection({ game }: { game: NexusGame }) {
  if (game.rating <= 0) return null;
  const { lines, count } = ratingDist(game);
  return (
    <section className="gd-section">
      <SecHead icon={<StarIcon size={18} />} title="Valoraciones" />
      <div className="gd-ratings">
        <div className="gd-rate-big">
          <div className="gd-rate-score">{game.rating.toFixed(1)}</div>
          <Stars value={game.rating} />
          <div className="gd-rate-count">{count.toLocaleString("es-ES")} valoraciones</div>
        </div>
        <div className="gd-rate-dist">
          {lines.map((l) => (
            <div key={l.star} className="gd-rate-line">
              <span className="lab">{l.star}</span>
              <span className="bar">
                <i style={{ width: l.pc + "%" }} />
              </span>
              <span className="pc">{l.pc}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── ficha ───────────────────────────────────────────────────
export function NexusGameDetail({
  game,
  density = "cozy",
  showCompat = true,
  sectionOrder = "info-first",
  isFavorite,
  onBack,
  onPlay,
  onToggleFavorite,
  onChangeEmulator,
  focusHandleRef,
}: NexusGameDetailProps) {
  const hue = useMemo(() => oklchHueFromHex(game.tint), [game.tint]);
  const compat = useMemo(() => compatOf(game), [game.key]);
  const stills = useGameStills(game);
  const [pinned, setPin] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useGameDetailFocus(rootRef, focusHandleRef, [game.key, density, showCompat, sectionOrder]);

  // Reset scroll on game change; Esc closes the ficha.
  useEffect(() => {
    if (rootRef.current) rootRef.current.scrollTo({ top: 0 });
  }, [game.key]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const sysIcon = SYSTEM_ICONS[game.systemId] ?? null;

  const actions = (
    <Actions
      game={game}
      fav={isFavorite}
      pinned={pinned}
      setPin={setPin}
      onToggleFavorite={onToggleFavorite}
      onPlay={onPlay}
    />
  );

  const SECTIONS: Record<string, React.ReactNode> = {
    shots: <ShotsSection key="shots" game={game} stills={stills} />,
    meta: <MetaSection key="meta" game={game} />,
    emu: (
      <div key="emu" className="gd-cols">
        <CoreSection game={game} onChangeEmulator={onChangeEmulator} />
        <ActivitySection game={game} stills={stills} onPlay={onPlay} />
      </div>
    ),
    ratings: <RatingsSection key="ratings" game={game} />,
  };
  const order =
    sectionOrder === "info-first"
      ? ["meta", "emu", "shots", "ratings"]
      : ["shots", "meta", "emu", "ratings"];

  return (
    <div
      className={"nx-gd " + (density === "dense" ? "dense" : density === "cozy" ? "cozy" : "")}
      style={{ ["--hue" as string]: hue }}
      ref={rootRef}
    >
      <button className="gd-back" onClick={onBack}>
        <BackIcon size={17} /> Biblioteca
      </button>

      <header className="gd-hero cinematic">
        <div className="gd-hero-art">
          <NexusGameShot game={game} idx={0} imageUrl={stills[0] ?? null} />
        </div>
        <div className="gd-hero-scrim" />
        <div className="gd-hero-inner">
          <div className="gd-hero-eyebrow">
            <span className="gd-sys-chip">
              <span className="g">{sysIcon ? <img src={sysIcon} alt="" /> : <LibraryIcon size={15} />}</span>{" "}
              {game.systemName}
            </span>
            {game.genre && <span className="gd-eye-meta">{game.genre}</span>}
            {game.year && <span className="gd-dot" />}
            {game.year && <span className="gd-eye-meta">{game.year}</span>}
            {game.rating > 0 && <span className="gd-dot" />}
            {game.rating > 0 && (
              <span className="gd-rate">
                <Stars value={game.rating} /> <span className="gd-rate-num">{game.rating.toFixed(1)}</span>
              </span>
            )}
            {showCompat && <Seal compat={compat} />}
          </div>
          <h1 className="gd-title">{game.title}</h1>
          {game.blurb && <p className="gd-tagline">{game.blurb}</p>}
          {actions}
        </div>
      </header>

      <div className="gd-body">{order.map((k) => SECTIONS[k])}</div>
    </div>
  );
}
