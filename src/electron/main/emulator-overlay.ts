import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { screen, type BrowserWindow } from "electron";

/**
 * Parse a command string into executable + args, respecting quoted segments.
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
import type {
  DiscoveredRom,
  ResolvedEmulator,
  EmbeddedLaunchResult,
  GameSessionEvent,
} from "../../core/types.js";
import type { GameLauncher } from "../../core/game-launcher.js";
import {
  findWindowByPid,
  stripDecorations,
  hideFromTaskbar,
  positionWindow,
  showWindow,
  focusWindow,
  isWindowAlive,
} from "./win32-api.js";
import { setGameActive } from "./game-state.js";

interface OverlayCallbacks {
  onSessionStarted: (event: GameSessionEvent) => void;
  onSessionEnded: () => void;
}

interface GameAreaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class EmulatorOverlay {
  private win: BrowserWindow;
  private callbacks: OverlayCallbacks;

  private process: ChildProcess | null = null;
  private emuHwnd: unknown | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private tmpConfigPath: string | null = null;
  private gameAreaBounds: GameAreaBounds | null = null;
  private currentRom: DiscoveredRom | null = null;
  private currentEmulatorId: string | null = null;
  private boundHandlers: { event: string; handler: (...args: unknown[]) => void }[] = [];

  constructor(win: BrowserWindow, callbacks: OverlayCallbacks) {
    this.win = win;
    this.callbacks = callbacks;
  }

  isActive(): boolean {
    return this.process !== null && !this.process.killed;
  }

  async launchEmbedded(
    rom: DiscoveredRom,
    resolved: ResolvedEmulator,
    launcher: GameLauncher,
    emulatorsPath?: string
  ): Promise<EmbeddedLaunchResult> {
    if (this.isActive()) {
      return {
        success: false,
        emulatorId: resolved.definition.id,
        romPath: rom.filePath,
        command: "",
        error: "A game session is already active",
      };
    }

    let command = launcher.buildCommand(resolved, rom.filePath);
    const isRetroArch = resolved.definition.id === "retroarch";

    // For RetroArch, generate a temporary config to run windowed + no menu
    if (isRetroArch) {
      const configContent = [
        `video_fullscreen = "false"`,
        `video_window_show_decorations = "false"`,
        `pause_nonactive = "false"`,
        `ui_menubar_enable = "false"`,
      ].join("\n");

      this.tmpConfigPath = path.join(
        os.tmpdir(),
        `retro-launcher-ra-${Date.now()}.cfg`
      );
      writeFileSync(this.tmpConfigPath, configContent, "utf-8");
      command += ` --appendconfig "${this.tmpConfigPath}"`;
    }

    try {
      const [exe, args] = parseCommand(command);
      const exeDir = path.dirname(exe);
      const child = spawn(exe, args, {
        detached: false,
        stdio: "pipe",
        cwd: exeDir,
      });

      if (!child.pid) {
        return {
          success: false,
          emulatorId: resolved.definition.id,
          romPath: rom.filePath,
          command,
          error: "Failed to spawn emulator process",
        };
      }

      this.process = child;
      this.currentRom = rom;
      this.currentEmulatorId = resolved.definition.id;

      child.stderr?.on("data", (data: Buffer) => {
        console.warn("[overlay] emulator stderr:", data.toString());
      });

      child.on("exit", (code) => {
        console.log("[overlay] emulator exited with code:", code);
        this.cleanup();
      });

      const hwnd = await findWindowByPid(child.pid);
      if (!hwnd) {
        this.killProcess();
        return {
          success: false,
          emulatorId: resolved.definition.id,
          romPath: rom.filePath,
          command,
          error: "Could not find emulator window (timeout)",
        };
      }

      this.emuHwnd = hwnd;

      // Strip decorations and hide from taskbar
      stripDecorations(hwnd);
      hideFromTaskbar(hwnd);

      // Position over the game area
      this.repositionEmulator();

      // Start synchronization
      this.startSync();

      setGameActive(true);

      this.callbacks.onSessionStarted({
        rom,
        emulatorId: resolved.definition.id,
      });

      // Re-position after renderer switches to GameModeView and sends correct bounds
      setTimeout(() => this.repositionEmulator(), 300);

      return {
        success: true,
        emulatorId: resolved.definition.id,
        romPath: rom.filePath,
        command,
        pid: child.pid,
      };
    } catch (err) {
      this.cleanup();
      return {
        success: false,
        emulatorId: resolved.definition.id,
        romPath: rom.filePath,
        command,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  stopGame(): void {
    this.killProcess();
  }

  setGameAreaBounds(bounds: GameAreaBounds): void {
    this.gameAreaBounds = bounds;
    if (this.emuHwnd && this.isActive()) {
      this.repositionEmulator();
    }
  }

  /**
   * Compute screen coordinates for MoveWindow (physical pixels).
   *
   * Electron's getContentBounds() returns DIP (logical) coordinates.
   * The renderer's getBoundingClientRect() returns CSS pixels (= DIP).
   * Win32 MoveWindow in a Per-Monitor DPI Aware V2 process expects physical pixels.
   *
   * So we compute the position in DIP, then multiply everything by the
   * display's scaleFactor to convert to physical pixels.
   */
  private getScreenBounds(): { x: number; y: number; width: number; height: number } {
    const contentBounds = this.win.getContentBounds();
    const display = screen.getDisplayMatching(contentBounds);
    const sf = display.scaleFactor;

    if (!this.gameAreaBounds) {
      return {
        x: Math.round(contentBounds.x * sf),
        y: Math.round(contentBounds.y * sf),
        width: Math.round(contentBounds.width * sf),
        height: Math.round(contentBounds.height * sf),
      };
    }

    // Both contentBounds and gameAreaBounds are in DIP.
    // Add them first, then scale to physical pixels.
    return {
      x: Math.round((contentBounds.x + this.gameAreaBounds.x) * sf),
      y: Math.round((contentBounds.y + this.gameAreaBounds.y) * sf),
      width: Math.round(this.gameAreaBounds.width * sf),
      height: Math.round(this.gameAreaBounds.height * sf),
    };
  }

  private repositionEmulator(): void {
    if (!this.emuHwnd) return;
    const b = this.getScreenBounds();
    positionWindow(this.emuHwnd, b.x, b.y, b.width, b.height);
  }

  private startSync(): void {
    const onMoveResize = () => this.repositionEmulator();
    const onMinimize = () => {
      if (this.emuHwnd) showWindow(this.emuHwnd, false);
    };
    const onRestore = () => {
      if (this.emuHwnd) {
        showWindow(this.emuHwnd, true);
        setTimeout(() => this.repositionEmulator(), 150);
      }
    };
    const onFocus = () => {
      if (this.emuHwnd) focusWindow(this.emuHwnd);
    };
    const onClose = () => this.stopGame();

    const events: [string, (...args: unknown[]) => void][] = [
      ["move", onMoveResize],
      ["resize", onMoveResize],
      ["maximize", onMoveResize],
      ["unmaximize", onMoveResize],
      ["minimize", onMinimize],
      ["restore", onRestore],
      ["focus", onFocus],
      ["close", onClose],
    ];

    for (const [event, handler] of events) {
      this.win.on(event as never, handler);
      this.boundHandlers.push({ event, handler });
    }

    // Polling: check if emulator is still alive + reposition
    this.syncInterval = setInterval(() => {
      if (!this.emuHwnd || !isWindowAlive(this.emuHwnd)) {
        this.cleanup();
        return;
      }
      this.repositionEmulator();
    }, 100);
  }

  private killProcess(): void {
    if (this.process && !this.process.killed) {
      try {
        this.process.kill();
      } catch {
        // Process may have already exited
      }
    }
  }

  private cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    for (const { event, handler } of this.boundHandlers) {
      this.win.removeListener(event as never, handler);
    }
    this.boundHandlers = [];

    if (this.tmpConfigPath) {
      try {
        unlinkSync(this.tmpConfigPath);
      } catch {
        // File may not exist
      }
      this.tmpConfigPath = null;
    }

    this.emuHwnd = null;
    this.process = null;
    this.currentRom = null;
    this.currentEmulatorId = null;

    setGameActive(false);
    this.callbacks.onSessionEnded();
  }
}
