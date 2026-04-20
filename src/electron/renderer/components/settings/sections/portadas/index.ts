import type { SettingsSection } from "../../../../schemas/settings-schema-types";
import { PortadasView } from "./PortadasView";
import { coverSourcesGroups, coverCredentialsGroups, coverActionsGroups } from "./cover-settings";

export const portadasSection: SettingsSection = {
  id: "portadas",
  path: "/settings/portadas",
  label: "Portadas",
  icon: "\uD83D\uDDBC\uFE0F",
  customComponent: PortadasView,
  customListColumns: 4,
  customListCount: (ctx) => {
    if (!ctx.scanResult) return 0;
    let total = 0;
    for (const sys of ctx.scanResult.systems) {
      total += sys.roms.length;
    }
    return total;
  },
  tabs: [
    { id: "port-galeria", label: "Galería", groups: [] },
    { id: "port-fuentes", label: "Fuentes", groups: coverSourcesGroups },
    { id: "port-credenciales", label: "Credenciales", groups: coverCredentialsGroups },
    { id: "port-acciones", label: "Acciones", groups: coverActionsGroups },
  ],
};
