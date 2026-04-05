import type { SettingsSection } from "../../../../schemas/settings-schema-types";
import { EmuladoresView } from "./EmuladoresView";

export const emuladoresSection: SettingsSection = {
  id: "emuladores",
  path: "/settings/emuladores",
  label: "Emuladores",
  icon: "🎮",
  customComponent: EmuladoresView,
};
