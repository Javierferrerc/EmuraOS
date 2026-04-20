import { describe, it, expect } from "vitest";
import { generalSection } from "../../src/electron/renderer/components/settings/sections/general";
import { aparienciaSection } from "../../src/electron/renderer/components/settings/sections/apariencia";
import { rutasSection } from "../../src/electron/renderer/components/settings/sections/rutas";
import { bibliotecaSection } from "../../src/electron/renderer/components/settings/sections/biblioteca";
import { avanzadoSection } from "../../src/electron/renderer/components/settings/sections/avanzado";
import {
  coverSourcesGroups,
  coverCredentialsGroups,
  coverActionsGroups,
} from "../../src/electron/renderer/components/settings/sections/portadas/cover-settings";
import type {
  SettingsContext,
  SettingsGroup,
  SettingsSection,
} from "../../src/electron/renderer/schemas/settings-schema-types";

// Minimal fake context that satisfies all the closure reads.
const fakeCtx = {
  config: {
    romsPath: "./roms",
    emulatorsPath: "./emulators",
    configPath: "./config",
    systems: [],
  },
  updateConfig: async () => {},
  navigation: {
    state: { stack: [] },
    currentPath: "/settings",
    navigateTo: () => {},
    replace: () => {},
    goBack: () => false,
    canGoBack: () => false,
    reset: () => {},
    match: () => null,
    updateMemo: () => {},
  },
  favorites: new Set<string>(),
  recentlyPlayed: [] as string[],
  playHistory: {} as Record<string, { lastPlayed: string; playCount: number }>,
  collections: [],
  metadataMap: {},
  isLoading: false,
  refreshScan: async () => {},
  isScraping: false,
  scrapeProgress: null,
  lastScrapeResult: null,
  startScraping: async () => {},
  isFetchingCovers: false,
  coverFetchProgress: null,
  lastCoverFetchResult: null,
  startFetchingCovers: async () => {},
  emulatorDefs: [],
  lastDetection: null,
  readinessReport: null,
  isDetectingEmulators: false,
  detectEmulators: async () => {},
  driveEmulators: {},
  isLoadingDrive: false,
  refreshDriveEmulators: async () => {},
  downloadingEmulatorId: null,
  emulatorDownloadProgress: null,
  downloadEmulator: async () => ({ success: false, installPath: "", error: "" }),
  pendingCemuKeysLaunch: null,
  isCemuKeysModalOpen: false,
  openCemuKeysModal: () => {},
  gamepadConnected: false,
  isFullscreen: false,
  toggleFullscreen: () => {},
  isGameRunning: false,
  currentGameFileName: null,
} as SettingsContext;

/** Collect all groups from a section, whether it uses tabs or flat groups. */
function allGroups(section: SettingsSection): SettingsGroup[] {
  if (section.tabs) return section.tabs.flatMap((t) => t.groups);
  return section.groups ?? [];
}

const ALL_SECTIONS = [
  generalSection,
  aparienciaSection,
  bibliotecaSection,
  rutasSection,
  avanzadoSection,
];

describe("PR2 real SettingsSections", () => {
  it("all sections have groups (via tabs or flat groups)", () => {
    for (const s of ALL_SECTIONS) {
      const groups = allGroups(s);
      expect(groups.length).toBeGreaterThan(0);
    }
  });

  it("General and Rutas use flat groups (no tabs)", () => {
    expect(generalSection.tabs).toBeUndefined();
    expect(generalSection.groups).toBeDefined();
    expect(rutasSection.tabs).toBeUndefined();
    expect(rutasSection.groups).toBeDefined();
  });

  it("Apariencia, Biblioteca, and Avanzado use tabs", () => {
    expect(aparienciaSection.tabs).toBeDefined();
    expect(aparienciaSection.tabs!.length).toBeGreaterThan(0);
    expect(bibliotecaSection.tabs).toBeDefined();
    expect(bibliotecaSection.tabs!.length).toBeGreaterThan(0);
    expect(avanzadoSection.tabs).toBeDefined();
    expect(avanzadoSection.tabs!.length).toBeGreaterThan(0);
  });

  it("every section has a /settings/* path", () => {
    for (const s of ALL_SECTIONS) {
      expect(s.path.startsWith("/settings")).toBe(true);
    }
  });

  it("every row has a unique id within its section", () => {
    for (const s of ALL_SECTIONS) {
      const ids = new Set<string>();
      for (const g of allGroups(s)) {
        for (const r of g.rows) {
          expect(r.id).toBeTruthy();
          expect(ids.has(r.id)).toBe(false);
          ids.add(r.id);
        }
      }
    }
  });

  it("General section has language dropdown and toggle rows", () => {
    const rows = allGroups(generalSection).flatMap((g) => g.rows);
    const kinds = rows.map((r) => r.kind);
    expect(kinds).toContain("dropdown");
    expect(kinds).toContain("toggle");
  });

  it("Rutas section has folder rows", () => {
    const rows = allGroups(rutasSection).flatMap((g) => g.rows);
    const folderRows = rows.filter((r) => r.kind === "folder");
    expect(folderRows.length).toBeGreaterThanOrEqual(2);
  });

  it("Cover settings have path rows for credentials", () => {
    const rows = coverCredentialsGroups.flatMap((g) => g.rows);
    const pathRows = rows.filter((r) => r.kind === "path");
    expect(pathRows.length).toBeGreaterThanOrEqual(2); // SGDB key + SS creds
  });

  it("Avanzado section has a danger button (reset config)", () => {
    const rows = allGroups(avanzadoSection).flatMap((g) => g.rows);
    const dangerBtns = rows.filter(
      (r) => r.kind === "button" && r.variant === "danger"
    );
    expect(dangerBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("Avanzado section has gamepad status info row", () => {
    const rows = allGroups(avanzadoSection).flatMap((g) => g.rows);
    const gamepadRow = rows.find((r) => r.id === "adv.gamepad-status");
    expect(gamepadRow).toBeDefined();
    expect(gamepadRow!.kind).toBe("info");
  });

  it("Apariencia section has 4 tabs (Efectos, Fondo, Colores, Sonidos)", () => {
    expect(aparienciaSection.tabs!.length).toBe(4);
    const tabIds = aparienciaSection.tabs!.map((t) => t.id);
    expect(tabIds).toContain("ap-effects");
    expect(tabIds).toContain("ap-background");
    expect(tabIds).toContain("ap-colors");
    expect(tabIds).toContain("ap-sounds");
  });

  it("Biblioteca section has Ordenación tab as first tab", () => {
    expect(bibliotecaSection.tabs![0].id).toBe("bib-sorting");
    expect(bibliotecaSection.tabs![0].label).toBe("Ordenación");
  });

  it("every getter runs without throwing given fakeCtx", () => {
    // Test section-level settings
    for (const s of ALL_SECTIONS) {
      for (const g of allGroups(s)) {
        for (const r of g.rows) {
          switch (r.kind) {
            case "toggle":
              expect(typeof r.get(fakeCtx)).toBe("boolean");
              break;
            case "dropdown":
              expect(r.options.length).toBeGreaterThan(0);
              r.get(fakeCtx);
              break;
            case "slider":
              expect(typeof r.get(fakeCtx)).toBe("number");
              break;
            case "info":
              expect(typeof r.value(fakeCtx)).toBe("string");
              break;
            case "folder":
            case "path":
              expect(typeof r.get(fakeCtx)).toBe("string");
              break;
            case "button":
              expect(typeof r.run).toBe("function");
              break;
          }
        }
      }
    }

    // Test cover settings groups
    const coverGroups = [...coverSourcesGroups, ...coverCredentialsGroups, ...coverActionsGroups];
    for (const g of coverGroups) {
      for (const r of g.rows) {
        switch (r.kind) {
          case "toggle":
            expect(typeof r.get(fakeCtx)).toBe("boolean");
            break;
          case "dropdown":
            expect(r.options.length).toBeGreaterThan(0);
            r.get(fakeCtx);
            break;
          case "path":
            expect(typeof r.get(fakeCtx)).toBe("string");
            break;
          case "button":
            expect(typeof r.run).toBe("function");
            break;
        }
      }
    }
  });
});
