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
  },
  shell: {
    exec: (cmd: string, cwd?: string) => ipcRenderer.invoke("shell:exec", cmd, cwd),
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  },
  app: {
    getCwd:       ()           => ipcRenderer.invoke("app:getCwd"),
    getVersion:   ()           => ipcRenderer.invoke("app:getVersion"),
    openExternal: (url: string) => ipcRenderer.invoke("app:openExternal", url),
  },
});
