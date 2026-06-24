"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  fs: {
    readFile: (path) => electron.ipcRenderer.invoke("fs:readFile", path),
    writeFile: (path, content) => electron.ipcRenderer.invoke("fs:writeFile", path, content),
    readDir: (path) => electron.ipcRenderer.invoke("fs:readDir", path)
  },
  shell: {
    exec: (cmd, cwd) => electron.ipcRenderer.invoke("shell:exec", cmd, cwd)
  },
  dialog: {
    openFolder: () => electron.ipcRenderer.invoke("dialog:openFolder")
  },
  app: {
    getCwd: () => electron.ipcRenderer.invoke("app:getCwd"),
    getVersion: () => electron.ipcRenderer.invoke("app:getVersion"),
    openExternal: (url) => electron.ipcRenderer.invoke("app:openExternal", url)
  }
});
//# sourceMappingURL=preload.js.map
