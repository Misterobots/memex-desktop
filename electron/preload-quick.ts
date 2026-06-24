/**
 * Preload for the Quick Entry floating window.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("quick", {
  submit: (text: string | null) => ipcRenderer.send("quick:submit", text),
  skooch: (width: number, height: number) => ipcRenderer.send("quick:skooch", width, height),
});
