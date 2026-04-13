import type { ComponentType, MutableRefObject } from "react";
import type {
  SettingsContext,
  SettingsGroup,
} from "../../../schemas/settings-schema-types";
import { rutasSection } from "../sections/rutas";
import { coverArtSection } from "../sections/cover-art";
import { WizardEmulatorStep } from "./WizardEmulatorStep";

/** Props passed to custom wizard step components for gamepad/keyboard focus. */
export interface WizardCustomStepProps {
  ctx: SettingsContext;
  focusedIndex: number;
  regionFocused: boolean;
  onItemCount: (n: number) => void;
  onActivate: MutableRefObject<(() => void) | null>;
  onDownload: MutableRefObject<(() => void) | null>;
  onNext: () => void;
}

export interface WizardStep {
  id: string;
  label: string;
  groups: SettingsGroup[];
  /** When set, rendered instead of SettingsListView for this step. */
  customComponent?: ComponentType<WizardCustomStepProps>;
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: "welcome",
    label: "Bienvenido",
    groups: [
      {
        id: "wiz-welcome",
        title: "Bienvenido a EmuraOS",
        description:
          "Configura las rutas de tus ROMs y emuladores para empezar.",
        rows: [
          {
            id: "wiz.welcome-info",
            kind: "info",
            label: "Primeros pasos",
            value: () => "Sigue los pasos para configurar tu biblioteca.",
            tone: "good",
            column: true,
            variant: "glass",
            nonFocusable: true,
          },
        ],
      },
    ],
  },
  {
    id: "paths",
    label: "Rutas",
    // Reuse the "Directorios" tab groups from Rutas section
    groups: rutasSection.tabs?.[0]?.groups ?? [],
  },
  {
    id: "detect",
    label: "Emuladores",
    groups: [],
    customComponent: WizardEmulatorStep,
  },
  {
    id: "covers",
    label: "Covers",
    // Reuse the "Fuentes" tab groups from Cover Art section + recommendation info
    groups: [
      ...(coverArtSection.tabs?.[0]?.groups ?? []),
      {
        id: "wiz-covers-tip",
        description:
          "Recomendación: Para la mejor experiencia, activa Libretro Thumbnails y selecciona \"Libretro primero\" como prioridad. Libretro no requiere credenciales, es gratuito y cubre la mayoría de sistemas retro. SteamGridDB es útil como respaldo para sistemas modernos (Switch, Wii U) pero requiere una API key.",
        rows: [],
      },
    ],
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
            value: () => "Listo! Ya puedes disfrutar de tus emuladores en una experiencia única.",
            tone: "good",
            column: true,
            variant: "glass" as const,
            nonFocusable: true,
          },
        ],
      },
    ],
  },
];
