import { useMemo } from "react";
import type { SettingsContext } from "../../../../schemas/settings-schema-types";
import { EmuladoresList } from "./EmuladoresList";
import { EmuladorDetail } from "./EmuladorDetail";

/**
 * Custom component for the Emuladores section.
 *
 * At `/settings/emuladores` — renders the emulator list.
 * At `/settings/emuladores/:id` — renders the 4-tab detail view.
 */
export function EmuladoresView({ ctx }: { ctx: SettingsContext }) {
  const currentPath = ctx.navigation.currentPath;

  const emulatorId = useMemo(() => {
    const match = ctx.navigation.match("/settings/emuladores/:emulatorId");
    return match?.emulatorId ?? null;
  }, [currentPath]);

  if (emulatorId) {
    return <EmuladorDetail ctx={ctx} emulatorId={emulatorId} />;
  }

  return <EmuladoresList ctx={ctx} />;
}
