/**
 * Cemu first-run setup.
 *
 * Cemu prompts the user to select a "game path" on first launch. To avoid
 * that, we pre-populate Cemu's settings.xml with the Wii U ROM folder so the
 * emulator starts directly in the game.
 *
 * Cemu's settings.xml is stored either next to Cemu.exe (portable mode) or
 * in %APPDATA%/Cemu/settings.xml (installed mode). We detect whichever one
 * exists; if neither exists we create a portable settings.xml next to the
 * executable with only the minimal <GamePaths> block.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import path from "node:path";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function normalizePath(p: string): string {
  return path.resolve(p).replace(/\//g, "\\");
}

function pathsEqual(a: string, b: string): boolean {
  // Windows paths are case-insensitive
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

/**
 * Return the directory where Cemu stores its config.
 *
 * Cemu 2.x uses a `portable.txt` marker file next to Cemu.exe to decide:
 * - If `portable.txt` exists → portable mode → config in `{emuDir}/`
 * - Otherwise → `%APPDATA%/Cemu/`
 *
 * As a safety net we also check for an existing `settings.xml` next to the
 * exe (old portable installs) before falling back to appdata.
 */
export function getCemuConfigDir(cemuExecutablePath: string): string {
  const emuDir = path.dirname(cemuExecutablePath);
  const portableMarker = path.join(emuDir, "portable.txt");
  const portableSettings = path.join(emuDir, "settings.xml");

  if (existsSync(portableMarker)) return emuDir;
  if (existsSync(portableSettings)) return emuDir;

  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, "Cemu");
  }
  // No appdata env var (unlikely on Windows) — fall back to portable
  return emuDir;
}

/**
 * Locate Cemu's settings.xml. Returns the path to use (which may not exist
 * yet — caller should create it).
 */
export function findCemuSettingsPath(cemuExecutablePath: string): string {
  return path.join(getCemuConfigDir(cemuExecutablePath), "settings.xml");
}

/**
 * Ensure Cemu's settings.xml contains the given Wii U ROM folder inside
 * its <GamePaths> block. Creates the file if it does not exist.
 *
 * Idempotent: calling this repeatedly with the same folder is a no-op.
 */
export function ensureCemuGamePath(
  cemuExecutablePath: string,
  wiiuRomFolder: string
): { updated: boolean; settingsPath: string } {
  const settingsPath = findCemuSettingsPath(cemuExecutablePath);
  const normalizedFolder = normalizePath(wiiuRomFolder);

  if (!existsSync(settingsPath)) {
    const content =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<content>\n` +
      `\t<GamePaths>\n` +
      `\t\t<Entry>${escapeXml(normalizedFolder)}</Entry>\n` +
      `\t</GamePaths>\n` +
      `</content>\n`;

    mkdirSync(path.dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, content, "utf-8");
    return { updated: true, settingsPath };
  }

  let content = readFileSync(settingsPath, "utf-8");
  const gamePathsMatch = content.match(/<GamePaths>([\s\S]*?)<\/GamePaths>/);

  // Extract existing entries
  const existingEntries: string[] = [];
  if (gamePathsMatch) {
    const entryRegex = /<Entry>([\s\S]*?)<\/Entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRegex.exec(gamePathsMatch[1])) !== null) {
      existingEntries.push(unescapeXml(m[1].trim()));
    }
  }

  // Already registered — nothing to do
  if (existingEntries.some((entry) => pathsEqual(entry, normalizedFolder))) {
    return { updated: false, settingsPath };
  }

  const newEntryLine = `\t\t<Entry>${escapeXml(normalizedFolder)}</Entry>`;

  if (gamePathsMatch) {
    // Append a new <Entry> to the existing <GamePaths> block, preserving
    // indentation style.
    const innerContent = gamePathsMatch[1].replace(/\s*$/, "");
    const updatedBlock = `<GamePaths>${innerContent}\n${newEntryLine}\n\t</GamePaths>`;
    content = content.replace(gamePathsMatch[0], updatedBlock);
  } else {
    // No <GamePaths> block yet — insert one just before </content>
    const block = `\t<GamePaths>\n${newEntryLine}\n\t</GamePaths>\n`;
    if (content.includes("</content>")) {
      content = content.replace("</content>", `${block}</content>`);
    } else {
      // Malformed or empty file — rewrite it entirely
      content =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<content>\n${block}</content>\n`;
    }
  }

  writeFileSync(settingsPath, content, "utf-8");
  return { updated: true, settingsPath };
}

// ── keys.txt handling ──────────────────────────────────────────────

/**
 * Locate Cemu's keys.txt. It lives in the same directory as settings.xml
 * (either portable next to Cemu.exe or under %APPDATA%/Cemu/).
 */
export function findCemuKeysPath(cemuExecutablePath: string): string {
  const settingsPath = findCemuSettingsPath(cemuExecutablePath);
  return path.join(path.dirname(settingsPath), "keys.txt");
}

export interface CemuKeysStatus {
  exists: boolean;
  path: string;
  entryCount: number;
}

/**
 * Strip an inline comment (starting with "#") from a line and trim it.
 */
function stripComment(line: string): string {
  const hashIdx = line.indexOf("#");
  return (hashIdx >= 0 ? line.slice(0, hashIdx) : line).trim();
}

/**
 * Determine if a keys.txt line contains a valid key entry.
 *
 * Cemu accepts two formats:
 *   1. Community/pastebin:   `<32-hex-char disc key>` (with optional inline
 *      comment). Example: `0123456789abcdef0123456789abcdef # BOTW EUR`
 *   2. Legacy hash=key form: `<hash> = <disc key>`
 *
 * Lines that are empty or full-line comments are ignored.
 */
export function isValidKeyLine(line: string): boolean {
  const stripped = stripComment(line);
  if (!stripped) return false;

  // Accept "hash = key" form
  if (stripped.includes("=")) {
    const [left, right] = stripped.split("=").map((s) => s.trim());
    return /^[0-9a-f]+$/i.test(left) && /^[0-9a-f]+$/i.test(right);
  }

  // Accept bare hex key (commonly 32 hex chars for Wii U disc keys,
  // but we accept any hex string of reasonable length to be lenient).
  return /^[0-9a-f]{16,64}$/i.test(stripped);
}

/**
 * Check if keys.txt exists and contains at least one key entry.
 */
export function checkCemuKeys(cemuExecutablePath: string): CemuKeysStatus {
  const keysPath = findCemuKeysPath(cemuExecutablePath);
  if (!existsSync(keysPath)) {
    return { exists: false, path: keysPath, entryCount: 0 };
  }
  const content = readFileSync(keysPath, "utf-8");
  const entries = content
    .split(/\r?\n/)
    .filter((line) => isValidKeyLine(line));
  return {
    exists: entries.length > 0,
    path: keysPath,
    entryCount: entries.length,
  };
}

/**
 * Write content to keys.txt. Creates parent directories if needed.
 * Returns the path that was written.
 */
export function writeCemuKeys(
  cemuExecutablePath: string,
  content: string
): string {
  const keysPath = findCemuKeysPath(cemuExecutablePath);
  mkdirSync(path.dirname(keysPath), { recursive: true });
  // Ensure file ends with a newline
  const normalized = content.endsWith("\n") ? content : content + "\n";
  writeFileSync(keysPath, normalized, "utf-8");
  return keysPath;
}
