/**
 * IPC handler registrations. NOT all of them, despite the name — health.ts,
 * updater.ts, and windows.ts (shortcuts:get/set, shell:retry) each register
 * their own to co-locate with the state they manage.
 *
 * Two kinds of handler live here, deliberately visible as separate sections:
 *   - Hand-written: a permission check, an event broadcast, or state beyond
 *     a single store (fs:*, shell:exec, pty:*, config:setActive, ...) — that
 *     logic needs to stay readable, not get hidden behind a generic wrapper.
 *   - autoWireStore() calls: pure "namespace:method calls one store method
 *     and returns the result" passthroughs (workspace, hooks, eval,
 *     artifact, most of config and runs) — see ipc-autowire.ts for why the
 *     explicit per-namespace method list there is a safety property, not
 *     boilerplate to trim further.
 */
import {
  app, ipcMain, BrowserWindow, dialog, shell,
} from "electron";
import {
  readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, unlinkSync,
} from "fs";
import { exec }      from "child_process";
import { promisify } from "util";
import { join, dirname } from "path";
import * as pty      from "node-pty";
import type { ConfigStore }       from "./config-store";
import type { WorkspaceFirewall } from "./workspace-firewall";
import type { LspManager }        from "./lsp-manager";
import type { BrowserBridge }     from "./browser-bridge";
import type { BrowserPane }       from "./browser-pane";
import { getCurrentUid, setCurrentUid } from "./identity";
import { updateNativeHostManifest }     from "./browser-bridge";
import type { RunStore }               from "./run-store";
import type { EvalStore }              from "./eval-store";
import type { ArtifactStore }          from "./artifact-store";
import type { HooksStore }             from "./hooks-store";
import { fireHooks }                   from "./hooks-runner";
import { runOpenScad, type RenderParams } from "./openscad-runner";
import { autoWireStore }                  from "./ipc-autowire";
import { MEMEX_PUBLIC_ORIGIN, publicSessionHeaders } from "./remote-auth";

const execAsync = promisify(exec);

const LOCAL_CAD_BRIDGE_URL = "http://127.0.0.1:8790";

type CadBridgeImport = {
  envPath: string;
  url: string;
  importedAt: string;
};

function cadBridgeImportPath(): string {
  return join(app.getPath("userData"), "cad-print-bridge.json");
}

function savedCadBridgeImport(): CadBridgeImport | null {
  try {
    const parsed = JSON.parse(readFileSync(cadBridgeImportPath(), "utf-8")) as Partial<CadBridgeImport>;
    if (typeof parsed.envPath !== "string" || typeof parsed.url !== "string" || typeof parsed.importedAt !== "string") return null;
    return { envPath: parsed.envPath, url: parsed.url, importedAt: parsed.importedAt };
  } catch {
    return null;
  }
}

function tokenFromCadBridgeEnv(envPath: string): string {
  try {
    const match = readFileSync(envPath, "utf-8").match(/^\s*CAD_PRINT_BRIDGE_TOKEN\s*=\s*(.+?)\s*$/m);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Read the Friday Body CAD bridge credential only in Electron's main process.
 * The renderer never receives this value, so the local print workflow does
 * not depend on users copying a secret out of a .env file by hand.
 */
function getLocalCadBridgeToken(): string {
  const explicit = process.env.CAD_PRINT_BRIDGE_TOKEN?.trim();
  if (explicit) return explicit;

  const imported = savedCadBridgeImport()?.envPath;
  const envPath = process.env.MEMEX_CAD_PRINT_BRIDGE_ENV || imported
    || join(process.env.USERPROFILE ?? "", "Documents", "Github", "Friday_Body", "services", "cad_print_bridge", ".env");
  return tokenFromCadBridgeEnv(envPath);
}

export interface IpcContext {
  config:    ConfigStore;
  firewall:  WorkspaceFirewall;
  lsp:       LspManager;
  browser:   BrowserBridge;
  browserPane: BrowserPane;
  runs:      RunStore;
  evals:     EvalStore;
  artifacts: ArtifactStore;
  hooks:     HooksStore;
  getMain:   () => BrowserWindow | null;
  startHealthLoop: () => void;
}

export function registerAllIpc(ctx: IpcContext): void {
  const { config, firewall, lsp, browser, browserPane, runs, evals, artifacts, hooks, getMain, startHealthLoop } = ctx;

  // ── Identity ──────────────────────────────────────────────────────────────
  ipcMain.handle("identity:get", () => getCurrentUid());
  ipcMain.handle("identity:set", (_e, uid: string) => {
    setCurrentUid(uid);
    return uid;
  });

  // ── Authenticated backend requests ───────────────────────────────────────
  // file:// renderer fetches do not reliably carry SameSite Authentik cookies.
  // Keep feature API calls in the native process, alongside the health probe
  // that already proves this session is authenticated. Targets are restricted
  // to the active profile so this cannot become an arbitrary network proxy.
  // The sole exception is the CAD/print bridge: it is deliberately a
  // workstation-local service, pinned to loopback port 8790. The renderer may
  // configure its token, but cannot use this path as a general local-network
  // proxy (no other host, port, or path is accepted here).
  type ApiRequest = {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
  const isLocalCadPrintBridge = (raw: string): boolean => {
    try {
      const target = new URL(raw);
      const loopback = target.hostname === "127.0.0.1" || target.hostname === "localhost" || target.hostname === "::1";
      const allowedPath = target.pathname === "/health" || target.pathname.startsWith("/cad/") || target.pathname.startsWith("/printer/") || target.pathname.startsWith("/print/");
      return target.protocol === "http:" && loopback && target.port === "8790" && allowedPath;
    } catch { return false; }
  };
  const prepareApiRequest = async (request: ApiRequest) => {
    const urls = config.getUrls();
    const allowed = [urls.agentRuntime, urls.mempalace, urls.ollama]
      .filter(Boolean)
      .some((base) => request.url.startsWith(base)) || isLocalCadPrintBridge(request.url);
    if (!allowed) throw new Error("Request target is outside the active runtime profile");

    const active = config.getActive();
    const headers = new Headers(request.headers);
    headers.set("X-authentik-uid", getCurrentUid());
    headers.set("X-authentik-username", getCurrentUid());
    headers.set("X-desktop-client", "memex-desktop");
    if (urls.agentRuntime.startsWith(MEMEX_PUBLIC_ORIGIN)) {
      for (const [name, value] of Object.entries(await publicSessionHeaders())) headers.set(name, value);
    }
    // The local CAD bridge owns a separate workstation-only token.  Source it
    // locally so a pasted UI value cannot be stale or accidentally be an LLM
    // provider key. Never expose the token back across IPC.
    if (isLocalCadPrintBridge(request.url)) {
      const localToken = getLocalCadBridgeToken();
      if (localToken) headers.set("Authorization", `Bearer ${localToken}`);
    } else if (active.providerType === "external" && active.apiKey) {
      headers.set("Authorization", `Bearer ${active.apiKey}`);
    }

    return { headers, request };
  };

  ipcMain.handle("api:request", async (_e, request: ApiRequest) => {
    const prepared = await prepareApiRequest(request);
    const response = await fetch(request.url, {
      method: request.method ?? "GET",
      headers: prepared.headers,
      body: request.body,
      signal: AbortSignal.timeout(30_000),
    });
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    };
  });

  const apiStreams = new Map<string, AbortController>();
  ipcMain.on("api:stream:start", async (event, streamId: string, request: ApiRequest) => {
    const controller = new AbortController();
    apiStreams.set(streamId, controller);
    const send = (kind: "response" | "chunk" | "done" | "error", value?: unknown) =>
      event.sender.send(`api:stream:${streamId}`, { kind, value });
    try {
      const prepared = await prepareApiRequest(request);
      const response = await fetch(request.url, {
        method: request.method ?? "GET",
        headers: prepared.headers,
        body: request.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        // A failed SSE response has no useful stream to consume. Preserve a
        // bounded server detail so the renderer can show the actionable reason
        // instead of only a bare status code.
        const detail = (await response.text()).slice(0, 2_000);
        send("response", { status: response.status, statusText: response.statusText, detail });
        send("done");
        return;
      }
      send("response", { status: response.status, statusText: response.statusText });
      if (!response.body) throw new Error("Runtime returned no response body");
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        send("chunk", value);
      }
      send("done");
    } catch (error: any) {
      if (error?.name !== "AbortError") send("error", error?.message ?? "Stream failed");
    } finally {
      apiStreams.delete(streamId);
    }
  });
  ipcMain.on("api:stream:abort", (_event, streamId: string) => {
    apiStreams.get(streamId)?.abort();
    apiStreams.delete(streamId);
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

  // ── OpenSCAD (workspace-gated) ────────────────────────────────────────────
  // Gated on checkRead(scadPath)/checkWrite(outputPath) rather than
  // checkShell(): this doesn't run a free-form shell string (it spawns the
  // openscad.exe binary directly with an argv array), so the shell-command
  // firewall check doesn't semantically apply. The two real filesystem touch
  // points are the .scad source being read and the export file being
  // written -- gating on those matches how fs:readFile/fs:writeFile already
  // work in this file, and is the check that actually matters here.
  ipcMain.handle("openscad:render", async (_e, params: RenderParams) => {
    if (!await firewall.checkRead(params.scadPath, getMain())) {
      return { ok: false, stdout: "", stderr: "Permission denied by workspace firewall (scadPath)", code: 126, warnings: [], durationMs: 0 };
    }
    if (!await firewall.checkWrite(params.outputPath, getMain())) {
      return { ok: false, stdout: "", stderr: "Permission denied by workspace firewall (outputPath)", code: 126, warnings: [], durationMs: 0 };
    }
    return runOpenScad(params);
  });

  ipcMain.handle("openscad:export", async (_e, params: RenderParams) => {
    if (!await firewall.checkRead(params.scadPath, getMain())) {
      return { ok: false, stdout: "", stderr: "Permission denied by workspace firewall (scadPath)", code: 126, warnings: [], durationMs: 0 };
    }
    if (!await firewall.checkWrite(params.outputPath, getMain())) {
      return { ok: false, stdout: "", stderr: "Permission denied by workspace firewall (outputPath)", code: 126, warnings: [], durationMs: 0 };
    }
    // export is render() with a manufacturable format required -- the
    // renderer is expected to pass format: "stl" | "3mf", but a defensive
    // check here means the IPC boundary itself refuses an accidental "png"
    // rather than silently doing the wrong thing.
    if (params.format !== "stl" && params.format !== "3mf") {
      return { ok: false, stdout: "", stderr: `openscad:export requires format "stl" or "3mf", got "${params.format}"`, code: null, warnings: [], durationMs: 0 };
    }
    return runOpenScad(params);
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
  ipcMain.handle("cadPrint:getBridgeConfig", () => {
    const saved = savedCadBridgeImport();
    const envPath = saved?.envPath || process.env.MEMEX_CAD_PRINT_BRIDGE_ENV
      || join(process.env.USERPROFILE ?? "", "Documents", "Github", "Friday_Body", "services", "cad_print_bridge", ".env");
    return {
      configured: Boolean(tokenFromCadBridgeEnv(envPath)),
      envPath,
      url: saved?.url ?? LOCAL_CAD_BRIDGE_URL,
      importedAt: saved?.importedAt ?? null,
    };
  });
  ipcMain.handle("cadPrint:importBridgeConfig", async () => {
    const choice = await dialog.showOpenDialog({
      title: "Import Friday CAD bridge configuration",
      defaultPath: savedCadBridgeImport()?.envPath,
      properties: ["openFile"],
      filters: [{ name: "Environment file", extensions: ["env"] }, { name: "All files", extensions: ["*"] }],
    });
    if (choice.canceled || !choice.filePaths[0]) return { ok: false, canceled: true };
    const envPath = choice.filePaths[0];
    if (!tokenFromCadBridgeEnv(envPath)) {
      return { ok: false, canceled: false, error: "The selected file does not contain CAD_PRINT_BRIDGE_TOKEN." };
    }
    const record: CadBridgeImport = { envPath, url: LOCAL_CAD_BRIDGE_URL, importedAt: new Date().toISOString() };
    writeFileSync(cadBridgeImportPath(), JSON.stringify(record, null, 2), "utf-8");
    return { ok: true, ...record };
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

  // ── Native browser pane ──────────────────────────────────────────────────
  ipcMain.handle("browser-pane:open",     (_e, url?: string) => browserPane.open(url));
  ipcMain.handle("browser-pane:navigate", (_e, url: string)  => browserPane.navigate(url));
  ipcMain.handle("browser-pane:bounds",   (_e, bounds: Electron.Rectangle) => browserPane.setBounds(bounds));
  ipcMain.handle("browser-pane:hide",     () => browserPane.hide());
  ipcMain.handle("browser-pane:back",     () => browserPane.back());
  ipcMain.handle("browser-pane:forward",  () => browserPane.forward());
  ipcMain.handle("browser-pane:reload",   () => browserPane.reload());
  ipcMain.handle("browser-pane:stop",     () => browserPane.stop());
  ipcMain.handle("browser-pane:getState", () => browserPane.getState());

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

  // ── Workspace firewall (pure passthrough) ─────────────────────────────────
  autoWireStore("workspace", firewall, ["getPolicy", "setPolicy", "addRoot"]);
  // Aliased on its own — "workspace:clearSession" (preload/desktop.ts's name)
  // differs from the store's actual clearSessionApprovals() method name.
  autoWireStore("workspace", firewall, { clearSession: "clearSessionApprovals" });

  // ── Runtime config profiles ───────────────────────────────────────────────
  // setActive stays hand-written: it broadcasts config:changed and restarts
  // the health loop, neither of which is "call one method, return result".
  // Aliased — existing channel names predate/differ from ConfigStore's
  // actual method names (save/delete vs saveProfile/deleteProfile, etc.).
  autoWireStore("config", config, {
    getAll: "getAll", getActive: "getActive", save: "saveProfile", delete: "deleteProfile",
    getUrls: "getUrls", getWizardDone: "getWizardComplete",
  });
  ipcMain.handle("config:setWizardDone", () => {
    config.setWizardComplete();
    const marker = join(dirname(process.resourcesPath), ".memex-setup-required");
    if (existsSync(marker)) unlinkSync(marker);
  });
  ipcMain.handle("config:setActive", (_e, id: string) => {
    const ok = config.setActive(id);
    if (ok) {
      getMain()?.webContents.send("config:changed", config.getActive());
      startHealthLoop();
    }
    return ok;
  });

  // ── Run store ─────────────────────────────────────────────────────────────
  // startRun/endRun stay hand-written — they also fireHooks(). fireHooks()
  // is deliberately not awaited: a hook must never delay the response the
  // renderer is waiting on to proceed with the chat turn.
  // Aliased — existing channel names (getRecent/getEvents) differ from
  // RunStore's actual method names (getRecentRuns/getEventsForRun).
  autoWireStore("runs", runs, { addEvent: "addEvent", getRecent: "getRecentRuns", getEvents: "getEventsForRun" });
  ipcMain.handle("runs:start", (_e, opts) => {
    const run = runs.startRun(opts);
    fireHooks("run:start", { hooks, firewall, getMain });
    return run;
  });
  ipcMain.handle("runs:end", (_e, id, st) => {
    runs.endRun(id, st);
    fireHooks("run:end", { hooks, firewall, getMain });
  });

  // ── Hooks (pure passthrough) ───────────────────────────────────────────────
  // setApproval is intentionally NOT listed — internal-only, called by
  // hooks-runner.ts in the main process. Renderer-reachable would let it
  // self-approve a hook, bypassing the first-fire consent dialog entirely.
  // Aliased — existing channel name is "hooks:list", not "hooks:getAll".
  autoWireStore("hooks", hooks, { list: "getAll", save: "save", delete: "delete" });

  // ── Artifact store (pure passthrough) ─────────────────────────────────────
  // Aliased — existing channel names (add/forRun/forSession/recent) differ
  // from ArtifactStore's actual method names.
  autoWireStore("artifact", artifacts, {
    add: "addArtifact", forRun: "getForRun", forSession: "getForSession", recent: "getRecent",
  });

  // ── Ollama model list ─────────────────────────────────────────────────────
  ipcMain.handle("ollama:listModels", async () => {
    try {
      const urls  = config.getUrls();
      const base  = urls.ollama ?? "http://localhost:11434";
      const res   = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return [];
      const data  = await res.json() as { models?: Array<{ name: string; size: number; modified_at: string; details?: { parameter_size?: string; family?: string } }> };
      return (data.models ?? []).map((m) => ({
        name:          m.name,
        parameterSize: m.details?.parameter_size ?? "",
        family:        m.details?.family ?? "",
        sizeGb:        +(m.size / 1e9).toFixed(1),
        modifiedAt:    m.modified_at,
      }));
    } catch {
      return [];
    }
  });

  // Model context window (max tokens) — read from Ollama /api/show model_info.
  ipcMain.handle("ollama:contextLength", async (_e, model: string) => {
    try {
      const urls = config.getUrls();
      const base = urls.ollama ?? "http://localhost:11434";
      const res  = await fetch(`${base}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const data = await res.json() as { model_info?: Record<string, unknown> };
      const mi = data.model_info ?? {};
      for (const k of Object.keys(mi)) {
        if (k.endsWith(".context_length") && typeof mi[k] === "number") return mi[k] as number;
      }
      return null;
    } catch {
      return null;
    }
  });

  // ── Eval store (pure passthrough) ─────────────────────────────────────────
  autoWireStore("eval", evals, [
    "getCases", "saveCase", "deleteCase", "getResults", "startResult", "updateResult",
  ]);
}
