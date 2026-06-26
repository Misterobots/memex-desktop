import {
  app, BrowserWindow, ipcMain,
  dialog, shell, Tray, Menu, nativeImage,
  globalShortcut, screen as electronScreen,
  safeStorage,
} from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as pty from "node-pty";
import { autoUpdater }  from "electron-updater";
import { LspManager }       from "./lsp-manager";
import { BrowserBridge, registerNativeHost } from "./browser-bridge";
import { ConfigStore } from "./config-store";
import { WorkspaceFirewall } from "./workspace-firewall";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const isDev         = process.env.NODE_ENV === "development";
const IDENTITY_FILE = join(app.getPath("userData"), "identity.enc");
// Initialised after app.whenReady so userData path is available
let configStore:    ConfigStore;
let workspaceFirewall: WorkspaceFirewall;

let mainWindow:  BrowserWindow | null = null;
let quickWindow: BrowserWindow | null = null;
let tray:        Tray          | null = null;
const lsp     = new LspManager(() => mainWindow);
const browser = new BrowserBridge();

// ---------------------------------------------------------------------------
// Identity — stored in safeStorage, injected as X-authentik-uid on all
// agent_runtime requests. No SSO redirect needed.
// ---------------------------------------------------------------------------
function loadIdentity(): string {
  try {
    if (existsSync(IDENTITY_FILE) && safeStorage.isEncryptionAvailable()) {
      const enc = readFileSync(IDENTITY_FILE);
      return safeStorage.decryptString(enc);
    }
  } catch {}
  return "desktop";
}

function saveIdentity(uid: string): void {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(IDENTITY_FILE, safeStorage.encryptString(uid));
    }
  } catch {}
}

let currentUid = loadIdentity();

// ---------------------------------------------------------------------------
// Main window — loads the local React app
// ---------------------------------------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 600,
    backgroundColor: "#262624",
    titleBarStyle: "hidden",
    titleBarOverlay: process.platform !== "darwin" ? {
      color:       "#30302e",
      symbolColor: "#a3a096",
      height:      40,
    } : undefined,
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 12 } : undefined,
    webPreferences: {
      // Full bridge preload — gives window.memex to the React app
      preload:          join(__dirname, "preload-memex.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  // Load local React renderer
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }

  // Inject identity + client marker on requests to the active profile's endpoints.
  // We use a broad http:// filter and check URL prefixes dynamically so that
  // profile switches take effect without restarting the webRequest listener.
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["http://*/*"] },
    (details, callback) => {
      const { agentRuntime, mempalace } = configStore.getUrls();
      const u = details.url;
      if (u.startsWith(agentRuntime) || u.startsWith(mempalace)) {
        callback({
          requestHeaders: {
            ...details.requestHeaders,
            "X-authentik-uid":  currentUid,
            "X-desktop-client": "memex-desktop",
          },
        });
      } else {
        callback({ requestHeaders: details.requestHeaders });
      }
    }
  );

  mainWindow.on("close", (e) => {
    if (tray) { e.preventDefault(); mainWindow?.hide(); }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------
function createTray() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAN0lEQVQ4jWNgYGD4z0ABYBo1YNQAKjcABQAA//8DABbHAv8AAAAA"
  );
  tray = new Tray(icon);
  tray.setToolTip("Memex Desktop");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open",        click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: "Quick Entry", click: toggleQuickWindow },
    { type: "separator" },
    { label: "Quit",        click: () => { tray = null; app.quit(); } },
  ]));
  tray.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ---------------------------------------------------------------------------
// Quick entry window
// ---------------------------------------------------------------------------
function createQuickWindow() {
  quickWindow = new BrowserWindow({
    width: 640, height: 72,
    transparent: true, frame: false,
    resizable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, "preload-quick.js"),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  quickWindow.loadFile(join(__dirname, "../quick.html"));

  let suppressNextBlur = false;
  quickWindow.on("blur", () => {
    if (suppressNextBlur) { suppressNextBlur = false; return; }
    quickWindow?.hide();
  });
  (quickWindow as any).__suppressNextBlur = () => { suppressNextBlur = true; };
  quickWindow.hide();
}

function toggleQuickWindow() {
  if (!quickWindow) { createQuickWindow(); }
  if (!quickWindow) return;
  if (quickWindow.isVisible()) {
    quickWindow.hide();
  } else {
    const pt  = electronScreen.getCursorScreenPoint();
    const dsp = electronScreen.getDisplayNearestPoint(pt);
    const { x, y, width } = dsp.workArea;
    const qw = quickWindow.getSize()[0];
    quickWindow.setPosition(Math.round(x + (width - qw) / 2), Math.round(y + 80));
    (quickWindow as any).__suppressNextBlur?.();
    quickWindow.show();
    quickWindow.focus();
  }
}

ipcMain.on("quick:skooch", (_e, width: number, height: number) => {
  if (!quickWindow) return;
  const [qx, qy] = quickWindow.getPosition();
  const dsp = electronScreen.getDisplayNearestPoint({ x: qx, y: qy });
  const bottom = dsp.workArea.y + dsp.workArea.height;
  const newY = qy + quickWindow.getSize()[1] <= bottom ? qy : bottom - height - 8;
  quickWindow.setBounds({ x: qx, y: newY, width, height });
});

ipcMain.on("quick:submit", (_e, text: string | null) => {
  quickWindow?.hide();
  if (!text) return;
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.executeJavaScript(
    `window.__memexQuickSubmit && window.__memexQuickSubmit(${JSON.stringify(text)})`
  );
});

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------
function setupUpdater() {
  if (isDev) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available",  (info) => mainWindow?.webContents.send("update:status", { state: "available",  version: info.version }));
  autoUpdater.on("update-not-available", ()  => mainWindow?.webContents.send("update:status", { state: "current" }));
  autoUpdater.on("download-progress", (p)   => mainWindow?.webContents.send("update:status", { state: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("update:status", { state: "ready", version: info.version });
    tray?.setToolTip(`Memex Desktop — update ${info.version} ready`);
    tray?.displayBalloon({ title: "Memex update ready", content: `${info.version} — restart to install` });
  });
  autoUpdater.on("error", (e) => mainWindow?.webContents.send("update:status", { state: "error", message: e.message }));

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}
ipcMain.on("update:install", () => autoUpdater.quitAndInstall(false, true));

// ---------------------------------------------------------------------------
// Connection health loop
// ---------------------------------------------------------------------------
let healthTimer: ReturnType<typeof setTimeout> | null = null;
let healthAttempt = 0;

function startHealthLoop() {
  healthAttempt = 0;
  scheduleHealth();
}
function scheduleHealth() {
  if (healthTimer) clearTimeout(healthTimer);
  const delay = healthAttempt === 0 ? 0
    : Math.min(1000 * Math.pow(2, healthAttempt - 1), 30_000) * (1 + 0.1 * Math.random());
  healthTimer = setTimeout(runHealth, delay);
}
async function runHealth() {
  try {
    const { agentRuntime } = configStore.getUrls();
    const r = await fetch(`${agentRuntime}/`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) { healthAttempt = 0; return; }
  } catch {}
  healthAttempt++;
  scheduleHealth();
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  configStore       = new ConfigStore(app.getPath("userData"));
  workspaceFirewall = new WorkspaceFirewall(app.getPath("userData"));
  createMainWindow();
  createTray();
  setupUpdater();
  registerNativeHost();
  browser.start((msg) => mainWindow?.webContents.send("browser:message", msg));

  // Global shortcuts
  [
    { key: process.platform === "darwin" ? "Option+Space" : "Ctrl+Shift+Space", fn: toggleQuickWindow },
    { key: process.platform === "darwin" ? "Command+Shift+M" : "Ctrl+Shift+M",   fn: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { key: process.platform === "darwin" ? "Command+Shift+N" : "Ctrl+Shift+N",   fn: () => {
      mainWindow?.show(); mainWindow?.focus();
      mainWindow?.webContents.executeJavaScript("window.__memexNewConversation && window.__memexNewConversation()");
    }},
  ].forEach(({ key, fn }) => { try { globalShortcut.register(key, fn); } catch {} });

  app.on("activate", () => { mainWindow ? (mainWindow.show(), mainWindow.focus()) : createMainWindow(); });
});

app.on("will-quit", () => { globalShortcut.unregisterAll(); lsp.stopAll(); browser.stop(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ---------------------------------------------------------------------------
// Identity IPC
// ---------------------------------------------------------------------------
ipcMain.handle("identity:get", () => currentUid);
ipcMain.handle("identity:set", (_e, uid: string) => {
  currentUid = uid;
  saveIdentity(uid);
  return uid;
});

// ---------------------------------------------------------------------------
// Shell overlay
// ---------------------------------------------------------------------------
ipcMain.on("shell:retry",    () => isDev
  ? mainWindow?.webContents.loadURL("http://localhost:5173")
  : mainWindow?.webContents.loadFile(join(__dirname, "../dist/index.html")));

// ---------------------------------------------------------------------------
// File system (workspace-gated)
// ---------------------------------------------------------------------------
ipcMain.handle("fs:readFile", async (_e, path: string) => {
  if (!await workspaceFirewall.checkRead(path, mainWindow)) throw new Error("Permission denied");
  return readFileSync(path, "utf-8");
});
ipcMain.handle("fs:writeFile", async (_e, path: string, content: string) => {
  if (!await workspaceFirewall.checkWrite(path, mainWindow)) throw new Error("Permission denied");
  writeFileSync(path, content, "utf-8");
});
ipcMain.handle("fs:readDir", async (_e, path: string) => {
  if (!await workspaceFirewall.checkRead(path, mainWindow)) throw new Error("Permission denied");
  return readdirSync(path).map((name) => {
    const full = join(path, name);
    return { name, path: full, isDir: statSync(full).isDirectory() };
  });
});
ipcMain.handle("fs:mkdir", async (_e, path: string) => {
  if (!await workspaceFirewall.checkMkdir(path, mainWindow)) throw new Error("Permission denied");
  mkdirSync(path, { recursive: true });
});

// ---------------------------------------------------------------------------
// Shell exec (workspace-gated)
// ---------------------------------------------------------------------------
ipcMain.handle("shell:exec", async (_e, cmd: string, cwd?: string) => {
  if (!await workspaceFirewall.checkShell(cmd, cwd, mainWindow)) {
    return { stdout: "", stderr: "Permission denied by workspace firewall", code: 126 };
  }
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 30000 });
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    return { stdout: "", stderr: err.message, code: err.code ?? 1 };
  }
});

// ---------------------------------------------------------------------------
// PTY (workspace-gated)
// ---------------------------------------------------------------------------
const ptyProcesses = new Map<string, pty.IPty>();

ipcMain.handle("pty:create", async (_e, id: string, cwd?: string) => {
  if (!await workspaceFirewall.checkPty(cwd, mainWindow)) throw new Error("Permission denied");
  const sh = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL ?? "bash");
  const p  = pty.spawn(sh, [], { name: "xterm-color", cols: 120, rows: 36,
    cwd: cwd ?? process.env.HOME ?? process.cwd(), env: process.env as Record<string, string> });
  ptyProcesses.set(id, p);
  p.onData((data) => mainWindow?.webContents.send(`pty:data:${id}`, data));
  p.onExit(({ exitCode }) => { mainWindow?.webContents.send(`pty:exit:${id}`, exitCode); ptyProcesses.delete(id); });
  return { pid: p.pid };
});
ipcMain.handle("pty:write",  (_e, id: string, data: string)               => ptyProcesses.get(id)?.write(data));
ipcMain.handle("pty:resize", (_e, id: string, cols: number, rows: number) => ptyProcesses.get(id)?.resize(cols, rows));
ipcMain.handle("pty:kill",   (_e, id: string)                             => { ptyProcesses.get(id)?.kill(); ptyProcesses.delete(id); });

// ---------------------------------------------------------------------------
// Dialog / app
// ---------------------------------------------------------------------------
ipcMain.handle("dialog:openFolder", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("app:getCwd",       () => process.cwd());
ipcMain.handle("app:getVersion",   () => app.getVersion());
ipcMain.handle("app:openExternal", (_e, url: string) => shell.openExternal(url));

// ---------------------------------------------------------------------------
// Auto-start
// ---------------------------------------------------------------------------
ipcMain.handle("app:getAutoStart", () => app.getLoginItemSettings({ path: process.execPath }).openAtLogin);
ipcMain.handle("app:setAutoStart", (_e, enable: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath, args: enable ? ["--startup"] : [] });
  return enable;
});
if (process.argv.includes("--startup")) app.whenReady().then(() => mainWindow?.hide());

// ---------------------------------------------------------------------------
// LSP
// ---------------------------------------------------------------------------
ipcMain.handle("lsp:start",   (_e, ext: string, rootUri: string) => lsp.start(ext, rootUri));
ipcMain.handle("lsp:request", (_e, lang: string, rootUri: string, method: string, params: unknown) =>
  lsp.request(lang, rootUri, method, params).catch((e) => ({ error: e.message })));
ipcMain.on("lsp:notify",      (_e, lang: string, rootUri: string, method: string, params: unknown) =>
  lsp.notify(lang, rootUri, method, params));

// ---------------------------------------------------------------------------
// Browser bridge
// ---------------------------------------------------------------------------
ipcMain.handle("browser:send", (_e, msg: Record<string, unknown>) => browser.send(msg));

// ---------------------------------------------------------------------------
// Permission prompts
// ---------------------------------------------------------------------------
ipcMain.handle("permission:request", async (_e, opts: { toolName: string; toolInput: Record<string, unknown>; callId: string }) => {
  if (!mainWindow) return { approved: false, scope: "once" as const };
  mainWindow.show(); mainWindow.focus();
  const argsSummary = Object.entries(opts.toolInput).slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join("\n");
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "question", title: "Tool permission required",
    message: `Allow: ${opts.toolName.replace(/_/g, " ")}`,
    detail: argsSummary ? `Arguments:\n${argsSummary}\n\nChoose how to proceed:` : "Choose how to proceed:",
    buttons: ["Approve once", "Auto-approve for session", "Auto-approve for workspace", "Deny"],
    defaultId: 0, cancelId: 3, noLink: true,
  });
  const scopes = ["once", "session", "workspace", "deny"] as const;
  const chosen  = scopes[response] ?? "deny";
  return { approved: chosen !== "deny", scope: chosen === "deny" ? "once" : chosen };
});

// ---------------------------------------------------------------------------
// Workspace firewall
// ---------------------------------------------------------------------------
ipcMain.handle("workspace:getPolicy",    () => workspaceFirewall.getPolicy());
ipcMain.handle("workspace:setPolicy",    (_e, policy) => { workspaceFirewall.setPolicy(policy); });
ipcMain.handle("workspace:addRoot",      (_e, root: string) => { workspaceFirewall.addRoot(root); });
ipcMain.handle("workspace:clearSession", () => { workspaceFirewall.clearSessionApprovals(); });

// ---------------------------------------------------------------------------
// Runtime configuration profiles
// ---------------------------------------------------------------------------
ipcMain.handle("config:getAll",    () => configStore.getAll());
ipcMain.handle("config:getActive", () => configStore.getActive());
ipcMain.handle("config:setActive", (_e, id: string) => {
  const ok = configStore.setActive(id);
  if (ok) mainWindow?.webContents.send("config:changed", configStore.getActive());
  return ok;
});
ipcMain.handle("config:save",   (_e, profile) => configStore.saveProfile(profile));
ipcMain.handle("config:delete", (_e, id: string) => configStore.deleteProfile(id));
ipcMain.handle("config:getUrls", () => configStore.getUrls());

// ---------------------------------------------------------------------------
// File type handlers
// ---------------------------------------------------------------------------
function routeFilePath(filePath: string) {
  mainWindow?.webContents.executeJavaScript(
    filePath.match(/\.(memex|claude)$/i)
      ? `window.__memexImportFile && window.__memexImportFile(${JSON.stringify(filePath)})`
      : `window.__memexOpenPath && window.__memexOpenPath(${JSON.stringify(filePath)})`
  );
}
app.on("open-file", (event, filePath) => { event.preventDefault(); mainWindow?.show(); mainWindow?.focus(); routeFilePath(filePath); });
if (process.argv.length > 1) {
  const candidate = process.argv[process.argv.length - 1];
  if (!candidate.startsWith("--") && candidate.includes(".")) app.whenReady().then(() => routeFilePath(candidate));
}
