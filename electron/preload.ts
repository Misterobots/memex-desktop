import { contextBridge, ipcRenderer } from "electron";

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

contextBridge.exposeInMainWorld("electron", {
  fs: {
    readFile:  (path: string)                    => ipcRenderer.invoke("fs:readFile", path),
    writeFile: (path: string, content: string)   => ipcRenderer.invoke("fs:writeFile", path, content),
    readDir:   (path: string)                    => ipcRenderer.invoke("fs:readDir", path),
    mkdir:     (path: string)                    => ipcRenderer.invoke("fs:mkdir", path),
  },
  shell: {
    exec: (cmd: string, cwd?: string) => ipcRenderer.invoke("shell:exec", cmd, cwd),
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  },
  app: {
    getCwd:       ()            => ipcRenderer.invoke("app:getCwd"),
    getVersion:   ()            => ipcRenderer.invoke("app:getVersion"),
    openExternal: (url: string) => ipcRenderer.invoke("app:openExternal", url),
  },
  pty: {
    create:  (id: string, cwd?: string)              => ipcRenderer.invoke("pty:create", id, cwd),
    write:   (id: string, data: string)              => ipcRenderer.invoke("pty:write", id, data),
    resize:  (id: string, cols: number, rows: number) => ipcRenderer.invoke("pty:resize", id, cols, rows),
    kill:    (id: string)                            => ipcRenderer.invoke("pty:kill", id),
    onData:  (id: string, cb: (data: string) => void) => {
      const channel = `pty:data:${id}`;
      ipcRenderer.on(channel, (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners(channel);
    },
    onExit:  (id: string, cb: (code: number) => void) => {
      const channel = `pty:exit:${id}`;
      ipcRenderer.on(channel, (_e, code) => cb(code));
      return () => ipcRenderer.removeAllListeners(channel);
    },
  },
});
