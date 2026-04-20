import type { SettingsSection } from "../../../../schemas/settings-schema-types";
import { PortadasView } from "./PortadasView";

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
};
