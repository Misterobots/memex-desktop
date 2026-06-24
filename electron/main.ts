import {
  app, BrowserWindow, WebContentsView, ipcMain,
  dialog, shell, Tray, Menu, nativeImage,
  globalShortcut, screen as electronScreen,
} from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as pty from "node-pty";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
// Primary: Authentik-protected URL — login happens here, cookies persist
const MEMEX_URL          = "https://memex.shivelymedia.com";
// Fallback: local LAN URL — no auth, used when external URL unreachable
const MEMEX_LOCAL_URL    = "http://192.168.2.101:3300";
const isDev              = process.env.NODE_ENV === "development";

let mainWindow:    BrowserWindow    | null = null;
let memexView:     WebContentsView  | null = null;
let quickWindow:   BrowserWindow    | null = null;
let tray:          Tray             | null = null;

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    backgroundColor: "#262624",
    titleBarStyle: "hidden",
    // Native Windows Controls Overlay — paints min/max/close into the app chrome
    titleBarOverlay: process.platform !== "darwin" ? {
      color:        "#30302e",
      symbolColor:  "#a3a096",
      height:       40,
    } : undefined,
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 12 } : undefined,
    webPreferences: {
      preload:          join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  // Local shell (minimal — just title bar chrome + error overlay)
  mainWindow.loadFile(join(__dirname, isDev ? "../index.html" : "../dist/index.html"));

  // WebContentsView loads the actual Memex UI
  memexView = new WebContentsView({
    webPreferences: {
      preload:          join(__dirname, "preload-memex.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  // Mark all requests from the desktop app so agent_runtime can identify
  // the client. X-authentik-uid comes from Authentik cookies automatically
  // after the user logs in — we only add the desktop marker here.
  memexView.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["https://memex.shivelymedia.com/*", "http://192.168.2.101:*/*", "http://192.168.2.102:*/*"] },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          "X-desktop-client": "memex-desktop",
        },
      });
    }
  );
  memexView.setBackgroundColor("#00000000");
  mainWindow.contentView.addChildView(memexView);

  // Keep WebContentsView filling the window (below the title bar overlay)
  const resizeView = () => {
    if (!mainWindow || !memexView) return;
    const bounds = mainWindow.getContentBounds();
    const titleBarHeight = process.platform !== "darwin" ? 40 : 0;
    memexView!.setBounds({
      x: 0, y: titleBarHeight,
      width: bounds.width,
      height: bounds.height - titleBarHeight,
    });
  };
  mainWindow.on("resize", resizeView);
  mainWindow.on("ready-to-show", resizeView);
  resizeView();

  // Load primary URL (Authentik-protected). If unreachable, fall back to LAN.
  // Authentik handles the login redirect transparently inside the WebContentsView —
  // the user sees the login page, authenticates, and lands on the app.
  // Electron's session persists cookies in userData so they survive restarts.
  memexView.webContents.loadURL(MEMEX_URL).catch(() => {
    mainWindow?.webContents.send("showLoadError");
    // Attempt LAN fallback after 2s
    setTimeout(() => {
      memexView?.webContents.loadURL(MEMEX_LOCAL_URL).catch(() => {});
    }, 2000);
  });

  // Surface load failures to the local shell overlay
  memexView.webContents.on("did-fail-load", (_e, code, desc) => {
    // -3 = ABORTED (navigation cancelled), ignore
    if (code === -3) return;
    mainWindow?.webContents.send("showLoadError", { code, desc });
  });

  memexView.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.send("hideLoadError");
  });

  // Open external links in system browser, not inside the app
  memexView.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    memexView.webContents.openDevTools({ mode: "detach" });
  }

  // Tray: hide instead of quit on close
  mainWindow.on("close", (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------
function createTray() {
  // Use a simple 16x16 icon — replace with actual asset when available
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAN0lEQVQ4jWNgYGD4z0ABYBo1YNQAKjcABQAA//8DABbHAv8AAAAA"
  );

  tray = new Tray(icon);
  tray.setToolTip("Memex Desktop");

  const menu = Menu.buildFromTemplate([
    { label: "Open Memex",     click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: "Quick Entry",    click: () => toggleQuickWindow() },
    { type: "separator" },
    { label: "Quit",           click: () => { tray = null; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });

  if (process.platform === "win32") {
    tray.displayBalloon({
      title: "Memex runs in the background",
      content: "Click the tray icon to reopen, or right-click to quit.",
    });
  }
}

// ---------------------------------------------------------------------------
// Quick entry window (transparent floating prompt)
// ---------------------------------------------------------------------------
function createQuickWindow() {
  quickWindow = new BrowserWindow({
    width:       640,
    height:      72,
    transparent: true,
    frame:       false,
    resizable:   false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload:          join(__dirname, "preload-quick.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  quickWindow.loadFile(join(__dirname, isDev ? "../quick.html" : "../dist-quick/index.html"));

  quickWindow.on("blur", () => {
    quickWindow?.hide();
  });

  quickWindow.hide();
}

function toggleQuickWindow() {
  if (!quickWindow) { createQuickWindow(); return; }
  if (quickWindow.isVisible()) {
    quickWindow.hide();
  } else {
    // Center on active display
    const pt  = electronScreen.getCursorScreenPoint();
    const dsp = electronScreen.getDisplayNearestPoint(pt);
    const { x, y, width } = dsp.workArea;
    const qw = quickWindow.getSize()[0];
    quickWindow.setPosition(Math.round(x + (width - qw) / 2), Math.round(y + 80));
    quickWindow.show();
    quickWindow.focus();
  }
}

// Quick window "skooch" — resize height as user types
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
  // Relay prompt into the Memex WebContentsView
  memexView?.webContents.executeJavaScript(
    `window.__memexQuickSubmit && window.__memexQuickSubmit(${JSON.stringify(text)})`
  );
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createMainWindow();
  createTray();

  // Global shortcut: Option+Option (or Ctrl+Shift+Space on Windows) → Quick Entry
  const shortcut = process.platform === "darwin" ? "Option+Space" : "Ctrl+Shift+Space";
  globalShortcut.register(shortcut, toggleQuickWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else { mainWindow?.show(); mainWindow?.focus(); }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------------------------------------------------------------------------
// IPC — file system
// ---------------------------------------------------------------------------
ipcMain.handle("fs:readFile",  (_e, path: string)                   => readFileSync(path, "utf-8"));
ipcMain.handle("fs:writeFile", (_e, path: string, content: string)  => writeFileSync(path, content, "utf-8"));
ipcMain.handle("fs:readDir",   (_e, path: string)                   => {
  return readdirSync(path).map((name) => {
    const full = join(path, name);
    const stat = statSync(full);
    return { name, path: full, isDir: stat.isDirectory() };
  });
});
ipcMain.handle("fs:mkdir",     (_e, path: string)                   => mkdirSync(path, { recursive: true }));

// ---------------------------------------------------------------------------
// IPC — shell
// ---------------------------------------------------------------------------
ipcMain.handle("shell:exec", async (_e, cmd: string, cwd?: string) => {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 30000 });
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    return { stdout: "", stderr: err.message, code: err.code ?? 1 };
  }
});

// ---------------------------------------------------------------------------
// IPC — PTY terminal
// ---------------------------------------------------------------------------
const ptyProcesses = new Map<string, pty.IPty>();

ipcMain.handle("pty:create", (_e, id: string, cwd?: string) => {
  const sh = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL ?? "bash");
  const p  = pty.spawn(sh, [], {
    name: "xterm-color",
    cols: 120, rows: 36,
    cwd:  cwd ?? process.env.HOME ?? process.cwd(),
    env:  process.env as Record<string, string>,
  });
  ptyProcesses.set(id, p);
  p.onData((data) => {
    // Send to whichever view has focus — prefer Memex WebContentsView
    memexView?.webContents.send(`pty:data:${id}`, data);
    mainWindow?.webContents.send(`pty:data:${id}`, data);
  });
  p.onExit(({ exitCode }) => {
    memexView?.webContents.send(`pty:exit:${id}`, exitCode);
    mainWindow?.webContents.send(`pty:exit:${id}`, exitCode);
    ptyProcesses.delete(id);
  });
  return { pid: p.pid };
});

ipcMain.handle("pty:write",  (_e, id: string, data: string)              => ptyProcesses.get(id)?.write(data));
ipcMain.handle("pty:resize", (_e, id: string, cols: number, rows: number) => ptyProcesses.get(id)?.resize(cols, rows));
ipcMain.handle("pty:kill",   (_e, id: string)                            => { ptyProcesses.get(id)?.kill(); ptyProcesses.delete(id); });

// ---------------------------------------------------------------------------
// IPC — dialog / app
// ---------------------------------------------------------------------------
ipcMain.handle("dialog:openFolder", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

// Shell overlay actions
ipcMain.on("shell:retry",    () => memexView?.webContents.loadURL(MEMEX_URL));
ipcMain.on("shell:useLocal", () => memexView?.webContents.loadURL(MEMEX_LOCAL_URL));

ipcMain.handle("app:getCwd",       () => process.cwd());
ipcMain.handle("app:getVersion",   () => app.getVersion());
ipcMain.handle("app:openExternal", (_e, url: string) => shell.openExternal(url));

// ---------------------------------------------------------------------------
// File drag-and-drop — relay folder drops to Memex UI
// ---------------------------------------------------------------------------
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  memexView?.webContents.executeJavaScript(
    `window.__memexOpenPath && window.__memexOpenPath(${JSON.stringify(filePath)})`
  );
});
