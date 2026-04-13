import { app } from "electron";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type {
  UpdateInfo,
  UpdateCheckResult,
  UpdateDownloadProgress,
} from "../../core/types.js";

// ── Configuration ──────────────────────────────────────────────────
const GITHUB_OWNER = "Javierferrerc";
const GITHUB_REPO = "EmuraOS";
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

/**
 * Compares two semver strings (e.g. "1.2.3" vs "1.3.0").
 * Returns true if `latest` is newer than `current`.
 */
function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map(Number);
  const [cMajor, cMinor, cPatch] = parse(current);
  const [lMajor, lMinor, lPatch] = parse(latest);
  if (lMajor !== cMajor) return lMajor > cMajor;
  if (lMinor !== cMinor) return lMinor > cMinor;
  return lPatch > cPatch;
}

export class AutoUpdater {
  private abortController: AbortController | null = null;
  private downloadedInstallerPath: string | null = null;

  /**
   * Query GitHub Releases API for the latest release and compare its
   * tag against the running app version.
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();
    console.log("[auto-update] checking for updates... current version:", currentVersion);

    const res = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }

    const release = (await res.json()) as {
      tag_name: string;
      body: string;
      published_at: string;
      assets: { name: string; browser_download_url: string; size: number }[];
    };

    const latestVersion = release.tag_name.replace(/^v/, "");

    console.log("[auto-update] latest release:", latestVersion, "| assets:", release.assets.map(a => a.name));

    if (!isNewerVersion(currentVersion, latestVersion)) {
      console.log("[auto-update] no update needed");
      return { available: false, currentVersion };
    }

    // Find the Squirrel Setup .exe asset
    const setupAsset = release.assets.find(
      (a) => a.name.toLowerCase().endsWith(".exe") && /setup/i.test(a.name)
    );

    if (!setupAsset) {
      console.log("[auto-update] update available but no Setup .exe asset found");
      return { available: false, currentVersion };
    }

    return {
      available: true,
      currentVersion,
      latestVersion,
      updateInfo: {
        version: latestVersion,
        releaseNotes: release.body ?? "",
        downloadUrl: setupAsset.browser_download_url,
        publishedAt: release.published_at,
        size: setupAsset.size,
      },
    };
  }

  /**
   * Stream-download the installer to the temp directory, reporting
   * progress via the callback.
   */
  async downloadUpdate(
    url: string,
    onProgress: (progress: UpdateDownloadProgress) => void
  ): Promise<string> {
    this.abortController = new AbortController();

    const res = await fetch(url, { signal: this.abortController.signal });
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}`);
    }

    const bytesTotal = Number(res.headers.get("content-length") ?? 0);
    const fileName = url.split("/").pop() ?? "emuraos-update.exe";
    const destPath = path.join(app.getPath("temp"), fileName);

    let bytesDownloaded = 0;

    // Create a transform that reports progress as bytes flow through
    const body = res.body;
    if (!body) throw new Error("No response body");

    const reader = body.getReader();
    const progressStream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        bytesDownloaded += value.byteLength;
        onProgress({
          bytesDownloaded,
          bytesTotal,
          percentComplete: bytesTotal > 0
            ? Math.round((bytesDownloaded / bytesTotal) * 100)
            : 0,
          status: "downloading",
        });
        controller.enqueue(value);
      },
      cancel() {
        reader.cancel();
      },
    });

    const nodeStream = Readable.fromWeb(progressStream as import("node:stream/web").ReadableStream);
    const fileStream = createWriteStream(destPath);

    try {
      await pipeline(nodeStream, fileStream);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.name === "AbortError"
      ) {
        onProgress({
          bytesDownloaded,
          bytesTotal,
          percentComplete: Math.round((bytesDownloaded / bytesTotal) * 100),
          status: "cancelled",
        });
        throw err;
      }
      throw err;
    }

    onProgress({
      bytesDownloaded: bytesTotal,
      bytesTotal,
      percentComplete: 100,
      status: "complete",
    });

    this.downloadedInstallerPath = destPath;
    this.abortController = null;
    return destPath;
  }

  /**
   * Launch the downloaded Squirrel installer and quit the current app.
   */
  installUpdate(): void {
    const installerPath = this.downloadedInstallerPath;
    if (!installerPath) {
      throw new Error("No downloaded installer available");
    }
    spawn(installerPath, [], {
      detached: true,
      stdio: "ignore",
    }).unref();
    app.quit();
  }

  /**
   * Abort an in-progress download.
   */
  cancelDownload(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
