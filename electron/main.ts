import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as pty from "node-pty";

const execAsync = promisify(exec);
const isDev = process.env.NODE_ENV === "development";

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d1117",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: process.platform !== "darwin",
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle("fs:readFile", async (_e, path: string) => {
  return readFileSync(path, "utf-8");
});

ipcMain.handle("fs:writeFile", async (_e, path: string, content: string) => {
  writeFileSync(path, content, "utf-8");
});

ipcMain.handle("fs:readDir", async (_e, path: string) => {
  const entries = readdirSync(path);
  return entries.map((name) => {
    const full = join(path, name);
    const stat = statSync(full);
    return { name, path: full, isDir: stat.isDirectory() };
  });
});

ipcMain.handle("shell:exec", async (_e, cmd: string, cwd?: string) => {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 30000 });
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    return { stdout: "", stderr: err.message, code: err.code ?? 1 };
  }
});

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("app:getCwd", () => process.cwd());
ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:openExternal", (_e, url: string) => shell.openExternal(url));

ipcMain.handle("fs:mkdir", async (_e, path: string) => {
  mkdirSync(path, { recursive: true });
});

// ---------------------------------------------------------------------------
// PTY — persistent terminal sessions
// ---------------------------------------------------------------------------
const ptyProcesses = new Map<string, pty.IPty>();

ipcMain.handle("pty:create", (_e, id: string, cwd?: string) => {
  const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL ?? "bash";
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 120,
    rows: 36,
    cwd: cwd ?? process.env.HOME ?? process.cwd(),
    env: process.env as Record<string, string>,
  });
  ptyProcesses.set(id, ptyProcess);

  ptyProcess.onData((data) => {
    win?.webContents.send(`pty:data:${id}`, data);
  });

  ptyProcess.onExit(({ exitCode }) => {
    win?.webContents.send(`pty:exit:${id}`, exitCode);
    ptyProcesses.delete(id);
  });

  return { pid: ptyProcess.pid };
});

ipcMain.handle("pty:write", (_e, id: string, data: string) => {
  ptyProcesses.get(id)?.write(data);
});

ipcMain.handle("pty:resize", (_e, id: string, cols: number, rows: number) => {
  ptyProcesses.get(id)?.resize(cols, rows);
});

ipcMain.handle("pty:kill", (_e, id: string) => {
  ptyProcesses.get(id)?.kill();
  ptyProcesses.delete(id);
});
