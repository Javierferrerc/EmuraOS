import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import {
  ensureCemuGamePath,
  findCemuSettingsPath,
  findCemuKeysPath,
  checkCemuKeys,
  writeCemuKeys,
  isValidKeyLine,
} from "../../src/core/cemu-setup.js";

const TEST_DIR = resolve(import.meta.dirname, "__test_cemu__");
const CEMU_EXE = join(TEST_DIR, "Cemu.exe");
const SETTINGS_PATH = join(TEST_DIR, "settings.xml");
const KEYS_PATH = join(TEST_DIR, "keys.txt");
const WIIU_FOLDER = join(TEST_DIR, "roms", "wiiu");

const FAKE_APPDATA = join(TEST_DIR, "__appdata__");
let originalAppdata: string | undefined;

describe("cemu-setup", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(WIIU_FOLDER, { recursive: true });
    mkdirSync(FAKE_APPDATA, { recursive: true });
    // Touch a fake Cemu.exe so dirname resolution is realistic
    writeFileSync(CEMU_EXE, "", "utf-8");
    // Create portable.txt marker so Cemu is treated as portable mode
    // (config lives next to the exe, not in %APPDATA%/Cemu).
    writeFileSync(join(TEST_DIR, "portable.txt"), "", "utf-8");
    // Isolate APPDATA so we don't hit the real Cemu install on the dev machine
    originalAppdata = process.env.APPDATA;
    process.env.APPDATA = FAKE_APPDATA;
  });

  afterEach(() => {
    if (originalAppdata !== undefined) {
      process.env.APPDATA = originalAppdata;
    } else {
      delete process.env.APPDATA;
    }
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("creates settings.xml with GamePaths entry when file does not exist", () => {
    const result = ensureCemuGamePath(CEMU_EXE, WIIU_FOLDER);

    expect(result.updated).toBe(true);
    expect(existsSync(SETTINGS_PATH)).toBe(true);

    const content = readFileSync(SETTINGS_PATH, "utf-8");
    expect(content).toContain("<GamePaths>");
    expect(content).toContain("<Entry>");
    expect(content).toContain(resolve(WIIU_FOLDER).replace(/\//g, "\\"));
    expect(content).toContain("</GamePaths>");
  });

  it("is idempotent — second call does not modify the file", () => {
    ensureCemuGamePath(CEMU_EXE, WIIU_FOLDER);
    const result = ensureCemuGamePath(CEMU_EXE, WIIU_FOLDER);

    expect(result.updated).toBe(false);
    const content = readFileSync(SETTINGS_PATH, "utf-8");
    // Only one <Entry> block should exist
    const matches = content.match(/<Entry>/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("appends to existing GamePaths block without duplicating", () => {
    const existing =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<content>\n` +
      `\t<fullscreen>false</fullscreen>\n` +
      `\t<GamePaths>\n` +
      `\t\t<Entry>D:\\OtherGames</Entry>\n` +
      `\t</GamePaths>\n` +
      `\t<graphic_api>Vulkan</graphic_api>\n` +
      `</content>\n`;
    writeFileSync(SETTINGS_PATH, existing, "utf-8");

    const result = ensureCemuGamePath(CEMU_EXE, WIIU_FOLDER);

    expect(result.updated).toBe(true);
    const content = readFileSync(SETTINGS_PATH, "utf-8");
    expect(content).toContain("D:\\OtherGames");
    expect(content).toContain(resolve(WIIU_FOLDER).replace(/\//g, "\\"));
    expect(content).toContain("<graphic_api>Vulkan</graphic_api>");
    const entries = content.match(/<Entry>/g) ?? [];
    expect(entries).toHaveLength(2);
  });

  it("creates GamePaths block when settings.xml exists without one", () => {
    const existing =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<content>\n` +
      `\t<fullscreen>false</fullscreen>\n` +
      `</content>\n`;
    writeFileSync(SETTINGS_PATH, existing, "utf-8");

    const result = ensureCemuGamePath(CEMU_EXE, WIIU_FOLDER);

    expect(result.updated).toBe(true);
    const content = readFileSync(SETTINGS_PATH, "utf-8");
    expect(content).toContain("<GamePaths>");
    expect(content).toContain("</GamePaths>");
    expect(content).toContain("<fullscreen>false</fullscreen>");
  });

  it("case-insensitive path comparison for Windows", () => {
    ensureCemuGamePath(CEMU_EXE, WIIU_FOLDER);

    // Call again with different casing
    const upper = WIIU_FOLDER.toUpperCase();
    const result = ensureCemuGamePath(CEMU_EXE, upper);

    expect(result.updated).toBe(false);
  });

  it("findCemuSettingsPath returns portable path when portable.txt exists", () => {
    const path = findCemuSettingsPath(CEMU_EXE);
    expect(path).toBe(SETTINGS_PATH);
  });

  it("findCemuSettingsPath prefers portable settings.xml when it exists", () => {
    writeFileSync(SETTINGS_PATH, "<content/>", "utf-8");
    const path = findCemuSettingsPath(CEMU_EXE);
    expect(path).toBe(SETTINGS_PATH);
  });

  it("findCemuSettingsPath falls back to %APPDATA%/Cemu when no portable marker exists", () => {
    // Remove the portable.txt marker added by beforeEach so we hit
    // the appdata branch.
    rmSync(join(TEST_DIR, "portable.txt"), { force: true });
    const settingsPath = findCemuSettingsPath(CEMU_EXE);
    expect(settingsPath).toBe(join(FAKE_APPDATA, "Cemu", "settings.xml"));
  });

  // ── keys.txt tests ──────────────────────────────────────────────

  it("findCemuKeysPath returns path next to settings.xml location", () => {
    const path = findCemuKeysPath(CEMU_EXE);
    expect(path).toBe(KEYS_PATH);
  });

  it("checkCemuKeys returns exists=false when file is missing", () => {
    const status = checkCemuKeys(CEMU_EXE);
    expect(status.exists).toBe(false);
    expect(status.entryCount).toBe(0);
    expect(status.path).toBe(KEYS_PATH);
  });

  it("checkCemuKeys returns exists=false when file has only comments", () => {
    writeFileSync(
      KEYS_PATH,
      "# just a comment\n# another comment\n\n",
      "utf-8"
    );
    const status = checkCemuKeys(CEMU_EXE);
    expect(status.exists).toBe(false);
    expect(status.entryCount).toBe(0);
  });

  it("checkCemuKeys counts valid key entries", () => {
    const content =
      "# Scribblenauts Unmasked\n" +
      "abcd1234567890abcdef1234567890ab = 0123456789abcdef0123456789abcdef\n" +
      "# Mario Kart 8\n" +
      "fedcba9876543210fedcba9876543210 = cafebabe1234567890abcdef12345678\n" +
      "\n";
    writeFileSync(KEYS_PATH, content, "utf-8");
    const status = checkCemuKeys(CEMU_EXE);
    expect(status.exists).toBe(true);
    expect(status.entryCount).toBe(2);
  });

  it("writeCemuKeys creates the file with given content", () => {
    const content =
      "abcd1234567890abcdef1234567890ab = 0123456789abcdef0123456789abcdef";
    const written = writeCemuKeys(CEMU_EXE, content);
    expect(written).toBe(KEYS_PATH);
    expect(existsSync(KEYS_PATH)).toBe(true);
    const readBack = readFileSync(KEYS_PATH, "utf-8");
    expect(readBack).toContain(content);
    // Ensures trailing newline
    expect(readBack.endsWith("\n")).toBe(true);
  });

  it("writeCemuKeys overwrites existing file", () => {
    writeFileSync(KEYS_PATH, "old content = 000", "utf-8");
    writeCemuKeys(CEMU_EXE, "new content = 111");
    const readBack = readFileSync(KEYS_PATH, "utf-8");
    expect(readBack).not.toContain("old content");
    expect(readBack).toContain("new content = 111");
  });

  it("checkCemuKeys + writeCemuKeys round trip", () => {
    let status = checkCemuKeys(CEMU_EXE);
    expect(status.exists).toBe(false);

    writeCemuKeys(
      CEMU_EXE,
      "abcd1234 = deadbeef\nfedc5678 = cafebabe"
    );

    status = checkCemuKeys(CEMU_EXE);
    expect(status.exists).toBe(true);
    expect(status.entryCount).toBe(2);
  });

  // ── Community pastebin format (bare hex key per line) ───────────

  it("isValidKeyLine accepts bare 32-hex disc keys", () => {
    expect(
      isValidKeyLine("0123456789abcdef0123456789abcdef")
    ).toBe(true);
    expect(
      isValidKeyLine("ABCDEF1234567890ABCDEF1234567890")
    ).toBe(true);
  });

  it("isValidKeyLine accepts bare hex keys with inline comments", () => {
    expect(
      isValidKeyLine(
        "0123456789abcdef0123456789abcdef  # Zelda BOTW (EUR)"
      )
    ).toBe(true);
    expect(
      isValidKeyLine("fedcba9876543210fedcba9876543210 # Mario Kart 8")
    ).toBe(true);
  });

  it("isValidKeyLine accepts hash=key legacy format", () => {
    expect(
      isValidKeyLine(
        "abcd1234567890abcdef1234567890ab = 0123456789abcdef0123456789abcdef"
      )
    ).toBe(true);
  });

  it("isValidKeyLine rejects comments, blanks, and invalid lines", () => {
    expect(isValidKeyLine("")).toBe(false);
    expect(isValidKeyLine("   ")).toBe(false);
    expect(isValidKeyLine("# just a comment")).toBe(false);
    expect(isValidKeyLine("not hex at all")).toBe(false);
    expect(isValidKeyLine("xyz123")).toBe(false); // 'x' and 'y' not hex
    expect(isValidKeyLine("abcd")).toBe(false); // too short
    expect(isValidKeyLine("= missing left side")).toBe(false);
  });

  it("checkCemuKeys counts bare hex keys from community pastebin format", () => {
    const pastebinStyle =
      "# Wii U Common Keys\n" +
      "0123456789abcdef0123456789abcdef  # The Legend of Zelda: BOTW (EUR)\n" +
      "fedcba9876543210fedcba9876543210  # The Legend of Zelda: BOTW (USA)\n" +
      "1111222233334444aaaabbbbccccdddd  # Mario Kart 8 (EUR)\n" +
      "\n" +
      "# Backups\n" +
      "5555666677778888eeeeffff11112222 # Splatoon (JPN)\n";
    writeFileSync(KEYS_PATH, pastebinStyle, "utf-8");
    const status = checkCemuKeys(CEMU_EXE);
    expect(status.exists).toBe(true);
    expect(status.entryCount).toBe(4);
  });

  it("checkCemuKeys supports mixed formats in the same file", () => {
    const mixed =
      "# Legacy format\n" +
      "abcd1234567890abcdef1234567890ab = 0123456789abcdef0123456789abcdef\n" +
      "# Bare hex format\n" +
      "fedcba9876543210fedcba9876543210  # BOTW (USA)\n";
    writeFileSync(KEYS_PATH, mixed, "utf-8");
    const status = checkCemuKeys(CEMU_EXE);
    expect(status.exists).toBe(true);
    expect(status.entryCount).toBe(2);
  });

  it("writeCemuKeys preserves pastebin content verbatim", () => {
    const pastebinContent =
      "0123456789abcdef0123456789abcdef  # Zelda BOTW (EUR)\n" +
      "fedcba9876543210fedcba9876543210  # Mario Kart 8 (USA)\n";
    writeCemuKeys(CEMU_EXE, pastebinContent);
    const readBack = readFileSync(KEYS_PATH, "utf-8");
    expect(readBack).toContain("Zelda BOTW (EUR)");
    expect(readBack).toContain("Mario Kart 8 (USA)");
    expect(readBack).toContain("0123456789abcdef0123456789abcdef");
  });
});
