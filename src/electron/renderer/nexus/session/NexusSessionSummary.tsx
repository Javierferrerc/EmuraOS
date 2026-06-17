/**
 * NexusSessionSummary — the post-session "resumen" card (handoff session.css,
 * SUMMARY). Shown over the NEXUS shell when a game session ends (the emulator
 * closed): time played, stats, an unlocked achievement (best-effort), the
 * session shot (cover), and replay / back-to-library actions.
 */

import { useEffect, useState } from "react";
import type { DiscoveredRom } from "../../../../core/types";
import { useApp } from "../../context/AppContext";
import { systemTint } from "../nexusPlatforms";
import { hexToHue } from "../launch/NexusLaunchSequence";
import { CheckIcon, TrophyIcon, CameraIcon, PlayIcon, BackIcon } from "../NexusIcons";
import "./nexus-session.css";

function metaKey(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i > 0 ? fileName.substring(0, i) : fileName;
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${sec} s`;
}

export function NexusSessionSummary({
  rom,
  durationSec,
  onReplay,
  onClose,
}: {
  rom: DiscoveredRom;
  durationSec: number;
  onReplay: () => void;
  onClose: () => void;
}) {
  const app = useApp();
  const meta = app.getMetadataForRom(rom.systemId, rom.fileName);
  const title = meta?.title?.trim() || metaKey(rom.fileName);
  const tint = systemTint(rom.systemId, app.config?.customSystemColors);
  const hue = hexToHue(tint);
  const key = `${rom.systemId}:${rom.fileName}`;
  const totalSec = app.playHistory[key]?.totalPlayTime ?? durationSec;
  const totalH = Math.max(0, Math.round(totalSec / 3600));
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [ach, setAch] = useState<{ title: string; desc: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (meta?.coverPath) {
      window.electronAPI
        .readCoverDataUrl(meta.coverPath)
        .then((u) => !cancelled && setCoverUrl(u ?? null))
        .catch(() => {});
    }
    app
      .getAchievementsForRom(rom)
      .then((res) => {
        if (cancelled || res.status !== "ok") return;
        const earned = res.progress.achievements.find((a) => a.dateEarned);
        if (earned) setAch({ title: earned.title, desc: earned.description });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rom.systemId, rom.fileName, meta?.coverPath]);

  // Esc closes back to the library.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="nx-session-summary"
      style={{ ["--tint" as string]: tint, ["--hue" as string]: hue }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="seS-card">
        <div className="seS-top">
          <div className="seS-top-glow" />
          <div className="seS-badge">
            <CheckIcon size={30} />
          </div>
          <div className="seS-kicker">Sesión finalizada</div>
          <div className="seS-title">{title}</div>
          <div className="seS-dur">
            Jugaste <b>{fmtDur(durationSec)}</b>
          </div>
        </div>
        <div className="seS-body">
          <div className="seS-stats">
            <div className="seS-stat">
              <b className="up">+{Math.max(1, Math.round(durationSec / 60))}m</b>
              <span>Esta sesión</span>
            </div>
            <div className="seS-stat">
              <b>{totalH} h</b>
              <span>Total jugado</span>
            </div>
            <div className="seS-stat">
              <b>{app.playHistory[key]?.playCount ?? 1}</b>
              <span>Partidas</span>
            </div>
          </div>

          {ach && (
            <div>
              <div className="seS-sec" style={{ marginBottom: 8 }}>
                Logro desbloqueado
              </div>
              <div className="seS-ach">
                <span className="seS-ach-ico">
                  <TrophyIcon size={19} />
                </span>
                <span className="seS-ach-txt">
                  <b>{ach.title}</b>
                  <span>{ach.desc}</span>
                </span>
              </div>
            </div>
          )}

          <div>
            <div className="seS-sec" style={{ marginBottom: 8 }}>
              Tu partida
            </div>
            <div className="seS-shot">
              {coverUrl && <img src={coverUrl} alt="" />}
              <span className="seS-shot-tag">
                <CameraIcon size={13} /> {title}
              </span>
            </div>
          </div>

          <div className="seS-actions">
            <button className="se-btn ghost" onClick={onReplay}>
              <PlayIcon size={17} /> Volver a jugar
            </button>
            <button className="se-btn primary" onClick={onClose}>
              <BackIcon size={17} /> A la biblioteca
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
