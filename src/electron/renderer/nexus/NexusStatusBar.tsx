/**
 * NexusStatusBar — the 60px top bar. Left: a profile chip summarising the real
 * library (total games / systems). Center: a live clock + date. Right: a games
 * pill, a fullscreen toggle and a settings gear that drops back into the
 * existing Settings page. Ported from the design's status-bar.jsx but fed real
 * counts instead of fictional credits.
 */

import { useEffect, useState } from "react";
import { TrophyIcon, SettingsIcon, SearchIcon } from "./NexusIcons";

interface NexusStatusBarProps {
  totalGames: number;
  systemsCount: number;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function NexusStatusBar({ totalGames, systemsCount, onOpenSettings, onOpenSearch }: NexusStatusBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const dateLabel = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  return (
    <div className="nx-statusbar">
      <button className="nx-sb-profile" onClick={onOpenSettings} title="Ajustes">
        <span className="nx-sb-avatar">NX</span>
        <span className="nx-sb-profile-txt">
          <span className="nx-sb-name">Biblioteca</span>
          <span className="nx-sb-sub">
            {totalGames} {totalGames === 1 ? "juego" : "juegos"} · {systemsCount}{" "}
            {systemsCount === 1 ? "sistema" : "sistemas"}
          </span>
        </span>
      </button>

      <div className="nx-sb-center">
        <span className="nx-sb-time">
          {hh}
          <span className="nx-sb-colon">:</span>
          {mm}
        </span>
        <span className="nx-sb-date">{dateLabel}</span>
      </div>

      <div className="nx-sb-right">
        <span className="nx-sb-pill" title="Juegos en la biblioteca">
          <TrophyIcon size={14} />
          {totalGames}
        </span>
        <button className="nx-sb-ico" onClick={onOpenSearch} title="Buscar (/)">
          <SearchIcon size={18} />
        </button>
        <button className="nx-sb-ico" onClick={onOpenSettings} title="Ajustes">
          <SettingsIcon size={18} />
        </button>
      </div>
    </div>
  );
}
