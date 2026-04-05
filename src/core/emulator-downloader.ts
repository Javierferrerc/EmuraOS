import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  DriveEmulatorMapping,
  EmulatorDefinition,
  EmulatorDownloadProgress,
} from "./types.js";
import { GDriveClient, type DriveFileEntry } from "./gdrive-client.js";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DOWNLOAD_CONCURRENCY = 4;
const PROGRESS_EMIT_INTERVAL_MS = 100;

/**
 * Run up to `limit` async workers in parallel, each pulling the next item
 * from the supplied queue. Returns when the queue is drained or any worker
 * throws — the first error is re-thrown after all in-flight workers finish.
 */
async function runParallel<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  let firstError: unknown;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length && firstError === undefined) {
      const i = index++;
      try {
        await worker(items[i]);
      } catch (err) {
        if (firstError === undefined) firstError = err;
      }
    }
  });

  await Promise.all(runners);
  if (firstError !== undefined) {
    throw firstError instanceof Error ? firstError : new Error(String(firstError));
  }
}

export class EmulatorDownloader {
  private client: GDriveClient;

  constructor(clientOrProjectRoot?: GDriveClient | string) {
    if (clientOrProjectRoot instanceof GDriveClient) {
      this.client = clientOrProjectRoot;
    } else {
      this.client = new GDriveClient(clientOrProjectRoot);
    }
  }

  /**
   * List all downloadable emulators in the Drive root folder. Returns a map
   * from emulatorId (lowercase) → folder metadata, for every subfolder whose
   * name matches an entry in `emulatorDefs` (case-insensitive).
   *
   * Intentionally does NOT recurse into each matched folder — for a tree
   * with many emulators (RetroArch alone is ~500 files across many nested
   * dirs), recursive enumeration turns into hundreds of sequential Drive
   * API calls and blocks the Settings UI for 30+ seconds. `fileCount` and
   * `totalBytes` are therefore left at 0; the real enumeration happens
   * inside `download()` when the user actually clicks Download.
   */
  async listAvailable(
    emulatorDefs: EmulatorDefinition[]
  ): Promise<Record<string, DriveEmulatorMapping>> {
    const rootId = await this.client.getRootFolderId();
    const rootChildren = await this.client.listFolder(rootId);

    // Build lowercase-id → definition lookup for O(1) matching.
    const defsByLowerId = new Map<string, EmulatorDefinition>();
    for (const def of emulatorDefs) {
      defsByLowerId.set(def.id.toLowerCase(), def);
    }

    const mapping: Record<string, DriveEmulatorMapping> = {};
    for (const child of rootChildren) {
      if (child.mimeType !== FOLDER_MIME) continue;
      const def = defsByLowerId.get(child.name.toLowerCase());
      if (!def) continue;
      mapping[def.id.toLowerCase()] = {
        emulatorId: def.id,
        folderId: child.id,
        fileCount: 0,
        totalBytes: 0,
      };
    }

    return mapping;
  }

  /**
   * Download and mirror one emulator's folder into
   * `{emulatorsPath}/{emulatorId}/`. Resumable: files that already exist at
   * the destination with the expected size are skipped.
   */
  async download(
    emulatorId: string,
    emulatorsPath: string,
    onProgress: (p: EmulatorDownloadProgress) => void
  ): Promise<{ success: boolean; installPath: string; error?: string }> {
    const installPath = join(emulatorsPath, emulatorId);
    const lowerId = emulatorId.toLowerCase();

    // Phase 1: resolve the Drive folder for this emulator. We re-enumerate
    // rather than trusting a stale cached mapping — users may click Download
    // minutes after opening Settings.
    onProgress({
      emulatorId,
      phase: "listing",
      filesCompleted: 0,
      filesTotal: 0,
      bytesReceived: 0,
      bytesTotal: 0,
    });

    let entries: DriveFileEntry[];
    try {
      const rootId = await this.client.getRootFolderId();
      const rootChildren = await this.client.listFolder(rootId);
      const match = rootChildren.find(
        (c) =>
          c.mimeType === FOLDER_MIME && c.name.toLowerCase() === lowerId
      );
      if (!match) {
        const msg = `No Drive folder matches emulator "${emulatorId}"`;
        onProgress({
          emulatorId,
          phase: "error",
          filesCompleted: 0,
          filesTotal: 0,
          bytesReceived: 0,
          bytesTotal: 0,
          message: msg,
        });
        return { success: false, installPath, error: msg };
      }
      entries = await this.client.listFolderRecursive(match.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress({
        emulatorId,
        phase: "error",
        filesCompleted: 0,
        filesTotal: 0,
        bytesReceived: 0,
        bytesTotal: 0,
        message: msg,
      });
      return { success: false, installPath, error: msg };
    }

    // Phase 2: download. Create the destination root and precompute totals.
    mkdirSync(installPath, { recursive: true });
    const filesTotal = entries.length;
    const bytesTotal = entries.reduce((sum, e) => sum + e.size, 0);
    let bytesReceived = 0;
    let filesCompleted = 0;
    let currentFile: string | undefined;
    let lastEmitAt = 0;

    const emitProgress = (force = false): void => {
      const now = Date.now();
      if (!force && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS) return;
      lastEmitAt = now;
      onProgress({
        emulatorId,
        phase: "downloading",
        filesCompleted,
        filesTotal,
        bytesReceived,
        bytesTotal,
        currentFile,
      });
    };

    emitProgress(true);

    try {
      await runParallel(entries, DOWNLOAD_CONCURRENCY, async (entry) => {
        const destPath = join(installPath, entry.relPath);
        mkdirSync(dirname(destPath), { recursive: true });

        // Resume: skip if a file already exists at the target with the
        // expected size. Accounts for both bytes and file count so the
        // progress bar jumps correctly past already-downloaded files.
        if (existsSync(destPath)) {
          try {
            if (statSync(destPath).size === entry.size) {
              bytesReceived += entry.size;
              filesCompleted += 1;
              currentFile = entry.relPath;
              emitProgress();
              return;
            }
          } catch {
            // stat failed — fall through to redownload
          }
        }

        currentFile = entry.relPath;
        await this.client.downloadFile(entry.id, destPath, (delta) => {
          bytesReceived += delta;
          emitProgress();
        });
        filesCompleted += 1;
        emitProgress();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress({
        emulatorId,
        phase: "error",
        filesCompleted,
        filesTotal,
        bytesReceived,
        bytesTotal,
        currentFile,
        message: msg,
      });
      return { success: false, installPath, error: msg };
    }

    onProgress({
      emulatorId,
      phase: "finalizing",
      filesCompleted,
      filesTotal,
      bytesReceived,
      bytesTotal,
    });

    onProgress({
      emulatorId,
      phase: "done",
      filesCompleted,
      filesTotal,
      bytesReceived,
      bytesTotal,
    });

    return { success: true, installPath };
  }
}
