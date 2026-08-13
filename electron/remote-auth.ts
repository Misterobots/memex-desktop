/** Authentik sign-in window for the public “Memex Anywhere” profile. */
import { BrowserWindow, ipcMain } from "electron";

export const MEMEX_PUBLIC_ORIGIN = "https://memex.shivelymedia.com";

export function registerRemoteAuthIpc(getMain: () => BrowserWindow | null): void {
  ipcMain.handle("remote-auth:signIn", () => new Promise<boolean>((resolve) => {
    const parent = getMain();
    const win = new BrowserWindow({
      parent: parent ?? undefined,
      modal: Boolean(parent),
      width: 520, height: 720,
      title: "Sign in to Memex",
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    let finished = false;
    const complete = (ok: boolean) => {
      if (finished) return;
      finished = true;
      if (!win.isDestroyed()) win.close();
      resolve(ok);
    };
    // Authentik redirects back to this origin after a completed login. We don't
    // expose the preload bridge to this remote page; it is authentication only.
    const consider = (url: string) => {
      try {
        const parsed = new URL(url);
        if (parsed.origin === MEMEX_PUBLIC_ORIGIN) complete(true);
      } catch {}
    };
    win.webContents.on("did-navigate", (_event, url) => consider(url));
    win.webContents.on("did-navigate-in-page", (_event, url) => consider(url));
    win.on("closed", () => { if (!finished) { finished = true; resolve(false); } });
    void win.loadURL(MEMEX_PUBLIC_ORIGIN).then(() => consider(win.webContents.getURL())).catch(() => complete(false));
  }));
}
