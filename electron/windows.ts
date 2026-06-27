/** Window management — main window, system tray, quick-entry window, global shortcuts. */
import {
  app, BrowserWindow, ipcMain, shell,
  Tray, Menu, nativeImage,
  globalShortcut, screen as electronScreen,
} from "electron";
import { join } from "path";
import type { ConfigStore } from "./config-store";
import { getCurrentUid } from "./identity";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
export function createMainWindow(
  config:   ConfigStore,
  getTray:  () => Tray | null,
): BrowserWindow {
  const win = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 600,
    backgroundColor: "#0a0a0d",
    titleBarStyle: "hidden",
    titleBarOverlay: process.platform !== "darwin" ? {
      color:       "#111114",
      symbolColor: "#8b8b94",
      height:      40,
    } : undefined,
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 12 } : undefined,
    webPreferences: {
      preload:          join(__dirname, "preload-memex.js"),
      contextIsolation: true,
      nodeIntegration:  false,
      // The renderer talks directly to the user's own agent_runtime / MemPalace
      // over the LAN. Those services send no CORS headers, so with the default
      // same-origin policy every cross-origin fetch from the renderer (dev:
      // http://localhost:5173, prod: file://) is blocked — breaking chat and the
      // setup connection test. We load only our own bundled code here (no remote
      // content), and the backends are trusted local hosts, so relaxing this is
      // an acceptable trade-off for a local-first desktop app.
      webSecurity:      false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(join(__dirname, "../dist/index.html"));
  }

  // Inject identity + desktop marker on requests to the active profile's endpoints.
  // Uses a broad filter and checks URL prefixes at request time so profile switches
  // take effect without re-registering the listener.
  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["http://*/*"] },
    (details, callback) => {
      const { agentRuntime, mempalace } = config.getUrls();
      const u = details.url;
      if (u.startsWith(agentRuntime) || u.startsWith(mempalace)) {
        callback({
          requestHeaders: {
            ...details.requestHeaders,
            "X-authentik-uid":      getCurrentUid(),
            // Owner key for server-side conversation sync (/v1/conversations).
            "X-authentik-username": getCurrentUid(),
            "X-desktop-client":     "memex-desktop",
          },
        });
      } else {
        callback({ requestHeaders: details.requestHeaders });
      }
    }
  );

  win.on("close", (e) => {
    if (getTray()) { e.preventDefault(); win.hide(); }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // shell:retry — reload renderer
  ipcMain.on("shell:retry", () => isDev
    ? win.webContents.loadURL("http://localhost:5173")
    : win.webContents.loadFile(join(__dirname, "../dist/index.html")));

  return win;
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------
export function createTray(
  getMain:       () => BrowserWindow | null,
  toggleQuick:   () => void,
): Tray {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAN0lEQVQ4jWNgYGD4z0ABYBo1YNQAKjcABQAA//8DABbHAv8AAAAA"
  );
  const tray = new Tray(icon);
  tray.setToolTip("Memex Desktop");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open",        click: () => { getMain()?.show(); getMain()?.focus(); } },
    { label: "Quick Entry", click: toggleQuick },
    { type: "separator" },
    { label: "Quit",        click: () => app.quit() },
  ]));
  tray.on("click", () => { getMain()?.show(); getMain()?.focus(); });
  return tray;
}

// ---------------------------------------------------------------------------
// Quick-entry window
// ---------------------------------------------------------------------------
let quickWindow: BrowserWindow | null = null;

export function createQuickWindow(): void {
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

export function toggleQuickWindow(): void {
  if (!quickWindow) createQuickWindow();
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

export function registerQuickIpc(getMain: () => BrowserWindow | null): void {
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
    const main = getMain();
    main?.show();
    main?.focus();
    main?.webContents.executeJavaScript(
      `window.__memexQuickSubmit && window.__memexQuickSubmit(${JSON.stringify(text)})`
    );
  });
}

// ---------------------------------------------------------------------------
// Global shortcuts
// ---------------------------------------------------------------------------
export function registerShortcuts(
  getMain:     () => BrowserWindow | null,
  toggleQuick: () => void,
): void {
  const mac = process.platform === "darwin";
  [
    { key: mac ? "Option+Space"      : "Ctrl+Shift+Space", fn: toggleQuick },
    { key: mac ? "Command+Shift+M"   : "Ctrl+Shift+M",    fn: () => { getMain()?.show(); getMain()?.focus(); } },
    { key: mac ? "Command+Shift+N"   : "Ctrl+Shift+N",    fn: () => {
      getMain()?.show(); getMain()?.focus();
      getMain()?.webContents.executeJavaScript("window.__memexNewConversation && window.__memexNewConversation()");
    }},
  ].forEach(({ key, fn }) => { try { globalShortcut.register(key, fn); } catch {} });
}

// ---------------------------------------------------------------------------
// File type / open-file routing
// ---------------------------------------------------------------------------
export function routeFilePath(path: string, getMain: () => BrowserWindow | null): void {
  getMain()?.webContents.executeJavaScript(
    path.match(/\.(memex|claude)$/i)
      ? `window.__memexImportFile && window.__memexImportFile(${JSON.stringify(path)})`
      : `window.__memexOpenPath && window.__memexOpenPath(${JSON.stringify(path)})`
  );
}
