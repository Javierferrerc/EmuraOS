import { createWriteStream, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { logSecurityEvent } from "./security-logger.js";

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
 * Load the Drive config. Priority order:
 *   1. Environment variables (GDRIVE_API_KEY, GDRIVE_ROOT_FOLDER_ID)
 *   2. `{projectRoot}/config/gdrive-config.json` (real, gitignored)
 *   3. `{projectRoot}/config/gdrive-config.example.json` (committed template)
 *   4. empty strings, so downstream API calls return 400 and the UI
 *      gracefully shows every emulator as "Not available yet"
 */
function loadDriveConfig(projectRoot: string): GDriveConfigFile {
  // Check environment variables first
  const envApiKey = process.env.GDRIVE_API_KEY;
  const envFolderId = process.env.GDRIVE_ROOT_FOLDER_ID;
  if (envApiKey && envFolderId) {
    return { rootFolderId: envFolderId, apiKey: envApiKey };
  }

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
  private async fetchWithRetry(
    url: string,
    signal?: AbortSignal
  ): Promise<Response> {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      signal?.throwIfAborted();
      try {
        const res = await fetch(url, signal ? { signal } : undefined);
        if (res.ok) return res;
        if (res.status === 401 || res.status === 403) {
          logSecurityEvent({
            type: "AUTH_FAILURE",
            detail: `GDrive API returned ${res.status}`,
            severity: "error",
          });
        }
        if (res.status === 429 || res.status >= 500) {
          logSecurityEvent({
            type: "RATE_LIMIT_HIT",
            detail: `GDrive API returned ${res.status}, attempt ${attempt + 1}/${maxAttempts}`,
            severity: "warn",
          });
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
  async listFolder(
    folderId: string,
    signal?: AbortSignal
  ): Promise<DriveFile[]> {
    const apiKey = await this.getApiKey();
    const results: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      signal?.throwIfAborted();
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

      const res = await this.fetchWithRetry(url, signal);
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
   *
   * Subfolders at each level are listed in parallel (up to 6 concurrent API
   * calls) to cut enumeration time from 20+ seconds to a few seconds for
   * large trees like RetroArch.
   */
  async listFolderRecursive(
    folderId: string,
    signal?: AbortSignal
  ): Promise<DriveFileEntry[]> {
    const out: DriveFileEntry[] = [];
    const LISTING_CONCURRENCY = 6;

    const walk = async (id: string, relBase: string): Promise<void> => {
      signal?.throwIfAborted();
      const children = await this.listFolder(id, signal);

      const subfolders: { id: string; rel: string }[] = [];
      for (const child of children) {
        const childRel = relBase ? `${relBase}/${child.name}` : child.name;
        if (child.mimeType === FOLDER_MIME) {
          subfolders.push({ id: child.id, rel: childRel });
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

      // Walk subfolders in parallel with a concurrency limit to avoid
      // hammering the Drive API with too many simultaneous requests.
      if (subfolders.length > 0) {
        let idx = 0;
        const runners = Array.from(
          { length: Math.min(LISTING_CONCURRENCY, subfolders.length) },
          async () => {
            while (idx < subfolders.length) {
              const i = idx++;
              await walk(subfolders[i].id, subfolders[i].rel);
            }
          }
        );
        await Promise.all(runners);
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
    onBytes: (deltaBytes: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    // Use the direct usercontent endpoint (skips the 303 redirect that
    // drive.google.com/uc does). The API alt=media endpoint requires OAuth2,
    // but this public endpoint works for any shared file.
    let url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;

    let res = await this.fetchWithRetry(url, signal);

    // For large files Google returns an HTML virus-scan confirmation page
    // instead of the file. Detect this and retry with confirm=t.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      url += "&confirm=t";
      res = await this.fetchWithRetry(url, signal);
    }

    if (!res.body) {
      throw new Error(`Empty response body for file ${fileId}`);
    }

    // Stream chunks from the web ReadableStream into the destination file,
    // reporting progress for each chunk.
    const webStream = res.body as unknown as ReadableStream<Uint8Array>;
    const reader = webStream.getReader();
    const writer = createWriteStream(destPath);

    try {
      for (;;) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        onBytes(value.byteLength);
        const ok = writer.write(Buffer.from(value));
        if (!ok) {
          await new Promise<void>((resolve) => writer.once("drain", resolve));
        }
      }
    } finally {
      writer.end();
      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    }
  }
}
