/**
 * Multi-provider emulator acquisition (PHASE 28).
 *
 * The in-app "Download" button routes through here. Which provider serves a
 * given emulator on the running OS comes from emulators.json v2
 * (`acquisition` per platform):
 *   - gdrive:  curated portable Windows build (existing EmulatorDownloader)
 *   - https:   official release zip, downloaded + extracted under
 *              {emulatorsPath}/{emulatorId}/
 *   - flatpak: `flatpak install --user -y flathub <appId>` (Linux)
 *
 * All providers report through the same EmulatorDownloadProgress channel the
 * renderer already renders, so the download UI is identical on every OS.
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  EmulatorDefinition,
  EmulatorDownloadProgress,
} from "./types.js";
import { EmulatorDownloader } from "./emulator-downloader.js";
import { extractZipBufferTo } from "./zip-utils.js";

export interface AcquisitionResult {
  success: boolean;
  installPath: string;
  error?: string;
}

const ALLOWED_HTTPS_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "buildbot.libretro.com",
]);

/** Only well-known release hosts may serve emulator archives — a tampered
 *  emulators.json must not turn the downloader into a generic fetch-and-run
 *  primitive. */
export function isAllowedAcquisitionUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ALLOWED_HTTPS_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function acquireEmulator(
  def: EmulatorDefinition,
  emulatorsPath: string,
  projectRoot: string,
  onProgress: (p: EmulatorDownloadProgress) => void,
  signal?: AbortSignal
): Promise<AcquisitionResult> {
  const provider = def.acquisition?.provider ?? "gdrive";

  switch (provider) {
    case "flatpak":
      return installFlatpak(def, onProgress, signal);
    case "https":
      return downloadHttpsZip(def, emulatorsPath, onProgress, signal);
    case "gdrive":
    default: {
      const downloader = new EmulatorDownloader(projectRoot);
      return downloader.download(def.id, emulatorsPath, onProgress, signal);
    }
  }
}

/** Install from Flathub. Non-interactive (-y), user scope (no root), and
 *  cancellable — aborting kills the flatpak process, which is safe to re-run
 *  (flatpak resumes/verifies on the next attempt). */
function installFlatpak(
  def: EmulatorDefinition,
  onProgress: (p: EmulatorDownloadProgress) => void,
  signal?: AbortSignal
): Promise<AcquisitionResult> {
  const appId = def.acquisition?.appId;
  const emit = (
    phase: EmulatorDownloadProgress["phase"],
    message?: string
  ): void =>
    onProgress({
      emulatorId: def.id,
      phase,
      filesCompleted: 0,
      filesTotal: 0,
      bytesReceived: 0,
      bytesTotal: 0,
      message,
    });

  if (!appId) {
    emit("error", "No Flatpak app id configured");
    return Promise.resolve({
      success: false,
      installPath: "",
      error: "No Flatpak app id configured",
    });
  }

  emit("downloading", `flatpak install ${appId}`);

  return new Promise((resolvePromise) => {
    const child = spawn(
      "flatpak",
      ["install", "--user", "-y", "--noninteractive", "flathub", appId],
      { stdio: ["ignore", "pipe", "pipe"], shell: false }
    );

    let lastLine = "";
    const onData = (data: Buffer): void => {
      const line = data.toString().trim().split("\n").pop()?.trim();
      if (line && line !== lastLine) {
        lastLine = line;
        emit("downloading", line);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    const onAbort = (): void => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      const msg =
        err.message.includes("ENOENT")
          ? "flatpak no está instalado en este sistema"
          : err.message;
      emit("error", msg);
      resolvePromise({ success: false, installPath: "", error: msg });
    });

    child.on("exit", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        emit("cancelled");
        resolvePromise({ success: false, installPath: "", error: "cancelled" });
        return;
      }
      if (code === 0) {
        emit("done");
        resolvePromise({ success: true, installPath: `flatpak:${appId}` });
      } else {
        const msg = `flatpak install exited with code ${code}: ${lastLine}`;
        emit("error", msg);
        resolvePromise({ success: false, installPath: "", error: msg });
      }
    });
  });
}

/** Download an official release zip and extract it under
 *  {emulatorsPath}/{emulatorId}/. Streaming download with byte progress;
 *  extraction is zip-slip safe and preserves POSIX execute bits (so .app
 *  bundles and Linux binaries stay runnable). */
async function downloadHttpsZip(
  def: EmulatorDefinition,
  emulatorsPath: string,
  onProgress: (p: EmulatorDownloadProgress) => void,
  signal?: AbortSignal
): Promise<AcquisitionResult> {
  const url = def.acquisition?.url;
  const installPath = join(emulatorsPath, def.id);
  const emit = (
    phase: EmulatorDownloadProgress["phase"],
    bytesReceived: number,
    bytesTotal: number,
    message?: string
  ): void =>
    onProgress({
      emulatorId: def.id,
      phase,
      filesCompleted: 0,
      filesTotal: 1,
      bytesReceived,
      bytesTotal,
      message,
    });

  if (!url || !isAllowedAcquisitionUrl(url)) {
    const msg = `Download URL missing or not allowlisted: ${url ?? "(none)"}`;
    emit("error", 0, 0, msg);
    return { success: false, installPath, error: msg };
  }

  try {
    emit("listing", 0, 0);
    const response = await fetch(url, { signal, redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }

    const bytesTotal = Number(response.headers.get("content-length") ?? 0);
    const chunks: Buffer[] = [];
    let bytesReceived = 0;
    for await (const chunk of response.body) {
      const buf = Buffer.from(chunk);
      chunks.push(buf);
      bytesReceived += buf.length;
      emit("downloading", bytesReceived, bytesTotal);
    }

    emit("finalizing", bytesReceived, bytesTotal, "Extrayendo…");
    mkdirSync(installPath, { recursive: true });
    extractZipBufferTo(Buffer.concat(chunks), installPath);

    emit("done", bytesReceived, bytesTotal);
    return { success: true, installPath };
  } catch (err) {
    if (
      (err instanceof DOMException || err instanceof Error) &&
      err.name === "AbortError"
    ) {
      emit("cancelled", 0, 0);
      return { success: false, installPath, error: "cancelled" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    emit("error", 0, 0, msg);
    return { success: false, installPath, error: msg };
  }
}
