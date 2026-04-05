import { createWriteStream, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** bytes; folders/shortcuts/google-docs have no size */
  size?: number;
}

export interface DriveFileEntry {
  id: string;
  /** path relative to the emulator root, e.g. "plugins/fx/shader.fx" */
  relPath: string;
  size: number;
}

interface DriveApiListResponse {
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
  }>;
  nextPageToken?: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";

interface GDriveConfigFile {
  rootFolderId: string;
  apiKey: string;
}

/**
 * Load the Drive config from disk. Read at runtime (not via `import(...)`)
 * so the bundler never tries to statically resolve the gitignored file —
 * Rollup rejects unresolvable imports regardless of `try/catch`. Falls back
 * through three layers:
 *   1. `{projectRoot}/config/gdrive-config.json` (real, gitignored)
 *   2. `{projectRoot}/config/gdrive-config.example.json` (committed template)
 *   3. empty strings, so downstream API calls return 400 and the UI
 *      gracefully shows every emulator as "Not available yet"
 */
function loadDriveConfig(projectRoot: string): GDriveConfigFile {
  const real = pathResolve(projectRoot, "config", "gdrive-config.json");
  const example = pathResolve(
    projectRoot,
    "config",
    "gdrive-config.example.json"
  );
  for (const candidate of [real, example]) {
    try {
      const raw = readFileSync(candidate, "utf-8");
      const parsed = JSON.parse(raw) as Partial<GDriveConfigFile>;
      if (parsed.rootFolderId && parsed.apiKey) {
        return {
          rootFolderId: parsed.rootFolderId,
          apiKey: parsed.apiKey,
        };
      }
    } catch {
      // ignore and try next candidate
    }
  }
  return { rootFolderId: "", apiKey: "" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GDriveClient {
  private projectRoot: string;
  private configPromise: Promise<GDriveConfigFile> | null = null;
  /** Test-only override: when set by tests, bypasses the JSON file lookup. */
  protected apiKeyPromise: Promise<string> | null = null;
  protected rootFolderIdPromise: Promise<string> | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  private getConfig(): Promise<GDriveConfigFile> {
    if (!this.configPromise) {
      this.configPromise = Promise.resolve(loadDriveConfig(this.projectRoot));
    }
    return this.configPromise;
  }

  private async getApiKey(): Promise<string> {
    if (this.apiKeyPromise) return this.apiKeyPromise;
    return (await this.getConfig()).apiKey;
  }

  async getRootFolderId(): Promise<string> {
    if (this.rootFolderIdPromise) return this.rootFolderIdPromise;
    return (await this.getConfig()).rootFolderId;
  }

  /**
   * Fetch a Drive API endpoint with retry on 429/5xx (3 attempts,
   * exponential backoff 1s/2s/4s).
   */
  private async fetchWithRetry(url: string): Promise<Response> {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) return res;
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`HTTP ${res.status} from ${url}`);
          if (attempt < maxAttempts - 1) {
            await sleep(1000 * Math.pow(2, attempt));
            continue;
          }
        }
        throw new Error(`HTTP ${res.status} from ${url}`);
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts - 1) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError));
  }

  /**
   * List the immediate children of a folder. Handles pagination via
   * `nextPageToken` for folders with more than `pageSize` items.
   */
  async listFolder(folderId: string): Promise<DriveFile[]> {
    const apiKey = await this.getApiKey();
    const results: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const fields = encodeURIComponent(
        "nextPageToken,files(id,name,mimeType,size)"
      );
      let url =
        `${DRIVE_API_BASE}?q=${q}&key=${apiKey}` +
        `&fields=${fields}&pageSize=1000`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const res = await this.fetchWithRetry(url);
      const data = (await res.json()) as DriveApiListResponse;

      for (const f of data.files ?? []) {
        results.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? Number(f.size) : undefined,
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return results;
  }

  /**
   * Recursively walk a folder and return a flat list of all non-folder files
   * with paths relative to that folder. Google-native files (Docs/Sheets/etc)
   * are skipped because they can't be downloaded via alt=media.
   */
  async listFolderRecursive(folderId: string): Promise<DriveFileEntry[]> {
    const out: DriveFileEntry[] = [];

    const walk = async (id: string, relBase: string): Promise<void> => {
      const children = await this.listFolder(id);
      for (const child of children) {
        const childRel = relBase ? `${relBase}/${child.name}` : child.name;
        if (child.mimeType === FOLDER_MIME) {
          await walk(child.id, childRel);
          continue;
        }
        // Skip Google-native files (Docs, Sheets, Shortcuts…); they can't
        // be downloaded with alt=media.
        if (child.mimeType.startsWith("application/vnd.google-apps.")) {
          continue;
        }
        out.push({
          id: child.id,
          relPath: childRel,
          size: child.size ?? 0,
        });
      }
    };

    await walk(folderId, "");
    return out;
  }

  /**
   * Stream a file's bytes to `destPath` via the Drive API's alt=media
   * endpoint. Calls `onBytes(delta)` for each chunk as it arrives.
   */
  async downloadFile(
    fileId: string,
    destPath: string,
    onBytes: (deltaBytes: number) => void
  ): Promise<void> {
    const apiKey = await this.getApiKey();
    const url = `${DRIVE_API_BASE}/${fileId}?alt=media&key=${apiKey}`;

    const res = await this.fetchWithRetry(url);
    if (!res.body) {
      throw new Error(`Empty response body for file ${fileId}`);
    }

    // Wrap the web ReadableStream with a passthrough that reports chunk
    // sizes, then pipe to the destination file.
    const webStream = res.body as unknown as ReadableStream<Uint8Array>;
    const reader = webStream.getReader();

    const nodeReadable = new Readable({
      read: async () => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            nodeReadable.push(null);
            return;
          }
          onBytes(value.byteLength);
          nodeReadable.push(Buffer.from(value));
        } catch (err) {
          nodeReadable.destroy(
            err instanceof Error ? err : new Error(String(err))
          );
        }
      },
    });

    await pipeline(nodeReadable, createWriteStream(destPath));
  }
}
