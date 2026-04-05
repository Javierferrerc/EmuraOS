import type { Prerequisite } from "./prerequisite-types";

/**
 * Registry of known prerequisites per emulator.
 * Each entry defines a check that returns severity + detail,
 * and an optional action (e.g. open a modal to paste keys).
 */
export const PREREQUISITES: Prerequisite[] = [
  {
    id: "wiiu-cemu-keys",
    emulatorId: "cemu",
    title: "Cemu Disc Keys (keys.txt)",
    description:
      "Cemu necesita un archivo keys.txt para descifrar juegos Wii U encriptados (.wud/.wux).",
    legalNote:
      "Solo usa claves extraídas de tu propia consola Wii U.",
    check: async () => {
      try {
        const status = await window.electronAPI.checkCemuKeys();
        if (!status.emulatorFound) {
          return { severity: "warning", detail: "Cemu no detectado." };
        }
        if (!status.exists) {
          return {
            severity: "error",
            detail: "No se encontró keys.txt.",
          };
        }
        return {
          severity: "ok",
          detail: `${status.entryCount} clave(s) encontrada(s).`,
        };
      } catch {
        return {
          severity: "warning",
          detail: "No se pudo comprobar el estado de keys.txt.",
        };
      }
    },
    actionLabel: "Resolver",
    action: (ctx) => {
      ctx.openCemuKeysModal();
    },
  },
];

export function getPrerequisitesForEmulator(
  emulatorId: string
): Prerequisite[] {
  return PREREQUISITES.filter((p) => p.emulatorId === emulatorId);
}
