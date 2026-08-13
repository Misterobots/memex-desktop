/**
 * Electron main process — lifecycle composition only.
 * All heavy logic lives in dedicated modules under electron/.
 */
import { app, BrowserWindow, globalShortcut } from "electron";
import type { Tray } from "electron";
import { existsSync } from "fs";
import { join, dirname } from "path";

import { ConfigStore }       from "./config-store";
import { WorkspaceFirewall } from "./workspace-firewall";
import { LspManager }        from "./lsp-manager";
import { BrowserBridge, registerNativeHost, setBridgeAllowedIds } from "./browser-bridge";
import { initIdentity }      from "./identity";
import { startHealthLoop, registerHealthIpc } from "./health";
import { setupUpdater, registerUpdaterIpc }   from "./updater";
import {
  createMainWindow, createTray, registerQuickIpc,
  registerShortcuts, registerShortcutIpc, routeFilePath, toggleQuickWindow,
} from "./windows";
import { registerAllIpc } from "./ipc-handlers";
import { RunStore }        from "./run-store";
import { EvalStore }       from "./eval-store";
import { ArtifactStore }   from "./artifact-store";
import { HooksStore }      from "./hooks-store";
import { BrowserPane }     from "./browser-pane";
import { registerRemoteAuthIpc } from "./remote-auth";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Shared singletons — created in whenReady, referenced by all modules
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;
let tray:       Tray          | null = null;
let isQuitting = false;
let config:     ConfigStore;
let firewall:   WorkspaceFirewall;
let runs:       RunStore;
let evals:      EvalStore;
let artifacts:  ArtifactStore;
let hooks:      HooksStore;
const lsp     = new LspManager(() => mainWindow);
const browser = new BrowserBridge();
const browserPane = new BrowserPane(() => mainWindow);

const getMain = () => mainWindow;
const getTray = () => tray;

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  const userData = app.getPath("userData");

  initIdentity(userData);
  config   = new ConfigStore(userData);
  // Every NSIS install writes this marker. Preserve prior user data, but
  // require setup before any persisted content is exposed in the renderer.
  if (existsSync(join(dirname(process.resourcesPath), ".memex-setup-required"))) {
    config.requireWizard();
  }
  firewall = new WorkspaceFirewall(userData);
  runs      = new RunStore(userData);
  evals     = new EvalStore(userData);
  artifacts = new ArtifactStore(userData);
  hooks     = new HooksStore(userData);
  setBridgeAllowedIds(config.getAllowedExtensionIds());

  mainWindow = createMainWindow(config, getTray, () => isQuitting);
  tray       = createTray(getMain, toggleQuickWindow);

  const doStartHealthLoop = () => startHealthLoop(config, getMain);
  doStartHealthLoop();

  setupUpdater(getMain, getTray, isDev);
  registerUpdaterIpc();
  registerRemoteAuthIpc(getMain);
  registerHealthIpc(config, getMain);
  registerQuickIpc(getMain);
  registerShortcuts(config, getMain, toggleQuickWindow);
  registerShortcutIpc(config, getMain, toggleQuickWindow);
  registerNativeHost();
  browser.start((msg) => mainWindow?.webContents.send("browser:message", msg));

  registerAllIpc({ config, firewall, lsp, browser, browserPane, runs, evals, artifacts, hooks, getMain, startHealthLoop: doStartHealthLoop });

  app.on("activate", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    else mainWindow = createMainWindow(config, getTray, () => isQuitting);
  });

  // Hide on --startup arg (auto-start login item)
  if (process.argv.includes("--startup")) mainWindow.hide();
});

// Flips before any window's close event fires as part of a real quit (tray
// "Quit", Cmd+Q, app.quit() from the updater, ...) — see windows.ts's close
// handler, which otherwise intercepts every close identically and just
// re-hides to tray, so "Quit" would silently do nothing.
app.on("before-quit", () => { isQuitting = true; });
app.on("will-quit", () => { globalShortcut.unregisterAll(); lsp.stopAll(); browser.stop(); browserPane.dispose(); });
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
