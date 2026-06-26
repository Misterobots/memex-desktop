/**
 * All IPC handler registrations except health, updater, and quick-window
 * (those live in their own modules to co-locate state).
 */
import {
  app, ipcMain, BrowserWindow, dialog, shell,
} from "electron";
import {
  readFileSync, writeFileSync, readdirSync, statSync, mkdirSync,
} from "fs";
import { exec }      from "child_process";
import { promisify } from "util";
import { join }      from "path";
import * as pty      from "node-pty";
import type { ConfigStore }       from "./config-store";
import type { WorkspaceFirewall } from "./workspace-firewall";
import type { LspManager }        from "./lsp-manager";
import type { BrowserBridge }     from "./browser-bridge";
import { getCurrentUid, setCurrentUid } from "./identity";
import { updateNativeHostManifest }     from "./browser-bridge";
import type { RunStore }               from "./run-store";

const execAsync = promisify(exec);

export interface IpcContext {
  config:    ConfigStore;
  firewall:  WorkspaceFirewall;
  lsp:       LspManager;
  browser:   BrowserBridge;
  runs:      RunStore;
  getMain:   () => BrowserWindow | null;
  startHealthLoop: () => void;
}

export function registerAllIpc(ctx: IpcContext): void {
  const { config, firewall, lsp, browser, runs, getMain, startHealthLoop } = ctx;

  // ── Identity ──────────────────────────────────────────────────────────────
  ipcMain.handle("identity:get", () => getCurrentUid());
  ipcMain.handle("identity:set", (_e, uid: string) => {
    setCurrentUid(uid);
    return uid;
  });

  // ── File system (workspace-gated) ─────────────────────────────────────────
  ipcMain.handle("fs:readFile", async (_e, path: string) => {
    if (!await firewall.checkRead(path, getMain())) throw new Error("Permission denied");
    return readFileSync(path, "utf-8");
  });
  ipcMain.handle("fs:previewWrite", async (_e, path: string) => {
    // Returns current file content so the renderer can show a diff before committing.
    // No permission check here — this is a read for preview only, not a write.
    try { return readFileSync(path, "utf-8"); } catch { return ""; }
  });
  ipcMain.handle("fs:writeFile", async (_e, path: string, content: string) => {
    if (!await firewall.checkWrite(path, getMain())) throw new Error("Permission denied");
    writeFileSync(path, content, "utf-8");
  });
  ipcMain.handle("fs:readDir", async (_e, path: string) => {
    if (!await firewall.checkRead(path, getMain())) throw new Error("Permission denied");
    return readdirSync(path).map((name) => {
      const full = join(path, name);
      return { name, path: full, isDir: statSync(full).isDirectory() };
    });
  });
  ipcMain.handle("fs:mkdir", async (_e, path: string) => {
    if (!await firewall.checkMkdir(path, getMain())) throw new Error("Permission denied");
    mkdirSync(path, { recursive: true });
  });

  // ── Shell (workspace-gated) ───────────────────────────────────────────────
  ipcMain.handle("shell:exec", async (_e, cmd: string, cwd?: string) => {
    if (!await firewall.checkShell(cmd, cwd, getMain())) {
      return { stdout: "", stderr: "Permission denied by workspace firewall", code: 126 };
    }
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 30000 });
      return { stdout, stderr, code: 0 };
    } catch (err: any) {
      return { stdout: "", stderr: err.message, code: err.code ?? 1 };
    }
  });

  // ── PTY (workspace-gated) ─────────────────────────────────────────────────
  const ptyProcesses = new Map<string, pty.IPty>();

  ipcMain.handle("pty:create", async (_e, id: string, cwd?: string) => {
    if (!await firewall.checkPty(cwd, getMain())) throw new Error("Permission denied");
    const sh = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL ?? "bash");
    const p  = pty.spawn(sh, [], {
      name: "xterm-color", cols: 120, rows: 36,
      cwd: cwd ?? process.env.HOME ?? process.cwd(),
      env: process.env as Record<string, string>,
    });
    ptyProcesses.set(id, p);
    p.onData((data)         => getMain()?.webContents.send(`pty:data:${id}`, data));
    p.onExit(({ exitCode }) => { getMain()?.webContents.send(`pty:exit:${id}`, exitCode); ptyProcesses.delete(id); });
    return { pid: p.pid };
  });
  ipcMain.handle("pty:write",  (_e, id, data)       => ptyProcesses.get(id)?.write(data));
  ipcMain.handle("pty:resize", (_e, id, cols, rows) => ptyProcesses.get(id)?.resize(cols, rows));
  ipcMain.handle("pty:kill",   (_e, id)             => { ptyProcesses.get(id)?.kill(); ptyProcesses.delete(id); });

  // ── App / dialog ──────────────────────────────────────────────────────────
  ipcMain.handle("dialog:openFolder", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle("app:getCwd",       () => process.cwd());
  ipcMain.handle("app:getVersion",   () => app.getVersion());
  ipcMain.handle("app:openExternal", (_e, url: string) => shell.openExternal(url));

  // ── Auto-start ────────────────────────────────────────────────────────────
  ipcMain.handle("app:getAutoStart", () =>
    app.getLoginItemSettings({ path: process.execPath }).openAtLogin);
  ipcMain.handle("app:setAutoStart", (_e, enable: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath, args: enable ? ["--startup"] : [] });
    return enable;
  });

  // ── LSP ───────────────────────────────────────────────────────────────────
  ipcMain.handle("lsp:start",   (_e, ext, rootUri) => lsp.start(ext, rootUri));
  ipcMain.handle("lsp:request", (_e, lang, rootUri, method, params) =>
    lsp.request(lang, rootUri, method, params).catch((e: any) => ({ error: e.message })));
  ipcMain.on("lsp:notify",      (_e, lang, rootUri, method, params) =>
    lsp.notify(lang, rootUri, method, params));

  // ── Browser bridge ────────────────────────────────────────────────────────
  ipcMain.handle("browser:send",            (_e, msg) => browser.send(msg));
  ipcMain.handle("browser:getExtensionIds", ()        => config.getAllowedExtensionIds());
  ipcMain.handle("browser:setExtensionIds", (_e, ids: string[]) => {
    config.setAllowedExtensionIds(ids);
    updateNativeHostManifest(config.getAllowedExtensionIds());
  });

  // ── Permissions ───────────────────────────────────────────────────────────
  ipcMain.handle("permission:request", async (_e, opts: {
    toolName: string; toolInput: Record<string, unknown>; callId: string;
  }) => {
    const main = getMain();
    if (!main) return { approved: false, scope: "once" as const };
    main.show(); main.focus();
    const argsSummary = Object.entries(opts.toolInput).slice(0, 3)
      .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join("\n");
    const { response } = await dialog.showMessageBox(main, {
      type: "question", title: "Tool permission required",
      message: `Allow: ${opts.toolName.replace(/_/g, " ")}`,
      detail: argsSummary
        ? `Arguments:\n${argsSummary}\n\nChoose how to proceed:`
        : "Choose how to proceed:",
      buttons: ["Approve once", "Auto-approve for session", "Auto-approve for workspace", "Deny"],
      defaultId: 0, cancelId: 3, noLink: true,
    });
    const scopes = ["once", "session", "workspace", "deny"] as const;
    const chosen  = scopes[response] ?? "deny";
    return { approved: chosen !== "deny", scope: chosen === "deny" ? "once" : chosen };
  });

  // ── Workspace firewall ────────────────────────────────────────────────────
  ipcMain.handle("workspace:getPolicy",    () => firewall.getPolicy());
  ipcMain.handle("workspace:setPolicy",    (_e, policy) => { firewall.setPolicy(policy); });
  ipcMain.handle("workspace:addRoot",      (_e, root)   => { firewall.addRoot(root); });
  ipcMain.handle("workspace:clearSession", ()           => { firewall.clearSessionApprovals(); });

  // ── Runtime config profiles ───────────────────────────────────────────────
  ipcMain.handle("config:getAll",    () => config.getAll());
  ipcMain.handle("config:getActive", () => config.getActive());
  ipcMain.handle("config:setActive", (_e, id: string) => {
    const ok = config.setActive(id);
    if (ok) {
      getMain()?.webContents.send("config:changed", config.getActive());
      startHealthLoop();
    }
    return ok;
  });
  ipcMain.handle("config:save",    (_e, profile) => config.saveProfile(profile));
  ipcMain.handle("config:delete",  (_e, id)      => config.deleteProfile(id));
  ipcMain.handle("config:getUrls", ()            => config.getUrls());

  // ── Run store ─────────────────────────────────────────────────────────────
  ipcMain.handle("runs:start",      (_e, opts)   => runs.startRun(opts));
  ipcMain.handle("runs:end",        (_e, id, st) => runs.endRun(id, st));
  ipcMain.handle("runs:addEvent",   (_e, id, type, payload) => runs.addEvent(id, type, payload));
  ipcMain.handle("runs:getRecent",  (_e, limit)  => runs.getRecentRuns(limit));
  ipcMain.handle("runs:getEvents",  (_e, id)     => runs.getEventsForRun(id));
}
