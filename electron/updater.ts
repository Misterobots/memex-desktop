/** Auto-updater setup and IPC. */
import { ipcMain, BrowserWindow, Tray } from "electron";
import { autoUpdater } from "electron-updater";

type UpdaterStatus = {
  state: "checking" | "available" | "downloading" | "ready" | "current" | "error";
  version?: string;
  percent?: number;
  message?: string;
};

let lastStatus: UpdaterStatus = { state: "checking" };
let requestCheck = async (): Promise<UpdaterStatus> => lastStatus;
let installReadyUpdate = (): boolean => false;

export function setupUpdater(
  getMain: () => BrowserWindow | null,
  getTray: () => Tray | null,
  isDev:   boolean,
): void {
  if (isDev) {
    lastStatus = { state: "current", message: "Development build — updates install through the packaged app." };
    return;
  }

  autoUpdater.autoDownload        = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (payload: UpdaterStatus) => {
    lastStatus = payload;
    getMain()?.webContents.send("update:status", payload);
  };

  requestCheck = async () => {
    send({ state: "checking" });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error: any) {
      send({ state: "error", message: error?.message ?? "Update check failed" });
    }
    return lastStatus;
  };
  installReadyUpdate = () => {
    if (lastStatus.state !== "ready") return false;
    autoUpdater.quitAndInstall(false, true);
    return true;
  };

  autoUpdater.on("update-available",     (i) => send({ state: "available",    version: i.version }));
  autoUpdater.on("update-not-available", ()  => send({ state: "current" }));
  autoUpdater.on("download-progress",    (p) => send({ state: "downloading",  percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded",    (i) => {
    send({ state: "ready", version: i.version });
    getTray()?.setToolTip(`Memex Desktop — update ${i.version} ready`);
    getTray()?.displayBalloon({ title: "Memex update ready", content: `${i.version} — restart to install` });
  });
  autoUpdater.on("error", (e) => send({ state: "error", message: e.message }));

  setTimeout(() => { void requestCheck(); }, 5000);
  setInterval(() => { void requestCheck(); }, 6 * 60 * 60 * 1000);
}

export function registerUpdaterIpc(): void {
  ipcMain.handle("update:getStatus", () => lastStatus);
  ipcMain.handle("update:check", () => requestCheck());
  ipcMain.handle("update:install", () => installReadyUpdate());
}
