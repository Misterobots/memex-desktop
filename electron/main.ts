/**
 * Electron main process — lifecycle composition only.
 * All heavy logic lives in dedicated modules under electron/.
 */
import { app, BrowserWindow, globalShortcut } from "electron";
import type { Tray } from "electron";

import { ConfigStore }       from "./config-store";
import { WorkspaceFirewall } from "./workspace-firewall";
import { LspManager }        from "./lsp-manager";
import { BrowserBridge, registerNativeHost, setBridgeAllowedIds } from "./browser-bridge";
import { initIdentity }      from "./identity";
import { startHealthLoop, registerHealthIpc } from "./health";
import { setupUpdater, registerUpdaterIpc }   from "./updater";
import {
  createMainWindow, createTray, registerQuickIpc,
  registerShortcuts, routeFilePath, toggleQuickWindow,
} from "./windows";
import { registerAllIpc } from "./ipc-handlers";
import { RunStore }       from "./run-store";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Shared singletons — created in whenReady, referenced by all modules
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;
let tray:       Tray          | null = null;
let config:     ConfigStore;
let firewall:   WorkspaceFirewall;
let runs:       RunStore;
const lsp     = new LspManager(() => mainWindow);
const browser = new BrowserBridge();

const getMain = () => mainWindow;
const getTray = () => tray;

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  const userData = app.getPath("userData");

  initIdentity(userData);
  config   = new ConfigStore(userData);
  firewall = new WorkspaceFirewall(userData);
  runs     = new RunStore(userData);
  setBridgeAllowedIds(config.getAllowedExtensionIds());

  mainWindow = createMainWindow(config, getTray);
  tray       = createTray(getMain, toggleQuickWindow);

  const doStartHealthLoop = () => startHealthLoop(config, getMain);
  doStartHealthLoop();

  setupUpdater(getMain, getTray, isDev);
  registerUpdaterIpc();
  registerHealthIpc(config, getMain);
  registerQuickIpc(getMain);
  registerShortcuts(getMain, toggleQuickWindow);
  registerNativeHost();
  browser.start((msg) => mainWindow?.webContents.send("browser:message", msg));

  registerAllIpc({ config, firewall, lsp, browser, runs, getMain, startHealthLoop: doStartHealthLoop });

  app.on("activate", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    else mainWindow = createMainWindow(config, getTray);
  });

  // Hide on --startup arg (auto-start login item)
  if (process.argv.includes("--startup")) mainWindow.hide();
});

app.on("will-quit", () => { globalShortcut.unregisterAll(); lsp.stopAll(); browser.stop(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ---------------------------------------------------------------------------
// File type / open-file routing
// ---------------------------------------------------------------------------
app.on("open-file", (e, path) => {
  e.preventDefault();
  mainWindow?.show(); mainWindow?.focus();
  routeFilePath(path, getMain);
});

if (process.argv.length > 1) {
  const candidate = process.argv[process.argv.length - 1];
  if (!candidate.startsWith("--") && candidate.includes(".")) {
    app.whenReady().then(() => routeFilePath(candidate, getMain));
  }
}
