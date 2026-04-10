import "dotenv/config";
import { app, BrowserWindow, globalShortcut, Menu, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { isGameActive, claimF10Fire } from "./game-state.js";
import { setSecurityLogDir } from "../../core/security-logger.js";

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
    title: "Retro Launcher",
    backgroundColor: "#111827",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
    if (mainWindow) {
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

app.whenReady().then(() => {
  // Initialize security logging directory
  setSecurityLogDir(app.getPath("logs"));

  // Content Security Policy — restrict renderer from loading external
  // scripts, connecting to arbitrary hosts, etc. In dev mode Vite needs
  // 'unsafe-inline' scripts and ws: connections for HMR.
  const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const csp = isDev
    ? "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "connect-src 'self' ws:; " +
      "font-src 'self'; " +
      "object-src 'none'; " +
      "base-uri 'self'"
    : "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "connect-src 'self'; " +
      "font-src 'self'; " +
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
