/**
 * Preload for the local BrowserWindow shell (title bar + error overlay only).
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("shell", {
  onLoadError: (cb: () => void)  => ipcRenderer.on("showLoadError", cb),
  onLoadOk:    (cb: () => void)  => ipcRenderer.on("hideLoadError", cb),
});
