import type {
  SettingsSection,
} from "../../../schemas/settings-schema-types";

/**
 * PR1 placeholder sections.
 *
 * 7 top-level `SettingsSection`s wired into the sidebar. Every widget kind
 * is exercised by at least one row so reviewers can see toggles, dropdowns,
 * sliders, buttons, info rows, folder pickers, and path inputs render and
 * focus correctly.
 *
 * PR2 replaces every placeholder section with the real migrated content
 * from `SettingsPage.tsx` / `EmulatorConfigPage.tsx`.
 */

const generalSection: SettingsSection = {
  id: "general",
  path: "/settings/general",
  label: "General",
  icon: "⚙",
  groups: [
    {
      id: "welcome",
      title: "General (PR1 preview)",
      description:
        "Placeholder section. PR2 replaces these rows with real app settings.",
      rows: [
        {
          id: "g.info",
          kind: "info",
          label: "Estado",
          value: () => "PR1 preview",
          tone: "good",
        },
      ],
    },
  ],
};

const rutasSection: SettingsSection = {
  id: "rutas",
  path: "/settings/rutas",
  label: "Rutas",
  icon: "📁",
  groups: [
    {
      id: "paths",
      title: "Rutas (PR1 preview)",
      rows: [
        {
          id: "r.folder",
          kind: "folder",
          label: "Ejemplo folder",
          get: (ctx) => ctx.config?.romsPath ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({ romsPath: value });
          },
        },
      ],
    },
  ],
};

const emuladoresSection: SettingsSection = {
  id: "emuladores",
  path: "/settings/emuladores",
  label: "Emuladores",
  icon: "🎮",
  groups: [
    {
      id: "emulators-placeholder",
      title: "Emuladores (PR1 preview)",
      description:
        "PR2 replaces this with a nested list + 4 tabs (Estado / Configuración / Descarga / Avanzado).",
      rows: [
        {
          id: "e.info",
          kind: "info",
          label: "Subtree",
          value: () => "PR2",
          tone: "warn",
        },
      ],
    },
  ],
};

const bibliotecaSection: SettingsSection = {
  id: "biblioteca",
  path: "/settings/biblioteca",
  label: "Biblioteca",
  icon: "📚",
  groups: [
    {
      id: "library-placeholder",
      title: "Biblioteca (PR1 preview)",
      rows: [
        {
          id: "l.info",
          kind: "info",
          label: "Placeholder",
          value: () => "PR2 will wire favorites / play history here",
        },
      ],
    },
  ],
};

const coverArtSection: SettingsSection = {
  id: "cover-art",
  path: "/settings/cover-art",
  label: "Cover Art",
  icon: "🖼",
  groups: [
    {
      id: "cover-placeholder",
      title: "Cover Art (PR1 preview)",
      rows: [
        {
          id: "c.info",
          kind: "info",
          label: "Placeholder",
          value: () => "PR2 moves Libretro / SGDB / ScreenScraper here",
        },
      ],
    },
  ],
};

const controlesSection: SettingsSection = {
  id: "controles",
  path: "/settings/controles",
  label: "Controles",
  icon: "🎛",
  groups: [
    {
      id: "controls-placeholder",
      title: "Controles (PR1 preview)",
      rows: [
        {
          id: "ct.info",
          kind: "info",
          label: "Placeholder",
          value: () => "PR2 wires gamepad / keyboard remap placeholders",
        },
      ],
    },
  ],
};

const avanzadoSection: SettingsSection = {
  id: "avanzado",
  path: "/settings/avanzado",
  label: "Avanzado",
  icon: "🔧",
  groups: [
    {
      id: "widget-playground",
      title: "Widget Playground (PR1 preview)",
      description:
        "Every widget kind rendered once so reviewers can verify focus + styling.",
      rows: [
        {
          id: "p.toggle",
          kind: "toggle",
          label: "Ejemplo toggle",
          description: "Local-only, does not persist.",
          get: () => false,
          set: () => {
            /* no-op in PR1 */
          },
        },
        {
          id: "p.dropdown",
          kind: "dropdown",
          label: "Ejemplo dropdown",
          options: [
            { value: "a", label: "Opción A" },
            { value: "b", label: "Opción B" },
          ],
          get: () => "a",
          set: () => {
            /* no-op in PR1 */
          },
        },
        {
          id: "p.slider",
          kind: "slider",
          label: "Ejemplo slider",
          min: 0,
          max: 100,
          step: 1,
          get: () => 50,
          set: () => {
            /* no-op in PR1 */
          },
        },
        {
          id: "p.info",
          kind: "info",
          label: "Ejemplo info",
          value: () => "valor",
          tone: "default",
        },
        {
          id: "p.folder",
          kind: "folder",
          label: "Ejemplo folder",
          get: () => "",
          set: () => {
            /* no-op in PR1 */
          },
        },
        {
          id: "p.path",
          kind: "path",
          label: "Ejemplo path",
          get: () => "",
          set: () => {
            /* no-op in PR1 */
          },
          secret: false,
        },
        {
          id: "p.button",
          kind: "button",
          label: "Ejemplo button",
          variant: "primary",
          run: () => {
            console.log("[settings] placeholder button clicked");
          },
        },
      ],
    },
  ],
};

export const PLACEHOLDER_SECTIONS: SettingsSection[] = [
  generalSection,
  rutasSection,
  emuladoresSection,
  bibliotecaSection,
  coverArtSection,
  controlesSection,
  avanzadoSection,
];
