/**
 * Injected into the Memex WebContentsView.
 * Exposes window.memex — the same pattern as window.claude in Claude Desktop.
 * The Memex Next.js UI checks for window.memex to unlock native features.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("memex", {
  // Signals the web UI it's running inside the desktop app
  isDesktop: true,
  version:   () => ipcRenderer.invoke("app:getVersion"),

  // File system
  fs: {
    readFile:  (path: string)                  => ipcRenderer.invoke("fs:readFile", path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke("fs:writeFile", path, content),
    readDir:   (path: string)                  => ipcRenderer.invoke("fs:readDir", path),
    mkdir:     (path: string)                  => ipcRenderer.invoke("fs:mkdir", path),
  },

  // Shell execution
  shell: {
    exec:        (cmd: string, cwd?: string) => ipcRenderer.invoke("shell:exec", cmd, cwd),
    openExternal:(url: string)               => ipcRenderer.invoke("app:openExternal", url),
  },

  // Dialogs
  dialog: {
    openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  },

  // PTY terminal
  pty: {
    create:  (id: string, cwd?: string)               => ipcRenderer.invoke("pty:create", id, cwd),
    write:   (id: string, data: string)               => ipcRenderer.invoke("pty:write", id, data),
    resize:  (id: string, cols: number, rows: number) => ipcRenderer.invoke("pty:resize", id, cols, rows),
    kill:    (id: string)                             => ipcRenderer.invoke("pty:kill", id),
    onData:  (id: string, cb: (data: string) => void) => {
      const ch = `pty:data:${id}`;
      ipcRenderer.on(ch, (_e, d) => cb(d));
      return () => ipcRenderer.removeAllListeners(ch);
    },
    onExit: (id: string, cb: (code: number) => void) => {
      const ch = `pty:exit:${id}`;
      ipcRenderer.on(ch, (_e, c) => cb(c));
      return () => ipcRenderer.removeAllListeners(ch);
    },
  },

  // Quick-entry relay — called from main when user submits via quick window
  onQuickSubmit: (cb: (text: string) => void) => {
    (window as any).__memexQuickSubmit = cb;
  },

  // File/folder drop relay
  onOpenPath: (cb: (path: string) => void) => {
    (window as any).__memexOpenPath = cb;
  },
});
