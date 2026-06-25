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

  // Chrome extension browser bridge
  browser: {
    send: (msg: Record<string, unknown>) => ipcRenderer.invoke("browser:send", msg),
    onMessage: (cb: (msg: Record<string, unknown>) => void) => {
      ipcRenderer.on("browser:message", (_e, msg) => cb(msg));
      return () => ipcRenderer.removeAllListeners("browser:message");
    },
  },

  // LSP bridge
  lsp: {
    start:   (ext: string, rootUri: string) =>
      ipcRenderer.invoke("lsp:start", ext, rootUri) as Promise<boolean>,
    request: (lang: string, rootUri: string, method: string, params: unknown) =>
      ipcRenderer.invoke("lsp:request", lang, rootUri, method, params),
    notify:  (lang: string, rootUri: string, method: string, params: unknown) =>
      ipcRenderer.send("lsp:notify", lang, rootUri, method, params),
    onNotification: (cb: (data: { lang: string; method: string; params: unknown }) => void) => {
      ipcRenderer.on("lsp:notification", (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners("lsp:notification");
    },
  },

  // Auto-start on login
  autoStart: {
    get: () => ipcRenderer.invoke("app:getAutoStart"),
    set: (enable: boolean) => ipcRenderer.invoke("app:setAutoStart", enable),
  },

  // Auto-updater
  updater: {
    onStatus: (cb: (status: {
      state: "checking" | "available" | "downloading" | "ready" | "current" | "error";
      version?: string;
      percent?: number;
      message?: string;
    }) => void) => {
      ipcRenderer.on("update:status", (_e, status) => cb(status));
      return () => ipcRenderer.removeAllListeners("update:status");
    },
    install: () => ipcRenderer.send("update:install"),
  },

  // Permission prompts — native dialog for tool approval
  permissions: {
    request: (opts: {
      toolName:  string;
      toolInput: Record<string, unknown>;
      callId:    string;
    }) => ipcRenderer.invoke("permission:request", opts) as Promise<{
      approved: boolean;
      scope: "once" | "session" | "workspace";
    }>,
  },
});
