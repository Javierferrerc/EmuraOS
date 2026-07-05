import { spawn } from "node:child_process";
import type { ResolvedEmulator, LaunchResult, DiscoveredRom } from "./types.js";
import type { EmulatorMapper } from "./emulator-mapper.js";
import { isFlatpakRef, flatpakAppId } from "./emulator-mapper.js";

// Sentinels swapped in for {executable}/{romPath} BEFORE tokenizing, then
// swapped back to the real values AFTER. This guarantees a rom path (the least
// trusted string in the app) is substituted into exactly one argv token and can
// never introduce new tokens or emulator flags — even if it contains spaces or
// double quotes. Null bytes are illegal in filesystem paths, so the sentinels
// can never collide with real path content.
const EXE_TOKEN = "\x00EXE\x00";
const ROM_TOKEN = "\x00ROM\x00";

/**
 * Split a command string into tokens, respecting quoted segments. Quotes are
 * stripped from the resulting tokens and empty tokens are dropped. Only ever
 * called on TRUSTED template text (launchTemplate + config args), never on a
 * string that already contains a rom path.
 */
export function tokenize(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === " " && !inQuote) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) parts.push(current);

  return parts;
}

export class GameLauncher {
  private mapper: EmulatorMapper;

  constructor(mapper: EmulatorMapper) {
    this.mapper = mapper;
  }

  /**
   * Build the full command string from the launch template.
   * FOR DISPLAY/LOGGING ONLY (LaunchResult.command). Its output must never be
   * re-parsed back into an argv array — use buildArgv for spawning, which keeps
   * the rom path confined to a single argument.
   */
  buildCommand(resolved: ResolvedEmulator, romPath: string): string {
    const { definition, systemId } = resolved;
    const args = definition.args[systemId] ?? definition.defaultArgs;

    let command = definition.launchTemplate
      .replace("{executable}", resolved.executablePath)
      .replace("{args}", args)
      .replace("{romPath}", romPath);

    // Clean double spaces left by empty {args}
    command = command.replace(/\s{2,}/g, " ").trim();

    return command;
  }

  /**
   * Build the executable path and argument array for spawning.
   *
   * The trusted template + config args are tokenized FIRST (with the executable
   * and rom path stubbed out as sentinels); the real executable and rom paths
   * are substituted back into the already-split tokens AFTER. This means the
   * rom path always lands in exactly one argv element and cannot inject extra
   * arguments or emulator flags, regardless of spaces or quotes in its name.
   */
  buildArgv(
    resolved: ResolvedEmulator,
    romPath: string
  ): { exe: string; args: string[] } {
    const { definition, systemId } = resolved;
    const argsValue = definition.args[systemId] ?? definition.defaultArgs;

    const templated = definition.launchTemplate
      .replace("{executable}", EXE_TOKEN)
      .replace("{args}", argsValue)
      .replace("{romPath}", ROM_TOKEN);

    const tokens = tokenize(templated).map((token) =>
      token
        .replace(EXE_TOKEN, resolved.executablePath)
        .replace(ROM_TOKEN, romPath)
    );

    const [exe, ...args] = tokens;

    // Flatpak installs resolve to a `flatpak:<appId>` sentinel instead of a
    // filesystem path — rewrite into `flatpak run <appId> …` for spawning.
    if (isFlatpakRef(exe)) {
      return { exe: "flatpak", args: ["run", flatpakAppId(exe), ...args] };
    }

    return { exe, args };
  }

  /**
   * @deprecated Use buildArgv. Retained as a thin alias so existing callers
   * keep working; delegates to the injection-safe implementation.
   */
  buildCommandArgs(
    resolved: ResolvedEmulator,
    romPath: string
  ): { exe: string; args: string[] } {
    return this.buildArgv(resolved, romPath);
  }

  launch(rom: DiscoveredRom, emulatorsPath?: string, emulatorId?: string): LaunchResult {
    const resolved = emulatorId
      ? this.mapper.resolveById(emulatorId, rom.systemId, emulatorsPath)
      : this.mapper.resolve(rom.systemId, emulatorsPath);

    if (!resolved) {
      return {
        success: false,
        emulatorId: "",
        romPath: rom.filePath,
        command: "",
        error: `No emulator found for system "${rom.systemId}"`,
      };
    }

    const command = this.buildCommand(resolved, rom.filePath);
    const { exe, args } = this.buildCommandArgs(resolved, rom.filePath);

    try {
      const child = spawn(exe, args, {
        detached: true,
        stdio: "ignore",
        shell: false,
      });

      child.unref();

      return {
        success: true,
        emulatorId: resolved.definition.id,
        romPath: rom.filePath,
        command,
        pid: child.pid,
      };
    } catch (err) {
      return {
        success: false,
        emulatorId: resolved.definition.id,
        romPath: rom.filePath,
        command,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
