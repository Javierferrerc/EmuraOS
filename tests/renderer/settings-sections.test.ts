import { describe, it, expect } from "vitest";
import { generalSection } from "../../src/electron/renderer/components/settings/sections/general";
import { rutasSection } from "../../src/electron/renderer/components/settings/sections/rutas";
import { bibliotecaSection } from "../../src/electron/renderer/components/settings/sections/biblioteca";
import { coverArtSection } from "../../src/electron/renderer/components/settings/sections/cover-art";
import { controlesSection } from "../../src/electron/renderer/components/settings/sections/controles";
import { avanzadoSection } from "../../src/electron/renderer/components/settings/sections/avanzado";
import type { SettingsContext } from "../../src/electron/renderer/schemas/settings-schema-types";

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

const ALL_SECTIONS = [
  generalSection,
  rutasSection,
  bibliotecaSection,
  coverArtSection,
  controlesSection,
  avanzadoSection,
];

describe("PR2 real SettingsSections", () => {
  it("all 6 group-based sections have groups array", () => {
    for (const s of ALL_SECTIONS) {
      expect(s.groups).toBeDefined();
      expect(s.groups!.length).toBeGreaterThan(0);
    }
  });

  it("every section has a /settings/* path", () => {
    for (const s of ALL_SECTIONS) {
      expect(s.path.startsWith("/settings")).toBe(true);
    }
  });

  it("every row has a unique id within its section", () => {
    for (const s of ALL_SECTIONS) {
      const ids = new Set<string>();
      for (const g of s.groups ?? []) {
        for (const r of g.rows) {
          expect(r.id).toBeTruthy();
          expect(ids.has(r.id)).toBe(false);
          ids.add(r.id);
        }
      }
    }
  });

  it("General section has language dropdown and toggle rows", () => {
    const rows = generalSection.groups!.flatMap((g) => g.rows);
    const kinds = rows.map((r) => r.kind);
    expect(kinds).toContain("dropdown");
    expect(kinds).toContain("toggle");
  });

  it("Rutas section has folder rows", () => {
    const rows = rutasSection.groups!.flatMap((g) => g.rows);
    const folderRows = rows.filter((r) => r.kind === "folder");
    expect(folderRows.length).toBeGreaterThanOrEqual(2);
  });

  it("Cover Art section has path rows for credentials", () => {
    const rows = coverArtSection.groups!.flatMap((g) => g.rows);
    const pathRows = rows.filter((r) => r.kind === "path");
    expect(pathRows.length).toBeGreaterThanOrEqual(2); // SGDB key + SS creds
  });

  it("Avanzado section has a danger button (reset config)", () => {
    const rows = avanzadoSection.groups!.flatMap((g) => g.rows);
    const dangerBtns = rows.filter(
      (r) => r.kind === "button" && r.variant === "danger"
    );
    expect(dangerBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("every getter runs without throwing given fakeCtx", () => {
    for (const s of ALL_SECTIONS) {
      for (const g of s.groups ?? []) {
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
  });
});
