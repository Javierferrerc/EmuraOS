/**
 * NexusEmuladores — NEXUS-styled emulator manager (replaces the standard
 * EmuladoresView inside the NEXUS settings). The list (card grid) and the
 * detail header + tab bar are NEXUS-native and wired to the REAL data
 * (ctx.emulatorDefs / lastDetection / driveEmulators / detect / download).
 *
 * The five detail tab *bodies* (Estado, Configuración, Mandos, Descarga,
 * Avanzado) reuse the existing real tab components — they render with the
 * global theme tokens, so under data-theme="nexus" they stay coherent while
 * keeping all the real emulator-config plumbing.
 */

import { useMemo, useRef, useState } from "react";
import type { SettingsContext } from "../../schemas/settings-schema-types";
import { systemDisplayName } from "../nexusModel";
import { SetIcon } from "./SetIcon";
import { EmulatorIcon } from "../../components/settings/sections/emuladores/EmulatorIcon";
import { EstadoTab } from "../../components/settings/sections/emuladores/tabs/EstadoTab";
import { ConfiguracionTab } from "../../components/settings/sections/emuladores/tabs/ConfiguracionTab";
import { MandosTab } from "../../components/settings/sections/emuladores/tabs/MandosTab";
import { DescargaTab } from "../../components/settings/sections/emuladores/tabs/DescargaTab";
import { AvanzadoTab } from "../../components/settings/sections/emuladores/tabs/AvanzadoTab";

type Status = "installed" | "available" | "unavailable";

const STATUS_LABEL: Record<Status, string> = {
  installed: "Instalado",
  available: "Descargable",
  unavailable: "No disponible",
};

const BASE_TABS = [
  { id: "estado", label: "Estado" },
  { id: "configuracion", label: "Configuración" },
  { id: "mandos", label: "Mandos" },
  { id: "descarga", label: "Descarga" },
  { id: "avanzado", label: "Avanzado" },
] as const;
type TabId = (typeof BASE_TABS)[number]["id"];

// Only Dolphin exposes a native controller editor (matches EmuladorDetail).
const EMULATORS_WITH_MANDOS = new Set(["dolphin"]);

function systemsLabel(systems: string[]): string {
  if (systems.length === 0) return "—";
  if (systems.length > 3) return "Multi-sistema";
  return systems.map((s) => systemDisplayName(s)).join(" · ");
}

export function NexusEmuladores({ ctx }: { ctx: SettingsContext }) {
  const [selected, setSelected] = useState<string | null>(null);

  const statusOf = (id: string): Status => {
    if (ctx.lastDetection?.detected.some((d) => d.id === id)) return "installed";
    if (ctx.driveEmulators[id.toLowerCase()]) return "available";
    return "unavailable";
  };

  const sortedDefs = useMemo(() => {
    const rank = (id: string) => (statusOf(id) === "unavailable" ? 1 : 0);
    return [...ctx.emulatorDefs].sort((a, b) => rank(a.id) - rank(b.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.emulatorDefs, ctx.lastDetection, ctx.driveEmulators]);

  if (selected) {
    return <EmuDetail ctx={ctx} emulatorId={selected} onBack={() => setSelected(null)} status={statusOf(selected)} />;
  }

  const installedCount = ctx.emulatorDefs.filter((d) => statusOf(d.id) === "installed").length;

  return (
    <div className="set-page">
      <div className="set-section-head">
        <h1>Emuladores</h1>
        <p>Detecta, instala y configura tus emuladores desde el launcher.</p>
      </div>
      <div className="set-group">
        <div className="set-group-head">
          <div className="set-group-htxt">
            <h2>Instalados y disponibles</h2>
            <p>
              {installedCount} instalados · {ctx.emulatorDefs.length} en total.
            </p>
          </div>
          <button
            className="ct-btn ghost"
            disabled={ctx.isDetectingEmulators || ctx.isLoadingDrive}
            onClick={() => void ctx.detectEmulators()}
          >
            <SetIcon name="refresh" size={16} />
            {ctx.isDetectingEmulators || ctx.isLoadingDrive ? "Detectando…" : "Detectar emuladores"}
          </button>
        </div>
        <div className="emu-grid">
          {sortedDefs.map((def) => {
            const status = statusOf(def.id);
            return (
              <button
                key={def.id}
                className="emu-card"
                disabled={status === "unavailable"}
                onClick={() => setSelected(def.id)}
              >
                <div className="emu-card-top">
                  <div className="emu-logo">
                    <EmulatorIcon id={def.id} className="emu-logo-img" />
                  </div>
                  <div>
                    <div className="emu-name">{def.name}</div>
                    <div className="emu-sys">{systemsLabel(def.systems)}</div>
                  </div>
                </div>
                <span className={"emu-status " + status}>
                  <span className="dot" /> {STATUS_LABEL[status]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmuDetail({
  ctx,
  emulatorId,
  status,
  onBack,
}: {
  ctx: SettingsContext;
  emulatorId: string;
  status: Status;
  onBack: () => void;
}) {
  const def = ctx.emulatorDefs.find((d) => d.id === emulatorId);
  const tabs = useMemo(
    () => BASE_TABS.filter((t) => t.id !== "mandos" || EMULATORS_WITH_MANDOS.has(emulatorId)),
    [emulatorId]
  );
  const [tab, setTab] = useState<TabId>("estado");
  const configActionRef = useRef<((action: "up" | "down" | "left" | "right" | "activate") => boolean) | null>(null);

  if (!def) {
    return (
      <div className="set-page">
        <button className="emu-back" onClick={onBack}>
          <SetIcon name="back" size={16} /> Emuladores
        </button>
        <div className="set-empty">Emulador no encontrado: {emulatorId}</div>
      </div>
    );
  }

  return (
    <div className="set-page emu-detail">
      <button className="emu-back" onClick={onBack}>
        <SetIcon name="back" size={16} /> Emuladores
      </button>
      <div className="emu-detail-head">
        <div className="emu-logo">
          <EmulatorIcon id={def.id} className="emu-logo-img" />
        </div>
        <div>
          <h2>{def.name}</h2>
          <div className="emu-sys">{systemsLabel(def.systems)}</div>
        </div>
        <div style={{ flex: 1 }} />
        <span className={"emu-status " + status}>
          <span className="dot" /> {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="emu-detail-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} className={"set-tab" + (t.id === tab ? " active" : "")} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="emu-tab-body">
        {tab === "estado" && <EstadoTab ctx={ctx} emulatorId={emulatorId} />}
        {tab === "configuracion" && (
          <ConfiguracionTab ctx={ctx} emulatorId={emulatorId} actionRef={configActionRef} />
        )}
        {tab === "mandos" && EMULATORS_WITH_MANDOS.has(emulatorId) && (
          <MandosTab ctx={ctx} emulatorId={emulatorId} />
        )}
        {tab === "descarga" && <DescargaTab ctx={ctx} emulatorId={emulatorId} />}
        {tab === "avanzado" && <AvanzadoTab ctx={ctx} emulatorId={emulatorId} />}
      </div>
    </div>
  );
}
