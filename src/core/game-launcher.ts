import { spawn } from "node:child_process";
import type { ResolvedEmulator, LaunchResult, DiscoveredRom } from "./types.js";
import type { EmulatorMapper } from "./emulator-mapper.js";

/**
 * Parse a command string into executable + args, respecting quoted segments.
 * Quotes are stripped from the resulting tokens.
 */
function parseCommand(command: string): [string, string[]] {
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

  return [parts[0], parts.slice(1)];
}

export class GameLauncher {
  private mapper: EmulatorMapper;

  constructor(mapper: EmulatorMapper) {
    this.mapper = mapper;
  }

  /**
   * Build the full command string from the launch template.
   * Kept for display/logging and for the embedded overlay which
   * does its own argument parsing.
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
   * Build the executable path and argument array from the launch template.
   * Uses shell-safe argument splitting (no shell interpolation).
   */
  buildCommandArgs(
    resolved: ResolvedEmulator,
    romPath: string
  ): { exe: string; args: string[] } {
    const command = this.buildCommand(resolved, romPath);
    const [exe, args] = parseCommand(command);
    return { exe, args };
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
