import { app, shell } from "electron";
import electronUpdater, { type UpdateInfo as EuUpdateInfo } from "electron-updater";
import type {
  UpdateInfo,
  UpdateCheckResult,
  UpdateDownloadProgress,
} from "../../core/types.js";

// electron-updater ships as CommonJS; under ESM the named `autoUpdater`
// export is exposed on the default export.
const { autoUpdater } = electronUpdater;

const RELEASES_PAGE =
  "https://github.com/Javierferrerc/EmuraOS/releases/latest";

/**
 * Phase 28 — whether electron-updater can actually INSTALL updates here:
 *  - Windows: yes (per-user NSIS, silent install)
 *  - Linux:   only when running from an AppImage (electron-updater swaps
 *             the image in place); .deb installs update via apt instead
 *  - macOS:   requires a signed + notarized build — until the Apple
 *             Developer certificate lands, updates are notify-only
 * When false we still CHECK for updates (latest*.yml) and notify, but
 * download/install actions open the releases page instead.
 */
export function updatesInstallable(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (platform === "win32") return true;
  if (platform === "linux") return Boolean(env.APPIMAGE);
  return false;
}

/** Channel payloads the updater pushes to the renderer. */
export type UpdaterEvent =
  | { channel: "update-download-progress"; payload: UpdateDownloadProgress }
  | { channel: "update-ready"; payload: UpdateInfo }
  | { channel: "update-error"; payload: string };

type SendFn = (event: UpdaterEvent) => void;

/**
 * Auto-update on top of electron-updater (electron-builder's updater).
 *
 * UX = "automatic with notification":
 *   - On startup we check + download in the background (autoDownload).
 *   - When the package is ready we emit `update-ready`; the renderer shows
 *     "restart now / later". If the user defers, autoInstallOnAppQuit
 *     applies it silently the next time the app closes.
 *   - `installUpdate()` runs the NSIS installer SILENTLY (no wizard) and
 *     relaunches into the new version — the "normal app" experience.
 *
 * Differential downloads: electron-updater uses the `.blockmap` published
 * next to the installer to fetch only the changed bytes, not the whole
 * ~140 MB .exe.
 *
 * Only runs in packaged builds — in dev there's no app-update.yml, so
 * checkForUpdates() short-circuits to "not available".
 */
export class AutoUpdater {
  private downloadedInfo: UpdateInfo | null = null;

  constructor(private readonly send: SendFn) {
    // We drive the lifecycle ourselves; don't pop the built-in dialog.
    // Where installing isn't possible (unsigned mac, non-AppImage Linux)
    // never auto-download — checkForUpdates() still reports availability
    // and the renderer's actions open the releases page.
    autoUpdater.autoDownload = updatesInstallable();
    autoUpdater.autoInstallOnAppQuit = updatesInstallable();
    // Surface the updater's own logs through the normal console.
    autoUpdater.logger = console;

    autoUpdater.on("download-progress", (p) => {
      this.send({
        channel: "update-download-progress",
        payload: {
          bytesDownloaded: p.transferred,
          bytesTotal: p.total,
          percentComplete: Math.round(p.percent),
          status: "downloading",
        },
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.downloadedInfo = this.toUpdateInfo(info);
      this.send({ channel: "update-ready", payload: this.downloadedInfo });
    });

    autoUpdater.on("error", (err) => {
      console.warn("[auto-update] error:", err);
      this.send({
        channel: "update-error",
        payload: err instanceof Error ? err.message : String(err),
      });
    });
  }

  /** Map electron-updater's UpdateInfo onto our renderer-facing shape. */
  private toUpdateInfo(info: EuUpdateInfo): UpdateInfo {
    const notes =
      typeof info.releaseNotes === "string"
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => n.note ?? "").join("\n\n")
          : "";
    return {
      version: info.version,
      releaseNotes: notes,
      downloadUrl: RELEASES_PAGE,
      publishedAt: info.releaseDate ?? "",
      size: info.files?.[0]?.size ?? 0,
    };
  }

  /**
   * Check GitHub for a newer release. With autoDownload enabled this also
   * kicks off the background download; the renderer is notified via
   * `update-ready` when it finishes. No-op (returns "not available") in
   * dev / unpackaged runs.
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();

    if (!app.isPackaged) {
      console.log("[auto-update] skipped — app is not packaged (dev mode)");
      return { available: false, currentVersion };
    }

    const result = await autoUpdater.checkForUpdates();
    const available = Boolean(
      result?.updateInfo &&
        result.updateInfo.version !== currentVersion &&
        result.isUpdateAvailable !== false
    );

    if (!available || !result) {
      return { available: false, currentVersion };
    }

    const updateInfo = this.toUpdateInfo(result.updateInfo);
    return {
      available: true,
      currentVersion,
      latestVersion: updateInfo.version,
      updateInfo,
    };
  }

  /**
   * Explicitly download the update (used when autoDownload is off, e.g. a
   * manual "check now"). Safe to call again after an automatic download.
   */
  async downloadUpdate(): Promise<void> {
    if (!app.isPackaged) return;
    if (!updatesInstallable()) {
      // Notify-only platforms: hand the user to the releases page — the
      // updater can't replace the app here.
      await shell.openExternal(RELEASES_PAGE);
      return;
    }
    await autoUpdater.downloadUpdate();
  }

  /**
   * Quit and install the downloaded update SILENTLY, then relaunch. NSIS
   * runs with no wizard because the install is per-user (no UAC) and we
   * pass isSilent=true. isForceRunAfter=true restarts the app.
   */
  async installUpdate(): Promise<void> {
    if (!updatesInstallable()) {
      await shell.openExternal(RELEASES_PAGE);
      return;
    }
    if (!this.downloadedInfo) {
      throw new Error("No update has been downloaded yet");
    }
    // Defer so the IPC reply flushes before the app tears down.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }

  /** electron-updater manages its own cache; no user-facing path to show. */
  getDownloadedInstallerPath(): string | null {
    return null;
  }

  /** electron-updater has no first-class cancel; kept for IPC compatibility. */
  cancelDownload(): void {
    /* no-op */
  }
}
