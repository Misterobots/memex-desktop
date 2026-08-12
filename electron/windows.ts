/** Window management — main window, system tray, quick-entry window, global shortcuts. */
import {
  app, BrowserWindow, ipcMain, shell,
  Tray, Menu, nativeImage, Notification,
  globalShortcut, screen as electronScreen,
} from "electron";
import { join } from "path";
import type { ConfigStore } from "./config-store";
import { getCurrentUid } from "./identity";

const isDev = process.env.NODE_ENV === "development";

// The one brand icon source (public/icon.png, 512x512 — same Memex mark
// already used by ui/'s web manifest/favicon). Vite copies public/* into
// dist/ verbatim at build time, so this mirrors the existing isDev ?
// loadURL : loadFile(join(__dirname, "../dist/...")) pattern already used
// below: in dev, "../public/icon.png" is the source file sitting on disk;
// in the packaged app, "../dist/icon.png" is what actually shipped (public/
// itself is never packaged — only dist/**, dist-electron/**, quick.html are,
// per package.json's build.files).
const ICON_PATH = join(__dirname, isDev ? "../public/icon.png" : "../dist/icon.png");

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
export function createMainWindow(
  config:      ConfigStore,
  getTray:     () => Tray | null,
  isQuitting:  () => boolean,
): BrowserWindow {
  const win = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 600,
    backgroundColor: "#0a0a0d",
    icon: ICON_PATH,
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
    { urls: ["http://*/*", "https://*/*"] },
    (details, callback) => {
      const { agentRuntime, mempalace } = config.getUrls();
      const u = details.url;
      if (u.startsWith(agentRuntime) || u.startsWith(mempalace)) {
        // Routing: an "external" active profile carries its own API key, injected
        // here rather than at each fetch call site — this hook already owns every
        // outbound request to the active profile's endpoints.
        const active = config.getActive();
        const authHeaders: Record<string, string> =
          active.providerType === "external" && active.apiKey
            ? { Authorization: `Bearer ${active.apiKey}` }
            : {};
        callback({
          requestHeaders: {
            ...details.requestHeaders,
            "X-authentik-uid":      getCurrentUid(),
            // Owner key for server-side conversation sync (/v1/conversations).
            "X-authentik-username": getCurrentUid(),
            "X-desktop-client":     "memex-desktop",
            ...authHeaders,
          },
        });
      } else {
        callback({ requestHeaders: details.requestHeaders });
      }
    }
  );

  win.on("close", (e) => {
    // Real quit (tray "Quit", Cmd+Q on mac, app.quit() from the updater, ...)
    // must be allowed to actually close the window -- otherwise this handler
    // intercepts that close the same as any other and just re-hides to tray,
    // so "Quit" silently does nothing and the tray icon never goes away.
    if (isQuitting()) return;
    if (!getTray()) return;
    e.preventDefault();
    win.hide();
    // First time only — closing the window doesn't quit the app (it keeps
    // running in the tray so Quick Entry / global shortcuts still work), and
    // Windows puts new tray icons in the hidden overflow area by default, so
    // without this the app can look like it vanished. No supported Windows
    // API pins a tray icon on the taskbar's behalf; pointing the user at the
    // drag-to-pin gesture is the honest fix, not a registry hack.
    if (!config.getTrayHintShown()) {
      config.setTrayHintShown();
      if (Notification.isSupported()) {
        new Notification({
          title: "Memex Desktop is still running",
          body:  "It moved to the system tray — look for it under the ^ arrow near the clock, and drag it out to keep it visible. Right-click the tray icon to quit.",
        }).show();
      }
    }
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
  // Downsampled from the same 512x512 brand mark ICON_PATH points at — this
  // used to be a hand-inlined ~16x16 base64 placeholder with no real artwork
  // in it, which is exactly why the tray icon showed up blank/generic.
  const icon = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16, quality: "best" });
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
  config:      ConfigStore,
  getMain:     () => BrowserWindow | null,
  toggleQuick: () => void,
): void {
  globalShortcut.unregisterAll(); // idempotent — safe to call on every (re)register
  const sc = config.getShortcuts();
  [
    { key: sc.toggleQuick, fn: toggleQuick },
    { key: sc.showWindow,  fn: () => { getMain()?.show(); getMain()?.focus(); } },
    { key: sc.newChat,     fn: () => {
      getMain()?.show(); getMain()?.focus();
      getMain()?.webContents.executeJavaScript("window.__memexNewConversation && window.__memexNewConversation()");
    }},
  ].forEach(({ key, fn }) => { if (key) { try { globalShortcut.register(key, fn); } catch {} } });
}

/** IPC for reading/updating global shortcuts; re-registers on change. */
export function registerShortcutIpc(
  config:      ConfigStore,
  getMain:     () => BrowserWindow | null,
  toggleQuick: () => void,
): void {
  ipcMain.handle("shortcuts:get", () => config.getShortcuts());
  ipcMain.handle("shortcuts:set", (_e, sc) => {
    const next = config.setShortcuts(sc);
    registerShortcuts(config, getMain, toggleQuick);
    return next;
  });
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
