/**
 * Injected into the main BrowserWindow renderer (local React app).
 * Exposes window.memex — the full native bridge to the Electron main process.
 */
import { contextBridge, ipcRenderer } from "electron";

/**
 * Collapses "one ipcRenderer.invoke wrapper per method" for namespaces that
 * are pure passthroughs on the main-process side (see ipc-autowire.ts —
 * these are exactly the namespaces wired there with autoWireStore()).
 * `methods` is either an array (exposed name === channel suffix) or a
 * { exposedName: channelSuffix } map for the cases where the renderer-facing
 * name and the channel name differ (e.g. hooks.getAll() calls "hooks:list",
 * not "hooks:getAll" — an existing name predating this helper).
 *
 * Deliberately untyped here (unknown[] / Promise<unknown>) — ipcRenderer.invoke
 * itself is always Promise<any>, so this was never where type safety came
 * from. desktop.ts's MemexBridge interface is and remains the one place the
 * renderer's actual method signatures are declared; this only removes the
 * repetitive `(...args) => ipcRenderer.invoke("ns:x", ...args)` lines.
 */
function bridgeNamespace(
  namespace: string,
  methods: readonly string[] | Readonly<Record<string, string>>,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const entries: Array<[string, string]> = Array.isArray(methods)
    ? methods.map((m) => [m, m])
    : Object.entries(methods as Record<string, string>);

  const obj: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const [exposedName, channelSuffix] of entries) {
    obj[exposedName] = (...args: unknown[]) => ipcRenderer.invoke(`${namespace}:${channelSuffix}`, ...args);
  }
  return obj;
}

contextBridge.exposeInMainWorld("memex", {
  isDesktop: true,
  version:   () => ipcRenderer.invoke("app:getVersion"),
  cwd:       () => ipcRenderer.invoke("app:getCwd") as Promise<string>,
  path:      (name: "home" | "userData") => ipcRenderer.invoke("app:getPath", name) as Promise<string>,

  // Identity — who is using this desktop instance
  identity: {
    get: () => ipcRenderer.invoke("identity:get") as Promise<string>,
    set: (uid: string) => ipcRenderer.invoke("identity:set", uid) as Promise<string>,
  },

  api: {
    request: (request: { url: string; method?: string; headers?: Record<string, string>; body?: string }) =>
      ipcRenderer.invoke("api:request", request),
    stream: (
      streamId: string,
      request: { url: string; method?: string; headers?: Record<string, string>; body?: string },
      onEvent: (event: { kind: "response" | "chunk" | "done" | "error"; value?: unknown }) => void,
    ) => {
      const channel = `api:stream:${streamId}`;
      ipcRenderer.on(channel, (_event, payload) => onEvent(payload));
      ipcRenderer.send("api:stream:start", streamId, request);
      return () => {
        ipcRenderer.send("api:stream:abort", streamId);
        ipcRenderer.removeAllListeners(channel);
      };
    },
  },

  // File system
  fs: {
    readFile:     (path: string)                  => ipcRenderer.invoke("fs:readFile", path),
    previewWrite: (path: string)                  => ipcRenderer.invoke("fs:previewWrite", path) as Promise<string>,
    writeFile:    (path: string, content: string) => ipcRenderer.invoke("fs:writeFile", path, content),
    readDir:   (path: string)                  => ipcRenderer.invoke("fs:readDir", path),
    mkdir:     (path: string)                  => ipcRenderer.invoke("fs:mkdir", path),
  },

  // Shell
  shell: {
    exec:         (cmd: string, cwd?: string) => ipcRenderer.invoke("shell:exec", cmd, cwd),
    openExternal: (url: string)               => ipcRenderer.invoke("app:openExternal", url),
  },

  // Dialogs
  dialog: {
    openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  },

  cadPrint: {
    getBridgeConfig: () => ipcRenderer.invoke("cadPrint:getBridgeConfig"),
    importBridgeConfig: () => ipcRenderer.invoke("cadPrint:importBridgeConfig"),
  },

  // OpenSCAD render/export -- kept as `unknown` here on purpose, same as
  // every other namespace in this file (this preload layer was never the
  // source of type safety; ipcRenderer.invoke is always Promise<any>
  // regardless of what's annotated locally). The real types now live in
  // src/lib/desktop.ts's MemexBridge.openscad (previously missing entirely —
  // that gap meant window.memex.openscad was untyped renderer-side; fixed).
  openscad: {
    render: (params: unknown) => ipcRenderer.invoke("openscad:render", params),
    export: (params: unknown) => ipcRenderer.invoke("openscad:export", params),
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

  // Auto-start
  autoStart: {
    get: () => ipcRenderer.invoke("app:getAutoStart"),
    set: (enable: boolean) => ipcRenderer.invoke("app:setAutoStart", enable),
  },

  // Auto-updater
  updater: {
    getStatus: () => ipcRenderer.invoke("update:getStatus"),
    check: () => ipcRenderer.invoke("update:check"),
    onStatus: (cb: (status: {
      state: "checking" | "available" | "downloading" | "ready" | "current" | "error";
      version?: string; percent?: number; message?: string;
    }) => void) => {
      ipcRenderer.on("update:status", (_e, status) => cb(status));
      return () => ipcRenderer.removeAllListeners("update:status");
    },
    install: () => ipcRenderer.invoke("update:install"),
  },

  // Chrome extension browser bridge
  browser: {
    send:              (msg: Record<string, unknown>) => ipcRenderer.invoke("browser:send", msg),
    getExtensionIds:   () => ipcRenderer.invoke("browser:getExtensionIds") as Promise<string[]>,
    setExtensionIds:   (ids: string[]) => ipcRenderer.invoke("browser:setExtensionIds", ids),
    onMessage: (cb: (msg: Record<string, unknown>) => void) => {
      ipcRenderer.on("browser:message", (_e, msg) => cb(msg));
      return () => ipcRenderer.removeAllListeners("browser:message");
    },
  },

  browserPane: {
    open:     (url?: string) => ipcRenderer.invoke("browser-pane:open", url),
    navigate: (url: string)  => ipcRenderer.invoke("browser-pane:navigate", url),
    setBounds:(bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke("browser-pane:bounds", bounds),
    hide:     () => ipcRenderer.invoke("browser-pane:hide"),
    back:     () => ipcRenderer.invoke("browser-pane:back"),
    forward:  () => ipcRenderer.invoke("browser-pane:forward"),
    reload:   () => ipcRenderer.invoke("browser-pane:reload"),
    stop:     () => ipcRenderer.invoke("browser-pane:stop"),
    getState: () => ipcRenderer.invoke("browser-pane:getState"),
    onState: (cb: (state: unknown) => void) => {
      ipcRenderer.on("browser-pane:state", (_e, state) => cb(state));
      return () => ipcRenderer.removeAllListeners("browser-pane:state");
    },
  },

  remoteAuth: {
    signIn: () => ipcRenderer.invoke("remote-auth:signIn") as Promise<boolean>,
    signOut: () => ipcRenderer.invoke("remote-auth:signOut") as Promise<boolean>,
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

  // Native health loop
  health: {
    check:   () => ipcRenderer.invoke("health:check"),
    getLast: () => ipcRenderer.invoke("health:getLast"),
    onStatus: (cb: (status: {
      agentRuntime: "connected" | "disconnected";
      mempalace:    "connected" | "disconnected";
      ollama:       "connected" | "disconnected";
      checkedAt:    string;
    }) => void) => {
      ipcRenderer.on("health:status", (_e, s) => cb(s));
      return () => ipcRenderer.removeAllListeners("health:status");
    },
  },

  // Workspace capability firewall
  workspace: bridgeNamespace("workspace", { getPolicy: "getPolicy", setPolicy: "setPolicy", addRoot: "addRoot", clearSession: "clearSession" }),

  // Runtime configuration profiles
  config: {
    ...bridgeNamespace("config", {
      getAll: "getAll", getActive: "getActive", save: "save", delete: "delete",
      getUrls: "getUrls", getWizardDone: "getWizardDone", setWizardDone: "setWizardDone",
    }),
    // setActive broadcasts config:changed on the main-process side (see
    // ipc-handlers.ts) — stays hand-written alongside its listener, same as
    // every other invoke+on pairing in this file.
    setActive: (id: string) => ipcRenderer.invoke("config:setActive", id),
    onChange:  (cb: (profile: unknown) => void) => {
      ipcRenderer.on("config:changed", (_e, p) => cb(p));
      return () => ipcRenderer.removeAllListeners("config:changed");
    },
  },

  // Permission prompts
  permissions: {
    request: (opts: { toolName: string; toolInput: Record<string, unknown>; callId: string }) =>
      ipcRenderer.invoke("permission:request", opts) as Promise<{
        approved: boolean; scope: "once" | "session" | "workspace";
      }>,
  },

  // Run and audit data model — start/end stay hand-written (see config.setActive
  // comment above; same reasoning, they trigger hooks on the main-process side).
  runs: {
    start: (opts: unknown) => ipcRenderer.invoke("runs:start", opts),
    end:   (id: string, status: string) => ipcRenderer.invoke("runs:end", id, status),
    ...bridgeNamespace("runs", { addEvent: "addEvent", getRecent: "getRecent", getEvents: "getEvents" }),
  },

  // Artifact store
  artifacts: bridgeNamespace("artifact", { add: "add", forRun: "forRun", forSession: "forSession", recent: "recent" }),

  // Ollama model list
  ollama: {
    listModels:    () => ipcRenderer.invoke("ollama:listModels"),
    contextLength: (model: string) => ipcRenderer.invoke("ollama:contextLength", model) as Promise<number | null>,
  },

  // Global keyboard shortcuts
  shortcuts: {
    get: () => ipcRenderer.invoke("shortcuts:get"),
    set: (sc: unknown) => ipcRenderer.invoke("shortcuts:set", sc),
  },

  // Eval bench
  evals: bridgeNamespace("eval", {
    getCases: "getCases", saveCase: "saveCase", deleteCase: "deleteCase",
    getResults: "getResults", startResult: "startResult", updateResult: "updateResult",
  }),

  // setApproval intentionally not exposed — see ipc-autowire.ts's comment on
  // the matching main-process registration for why.
  hooks: bridgeNamespace("hooks", { getAll: "list", save: "save", delete: "delete" }),

  // Quick submit / open path relays (set by the React app)
  onQuickSubmit: (cb: (text: string) => void) => { (window as any).__memexQuickSubmit = cb; },
  onOpenPath:    (cb: (path: string) => void) => { (window as any).__memexOpenPath    = cb; },
});
