import { spawn } from "node:child_process";
import type { ResolvedEmulator, LaunchResult, DiscoveredRom } from "./types.js";
import type { EmulatorMapper } from "./emulator-mapper.js";

export class GameLauncher {
  private mapper: EmulatorMapper;

  constructor(mapper: EmulatorMapper) {
    this.mapper = mapper;
  }

  buildCommand(resolved: ResolvedEmulator, romPath: string): string {
    const { definition, executablePath, systemId } = resolved;
    const args = definition.args[systemId] ?? definition.defaultArgs;

    let command = definition.launchTemplate
      .replace("{executable}", executablePath)
      .replace("{args}", args)
      .replace("{romPath}", romPath);

    // Clean double spaces left by empty {args}
    command = command.replace(/\s{2,}/g, " ").trim();

    return command;
  }

  launch(rom: DiscoveredRom, emulatorsPath?: string): LaunchResult {
    const resolved = this.mapper.resolve(rom.systemId, emulatorsPath);

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

    try {
      const child = spawn(command, [], {
        detached: true,
        stdio: "ignore",
        shell: true,
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
