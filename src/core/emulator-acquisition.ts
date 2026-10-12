/**
 * Multi-provider emulator acquisition (PHASE 28).
 *
 * The in-app "Download" button routes through here. Which provider serves a
 * given emulator on the running OS comes from emulators.json
 * (`acquisition` per definition):
 *   - https:   pinned official archive (.zip/.7z), optionally SHA-256 checked
 *   - github:  latest official release asset resolved via the GitHub API,
 *              falling back to the pinned `url` if the API is unavailable
 *   - manual:  no direct download — the UI links to the official page
 *   - gdrive:  curated portable Windows build (legacy EmulatorDownloader)
 *   - flatpak: `flatpak install --user -y flathub <appId>` (Linux)
 * https/github extract under {emulatorsPath}/{emulatorId}/.
 *
 * All providers report through the same EmulatorDownloadProgress channel the
 * renderer already renders, so the download UI is identical on every OS.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type {
  EmulatorAcquisition,
  EmulatorDefinition,
  EmulatorDownloadProgress,
} from "./types.js";
import { EmulatorDownloader } from "./emulator-downloader.js";
import { extractZipBufferTo } from "./zip-utils.js";
import { extract7zBufferTo } from "./archive-utils.js";

export interface AcquisitionResult {
  success: boolean;
  installPath: string;
  error?: string;
}

/** Providers the app can install by itself (no Drive, no user action). */
export const DIRECT_PROVIDERS = new Set<EmulatorAcquisition["provider"]>([
  "https",
  "github",
]);

const ALLOWED_HTTPS_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "buildbot.libretro.com",
  "dl.dolphin-emu.org",
  "www.pj64-emu.com",
  "www.carpeludum.com",
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
    case "github":
      return downloadArchive(def, emulatorsPath, onProgress, signal);
    case "manual": {
      const msg = "Este emulador se instala manualmente desde su página oficial";
      onProgress({
        emulatorId: def.id,
        phase: "error",
        filesCompleted: 0,
        filesTotal: 0,
        bytesReceived: 0,
        bytesTotal: 0,
        message: msg,
      });
      return { success: false, installPath: "", error: msg };
    }
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

/**
 * If the zip wrapped everything in a single top-level folder (e.g. Cemu ships
 * `Cemu_2.6/Cemu.exe`), hoist its contents up so the executable lands at
 * `{installPath}/{executable}` where EmulatorDetector expects it. The wrapper
 * dir is renamed to a temp name first so a child sharing its name can't
 * collide during the moves.
 */
export function flattenSingleRootDir(
  installPath: string,
  extracted: string[]
): void {
  const roots = new Set(extracted.map((e) => e.split(/[/\\]/, 1)[0]));
  if (roots.size !== 1) return;
  const root = [...roots][0];
  // A lone top-level *file* (single-entry zips like melonDS) needs no work.
  if (extracted.some((e) => !/[/\\]/.test(e))) return;

  const tmp = join(installPath, `.${root}.unwrap`);
  renameSync(join(installPath, root), tmp);
  for (const child of readdirSync(tmp)) {
    renameSync(join(tmp, child), join(installPath, child));
  }
  rmdirSync(tmp);
}

/** Archive format of an acquisition: explicit `archive`, else the URL's
 *  extension (.7z), else zip. */
export function archiveFormatOf(
  acq: EmulatorAcquisition | undefined,
  url: string
): "zip" | "7z" {
  if (acq?.archive) return acq.archive;
  return /\.7z(?:[?#]|$)/i.test(url) ? "7z" : "zip";
}

/**
 * Resolve the download URL of a "github" acquisition: the first asset of the
 * repo's latest release whose name matches `asset`. Returns null when the API
 * is unreachable/rate-limited or nothing matches — callers fall back to the
 * pinned `url`.
 */
export async function resolveGithubAssetUrl(
  acq: EmulatorAcquisition,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  if (!acq.repo || !acq.asset || !/^[\w.-]+\/[\w.-]+$/.test(acq.repo)) {
    return null;
  }
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${acq.repo}/releases/latest`,
      {
        signal,
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "EmuraOS",
        },
      }
    );
    if (!res.ok) return null;
    const release = (await res.json()) as {
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };
    const re = new RegExp(acq.asset, "i");
    const match = release.assets?.find(
      (a) => typeof a.name === "string" && re.test(a.name)
    );
    const url = match?.browser_download_url;
    return url && isAllowedAcquisitionUrl(url) ? url : null;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return null;
  }
}

/** Download an official release archive (.zip or .7z) and extract it under
 *  {emulatorsPath}/{emulatorId}/. Streaming download with byte progress;
 *  extraction is path-traversal safe. The archive is unpacked into a staging
 *  dir and then merged over the install dir, so files the user created there
 *  (portable configs, saves) survive a re-download/update. */
async function downloadArchive(
  def: EmulatorDefinition,
  emulatorsPath: string,
  onProgress: (p: EmulatorDownloadProgress) => void,
  signal?: AbortSignal
): Promise<AcquisitionResult> {
  const acq = def.acquisition;
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

  const stagingPath = join(emulatorsPath, `.${def.id}.staging`);

  try {
    emit("listing", 0, 0);

    // "github": prefer the latest release asset; the pinned url is only a
    // fallback (API down / rate-limited). Integrity pins only apply to the
    // pinned url — a newer release necessarily has a different hash.
    let url = acq?.url;
    let pinned = true;
    if (acq?.provider === "github") {
      const latest = await resolveGithubAssetUrl(acq, signal);
      if (latest) {
        url = latest;
        pinned = false;
      }
    }

    if (!url || !isAllowedAcquisitionUrl(url)) {
      const msg = `Download URL missing or not allowlisted: ${url ?? "(none)"}`;
      emit("error", 0, 0, msg);
      return { success: false, installPath, error: msg };
    }

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

    const archive = Buffer.concat(chunks);
    if (pinned && acq?.sha256) {
      const digest = createHash("sha256").update(archive).digest("hex");
      if (digest.toLowerCase() !== acq.sha256.toLowerCase()) {
        throw new Error(
          `El archivo descargado no coincide con la huella esperada (SHA-256 ${digest})`
        );
      }
    }

    emit("finalizing", bytesReceived, bytesTotal, "Extrayendo…");
    rmSync(stagingPath, { recursive: true, force: true });
    mkdirSync(stagingPath, { recursive: true });
    const extracted =
      archiveFormatOf(acq, url) === "7z"
        ? await extract7zBufferTo(archive, stagingPath)
        : extractZipBufferTo(archive, stagingPath);
    flattenSingleRootDir(stagingPath, extracted);

    if (!existsSync(join(stagingPath, def.executable))) {
      throw new Error(
        `El archivo descargado no contiene ${def.executable}`
      );
    }

    mkdirSync(installPath, { recursive: true });
    cpSync(stagingPath, installPath, { recursive: true, force: true });
    rmSync(stagingPath, { recursive: true, force: true });

    emit("done", bytesReceived, bytesTotal);
    return { success: true, installPath };
  } catch (err) {
    rmSync(stagingPath, { recursive: true, force: true });
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
