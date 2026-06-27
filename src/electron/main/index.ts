import "dotenv/config";
import { app, BrowserWindow, globalShortcut, Menu, session } from "electron";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { migrateDataIfNeeded } from "./data-migrator.js";
import { isGameActive, claimF10Fire } from "./game-state.js";
import { setSecurityLogDir } from "../../core/security-logger.js";
import { MetadataCache } from "../../core/metadata-cache.js";
import { migrateThumbnailVersion } from "../../core/thumbnail-cache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Remove the native application menu bar entirely (View/Edit/etc).
  // Called before BrowserWindow creation to avoid a flash of the menu.
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    // Open maximized to the full screen by default (console-like experience).
    // F10 still toggles fullscreen on/off at runtime.
    fullscreen: true,
    title: "EmuraOS",
    backgroundColor: "#111827",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Let the EMURA boot chime (WebAudio) play on startup without a prior
      // user gesture — Chromium otherwise blocks audio until first interaction.
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  // TODO: remove before production
  // mainWindow.webContents.openDevTools({ mode: "detach" });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "..", "renderer", MAIN_WINDOW_VITE_NAME, "index.html")
    );
  }

  // Chromium's Gamepad API requires document.hasFocus() to return valid data.
  // Detached DevTools steals focus — restore it once loaded (with a small
  // delay so the DevTools window finishes opening first) and every time
  // the main window regains focus.
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => mainWindow?.webContents.focus(), 300);
    // Trigger an update check after the UI has settled
    setTimeout(() => {
      mainWindow?.webContents.send("startup-update-check");
    }, 3000);
  });
  mainWindow.on("focus", () => {
    mainWindow?.webContents.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("enter-full-screen", () =>
    mainWindow?.webContents.send("fullscreen-changed", true)
  );
  mainWindow.on("leave-full-screen", () =>
    mainWindow?.webContents.send("fullscreen-changed", false)
  );

  // F10 toggles fullscreen — register once, re-register on focus only if needed.
  // The emulator-overlay sync loop has a GetAsyncKeyState-based polling fallback
  // for F10 during game sessions (because globalShortcut stops delivering
  // WM_HOTKEY reliably once an embedded emulator owns fullscreen foreground).
  // Both paths claim the fire through `claimF10Fire()` to avoid double-toggles.
  const f10Handler = () => {
    if (!claimF10Fire()) return;
    if (!mainWindow) return;
    if (isGameActive()) {
      // During a game session F10 opens/closes the NEXUS pause menu.
      console.log("[F10] → toggle pause menu");
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.focus();
      mainWindow.webContents.send("nexus-toggle-pause");
    } else {
      const next = !mainWindow.isFullScreen();
      console.log("[F10] toggling fullscreen →", next);
      mainWindow.setFullScreen(next);
    }
  };
  globalShortcut.register("F10", f10Handler);

  mainWindow.on("focus", () => {
    if (!globalShortcut.isRegistered("F10")) {
      globalShortcut.register("F10", f10Handler);
    }
  });
  mainWindow.on("blur", () => {
    if (!isGameActive()) {
      globalShortcut.unregister("F10");
    }
  });
}

// Single-instance guard: a second launch would fight the first over the shared
// userData/cache directory on Windows, producing "Unable to move the cache:
// Access denied (0x5)" / "Gpu Cache Creation failed" disk_cache errors. Instead,
// quit the duplicate and focus the window that's already open. Calling app.quit()
// before 'ready' fires means the whenReady() handler below never runs for the
// losing instance, so it creates no window and touches no cache.
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  // Initialize security logging directory
  setSecurityLogDir(app.getPath("logs"));

  // Content Security Policy — restrict renderer from loading external
  // scripts, connecting to arbitrary hosts, etc. In dev mode Vite needs
  // 'unsafe-inline' scripts and ws: connections for HMR.
  const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
  // SteamGridDB CDN is allowlisted in img-src so the per-game cover picker
  // can preview candidate thumbnails without round-tripping each image
  // through main as a data URL. The actual chosen cover is still downloaded
  // server-side and stored locally — only the previews load directly.
  const csp = isDev
    ? "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https://cdn2.steamgriddb.com https://steamgriddb.com https://*.supabase.co; " +
      "connect-src 'self' ws: https://*.supabase.co wss://*.supabase.co; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "object-src 'none'; " +
      "base-uri 'self'"
    : "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "img-src 'self' data: https://cdn2.steamgriddb.com https://steamgriddb.com https://*.supabase.co; " +
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "object-src 'none'; " +
      "base-uri 'self'";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  // Migrate user data from install dir to %USERPROFILE%\EmuraOS\
  if (app.isPackaged) {
    const oldRoot = path.dirname(app.getPath("exe"));
    const newRoot = path.join(os.homedir(), "EmuraOS");
    migrateDataIfNeeded(oldRoot, newRoot);
  }

  // Wipe the thumbnails directory if it was generated by a previous
  // version (smaller dimensions, different quality). The next grid load
  // regenerates them lazily at the new spec via ensureThumbnail.
  try {
    const projectRoot = app.isPackaged
      ? path.join(os.homedir(), "EmuraOS")
      : app.getAppPath();
    const cache = new MetadataCache(projectRoot);
    migrateThumbnailVersion(cache.getThumbnailsDir());
  } catch (err) {
    console.warn("[startup] thumbnail migration failed:", err);
  }

  registerIpcHandlers(() => mainWindow);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
