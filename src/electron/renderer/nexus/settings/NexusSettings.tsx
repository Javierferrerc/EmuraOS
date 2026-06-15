/**
 * NexusSettings — the NEXUS-themed Settings shell. Renders instead of the
 * standard SettingsRoot when the active theme is "nexus". Reuses the SAME
 * schema-driven section definitions (real get/set/run wired to AppContext) and
 * a staging layer + Save bar; only the chrome/controls are the NEXUS design.
 *
 * Custom sections: Portadas renders its real cover-settings groups in NEXUS
 * style; Emuladores embeds the existing real EmuladoresView (list + detail).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useApp } from "../../context/AppContext";
import { useNavigation } from "../../navigation/NavigationContext";
import type { AppConfig } from "../../../../core/types";
import type {
  Setting,
  SettingsContext as ISettingsContext,
  SettingsSection,
} from "../../schemas/settings-schema-types";
import { generalSection } from "../../components/settings/sections/general";
import { aparienciaSection } from "../../components/settings/sections/apariencia";
import { bibliotecaSection } from "../../components/settings/sections/biblioteca";
import { portadasSection } from "../../components/settings/sections/portadas/index";
import { rutasSection } from "../../components/settings/sections/rutas";
import { emuladoresSection } from "../../components/settings/sections/emuladores/index";
import { retroachievementsSection } from "../../components/settings/sections/retroachievements";
import { avanzadoSection } from "../../components/settings/sections/avanzado";
import { RowView, GroupView, resolveDisabled } from "./NexusSettingsRows";
import { NexusEmuladores } from "./NexusEmuladores";
import { NexusCoverGallery } from "../NexusCoverGallery";
import { NexusSoundSettings } from "./NexusSoundSettings";
import { SetIcon, SECTION_ICON } from "./SetIcon";
import "./nexus-settings.css";

const SECTIONS: SettingsSection[] = [
  generalSection,
  aparienciaSection,
  { id: "sonido", label: "Sonido", groups: [] },
  bibliotecaSection,
  portadasSection,
  rutasSection,
  emuladoresSection,
  retroachievementsSection,
  avanzadoSection,
];

function SetClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return (
    <div className="set-clock">
      <b>
        {hh}
        <span className="set-colon">:</span>
        {mm}
      </b>
      <span>{now.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</span>
    </div>
  );
}

interface NexusSettingsProps {
  onExit: () => void;
}

export function NexusSettings({ onExit }: NexusSettingsProps) {
  const app = useApp();
  const navigation = useNavigation();

  // ── Staging layer — buffer changes until "Guardar" ───────────────
  const [pendingChanges, setPendingChanges] = useState<Partial<AppConfig>>({});
  const hasChanges = Object.keys(pendingChanges).length > 0;
  const mergedConfig = useMemo(
    () => (app.config ? { ...app.config, ...pendingChanges } : null),
    [app.config, pendingChanges]
  );
  const stagingUpdateConfig = useCallback(async (partial: Partial<AppConfig>) => {
    setPendingChanges((prev) => ({ ...prev, ...partial }));
  }, []);
  const handleSave = useCallback(async () => {
    await app.updateConfig(pendingChanges);
    setPendingChanges({});
  }, [app, pendingChanges]);
  const handleDiscard = useCallback(() => setPendingChanges({}), []);

  const ctx: ISettingsContext = useMemo(
    () => ({
      config: mergedConfig,
      updateConfig: stagingUpdateConfig,
      liveUpdateConfig: app.updateConfig,
      navigation,
      scanResult: app.scanResult,
      loadAllMetadata: app.loadAllMetadata,
      favorites: app.favorites,
      recentlyPlayed: app.recentlyPlayed,
      playHistory: app.playHistory,
      collections: app.collections,
      metadataMap: app.metadataMap,
      bumpCoverVersion: app.bumpCoverVersion,
      isLoading: app.isLoading,
      refreshScan: app.refreshScan,
      isScraping: app.isScraping,
      scrapeProgress: app.scrapeProgress,
      lastScrapeResult: app.lastScrapeResult,
      startScraping: app.startScraping,
      isFetchingCovers: app.isFetchingCovers,
      coverFetchProgress: app.coverFetchProgress,
      lastCoverFetchResult: app.lastCoverFetchResult,
      startFetchingCovers: app.startFetchingCovers,
      emulatorDefs: app.emulatorDefs,
      lastDetection: app.lastDetection,
      readinessReport: app.readinessReport,
      isDetectingEmulators: app.isDetectingEmulators,
      detectEmulators: app.detectEmulators,
      driveEmulators: app.driveEmulators,
      isLoadingDrive: app.isLoadingDrive,
      refreshDriveEmulators: app.refreshDriveEmulators,
      downloadingEmulatorId: app.downloadingEmulatorId,
      emulatorDownloadProgress: app.emulatorDownloadProgress,
      downloadEmulator: app.downloadEmulator,
      cancelEmulatorDownload: app.cancelEmulatorDownload,
      pendingCemuKeysLaunch: app.pendingCemuKeysLaunch,
      isCemuKeysModalOpen: app.isCemuKeysModalOpen,
      openCemuKeysModal: app.openCemuKeysModal,
      gamepadConnected: app.gamepadConnected,
      isFullscreen: app.isFullscreen,
      toggleFullscreen: app.toggleFullscreen,
      isGameRunning: app.isGameRunning,
      currentGameFileName: app.currentGame?.rom?.fileName ?? null,
      resolvedPaths: app.resolvedPaths ?? undefined,
      raStatus: app.raStatus,
      raLogin: app.raLogin,
      raLogout: app.raLogout,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mergedConfig, stagingUpdateConfig, navigation, app]
  );

  // ── Section / tab selection ──────────────────────────────────────
  const initialSection = navigation.currentPath.startsWith("/settings/emuladores")
    ? "emuladores"
    : "general";
  const [secId, setSecId] = useState<string>(initialSection);
  const [tabBySec, setTabBySec] = useState<Record<string, string>>({});

  const section = SECTIONS.find((s) => s.id === secId) ?? SECTIONS[0];
  const tabs = section.tabs ?? null;
  const tabId = tabs ? tabBySec[secId] ?? tabs[0].id : null;
  const curTab = tabs ? tabs.find((t) => t.id === tabId) ?? tabs[0] : null;
  const groups = tabs ? curTab!.groups : section.groups ?? [];

  const selectSection = useCallback((id: string) => setSecId(id), []);

  // ── Render helpers ───────────────────────────────────────────────
  const renderRow = useCallback(
    (setting: Setting) => (
      <RowView key={setting.id} setting={setting} ctx={ctx} focused={false} onHover={() => {}} />
    ),
    [ctx]
  );

  // ── Keyboard: Esc exits ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div className="nexus-settings">
      <div className="set-app">
        <div className="set-top">
          <button className="set-back" onClick={onExit}>
            <SetIcon name="back" size={17} /> Volver
          </button>
          <div className="set-top-title">
            <b>Configuración</b>
            <span>
              {section.label}
              {curTab ? " · " + curTab.label : ""}
            </span>
          </div>
          <div className="set-top-spacer" />
          <SetClock />
        </div>

        <div className="set-main">
          <aside className="set-sidebar">
            <div className="set-brand">
              <div className="set-brand-mark">
                <i />
              </div>
              <div className="set-brand-txt">
                <b>EmuraOS</b>
                <span>Launcher · NEXUS</span>
              </div>
            </div>
            <div className="set-seclist" role="tablist">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={"set-sec" + (s.id === secId ? " active" : "")}
                  onClick={() => selectSection(s.id)}
                >
                  {s.id === secId && <span className="set-sec-bar" />}
                  <span className="set-sec-ico">
                    <SetIcon name={SECTION_ICON[s.id] ?? "gear"} size={19} />
                  </span>
                  <span className="set-sec-name">{s.label}</span>
                </button>
              ))}
            </div>
            <div className="set-sidebar-foot">EmuraOS · tema NEXUS</div>
          </aside>

          <div className="set-content-area">
            {tabs && (
              <div className="set-tabbar" role="tablist">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    className={"set-tab" + (t.id === tabId ? " active" : "")}
                    onClick={() => setTabBySec((p) => ({ ...p, [secId]: t.id }))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <div className="set-scroll" data-setscroll>
              {section.id === "sonido" ? (
                <NexusSoundSettings ctx={ctx} />
              ) : section.id === "emuladores" ? (
                <div className="set-embed">
                  <NexusEmuladores ctx={ctx} />
                </div>
              ) : section.id === "portadas" && tabId === "port-galeria" ? (
                <NexusCoverGallery embedded />
              ) : section.id === "portadas" ? (
                <div className="set-page">
                  <div className="set-section-head">
                    <h1>Portadas</h1>
                    <p>Fuentes de carátulas y metadatos. Descarga automática y por credenciales.</p>
                  </div>
                  {groups.map((g, i) => (
                    <GroupView key={g.id ?? i} group={g} renderRow={renderRow} />
                  ))}
                </div>
              ) : (
                <div className="set-page">
                  <div className="set-section-head">
                    <h1>{section.label}</h1>
                  </div>
                  {groups.map((g, gi) => (
                    <GroupView key={g.id ?? gi} group={g} renderRow={renderRow} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={"set-savebar" + (hasChanges ? " show" : "")}>
          <div className="set-savebar-txt">
            <span className="set-savebar-dot" /> Tienes cambios sin guardar
          </div>
          <span className="set-savebar-count">
            {Object.keys(pendingChanges).length}{" "}
            {Object.keys(pendingChanges).length === 1 ? "cambio" : "cambios"}
          </span>
          <div className="set-savebar-actions">
            <button className="ct-btn ghost" onClick={handleDiscard}>
              Descartar
            </button>
            <button className="ct-btn primary" onClick={handleSave}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// `resolveDisabled` re-exported for potential consumers/tests.
export { resolveDisabled };
