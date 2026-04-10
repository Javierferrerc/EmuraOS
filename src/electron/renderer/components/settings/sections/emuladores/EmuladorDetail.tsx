import { useState, useMemo, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import type { SettingsContext } from "../../../../schemas/settings-schema-types";
import { EmulatorIcon } from "./EmulatorIcon";
import { EstadoTab } from "./tabs/EstadoTab";
import { ConfiguracionTab } from "./tabs/ConfiguracionTab";
import { DescargaTab } from "./tabs/DescargaTab";
import { AvanzadoTab } from "./tabs/AvanzadoTab";

const TABS = [
  { id: "estado", label: "Estado" },
  { id: "configuracion", label: "Configuración" },
  { id: "descarga", label: "Descarga" },
  { id: "avanzado", label: "Avanzado" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  ctx: SettingsContext;
  emulatorId: string;
  prevFilterRef: MutableRefObject<(() => void) | null>;
  nextFilterRef: MutableRefObject<(() => void) | null>;
  listActionRef: MutableRefObject<((action: "up" | "down" | "left" | "right" | "activate") => boolean) | null>;
}

export function EmuladorDetail({ ctx, emulatorId, prevFilterRef, nextFilterRef, listActionRef }: Props) {
  // Derive initial tab from nav path if present
  const initialTab = useMemo(() => {
    const match = ctx.navigation.match(
      "/settings/emuladores/:id/:tab"
    );
    const tab = match?.tab as TabId | undefined;
    if (tab && TABS.some((t) => t.id === tab)) return tab;
    return "estado" as TabId;
  }, []);

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Wire L1/R1 (prev/next filter) to cycle through tabs
  const goPrevTab = useCallback(() => {
    setActiveTab((prev) => {
      const idx = TABS.findIndex((t) => t.id === prev);
      const prevIdx = idx <= 0 ? TABS.length - 1 : idx - 1;
      return TABS[prevIdx].id;
    });
  }, []);

  const goNextTab = useCallback(() => {
    setActiveTab((prev) => {
      const idx = TABS.findIndex((t) => t.id === prev);
      const nextIdx = idx >= TABS.length - 1 ? 0 : idx + 1;
      return TABS[nextIdx].id;
    });
  }, []);

  useEffect(() => {
    prevFilterRef.current = goPrevTab;
    nextFilterRef.current = goNextTab;
    return () => {
      prevFilterRef.current = null;
      nextFilterRef.current = null;
    };
  }, [prevFilterRef, nextFilterRef, goPrevTab, goNextTab]);

  // Delegate list actions to the active tab's handler (ConfiguracionTab).
  // Other tabs consume most actions to prevent SettingsRoot from running
  // stale grid navigation; LEFT escapes to sidebar.
  const configActionRef = useRef<((action: "up" | "down" | "left" | "right" | "activate") => boolean) | null>(null);

  const handleListAction = useCallback((action: "up" | "down" | "left" | "right" | "activate"): boolean => {
    // Try the active tab's handler first (ConfiguracionTab wires this)
    if (configActionRef.current?.(action)) return true;
    // For other tabs (Estado, Descarga, Avanzado), consume everything
    // except LEFT which should escape to sidebar.
    if (action === "left") return false;
    return true;
  }, []);

  useEffect(() => {
    listActionRef.current = handleListAction;
    return () => {
      listActionRef.current = null;
    };
  }, [listActionRef, handleListAction]);

  const def = ctx.emulatorDefs.find((d) => d.id === emulatorId);
  const detected = ctx.lastDetection?.detected.find(
    (d) => d.id === emulatorId
  );

  if (!def) {
    return (
      <div className="py-8 text-center text-[var(--color-text-muted)]">
        Emulador no encontrado: {emulatorId}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <EmulatorIcon id={def.id} className="h-10 w-10" />
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            {def.name}
          </h2>
          {detected && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {detected.executablePath}
            </p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[var(--color-surface-1)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "estado" && (
        <EstadoTab ctx={ctx} emulatorId={emulatorId} />
      )}
      {activeTab === "configuracion" && (
        <ConfiguracionTab
          ctx={ctx}
          emulatorId={emulatorId}
          actionRef={configActionRef}
        />
      )}
      {activeTab === "descarga" && (
        <DescargaTab ctx={ctx} emulatorId={emulatorId} />
      )}
      {activeTab === "avanzado" && (
        <AvanzadoTab ctx={ctx} emulatorId={emulatorId} />
      )}
    </div>
  );
}
