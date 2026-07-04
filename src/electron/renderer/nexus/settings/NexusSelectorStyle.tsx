/**
 * NexusSelectorStyle — Configuración → Apariencia → Sistemas (custom tab).
 * Ported from the handoff's selector-style-view.jsx: four style options
 * (Chips / Dos niveles / Breadcrumb / Segmentado) plus a live preview frame
 * that renders the REAL system rail (NexusSystemRail) with the real library
 * data, reflecting the pending (unsaved) choice.
 *
 * It participates in the native save flow via value/saved/setValue: `value`
 * is the draft (staged) style, `saved` the committed one — the green dot
 * marks the saved/active style and the shell's save bar handles persisting.
 */

import { useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import type { SystemDefinition } from "../../../../core/types";
import {
  buildFamilies,
  platformSystemIds,
  platformLabel,
  ALL_PLATFORM,
} from "../nexusPlatforms";
import { buildNexusGames } from "../nexusModel";
import { NexusSystemRail, type RailStyle } from "../NexusSystemRail";
import { NexusCover } from "../NexusCover";
import "./nexus-selector-style.css";

const SEL_OPT_META: Record<RailStyle, { name: string; desc: string }> = {
  chips: { name: "Chips", desc: "Fichas con año" },
  two: { name: "Dos niveles", desc: "Familia + sistemas" },
  breadcrumb: { name: "Breadcrumb", desc: "Ruta con menús" },
  seg: { name: "Segmentado", desc: "Controles compactos" },
};
const SEL_OPT_ORDER: RailStyle[] = ["chips", "two", "breadcrumb", "seg"];

interface NexusSelectorStyleProps {
  /** Draft (staged) style — what the preview shows. */
  value: RailStyle;
  /** Committed style — marked with the green dot. */
  saved: RailStyle;
  setValue: (style: RailStyle) => void;
}

export function NexusSelectorStyle({ value, saved, setValue }: NexusSelectorStyleProps) {
  const app = useApp();
  const {
    scanResult,
    systems,
    config,
    getMetadataForRom,
    romAddedDates,
    playHistory,
    isRomHidden,
  } = app;
  const customColors = config?.customSystemColors;

  // Same family/game model the library shell uses — the preview is the real rail.
  const families = useMemo(() => {
    if (!scanResult) return buildFamilies([], customColors);
    const present: SystemDefinition[] = [];
    for (const sys of scanResult.systems) {
      if (sys.roms.length === 0) continue;
      const def = systems.find((s) => s.id === sys.systemId);
      if (def) present.push(def);
    }
    return buildFamilies(present, customColors);
  }, [scanResult, systems, customColors]);

  const allGames = useMemo(
    () =>
      buildNexusGames({
        scanResult,
        getMetadataForRom,
        romAddedDates,
        playHistory,
        isRomHidden,
        customColors,
      }),
    [scanResult, getMetadataForRom, romAddedDates, playHistory, isRomHidden, customColors]
  );

  // Preview-local selection (doesn't touch the library's platform).
  const [curSel, setCurSel] = useState<string | null>(null);
  const cur = curSel ?? families[0]?.systems[0]?.id ?? ALL_PLATFORM;

  const previewGames = useMemo(() => {
    const ids = platformSystemIds(cur, families);
    const filtered = ids === null ? allGames : allGames.filter((g) => ids.has(g.systemId));
    return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
  }, [allGames, cur, families]);

  const tint = useMemo(() => {
    if (cur === ALL_PLATFORM) return "#9aa6c0";
    const fam = families.find((f) => f.id === cur);
    if (fam) return fam.tint;
    for (const f of families) {
      const sys = f.systems.find((s) => s.id === cur);
      if (sys) return sys.tint;
    }
    return "var(--accent)";
  }, [cur, families]);

  const label = cur === ALL_PLATFORM ? "Biblioteca" : platformLabel(cur, families);

  return (
    <div className="set-page">
      <div className="set-section-head">
        <h1>Selector de sistema</h1>
        <p>Cómo se muestran las familias y sistemas en la parte superior de la biblioteca.</p>
      </div>

      <div className="set-group">
        <div className="set-group-head">
          <div className="set-group-htxt">
            <h2>Estilo</h2>
            <p>Elige una disposición. Los cambios se guardan con la barra inferior.</p>
          </div>
        </div>

        <div className="sel-opts">
          {SEL_OPT_ORDER.map((id) => (
            <button
              key={id}
              className={`sel-opt${value === id ? " sel" : ""}`}
              onClick={() => {
                if (id !== value) setValue(id);
              }}
            >
              <span className="sel-opt-nm">
                {SEL_OPT_META[id].name}
                {saved === id && <span className="sel-dot" title="Activo" />}
              </span>
              <span className="sel-opt-desc">{SEL_OPT_META[id].desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="set-group">
        <div className="set-group-head">
          <div className="set-group-htxt">
            <h2>Vista previa</h2>
            <p>{value === saved ? "Estilo activo." : "Sin guardar — así se verá al guardar."}</p>
          </div>
        </div>
        <div className="sel-frame">
          <div className="sel-frame-inner" style={{ ["--tint" as string]: tint }}>
            <NexusSystemRail
              variant={value}
              families={families}
              activePlatform={cur}
              onSelect={setCurSel}
              gameCount={previewGames.length}
            />
            <div className="sr-preview">
              <div className="sr-preview-head">
                <h1>{label}</h1>
                <span className="sub">
                  {previewGames.length} {previewGames.length === 1 ? "juego" : "juegos"}
                </span>
              </div>
              <div className="sr-grid">
                {previewGames.slice(0, 18).map((g) => (
                  <div key={g.key} className="sr-tile">
                    <span className="sr-tile-art">
                      <NexusCover game={g} rounded={0} />
                    </span>
                    <span className="sr-tile-nm">{g.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
