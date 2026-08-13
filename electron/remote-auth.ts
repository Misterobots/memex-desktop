/** Authentik sign-in window for the public “Memex Anywhere” profile. */
import { BrowserWindow, ipcMain, session } from "electron";

export const MEMEX_PUBLIC_ORIGIN = "https://memex.shivelymedia.com";

/** Remove only SSO cookies owned by Memex/Authen­tik, never the Desktop app's
 * own local settings, workspace data, or unrelated browser state. */
async function clearMemexSsoSession(): Promise<void> {
  const cookies = await session.defaultSession.cookies.get({});
  const ssoCookies = cookies.filter((cookie) =>
    (cookie.domain ?? "").replace(/^\./, "").endsWith("shivelymedia.com"),
  );
  await Promise.all(ssoCookies.map((cookie) => {
    const scheme = cookie.secure ? "https" : "http";
    const host = (cookie.domain ?? "").replace(/^\./, "");
    return session.defaultSession.cookies.remove(`${scheme}://${host}${cookie.path}`, cookie.name);
  }));
  session.defaultSession.clearAuthCache();
}

/** Headers for native/renderer requests that must reuse the sign-in window's
 * Authentik session. Electron's Node fetch and file:// renderer requests do
 * not reliably attach this cookie automatically. */
export async function publicSessionHeaders(): Promise<Record<string, string>> {
  const cookies = await session.defaultSession.cookies.get({ url: MEMEX_PUBLIC_ORIGIN });
  return cookies.length ? { Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") } : {};
}

export function registerRemoteAuthIpc(getMain: () => BrowserWindow | null): void {
  ipcMain.handle("remote-auth:signOut", async () => {
    await clearMemexSsoSession();
    return true;
  });

  ipcMain.handle("remote-auth:signIn", async () => {
    // "Sign in" must mean a deliberate fresh SSO flow. Electron's cookie jar
    // is independent of Chrome/Brave, so a browser logout cannot clear it.
    await clearMemexSsoSession();
    return new Promise<boolean>((resolve) => {
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
    // The first navigation may redirect through Authentik, or may load Memex
    // directly when this Electron session already has a valid SSO cookie.
    // Track redirects, then complete only after an actual Memex document has
    // finished loading (never merely on the initial navigation event).
    let authFlowVisited = false;
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
        if (parsed.origin !== MEMEX_PUBLIC_ORIGIN) {
          authFlowVisited = true;
          return;
        }
        if (authFlowVisited) complete(true);
      } catch {}
    };
    win.webContents.on("did-navigate", (_event, url) => consider(url));
    win.webContents.on("did-navigate-in-page", (_event, url) => consider(url));
    win.webContents.on("did-finish-load", () => {
      const url = win.webContents.getURL();
      try {
        const parsed = new URL(url);
        if (parsed.origin === MEMEX_PUBLIC_ORIGIN) complete(true);
      } catch {}
    });
    win.on("closed", () => { if (!finished) { finished = true; resolve(false); } });
    void win.loadURL(MEMEX_PUBLIC_ORIGIN).catch(() => complete(false));
    });
  });
}
