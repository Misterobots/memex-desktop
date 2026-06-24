"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const child_process = require("child_process");
const util = require("util");
const execAsync = util.promisify(child_process.exec);
const isDev = process.env.NODE_ENV === "development";
let win = null;
function createWindow() {
  win = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d1117",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    frame: process.platform !== "darwin"
  });
  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.ipcMain.handle("fs:readFile", async (_e, path2) => {
  return fs.readFileSync(path2, "utf-8");
});
electron.ipcMain.handle("fs:writeFile", async (_e, path2, content) => {
  fs.writeFileSync(path2, content, "utf-8");
});
electron.ipcMain.handle("fs:readDir", async (_e, path$1) => {
  const entries = fs.readdirSync(path$1);
  return entries.map((name) => {
    const full = path.join(path$1, name);
    const stat = fs.statSync(full);
    return { name, path: full, isDir: stat.isDirectory() };
  });
});
electron.ipcMain.handle("shell:exec", async (_e, cmd, cwd) => {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 3e4 });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    return { stdout: "", stderr: err.message, code: err.code ?? 1 };
  }
});
electron.ipcMain.handle("dialog:openFolder", async () => {
  const result = await electron.dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
electron.ipcMain.handle("app:getCwd", () => process.cwd());
electron.ipcMain.handle("app:getVersion", () => electron.app.getVersion());
electron.ipcMain.handle("app:openExternal", (_e, url) => electron.shell.openExternal(url));
//# sourceMappingURL=main.js.map
