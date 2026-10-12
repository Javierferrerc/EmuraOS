/**
 * 7z extraction for official emulator releases (RetroArch, Dolphin, PCSX2,
 * mGBA, RPCS3 ship .7z). Delegates to the system `tar`: on Windows 10+/11 the
 * bundled System32\tar.exe is bsdtar (libarchive), which reads 7z natively —
 * no extra dependency. The archive is listed first and every entry name is
 * validated before anything is written, so a hostile archive can't escape
 * `destDir` (bsdtar also refuses `..`/absolute paths by default; this is
 * defence in depth).
 */

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Absolute path to the system tar. On Windows we never resolve through PATH
 *  (a planted tar.exe in the cwd/PATH must not be picked up). */
export function systemTarPath(): string {
  if (process.platform === "win32") {
    const root = process.env.SystemRoot ?? "C:\\Windows";
    return join(root, "System32", "tar.exe");
  }
  return "tar";
}

/** True when an archive entry name stays inside `destDir` once extracted. */
export function isSafeEntryName(name: string, destDir: string): boolean {
  if (!name || isAbsolute(name) || /^[a-zA-Z]:/.test(name)) return false;
  const destResolved = resolve(destDir);
  const cleaned = normalize(name).replace(/^([/\\])+/, "");
  const outPath = resolve(destResolved, cleaned);
  return outPath === destResolved || outPath.startsWith(destResolved + sep);
}

/**
 * Extract a 7z archive buffer under `destDir`. Returns the extracted file
 * entry names (directories excluded), with the archive's own separators
 * normalised to the platform's — same contract as extractZipBufferTo.
 */
export async function extract7zBufferTo(
  buf: Buffer,
  destDir: string
): Promise<string[]> {
  const tmp = mkdtempSync(join(tmpdir(), "emura-7z-"));
  const archivePath = join(tmp, "archive.7z");
  try {
    writeFileSync(archivePath, buf);
    const tar = systemTarPath();
    // RetroArch lists thousands of entries — give the listing room.
    const { stdout } = await execFileAsync(tar, ["-tf", archivePath], {
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    const entries = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (entries.length === 0) throw new Error("7z: archive is empty");
    for (const entry of entries) {
      if (!isSafeEntryName(entry, destDir)) {
        throw new Error(`7z: unsafe entry path rejected: ${entry}`);
      }
    }
    await execFileAsync(tar, ["-xf", archivePath, "-C", destDir], {
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return entries
      .filter((e) => !e.endsWith("/") && !e.endsWith("\\"))
      .map((e) => normalize(e));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
