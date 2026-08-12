/**
 * Native, sandboxed browser surface for the Desktop Browser pane.
 *
 * BrowserView intentionally lives in the main process: renderer <webview>s
 * require relaxed web preferences and turn arbitrary web content into part of
 * the app's DOM.  Keeping it here preserves context isolation and gives the
 * renderer a small, auditable navigation-only contract.
 */
import { BrowserView, BrowserWindow, shell } from "electron";

export interface BrowserPaneState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

const DEFAULT_URL = "https://memex.shivelymedia.com";

function normaliseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_URL;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Browser Pane only supports http and https addresses");
  }
  return parsed.toString();
}

export class BrowserPane {
  private view: BrowserView | null = null;
  private visible = false;

  constructor(private readonly getMain: () => BrowserWindow | null) {}

  private emit(): void {
    const contents = this.view?.webContents;
    const main = this.getMain();
    if (!contents || !main) return;
    main.webContents.send("browser-pane:state", {
      url: contents.getURL(),
      title: contents.getTitle(),
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
      loading: contents.isLoading(),
    } satisfies BrowserPaneState);
  }

  private ensure(): BrowserView {
    if (this.view) return this.view;
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    view.setBackgroundColor("#0e1117");
    view.webContents.setWindowOpenHandler(({ url }) => {
      // Keep pop-ups outside the app's trusted surface. The user can still
      // follow them deliberately in their system browser.
      if (/^https?:/i.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    view.webContents.on("did-start-loading", () => this.emit());
    view.webContents.on("did-stop-loading", () => this.emit());
    view.webContents.on("did-navigate", () => this.emit());
    view.webContents.on("did-navigate-in-page", () => this.emit());
    view.webContents.on("page-title-updated", () => this.emit());
    this.view = view;
    return view;
  }

  open(url = DEFAULT_URL): BrowserPaneState {
    const main = this.getMain();
    if (!main) throw new Error("Main window is not available");
    const view = this.ensure();
    if (!main.getBrowserViews().includes(view)) main.addBrowserView(view);
    this.visible = true;
    void view.webContents.loadURL(normaliseUrl(url));
    return this.getState();
  }

  navigate(url: string): BrowserPaneState {
    const view = this.ensure();
    void view.webContents.loadURL(normaliseUrl(url));
    return this.getState();
  }

  setBounds(bounds: Electron.Rectangle): void {
    if (!this.visible || !this.view) return;
    this.view.setBounds({
      x: Math.max(0, Math.round(bounds.x)), y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(1, Math.round(bounds.width)), height: Math.max(1, Math.round(bounds.height)),
    });
    this.view.setAutoResize({ width: true, height: true });
  }

  hide(): void {
    const main = this.getMain();
    if (this.view && main?.getBrowserViews().includes(this.view)) main.removeBrowserView(this.view);
    this.visible = false;
  }

  back(): BrowserPaneState { if (this.view?.webContents.canGoBack()) this.view.webContents.goBack(); return this.getState(); }
  forward(): BrowserPaneState { if (this.view?.webContents.canGoForward()) this.view.webContents.goForward(); return this.getState(); }
  reload(): BrowserPaneState { this.view?.webContents.reload(); return this.getState(); }
  stop(): BrowserPaneState { this.view?.webContents.stop(); return this.getState(); }

  getState(): BrowserPaneState {
    const contents = this.view?.webContents;
    return {
      url: contents?.getURL() || DEFAULT_URL,
      title: contents?.getTitle() || "Memex Browser",
      canGoBack: contents?.canGoBack() ?? false,
      canGoForward: contents?.canGoForward() ?? false,
      loading: contents?.isLoading() ?? false,
    };
  }

  dispose(): void {
    this.hide();
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = null;
  }
}
