import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { app, screen, type BrowserWindow } from "electron";

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
  restoreDecorations,
  removeMenuBar,
  getMenu,
  restoreMenuBar,
  hideFromTaskbar,
  showInTaskbar,
  positionWindow,
  showWindow,
  focusWindow,
  isWindowAlive,
  isKeyPressed,
  clipTopPixels,
  clearClipRegion,
  VK_F10,
  VK_F11,
} from "./win32-api.js";

// Pixels to clip off the top of the PCSX2 window to hide its Qt menu bar
// (~22px) + toolbar (~36px). These widgets live inside the client area, so
// stripDecorations alone can't remove them. Value is in physical pixels at
// the current display scaleFactor (computed dynamically per-launch).
const PCSX2_CHROME_BASE_PX = 58;
import { setGameActive, claimF10Fire } from "./game-state.js";

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
  // F10 polling state for edge detection inside the sync loop. See syncInterval.
  private prevF10Down = false;
  private tmpConfigPath: string | null = null;
  private gameAreaBounds: GameAreaBounds | null = null;
  // Physical pixels of chrome (menu bar + toolbar) clipped off the top of
  // the embedded emulator window via SetWindowRgn. Per-emulator, set at
  // launchEmbedded time. The reposition logic extends the window upward by
  // this amount so the remaining (visible, clipped) area exactly fills the
  // game rectangle reported by the renderer.
  private topChromePx = 0;
  private currentRom: DiscoveredRom | null = null;
  private currentEmulatorId: string | null = null;
  private boundHandlers: { event: string; handler: (...args: unknown[]) => void }[] = [];
  // Citra config patching: stores the path + original values so cleanup can
  // restore the user's settings after the game session ends.
  // `fullscreenMode` is null if the key didn't exist in the original config —
  // restore deletes the line we added instead of rewriting it.
  private citraConfigPath: string | null = null;
  private citraBackup: {
    fullscreen: string;
    showStatusBar: string;
    fullscreenMode: string | null;
    singleWindowMode: string | null;
  } | null = null;
  // PCSX2 config patching: forces safe values for [UI] keys that would
  // otherwise break embedding (StartFullscreen, RenderToSeparateWindow, etc.)
  // A null value in the backup means the key did not exist in the original
  // file — restore removes the inserted line instead of rewriting it.
  private pcsx2ConfigPath: string | null = null;
  private pcsx2Backup: {
    StartFullscreen: string | null;
    RenderToSeparateWindow: string | null;
    HideMainWindowWhenRunning: string | null;
    DisableWindowResize: string | null;
    PauseOnFocusLoss: string | null;
  } | null = null;
  // PPSSPP config patching: forces FullScreen=false ([Graphics]) and
  // ShowMenuBar=false ([General]) during embedded sessions. If PPSSPP tries
  // to go native fullscreen it fights our SetParent embedding; if the menu
  // bar is visible it eats pixels inside the embedded client area. Both
  // settings are restored on cleanup so standalone launches keep the user's
  // preferences. null in the backup = key was absent → remove on restore.
  private ppssppConfigPath: string | null = null;
  private ppssppBackup: {
    FullScreen: string | null;
    ShowMenuBar: string | null;
  } | null = null;
  // Dolphin config patching: forces [Core] ConfirmStop=False during embedded
  // sessions. Dolphin's default ESC binding triggers "Stop", which — with
  // ConfirmStop=True — pops a modal confirmation dialog. Inside our embedded
  // layout the modal is unreachable, so Dolphin freezes waiting for input and
  // the render surface goes black. Disabling the prompt makes ESC cleanly end
  // the process, letting our child.on("exit") handler run cleanup. null in the
  // backup means the key was absent → remove on restore.
  private dolphinConfigPath: string | null = null;
  private dolphinBackup: {
    ConfirmStop: string | null;
  } | null = null;
  // F11 Dolphin-only "config mode" toggle. See `toggleConfigMode` for the
  // state machine. `savedMenu` holds the native HMENU detached at embed time
  // so we can re-attach it when entering config mode; `configMode` gates the
  // reposition loop and cleanup path; `prevF11Down` is the rising-edge
  // detector for the sync-interval keyboard poll.
  private savedMenu: unknown = null;
  private configMode = false;
  private prevF11Down = false;

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

    // Reset idempotency guard so the next cleanup (after this session ends)
    // actually runs.
    this.cleanedUp = false;

    let command = launcher.buildCommand(resolved, rom.filePath);
    const isRetroArch = resolved.definition.id === "retroarch";
    const isCitra = resolved.definition.id === "citra";
    const isPCSX2 = resolved.definition.id === "pcsx2";
    const isPPSSPP = resolved.definition.id === "ppsspp";
    const isDolphin = resolved.definition.id === "dolphin";

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

    // For Citra, patch qt-config.ini to hide the menubar (via Qt fullscreen
    // state) and the bottom status bar. Originals are restored on cleanup.
    if (isCitra) {
      this.patchCitraConfig();
    }

    // For PCSX2, patch PCSX2.ini to force safe [UI] values that are required
    // for reliable embedding. The user can toggle these settings from the
    // in-app Emulator Configuration screen, but any value they pick only
    // affects standalone PCSX2 — during an embedded session we must override
    // them (and restore on cleanup) because otherwise the embedding breaks:
    //   - StartFullscreen=true → PCSX2 takes over the screen in its own
    //     native fullscreen, fighting our SetWindowPos embedding and making
    //     F10 visually useless (Electron exits fullscreen but PCSX2's own
    //     fullscreen still covers the screen).
    //   - RenderToSeparateWindow=true → findWindowByPid grabs the main UI
    //     window instead of the render window.
    //   - HideMainWindowWhenRunning=true → hides the window we're embedding.
    //   - DisableWindowResize=true → blocks our SetWindowPos calls.
    //   - PauseOnFocusLoss=true → pauses the game during reposition ticks.
    if (isPCSX2) {
      this.patchPCSX2Config();
    }

    // For PPSSPP, force FullScreen=false and ShowMenuBar=false during the
    // embedded session. PPSSPP's own fullscreen fights SetParent embedding,
    // and its menu bar eats client-area pixels inside the embedded view.
    // Original values are restored on cleanup.
    if (isPPSSPP) {
      this.patchPPSSPPConfig(resolved.executablePath);
    }

    // For Dolphin, force [Core] ConfirmStop=False so ESC (default "Stop"
    // binding) cleanly exits the emulator instead of showing a modal
    // confirmation dialog that's unreachable inside the embedded layout.
    if (isDolphin) {
      this.patchDolphinConfig();
    }

    // Mark the game as active BEFORE spawning so the blur handler in
    // main/index.ts doesn't unregister the F10 global shortcut when the
    // emulator window steals focus during startup.
    setGameActive(true);

    try {
      const [exe, args] = parseCommand(command);
      const exeDir = path.dirname(exe);
      const child = spawn(exe, args, {
        detached: false,
        stdio: "pipe",
        cwd: exeDir,
      });

      if (!child.pid) {
        setGameActive(false);
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
        setGameActive(false);
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
      // Capture the native Win32 HMENU (if any) BEFORE detaching it so
      // `toggleConfigMode` can re-attach the same handle later. SetMenu with
      // NULL only detaches — it doesn't destroy the menu — but once detached
      // there is no API to retrieve the previous handle. For Qt-based
      // emulators GetMenu returns null, which is fine: restoreMenuBar is a
      // no-op on null handles.
      this.savedMenu = getMenu(hwnd);
      // Detach any native Win32 menu bar (PPSSPP, Dolphin, Project64). No-op
      // for Qt-based emulators which use an in-client QMenuBar widget instead
      // — those are hidden via clipTopPixels / config patches elsewhere.
      removeMenuBar(hwnd);
      hideFromTaskbar(hwnd);

      // For PCSX2, the Qt menu bar + toolbar live inside the window's client
      // area (not the Win32 non-client area), so stripDecorations can't touch
      // them. We use SetWindowRgn to visually clip off the top N pixels of
      // the window so the menu bar and toolbar are never composited. The
      // reposition math below extends the window upward by the same amount,
      // so the visible (non-clipped) area exactly fills the game rectangle.
      //
      // The chrome height is DPI-scaled: on a 150% DPI display, Qt's menu
      // bar and toolbar are ~50% taller than at 100% DPI.
      if (isPCSX2) {
        const display = screen.getDisplayMatching(this.win.getContentBounds());
        this.topChromePx = Math.round(PCSX2_CHROME_BASE_PX * display.scaleFactor);
        clipTopPixels(hwnd, this.topChromePx);
      } else {
        this.topChromePx = 0;
      }

      // Position over the game area. positionWindow uses SWP_NOACTIVATE so
      // this does NOT give keyboard focus — we must do that explicitly below
      // with focusWindow. The reason positionWindow is non-activating is that
      // the sync loop repositions every 100ms, and constant activation would
      // cause WM_SETFOCUS thrashing that freezes Qt emulators' input.
      this.repositionEmulator();

      // Give the emulator window keyboard focus ONCE, on initial embedding.
      // After this, the non-activating sync loop keeps the window positioned
      // but never steals focus again — so Qt keeps a stable foreground state
      // and keyboard input flows to the game.
      focusWindow(hwnd);

      // Start synchronization
      this.startSync();

      setGameActive(true);

      this.callbacks.onSessionStarted({
        rom,
        emulatorId: resolved.definition.id,
      });

      // Re-position after renderer switches to GameModeView and sends correct bounds.
      // Re-focus too since the renderer transition may have stolen foreground briefly.
      setTimeout(() => {
        this.repositionEmulator();
        if (this.emuHwnd) focusWindow(this.emuHwnd);
      }, 300);

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
    // Stop touching the emulator window BEFORE killing the process. If we
    // keep running repositionEmulator() against a dying window that still
    // holds GPU context (PCSX2, Dolphin, RPCS3…), SetWindowPos can block
    // waiting for DWM to release resources — that blocks the Electron main
    // process and freezes the whole launcher.
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    // Detach handlers that could also trigger repositioning mid-teardown.
    for (const { event, handler } of this.boundHandlers) {
      this.win.removeListener(event as never, handler);
    }
    this.boundHandlers = [];
    // Drop the HWND so any late callbacks become no-ops.
    this.emuHwnd = null;

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
    // Extend the window upward by topChromePx so the clipped (hidden) menu
    // bar / toolbar region sits above the intended game rectangle and the
    // visible portion of the window exactly matches b. For emulators where
    // topChromePx is 0 this is a no-op.
    const offset = this.topChromePx;
    positionWindow(
      this.emuHwnd,
      b.x,
      b.y - offset,
      b.width,
      b.height + offset
    );
  }

  private suppressFocus = false;

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
      if (this.emuHwnd && !this.suppressFocus) focusWindow(this.emuHwnd);
    };
    const onClose = () => this.stopGame();
    const onFullscreen = () => {
      // Briefly suppress focus redirect so fullscreen transition completes
      this.suppressFocus = true;
      // Invalidate the cached game-area bounds. The renderer will send fresh
      // bounds once the DOM re-layouts (ResizeObserver → setGameAreaBounds IPC),
      // but until then any reposition tick would use STALE coordinates from the
      // previous fullscreen state. With gameAreaBounds=null, getScreenBounds()
      // falls back to the current mainWindow contentBounds so the emulator
      // tracks the new window size on the next sync tick instead of keeping
      // leftover fullscreen dimensions.
      //
      // IMPORTANT: do NOT call repositionEmulator() synchronously here.
      // SetWindowPos uses SendMessage to dispatch WM_WINDOWPOSCHANGING to the
      // target emulator process, and during Electron's fullscreen transition
      // DWM is rearranging window z-order and sending WM_ACTIVATEAPP /
      // WM_NCACTIVATE to the emulator. Calling SetWindowPos on top of that
      // can block the Electron main thread waiting for the emulator to finish
      // processing its own messages — freezing the entire launcher and
      // leaving mainWindow stuck in its previous fullscreen state.
      //
      // The sync loop fires every 100 ms and will pick up the new contentBounds
      // automatically as soon as Electron finishes the transition, which is
      // imperceptible to the user.
      this.gameAreaBounds = null;
      setTimeout(() => {
        this.suppressFocus = false;
        this.repositionEmulator();
        if (this.emuHwnd) focusWindow(this.emuHwnd);
      }, 300);
    };

    const events: [string, (...args: unknown[]) => void][] = [
      ["move", onMoveResize],
      ["resize", onMoveResize],
      ["maximize", onMoveResize],
      ["unmaximize", onMoveResize],
      ["minimize", onMinimize],
      ["restore", onRestore],
      ["focus", onFocus],
      ["close", onClose],
      ["enter-full-screen", onFullscreen],
      ["leave-full-screen", onFullscreen],
    ];

    for (const [event, handler] of events) {
      this.win.on(event as never, handler);
      this.boundHandlers.push({ event, handler });
    }

    // Reset F10/F11 edge-detection state for the new session.
    this.prevF10Down = false;
    this.prevF11Down = false;

    // Polling: check if emulator is still alive + reposition + detect F10/F11.
    //
    // The F10 polling is a fallback for when globalShortcut stops delivering
    // WM_HOTKEY once an embedded fullscreen emulator owns the foreground.
    // GetAsyncKeyState reads the real-time keyboard state regardless of which
    // process has focus, so we reliably catch F10 presses here. Rising-edge
    // detection (prevF10Down → down) ensures one toggle per press; the shared
    // claimF10Fire() debounce in game-state.ts prevents the parallel
    // globalShortcut path from also firing for the same press.
    //
    // F11 is Dolphin-only and toggles config mode (see `toggleConfigMode`).
    // It doesn't use globalShortcut because we intentionally want it to only
    // fire during an active embedded session, not in the launcher UI.
    this.syncInterval = setInterval(() => {
      if (!this.emuHwnd || !isWindowAlive(this.emuHwnd)) {
        this.cleanup();
        return;
      }
      // In config mode the emulator window is a standalone window the user
      // is interacting with directly — do NOT reposition it every tick or
      // we'd yank it back to the game rectangle mid-click.
      if (!this.configMode) {
        this.repositionEmulator();
      }

      const f10Down = isKeyPressed(VK_F10);
      if (f10Down && !this.prevF10Down && claimF10Fire()) {
        const next = !this.win.isFullScreen();
        console.log("[overlay] F10 (polled) toggling fullscreen →", next);
        this.win.setFullScreen(next);
      }
      this.prevF10Down = f10Down;

      if (this.currentEmulatorId === "dolphin") {
        const f11Down = isKeyPressed(VK_F11);
        if (f11Down && !this.prevF11Down) {
          this.toggleConfigMode();
        }
        this.prevF11Down = f11Down;
      }
    }, 100);
  }

  /**
   * Toggle Dolphin between embedded mode and standalone "config mode".
   *
   * Embedded → Config: hide the Electron host window, restore the emulator's
   * window chrome + native menu bar + taskbar presence, drop any clipping
   * region, and resize to a centered 1280×720 DIP rectangle on the display
   * the launcher was on. The user can then reach Dolphin's Options / Graphics
   * / Controllers menus as if it had been launched standalone.
   *
   * Config → Embedded: reverse everything — re-strip decorations, detach the
   * menu, hide from taskbar, re-show the Electron window, and reposition the
   * emulator back inside the game area. Any config dialogs Dolphin opened
   * while in config mode remain as separate top-level windows; the user is
   * expected to close them before toggling back.
   *
   * Scoped to Dolphin for now (see the F11 guard in `startSync`). Generalizing
   * to PCSX2/Citra/PPSSPP requires also re-applying `clipTopPixels` with the
   * right chrome offset and isn't needed for the initial use case.
   */
  private toggleConfigMode(): void {
    if (!this.emuHwnd) return;

    if (!this.configMode) {
      this.configMode = true;
      console.log("[overlay] F11 → entering config mode");

      // Suppress the win.on("focus") handler for a moment so hiding the
      // Electron window doesn't race with a focus redirect back to Dolphin.
      this.suppressFocus = true;

      // Hide the Electron launcher so Dolphin has the full screen real estate
      // and appears on top naturally when we foreground it below.
      if (this.win.isFullScreen()) this.win.setFullScreen(false);
      this.win.hide();

      // Restore standalone window chrome on the emulator.
      restoreDecorations(this.emuHwnd);
      restoreMenuBar(this.emuHwnd, this.savedMenu);
      showInTaskbar(this.emuHwnd);
      clearClipRegion(this.emuHwnd);

      // Resize + center on the display the launcher was on. Convert DIPs to
      // physical pixels since positionWindow expects physical coords in a
      // Per-Monitor DPI V2 process.
      const contentBounds = this.win.getContentBounds();
      const display = screen.getDisplayMatching(contentBounds);
      const sf = display.scaleFactor;
      const w = Math.round(1280 * sf);
      const h = Math.round(720 * sf);
      const x =
        Math.round(display.bounds.x * sf) +
        Math.round((display.bounds.width * sf - w) / 2);
      const y =
        Math.round(display.bounds.y * sf) +
        Math.round((display.bounds.height * sf - h) / 2);
      positionWindow(this.emuHwnd, x, y, w, h);
      focusWindow(this.emuHwnd);
    } else {
      this.configMode = false;
      console.log("[overlay] F11 → exiting config mode");

      // Re-strip chrome and re-embed. Order matches the initial embedding in
      // launchEmbedded so the window state is identical.
      stripDecorations(this.emuHwnd);
      removeMenuBar(this.emuHwnd);
      hideFromTaskbar(this.emuHwnd);

      // Bring the Electron host back. Defer the reposition + refocus a tick
      // so the show() has time to create the host's swapchain before we
      // SetWindowPos the emulator over its content area.
      this.win.show();
      setTimeout(() => {
        this.suppressFocus = false;
        this.repositionEmulator();
        if (this.emuHwnd) focusWindow(this.emuHwnd);
      }, 200);
    }
  }

  /**
   * Patch Citra's qt-config.ini so the main window starts in Qt fullscreen
   * state — the same state that Citra's F11 shortcut toggles. In fullscreen
   * state Qt hides the menubar automatically, and we additionally disable
   * the bottom status bar.
   *
   * We also force `fullscreen_mode=0` (Borderless Fullscreen) so Citra does
   * not hijack the display in Exclusive mode. Borderless fullscreen is what
   * F11 produces by default on a typical Citra install.
   *
   * `singleWindowMode=true` is forced so Citra renders the game inside the
   * main window instead of spawning a separate render window. Without this,
   * findWindowByPid picks up the citra-qt game list window and positions it
   * over the game area, leaving the real render window floating elsewhere.
   *
   * The overlay's SetWindowPos still resizes the window into the game area —
   * Qt keeps its internal fullscreen flag regardless of external resize, so
   * the menubar stays hidden while we control the final screen rectangle.
   *
   * Original values are stashed in `this.citraBackup` and restored on cleanup.
   * If `fullscreen_mode` or `singleWindowMode` didn't exist in the original
   * config, restore removes the lines we inserted.
   */
  private patchCitraConfig(): void {
    const configPath = path.join(
      app.getPath("appData"),
      "Citra",
      "config",
      "qt-config.ini"
    );
    if (!existsSync(configPath)) {
      console.warn("[overlay] Citra config not found:", configPath);
      return;
    }

    try {
      const raw = readFileSync(configPath, "utf-8");
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      const lines = raw.split(/\r?\n/);

      let inUiSection = false;
      let fullscreenIdx = -1;
      let statusBarIdx = -1;
      let fullscreenModeIdx = -1;
      let singleWindowModeIdx = -1;
      let origFullscreen = "false";
      let origShowStatusBar = "true";
      let origFullscreenMode: string | null = null;
      let origSingleWindowMode: string | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("[")) {
          inUiSection = line.trim() === "[UI]";
          continue;
        }
        if (!inUiSection) continue;

        // Match the value lines ("fullscreen=...") but skip the
        // "fullscreen\default=..." sibling lines.
        if (line.startsWith("fullscreen=")) {
          origFullscreen = line.substring("fullscreen=".length);
          fullscreenIdx = i;
        } else if (line.startsWith("showStatusBar=")) {
          origShowStatusBar = line.substring("showStatusBar=".length);
          statusBarIdx = i;
        } else if (line.startsWith("fullscreen_mode=")) {
          origFullscreenMode = line.substring("fullscreen_mode=".length);
          fullscreenModeIdx = i;
        } else if (line.startsWith("singleWindowMode=")) {
          origSingleWindowMode = line.substring("singleWindowMode=".length);
          singleWindowModeIdx = i;
        }
      }

      if (fullscreenIdx === -1 && statusBarIdx === -1 && singleWindowModeIdx === -1) {
        console.warn("[overlay] Citra UI section not found in config");
        return;
      }

      this.citraConfigPath = configPath;
      this.citraBackup = {
        fullscreen: origFullscreen,
        showStatusBar: origShowStatusBar,
        fullscreenMode: origFullscreenMode,
        singleWindowMode: origSingleWindowMode,
      };

      if (fullscreenIdx !== -1) lines[fullscreenIdx] = "fullscreen=true";
      if (statusBarIdx !== -1) lines[statusBarIdx] = "showStatusBar=false";

      // Force Borderless Fullscreen (mode 0). If the key didn't exist, insert
      // it right after the `fullscreen=` line so restore can find + delete it.
      if (fullscreenModeIdx !== -1) {
        lines[fullscreenModeIdx] = "fullscreen_mode=0";
      } else if (fullscreenIdx !== -1) {
        lines.splice(fullscreenIdx + 1, 0, "fullscreen_mode=0");
        // Shift any index we captured after the insert point.
        if (singleWindowModeIdx > fullscreenIdx) singleWindowModeIdx++;
        if (statusBarIdx > fullscreenIdx) statusBarIdx++;
      }

      // Force Single Window Mode so the rendered game lives inside the main
      // citra-qt window (the one we grab with findWindowByPid). Without this,
      // Citra spawns a separate render window and findWindowByPid picks up
      // the game list window instead, leaving the render window untouched.
      if (singleWindowModeIdx !== -1) {
        lines[singleWindowModeIdx] = "singleWindowMode=true";
      } else if (fullscreenIdx !== -1) {
        lines.splice(fullscreenIdx + 1, 0, "singleWindowMode=true");
      }

      writeFileSync(configPath, lines.join(eol), "utf-8");
    } catch (err) {
      console.warn("[overlay] Failed to patch Citra config:", err);
    }
  }

  /**
   * Restore the original Citra qt-config.ini values that were patched by
   * `patchCitraConfig`. Safe to call if nothing was patched.
   */
  private restoreCitraConfig(): void {
    if (!this.citraBackup || !this.citraConfigPath) return;
    if (!existsSync(this.citraConfigPath)) {
      this.citraBackup = null;
      this.citraConfigPath = null;
      return;
    }

    try {
      const raw = readFileSync(this.citraConfigPath, "utf-8");
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      const lines = raw.split(/\r?\n/);
      const backup = this.citraBackup;

      let inUiSection = false;
      // Iterate with an index we can mutate so `splice` works cleanly.
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("[")) {
          inUiSection = line.trim() === "[UI]";
          continue;
        }
        if (!inUiSection) continue;

        if (line.startsWith("fullscreen=")) {
          lines[i] = "fullscreen=" + backup.fullscreen;
        } else if (line.startsWith("showStatusBar=")) {
          lines[i] = "showStatusBar=" + backup.showStatusBar;
        } else if (line.startsWith("fullscreen_mode=")) {
          if (backup.fullscreenMode === null) {
            // Key didn't exist before we patched — remove the line we added.
            lines.splice(i, 1);
            i--;
          } else {
            lines[i] = "fullscreen_mode=" + backup.fullscreenMode;
          }
        } else if (line.startsWith("singleWindowMode=")) {
          if (backup.singleWindowMode === null) {
            // Key didn't exist before we patched — remove the line we added.
            lines.splice(i, 1);
            i--;
          } else {
            lines[i] = "singleWindowMode=" + backup.singleWindowMode;
          }
        }
      }

      writeFileSync(this.citraConfigPath, lines.join(eol), "utf-8");
    } catch (err) {
      console.warn("[overlay] Failed to restore Citra config:", err);
    } finally {
      this.citraBackup = null;
      this.citraConfigPath = null;
    }
  }

  /**
   * Patch PCSX2.ini to force safe [UI] values required for reliable embedding.
   * See the comment at the call site in `launchEmbedded` for the rationale
   * behind each forced key. Originals are stashed in `this.pcsx2Backup` and
   * restored on cleanup. For keys that did not exist in the original file,
   * the backup stores `null` and the restore step deletes the inserted line.
   */
  private patchPCSX2Config(): void {
    const configPath = path.join(
      app.getPath("documents"),
      "PCSX2",
      "inis",
      "PCSX2.ini"
    );
    if (!existsSync(configPath)) {
      console.warn("[overlay] PCSX2 config not found:", configPath);
      return;
    }

    // Keys we force to "false" during embedded sessions. The order here also
    // determines insertion order if we have to add missing keys.
    const forcedKeys = [
      "StartFullscreen",
      "RenderToSeparateWindow",
      "HideMainWindowWhenRunning",
      "DisableWindowResize",
      "PauseOnFocusLoss",
    ] as const;

    try {
      const raw = readFileSync(configPath, "utf-8");
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      const lines = raw.split(/\r?\n/);

      // Locate the [UI] section and each key within it.
      let uiStartIdx = -1;
      let uiEndIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === "[UI]") {
          uiStartIdx = i;
          continue;
        }
        if (uiStartIdx !== -1 && trimmed.startsWith("[") && trimmed.endsWith("]")) {
          uiEndIdx = i;
          break;
        }
      }
      if (uiStartIdx === -1) {
        console.warn("[overlay] PCSX2 [UI] section not found in config");
        return;
      }
      if (uiEndIdx === -1) uiEndIdx = lines.length;

      // Record original values (null = key was absent) and the index of each
      // existing key line so we can rewrite it in place.
      const backup: Record<string, string | null> = {};
      const keyIdx: Record<string, number> = {};
      for (const key of forcedKeys) {
        backup[key] = null;
        keyIdx[key] = -1;
      }

      // PCSX2 writes keys as "Key = value" (with spaces around =). Match both
      // "Key = value" and "Key=value" to be safe.
      const keyLineRe = (key: string) =>
        new RegExp("^\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*(.*)$");

      for (let i = uiStartIdx + 1; i < uiEndIdx; i++) {
        const line = lines[i];
        for (const key of forcedKeys) {
          if (keyIdx[key] !== -1) continue;
          const m = line.match(keyLineRe(key));
          if (m) {
            backup[key] = m[1];
            keyIdx[key] = i;
          }
        }
      }

      this.pcsx2ConfigPath = configPath;
      this.pcsx2Backup = {
        StartFullscreen: backup.StartFullscreen,
        RenderToSeparateWindow: backup.RenderToSeparateWindow,
        HideMainWindowWhenRunning: backup.HideMainWindowWhenRunning,
        DisableWindowResize: backup.DisableWindowResize,
        PauseOnFocusLoss: backup.PauseOnFocusLoss,
      };

      // Overwrite existing keys in place; insert missing ones right after the
      // [UI] header. Walk forcedKeys in reverse so each splice at uiStartIdx+1
      // leaves the earlier keys in the right relative order.
      for (const key of forcedKeys) {
        if (keyIdx[key] !== -1) {
          lines[keyIdx[key]] = `${key} = false`;
        }
      }
      for (let k = forcedKeys.length - 1; k >= 0; k--) {
        const key = forcedKeys[k];
        if (keyIdx[key] === -1) {
          lines.splice(uiStartIdx + 1, 0, `${key} = false`);
        }
      }

      writeFileSync(configPath, lines.join(eol), "utf-8");
    } catch (err) {
      console.warn("[overlay] Failed to patch PCSX2 config:", err);
    }
  }

  /**
   * Restore the original PCSX2.ini [UI] values that were patched by
   * `patchPCSX2Config`. Safe to call if nothing was patched.
   */
  private restorePCSX2Config(): void {
    if (!this.pcsx2Backup || !this.pcsx2ConfigPath) return;
    if (!existsSync(this.pcsx2ConfigPath)) {
      this.pcsx2Backup = null;
      this.pcsx2ConfigPath = null;
      return;
    }

    const forcedKeys = [
      "StartFullscreen",
      "RenderToSeparateWindow",
      "HideMainWindowWhenRunning",
      "DisableWindowResize",
      "PauseOnFocusLoss",
    ] as const;

    try {
      const raw = readFileSync(this.pcsx2ConfigPath, "utf-8");
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      const lines = raw.split(/\r?\n/);
      const backup = this.pcsx2Backup;

      // Find [UI] boundaries.
      let uiStartIdx = -1;
      let uiEndIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === "[UI]") {
          uiStartIdx = i;
          continue;
        }
        if (uiStartIdx !== -1 && trimmed.startsWith("[") && trimmed.endsWith("]")) {
          uiEndIdx = i;
          break;
        }
      }
      if (uiStartIdx === -1) {
        this.pcsx2Backup = null;
        this.pcsx2ConfigPath = null;
        return;
      }
      if (uiEndIdx === -1) uiEndIdx = lines.length;

      // Walk backward so splice indices stay valid while we delete lines
      // for keys whose original value was null (i.e. we inserted them).
      for (let i = uiEndIdx - 1; i > uiStartIdx; i--) {
        const line = lines[i];
        for (const key of forcedKeys) {
          const re = new RegExp("^\\s*" + key + "\\s*=\\s*(.*)$");
          const m = line.match(re);
          if (!m) continue;
          const original = backup[key];
          if (original === null) {
            lines.splice(i, 1);
          } else {
            lines[i] = `${key} = ${original}`;
          }
          break;
        }
      }

      writeFileSync(this.pcsx2ConfigPath, lines.join(eol), "utf-8");
    } catch (err) {
      console.warn("[overlay] Failed to restore PCSX2 config:", err);
    } finally {
      this.pcsx2Backup = null;
      this.pcsx2ConfigPath = null;
    }
  }

  /**
   * Patch `{emuDir}/memstick/PSP/SYSTEM/ppsspp.ini` to force FullScreen=false
   * and ShowMenuBar=false during an embedded PPSSPP session. Originals are
   * captured so `restorePPSSPPConfig` can put them back after the game
   * exits, keeping the user's standalone preferences intact.
   */
  private patchPPSSPPConfig(executablePath: string): void {
    const configPath = path.join(
      path.dirname(executablePath),
      "memstick",
      "PSP",
      "SYSTEM",
      "ppsspp.ini"
    );
    if (!existsSync(configPath)) {
      console.warn("[overlay] PPSSPP config not found:", configPath);
      return;
    }

    // Section → key → forced value during embedded sessions.
    const patches: { section: string; key: string }[] = [
      { section: "Graphics", key: "FullScreen" },
      { section: "General", key: "ShowMenuBar" },
    ];

    try {
      const raw = readFileSync(configPath, "utf-8");
      // Strip UTF-8 BOM before splitting so the first section header is
      // detectable. PPSSPP writes the ini with a leading BOM.
      const stripped = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      const lines = stripped.split(/\r?\n/);

      // Locate [Graphics] and [General] section boundaries in a single pass.
      const sectionStart: Record<string, number> = {};
      const sectionEnd: Record<string, number> = {};
      let currentSection: string | null = null;
      let currentStart = -1;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const m = trimmed.match(/^\[(.+)\]$/);
        if (m) {
          if (currentSection !== null) {
            sectionEnd[currentSection] = i;
          }
          currentSection = m[1];
          currentStart = i;
          sectionStart[currentSection] = currentStart;
        }
      }
      if (currentSection !== null && sectionEnd[currentSection] === undefined) {
        sectionEnd[currentSection] = lines.length;
      }

      // Find each patched key's line index and its original value.
      const backup: Record<string, string | null> = {
        FullScreen: null,
        ShowMenuBar: null,
      };
      const keyIdx: Record<string, number> = {
        FullScreen: -1,
        ShowMenuBar: -1,
      };
      for (const { section, key } of patches) {
        const start = sectionStart[section];
        const end = sectionEnd[section];
        if (start === undefined || end === undefined) continue;
        const re = new RegExp(
          "^\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*(.*)$"
        );
        for (let i = start + 1; i < end; i++) {
          const m = lines[i].match(re);
          if (m) {
            backup[key] = m[1];
            keyIdx[key] = i;
            break;
          }
        }
      }

      this.ppssppConfigPath = configPath;
      this.ppssppBackup = {
        FullScreen: backup.FullScreen,
        ShowMenuBar: backup.ShowMenuBar,
      };

      // Overwrite existing keys in place, insert missing ones right after
      // their section header. Walk patches in reverse when inserting so
      // earlier inserts don't shift later indices.
      for (const { key } of patches) {
        if (keyIdx[key] !== -1) {
          lines[keyIdx[key]] = `${key} = False`;
        }
      }
      for (let p = patches.length - 1; p >= 0; p--) {
        const { section, key } = patches[p];
        if (keyIdx[key] === -1 && sectionStart[section] !== undefined) {
          lines.splice(sectionStart[section] + 1, 0, `${key} = False`);
        }
      }

      writeFileSync(configPath, lines.join(eol), "utf-8");
    } catch (err) {
      console.warn("[overlay] Failed to patch PPSSPP config:", err);
    }
  }

  /**
   * Restore the original PPSSPP ini values patched by `patchPPSSPPConfig`.
   * Safe to call if nothing was patched.
   */
  private restorePPSSPPConfig(): void {
    if (!this.ppssppBackup || !this.ppssppConfigPath) return;
    if (!existsSync(this.ppssppConfigPath)) {
      this.ppssppBackup = null;
      this.ppssppConfigPath = null;
      return;
    }

    const backup = this.ppssppBackup;
    const patches: { section: string; key: string; original: string | null }[] = [
      { section: "Graphics", key: "FullScreen", original: backup.FullScreen },
      { section: "General", key: "ShowMenuBar", original: backup.ShowMenuBar },
    ];

    try {
      const raw = readFileSync(this.ppssppConfigPath, "utf-8");
      const stripped = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      const lines = stripped.split(/\r?\n/);

      // Locate section boundaries.
      const sectionStart: Record<string, number> = {};
      const sectionEnd: Record<string, number> = {};
      let currentSection: string | null = null;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const m = trimmed.match(/^\[(.+)\]$/);
        if (m) {
          if (currentSection !== null) sectionEnd[currentSection] = i;
          currentSection = m[1];
          sectionStart[currentSection] = i;
        }
      }
      if (currentSection !== null && sectionEnd[currentSection] === undefined) {
        sectionEnd[currentSection] = lines.length;
      }

      // Walk each patched key, restoring its original value or deleting it
      // if we inserted it. Deletion iterates the range backward to keep
      // splice indices valid.
      for (const { section, key, original } of patches) {
        const start = sectionStart[section];
        const end = sectionEnd[section];
        if (start === undefined || end === undefined) continue;
        const re = new RegExp(
          "^\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*(.*)$"
        );
        for (let i = end - 1; i > start; i--) {
          if (!re.test(lines[i])) continue;
          if (original === null) {
            lines.splice(i, 1);
          } else {
            lines[i] = `${key} = ${original}`;
          }
          break;
        }
      }

      writeFileSync(this.ppssppConfigPath, lines.join(eol), "utf-8");
    } catch (err) {
      console.warn("[overlay] Failed to restore PPSSPP config:", err);
    } finally {
      this.ppssppBackup = null;
      this.ppssppConfigPath = null;
    }
  }

  /**
   * Patch `%APPDATA%/Dolphin Emulator/Config/Dolphin.ini` to force
   * [Core] ConfirmStop=False during an embedded session. See the field
   * declaration comment for the rationale. Original value is captured so
   * `restoreDolphinConfig` can put it back after the game exits. If the key
   * was absent in the original file, the backup stores null and restore
   * deletes the line we inserted.
   */
  private patchDolphinConfig(): void {
    const configPath = path.join(
      app.getPath("appData"),
      "Dolphin Emulator",
      "Config",
      "Dolphin.ini"
    );
    if (!existsSync(configPath)) {
      console.warn("[overlay] Dolphin config not found:", configPath);
      return;
    }

    try {
      const raw = readFileSync(configPath, "utf-8");
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      const lines = raw.split(/\r?\n/);

      // Locate [Core] section bounds.
      let coreStartIdx = -1;
      let coreEndIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === "[Core]") {
          coreStartIdx = i;
          continue;
        }
        if (coreStartIdx !== -1 && trimmed.startsWith("[") && trimmed.endsWith("]")) {
          coreEndIdx = i;
          break;
        }
      }
      if (coreStartIdx === -1) {
        console.warn("[overlay] Dolphin [Core] section not found in config");
        return;
      }
      if (coreEndIdx === -1) coreEndIdx = lines.length;

      // Find existing ConfirmStop = ... line (with or without spaces).
      const re = /^\s*ConfirmStop\s*=\s*(.*)$/;
      let confirmIdx = -1;
      let origValue: string | null = null;
      for (let i = coreStartIdx + 1; i < coreEndIdx; i++) {
        const m = lines[i].match(re);
        if (m) {
          confirmIdx = i;
          origValue = m[1];
          break;
        }
      }

      this.dolphinConfigPath = configPath;
      this.dolphinBackup = { ConfirmStop: origValue };

      if (confirmIdx !== -1) {
        lines[confirmIdx] = "ConfirmStop = False";
      } else {
        lines.splice(coreStartIdx + 1, 0, "ConfirmStop = False");
      }

      writeFileSync(configPath, lines.join(eol), "utf-8");
    } catch (err) {
      console.warn("[overlay] Failed to patch Dolphin config:", err);
    }
  }

  /**
   * Restore the original Dolphin.ini [Core] ConfirmStop value patched by
   * `patchDolphinConfig`. Safe to call if nothing was patched.
   */
  private restoreDolphinConfig(): void {
    if (!this.dolphinBackup || !this.dolphinConfigPath) return;
    if (!existsSync(this.dolphinConfigPath)) {
      this.dolphinBackup = null;
      this.dolphinConfigPath = null;
      return;
    }

    try {
      const raw = readFileSync(this.dolphinConfigPath, "utf-8");
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      const lines = raw.split(/\r?\n/);
      const original = this.dolphinBackup.ConfirmStop;

      let coreStartIdx = -1;
      let coreEndIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === "[Core]") {
          coreStartIdx = i;
          continue;
        }
        if (coreStartIdx !== -1 && trimmed.startsWith("[") && trimmed.endsWith("]")) {
          coreEndIdx = i;
          break;
        }
      }
      if (coreStartIdx === -1) {
        this.dolphinBackup = null;
        this.dolphinConfigPath = null;
        return;
      }
      if (coreEndIdx === -1) coreEndIdx = lines.length;

      const re = /^\s*ConfirmStop\s*=\s*(.*)$/;
      for (let i = coreEndIdx - 1; i > coreStartIdx; i--) {
        if (!re.test(lines[i])) continue;
        if (original === null) {
          lines.splice(i, 1);
        } else {
          lines[i] = `ConfirmStop = ${original}`;
        }
        break;
      }

      writeFileSync(this.dolphinConfigPath, lines.join(eol), "utf-8");
    } catch (err) {
      console.warn("[overlay] Failed to restore Dolphin config:", err);
    } finally {
      this.dolphinBackup = null;
      this.dolphinConfigPath = null;
    }
  }

  private killProcess(): void {
    const proc = this.process;
    if (!proc || proc.killed) return;
    const pid = proc.pid;

    try {
      if (process.platform === "win32" && pid) {
        // taskkill /F /T force-kills the entire process tree. This is more
        // reliable than child.kill() for emulators that spawn helper
        // processes (PCSX2, Dolphin) and doesn't leave orphaned workers.
        // We detach it so it never blocks the Electron main loop.
        const killer = spawn(
          "taskkill",
          ["/PID", String(pid), "/T", "/F"],
          { detached: true, stdio: "ignore", windowsHide: true }
        );
        killer.unref();
      } else {
        proc.kill("SIGKILL");
      }
    } catch (err) {
      console.warn("[overlay] killProcess failed:", err);
      // Fallback to Node's built-in kill if taskkill couldn't be launched.
      try {
        proc.kill();
      } catch {
        // Process may have already exited
      }
    }
  }

  private cleanedUp = false;

  private cleanup(): void {
    // Idempotent: cleanup can be invoked from multiple paths (stopGame,
    // child.on("exit"), syncInterval dead-window detection) and we don't
    // want to fire `onSessionEnded` twice or double-remove listeners.
    if (this.cleanedUp) return;
    this.cleanedUp = true;

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

    // Restore Citra's qt-config.ini if we patched it before launch.
    this.restoreCitraConfig();

    // Restore PCSX2.ini [UI] values if we patched them before launch.
    this.restorePCSX2Config();

    // Restore PPSSPP ini values if we patched them before launch.
    this.restorePPSSPPConfig();

    // Restore Dolphin.ini [Core] ConfirmStop if we patched it before launch.
    this.restoreDolphinConfig();

    // If the session ended while Dolphin was in standalone config mode the
    // Electron window is still hidden — make it visible again so the user
    // lands back on the launcher instead of a vanished app.
    if (this.configMode && !this.win.isDestroyed()) {
      this.win.show();
    }

    this.emuHwnd = null;
    this.process = null;
    this.currentRom = null;
    this.currentEmulatorId = null;
    this.suppressFocus = false;
    this.topChromePx = 0;
    this.savedMenu = null;
    this.configMode = false;
    this.prevF11Down = false;

    setGameActive(false);
    this.callbacks.onSessionEnded();
  }
}
