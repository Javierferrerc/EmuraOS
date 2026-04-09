import type { SettingsSection } from "../../../../schemas/settings-schema-types";
import { EmuladoresView } from "./EmuladoresView";

export const emuladoresSection: SettingsSection = {
  id: "emuladores",
  path: "/settings/emuladores",
  label: "Emuladores",
  icon: "🎮",
  customComponent: EmuladoresView,
  customListColumns: 3,
  // 1 (detect button) + emulator count — computed dynamically
  customListCount: (ctx) => 1 + (ctx.emulatorDefs?.length ?? 0),
};
