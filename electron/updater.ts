/** Auto-updater setup and IPC. */
import { ipcMain, BrowserWindow, Tray } from "electron";
import { autoUpdater } from "electron-updater";

export function setupUpdater(
  getMain: () => BrowserWindow | null,
  getTray: () => Tray | null,
  isDev:   boolean,
): void {
  if (isDev) return;

  autoUpdater.autoDownload        = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (payload: object) => getMain()?.webContents.send("update:status", payload);

  autoUpdater.on("update-available",     (i) => send({ state: "available",    version: i.version }));
  autoUpdater.on("update-not-available", ()  => send({ state: "current" }));
  autoUpdater.on("download-progress",    (p) => send({ state: "downloading",  percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded",    (i) => {
    send({ state: "ready", version: i.version });
    getTray()?.setToolTip(`Memex Desktop — update ${i.version} ready`);
    getTray()?.displayBalloon({ title: "Memex update ready", content: `${i.version} — restart to install` });
  });
  autoUpdater.on("error", (e) => send({ state: "error", message: e.message }));

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

export function registerUpdaterIpc(): void {
  ipcMain.on("update:install", () => autoUpdater.quitAndInstall(false, true));
}
