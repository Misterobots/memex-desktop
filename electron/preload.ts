/**
 * Preload for the local BrowserWindow shell (title bar + error overlay only).
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("shell", {
  onLoadError: (cb: (info?: { code: number; desc: string }) => void) =>
    ipcRenderer.on("showLoadError", (_e, info) => cb(info)),
  onLoadOk: (cb: () => void) =>
    ipcRenderer.on("hideLoadError", cb),
  retry:    () => ipcRenderer.send("shell:retry"),
  useLocal: () => ipcRenderer.send("shell:useLocal"),
});
