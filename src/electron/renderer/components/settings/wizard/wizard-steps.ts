import type { SettingsGroup } from "../../../schemas/settings-schema-types";
import { rutasSection } from "../sections/rutas";
import { coverArtSection } from "../sections/cover-art";

export interface WizardStep {
  id: string;
  label: string;
  groups: SettingsGroup[];
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: "welcome",
    label: "Bienvenido",
    groups: [
      {
        id: "wiz-welcome",
        title: "Bienvenido a Retro Launcher",
        description:
          "Configura las rutas de tus ROMs y emuladores para empezar.",
        rows: [
          {
            id: "wiz.welcome-info",
            kind: "info",
            label: "Primeros pasos",
            value: () => "Sigue los pasos para configurar tu biblioteca.",
            tone: "good",
          },
        ],
      },
    ],
  },
  {
    id: "paths",
    label: "Rutas",
    // Reuse the "Directorios principales" group from Rutas section
    groups: rutasSection.groups?.slice(0, 1) ?? [],
  },
  {
    id: "detect",
    label: "Emuladores",
    groups: [
      {
        id: "wiz-detect",
        title: "Detectar emuladores",
        description:
          "Detecta los emuladores instalados en tu sistema para poder jugar.",
        rows: [
          {
            id: "wiz.detect-btn",
            kind: "button",
            label: "Detectar emuladores",
            variant: "primary",
            run: async (ctx) => {
              await ctx.detectEmulators();
            },
            status: (ctx) =>
              ctx.isDetectingEmulators ? "Detectando..." : null,
          },
        ],
      },
    ],
  },
  {
    id: "covers",
    label: "Covers",
    // Reuse the source group from Cover Art section
    groups: coverArtSection.groups?.slice(0, 1) ?? [],
  },
  {
    id: "done",
    label: "Listo",
    groups: [
      {
        id: "wiz-done",
        title: "¡Configuración completa!",
        description: "Tu biblioteca está lista. Puedes cambiar estos ajustes en cualquier momento desde Configuración.",
        rows: [
          {
            id: "wiz.done-info",
            kind: "info",
            label: "Estado",
            value: () => "Todo configurado.",
            tone: "good",
          },
        ],
      },
    ],
  },
];
