/**
 * NexusStatusBar — the 60px top bar. Left: profile chip. Then the GLOBAL view
 * controls (search · Destacado/Cuadrícula · Rail/Sidebar) relocated here off
 * the platform rail, so the rail is clean and full-width. Centre: live clock.
 * Right: games pill + settings gear. Ported from the updated design's StatusBar.
 */

import { useEffect, useState } from "react";
import { TrophyIcon, SettingsIcon, SearchIcon, LayersIcon, GridIcon, RailIcon, SidebarIcon } from "./NexusIcons";
import type { NexusLayout } from "./nexusTypes";
import { useSocial } from "../social/SocialContext";
import {
  loadProfileEdit,
  initialsOf,
  PROFILE_UPDATED_EVENT,
} from "./profile/nexusProfileData";

/** Live view of the locally-persisted profile edit (name + avatar). Re-reads on
 * every save so the status-bar chip stays in sync with the profile modal. */
function useLocalProfile() {
  const [profile, setProfile] = useState(() => loadProfileEdit("Jugador"));
  useEffect(() => {
    const reload = () => setProfile(loadProfileEdit("Jugador"));
    window.addEventListener(PROFILE_UPDATED_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);
  return profile;
}

interface NexusStatusBarProps {
  totalGames: number;
  systemsCount: number;
  layout: NexusLayout;
  nav: "rail" | "sidebar";
  onLayoutChange: (layout: NexusLayout) => void;
  onNavChange: (nav: "rail" | "sidebar") => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenProfile: () => void;
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function NexusStatusBar({
  totalGames,
  systemsCount,
  layout,
  nav,
  onLayoutChange,
  onNavChange,
  onOpenSettings,
  onOpenSearch,
  onOpenProfile,
}: NexusStatusBarProps) {
  const [now, setNow] = useState(() => new Date());
  const social = useSocial();
  const localProfile = useLocalProfile();

  const signedIn = social.configured && !!social.user;
  const profileName =
    (signedIn
      ? social.profile?.display_name?.trim() || social.profile?.username
      : null) ||
    localProfile.name?.trim() ||
    "Jugador";
  const avatarUrl = localProfile.avatarUrl ?? null;

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const dateLabel = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  return (
    <div className="nx-statusbar">
      <button className="nx-sb-profile" onClick={onOpenProfile} title="Tu perfil">
        <span className="nx-sb-avatar">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initialsOf(profileName)}
        </span>
        <span className="nx-sb-profile-txt">
          <span className="nx-sb-name">{profileName}</span>
          <span className="nx-sb-sub">
            {totalGames} {totalGames === 1 ? "juego" : "juegos"} · {systemsCount}{" "}
            {systemsCount === 1 ? "sistema" : "sistemas"}
          </span>
        </span>
      </button>

      {/* Global view controls — relocated here, off the system rail */}
      <div className="nx-sb-tools">
        <button className="nx-sb-tool-btn" onClick={onOpenSearch} aria-label="Buscar">
          <SearchIcon size={17} />
          <span>Buscar</span>
        </button>
        <div className="nx-sb-seg" role="group" aria-label="Vista">
          <button
            className={`nx-sb-seg-btn${layout === "hero" ? " active" : ""}`}
            onClick={() => onLayoutChange("hero")}
            title="Vista destacada"
          >
            <LayersIcon size={15} />
            <span>Destacado</span>
          </button>
          <button
            className={`nx-sb-seg-btn${layout === "grid" ? " active" : ""}`}
            onClick={() => onLayoutChange("grid")}
            title="Vista en cuadrícula"
          >
            <GridIcon size={15} />
            <span>Cuadrícula</span>
          </button>
        </div>
        <div className="nx-sb-seg icons" role="group" aria-label="Modo de selector">
          <button
            className={`nx-sb-seg-btn icon${nav === "rail" ? " active" : ""}`}
            onClick={() => onNavChange("rail")}
            title="Modo consola (riel)"
            aria-label="Modo consola"
          >
            <RailIcon size={16} />
          </button>
          <button
            className={`nx-sb-seg-btn icon${nav === "sidebar" ? " active" : ""}`}
            onClick={() => onNavChange("sidebar")}
            title="Barra lateral"
            aria-label="Barra lateral"
          >
            <SidebarIcon size={16} />
          </button>
        </div>
      </div>

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
        <button className="nx-sb-ico" onClick={onOpenSettings} title="Ajustes">
          <SettingsIcon size={18} />
        </button>
      </div>
    </div>
  );
}
