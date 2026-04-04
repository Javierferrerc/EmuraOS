import { app, BrowserWindow, globalShortcut, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { isGameActive } from "./game-state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
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
    },
  });

  // TODO: remove before production
  mainWindow.webContents.openDevTools();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "..", "renderer", MAIN_WINDOW_VITE_NAME, "index.html")
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("enter-full-screen", () =>
    mainWindow?.webContents.send("fullscreen-changed", true)
  );
  mainWindow.on("leave-full-screen", () =>
    mainWindow?.webContents.send("fullscreen-changed", false)
  );

  // Keep dev-friendly menu items
  const menu = Menu.buildFromTemplate([
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  // F10 toggles fullscreen — register once, re-register on focus only if needed
  const f10Handler = () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
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
