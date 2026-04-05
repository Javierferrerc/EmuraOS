import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import { resolve, join } from "node:path";
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  statSync,
} from "node:fs";
import { EmulatorDownloader } from "../../src/core/emulator-downloader.js";
import { GDriveClient } from "../../src/core/gdrive-client.js";
import type {
  EmulatorDefinition,
  EmulatorDownloadProgress,
} from "../../src/core/types.js";

const TEST_ROOT = resolve(import.meta.dirname, "__test_emulator_downloader__");
const FAKE_ROOT_FOLDER_ID = "test-root-folder-id";

const FOLDER_MIME = "application/vnd.google-apps.folder";

interface FakeDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents: string[];
  /** For non-folder files: the bytes served by alt=media. */
  content?: Uint8Array;
}

function makeDef(id: string, name = id): EmulatorDefinition {
  return {
    id,
    name,
    executable: `${id}.exe`,
    defaultPaths: [],
    systems: [],
    launchTemplate: "",
    args: {},
    defaultArgs: "",
  };
}

/**
 * Minimal in-memory Drive API simulator. Backs `fetch` by routing list
 * calls to `listResponse` and alt=media calls to the file content.
 */
class FakeDrive {
  files: FakeDriveFile[] = [];

  addFolder(name: string, parents: string[], id = `folder-${name}`): string {
    this.files.push({ id, name, mimeType: FOLDER_MIME, parents });
    return id;
  }

  addFile(
    name: string,
    parents: string[],
    content: Uint8Array,
    id = `file-${name}-${Math.random().toString(36).slice(2, 8)}`,
    mimeType = "application/octet-stream"
  ): string {
    this.files.push({
      id,
      name,
      mimeType,
      size: String(content.byteLength),
      parents,
      content,
    });
    return id;
  }

  /** Build a `fetch` mock that answers list + alt=media requests. */
  buildFetch(): (url: string) => Promise<Response> {
    return async (url: string) => {
      const u = new URL(url);

      // alt=media download endpoint:  /drive/v3/files/{fileId}?alt=media&key=...
      if (u.searchParams.get("alt") === "media") {
        const match = u.pathname.match(/\/files\/([^/]+)$/);
        const fileId = match?.[1];
        const file = this.files.find((f) => f.id === fileId);
        if (!file || !file.content) {
          return new Response(null, { status: 404 });
        }
        return new Response(file.content, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        });
      }

      // List endpoint: /drive/v3/files?q=<folderId>+in+parents...
      const q = u.searchParams.get("q") ?? "";
      const m = q.match(/'([^']+)'\s+in\s+parents/);
      if (m) {
        const parentId = m[1];
        const matches = this.files.filter((f) => f.parents.includes(parentId));
        return new Response(
          JSON.stringify({
            files: matches.map((f) => ({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size,
            })),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response(null, { status: 400 });
    };
  }
}

function makeClient(rootFolderId = FAKE_ROOT_FOLDER_ID): GDriveClient {
  const client = new GDriveClient();
  // Bypass the lazy config loader so tests don't need a real config file.
  (client as unknown as { apiKeyPromise: Promise<string> }).apiKeyPromise =
    Promise.resolve("fake-api-key");
  (
    client as unknown as { rootFolderIdPromise: Promise<string> }
  ).rootFolderIdPromise = Promise.resolve(rootFolderId);
  return client;
}

describe("EmulatorDownloader", () => {
  let drive: FakeDrive;
  let fetchMock: MockInstance;

  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
    drive = new FakeDrive();
    fetchMock = vi.fn(drive.buildFetch()) as unknown as MockInstance;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("listAvailable", () => {
    it("matches Drive folders to emulator defs case-insensitively", async () => {
      drive.addFolder("pcsx2", [FAKE_ROOT_FOLDER_ID]);
      drive.addFolder("Dolphin", [FAKE_ROOT_FOLDER_ID]);
      drive.addFolder("Unknown", [FAKE_ROOT_FOLDER_ID]);

      const defs = [makeDef("pcsx2"), makeDef("dolphin"), makeDef("ryujinx")];
      const downloader = new EmulatorDownloader(makeClient());
      const mapping = await downloader.listAvailable(defs);

      expect(Object.keys(mapping).sort()).toEqual(["dolphin", "pcsx2"]);
      expect(mapping.pcsx2.emulatorId).toBe("pcsx2");
      expect(mapping.dolphin.emulatorId).toBe("dolphin");
    });

    it("does not recurse into matched folders (fast path)", async () => {
      // Set up a deeply nested folder to prove the recursive walk is
      // skipped. listAvailable must answer with a single root listing so
      // the Settings UI doesn't block on hundreds of sequential Drive API
      // calls for large emulator trees.
      const pcsx2Id = drive.addFolder("pcsx2", [FAKE_ROOT_FOLDER_ID]);
      drive.addFile("pcsx2.exe", [pcsx2Id], new Uint8Array(100));
      const pluginsId = drive.addFolder("plugins", [pcsx2Id]);
      drive.addFile("gs.dll", [pluginsId], new Uint8Array(200));
      drive.addFile("pad.dll", [pluginsId], new Uint8Array(300));

      const defs = [makeDef("pcsx2")];
      const downloader = new EmulatorDownloader(makeClient());
      const mapping = await downloader.listAvailable(defs);

      expect(mapping.pcsx2.emulatorId).toBe("pcsx2");
      // fileCount/totalBytes are left at 0 — real enumeration happens
      // only inside download() when the user actually clicks Download.
      expect(mapping.pcsx2.fileCount).toBe(0);
      expect(mapping.pcsx2.totalBytes).toBe(0);
      // Exactly one Drive API call: the root folder listing.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("download", () => {
    it("mirrors the Drive folder tree to disk", async () => {
      const pcsx2Id = drive.addFolder("pcsx2", [FAKE_ROOT_FOLDER_ID]);
      const exeBytes = new Uint8Array([1, 2, 3, 4]);
      const gsBytes = new Uint8Array([9, 9, 9]);
      drive.addFile("pcsx2.exe", [pcsx2Id], exeBytes);
      const pluginsId = drive.addFolder("plugins", [pcsx2Id]);
      drive.addFile("gs.dll", [pluginsId], gsBytes);

      const progressEvents: EmulatorDownloadProgress[] = [];
      const downloader = new EmulatorDownloader(makeClient());
      const result = await downloader.download(
        "pcsx2",
        TEST_ROOT,
        (p) => progressEvents.push(p)
      );

      expect(result.success).toBe(true);
      expect(result.installPath).toBe(join(TEST_ROOT, "pcsx2"));

      const exePath = join(TEST_ROOT, "pcsx2", "pcsx2.exe");
      const gsPath = join(TEST_ROOT, "pcsx2", "plugins", "gs.dll");
      expect(existsSync(exePath)).toBe(true);
      expect(existsSync(gsPath)).toBe(true);
      expect(readFileSync(exePath)).toEqual(Buffer.from(exeBytes));
      expect(readFileSync(gsPath)).toEqual(Buffer.from(gsBytes));

      // Progress lifecycle: at least one listing + downloading + done event.
      const phases = progressEvents.map((p) => p.phase);
      expect(phases).toContain("listing");
      expect(phases).toContain("downloading");
      expect(phases).toContain("done");

      const done = progressEvents[progressEvents.length - 1];
      expect(done.phase).toBe("done");
      expect(done.filesCompleted).toBe(2);
      expect(done.filesTotal).toBe(2);
      expect(done.bytesReceived).toBe(exeBytes.byteLength + gsBytes.byteLength);
      expect(done.bytesTotal).toBe(exeBytes.byteLength + gsBytes.byteLength);
    });

    it("excludes google-native files from the downloaded tree", async () => {
      const pcsx2Id = drive.addFolder("pcsx2", [FAKE_ROOT_FOLDER_ID]);
      const exeBytes = new Uint8Array([1, 2, 3, 4]);
      drive.addFile("pcsx2.exe", [pcsx2Id], exeBytes);
      // A stray Google Doc inside the emulator folder — must be ignored,
      // it can't be fetched via alt=media.
      drive.files.push({
        id: "gdoc-1",
        name: "README.gdoc",
        mimeType: "application/vnd.google-apps.document",
        parents: [pcsx2Id],
      });

      const downloader = new EmulatorDownloader(makeClient());
      const result = await downloader.download("pcsx2", TEST_ROOT, () => {});

      expect(result.success).toBe(true);
      expect(existsSync(join(TEST_ROOT, "pcsx2", "pcsx2.exe"))).toBe(true);
      expect(existsSync(join(TEST_ROOT, "pcsx2", "README.gdoc"))).toBe(false);
    });

    it("skips files that already exist with the correct size (resume)", async () => {
      const pcsx2Id = drive.addFolder("pcsx2", [FAKE_ROOT_FOLDER_ID]);
      const exeBytes = new Uint8Array([1, 2, 3, 4]);
      const gsBytes = new Uint8Array([9, 9, 9]);
      drive.addFile("pcsx2.exe", [pcsx2Id], exeBytes);
      drive.addFile("gs.dll", [pcsx2Id], gsBytes);

      // Pre-seed the exe file with the correct size so resume skips it.
      const installDir = join(TEST_ROOT, "pcsx2");
      mkdirSync(installDir, { recursive: true });
      writeFileSync(join(installDir, "pcsx2.exe"), Buffer.from(exeBytes));

      // Sanity check: the seeded file has the right size.
      expect(statSync(join(installDir, "pcsx2.exe")).size).toBe(
        exeBytes.byteLength
      );

      // Track which file ids trigger alt=media calls.
      const altMediaIds: string[] = [];
      fetchMock.mockImplementation(async (url: string) => {
        const u = new URL(url);
        if (u.searchParams.get("alt") === "media") {
          const fileId = u.pathname.match(/\/files\/([^/]+)$/)?.[1];
          if (fileId) altMediaIds.push(fileId);
        }
        return drive.buildFetch()(url);
      });

      const downloader = new EmulatorDownloader(makeClient());
      const result = await downloader.download("pcsx2", TEST_ROOT, () => {});

      expect(result.success).toBe(true);
      // Only gs.dll should have been fetched via alt=media; pcsx2.exe was
      // resumed from disk.
      const exeFile = drive.files.find((f) => f.name === "pcsx2.exe")!;
      const gsFile = drive.files.find((f) => f.name === "gs.dll")!;
      expect(altMediaIds).not.toContain(exeFile.id);
      expect(altMediaIds).toContain(gsFile.id);
    });
  });

  describe("GDriveClient pagination + retry", () => {
    it("merges paginated list responses", async () => {
      // Custom fetch mock that returns a nextPageToken for the first call
      // and no token for the second.
      const page1 = {
        files: [
          {
            id: "f1",
            name: "pcsx2",
            mimeType: FOLDER_MIME,
          },
        ],
        nextPageToken: "page2token",
      };
      const page2 = {
        files: [
          {
            id: "f2",
            name: "dolphin",
            mimeType: FOLDER_MIME,
          },
        ],
      };

      let callCount = 0;
      fetchMock.mockImplementation(async (url: string) => {
        callCount++;
        const u = new URL(url);
        const body = u.searchParams.get("pageToken") ? page2 : page1;
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });

      const client = makeClient();
      const files = await client.listFolder(FAKE_ROOT_FOLDER_ID);
      expect(callCount).toBe(2);
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.name).sort()).toEqual(["dolphin", "pcsx2"]);
    });

    it("retries once on a 429 response and succeeds on the second attempt", async () => {
      let attempts = 0;
      fetchMock.mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          return new Response(JSON.stringify({ error: "rate limited" }), {
            status: 429,
          });
        }
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });

      // Patch setTimeout so the backoff sleep is effectively instant.
      vi.useFakeTimers();
      const client = makeClient();
      const promise = client.listFolder(FAKE_ROOT_FOLDER_ID);
      await vi.runAllTimersAsync();
      const result = await promise;
      vi.useRealTimers();

      expect(attempts).toBe(2);
      expect(result).toEqual([]);
    });
  });
});
