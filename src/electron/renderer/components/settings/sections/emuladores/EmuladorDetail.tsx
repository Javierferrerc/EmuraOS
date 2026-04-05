import { useState, useMemo } from "react";
import type { SettingsContext } from "../../../../schemas/settings-schema-types";
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
}

export function EmuladorDetail({ ctx, emulatorId }: Props) {
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
        <ConfiguracionTab ctx={ctx} emulatorId={emulatorId} />
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
