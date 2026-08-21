/**
 * Memex Desktop bridge — window.memex exposed by preload-memex.ts.
 * The React app uses this to access native capabilities.
 * Gracefully no-ops when not running in Electron.
 */
import type { RunRecord, RunEvent, EvalCase, EvalResult } from "../types/memex";
export type { RunRecord, RunEvent, EvalCase, EvalResult };

export type PermissionMode = "trusted" | "workspace" | "ask";

export interface ShortcutConfig {
  toggleQuick: string;
  showWindow:  string;
  newChat:     string;
}

export type ArtifactType = "file" | "diff" | "diagram" | "report" | "log" | "image";
export interface ArtifactRecord {
  id:        string;
  runId?:    string;
  sessionId: string;
  type:      ArtifactType;
  name:      string;
  path?:     string;
  content?:  string;
  createdAt: string;
  sizeBytes?: number;
}

export type HookEvent = "run:start" | "run:end";
export interface Hook {
  id:        string;
  name:      string;
  event:     HookEvent;
  command:   string;
  cwd?:      string;
  enabled:   boolean;
  approved:  boolean;
  createdAt: string;
}

export interface BrowserPaneState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

// Mirrors electron/openscad-pure.ts's RenderParams/OpenScadResult (a real
// pre-existing gap: preload-memex.ts exposes `openscad`, but this interface
// never declared it, so window.memex.openscad was renderer-side untyped).
// Local copy, not an import — same convention as every other namespace
// here (Hook, EvalCase, ArtifactRecord, ...), avoiding a renderer-bundle
// import of an electron/ module even though openscad-pure.ts is Node-free.
export type OpenScadFormat = "png" | "stl" | "3mf" | "off";
export interface RenderParams {
  scadPath:    string;
  outputPath:  string;
  part?:       string;
  vars?:       Record<string, string | number | boolean>;
  format:      OpenScadFormat;
  fullRender?: boolean;
  timeoutMs?:  number;
  openscadBin?: string;
}
export interface OpenScadResult {
  ok:         boolean;
  outputPath?: string;
  stdout:     string;
  stderr:     string;
  code:       number | null;
  warnings:   string[];
  geometry?:  {
    boundingBox: { min: [number, number, number]; max: [number, number, number] };
    triangleCount: number;
    vertexCount: number;
    manifold: boolean | null;
  };
  durationMs: number;
}

export interface OllamaModel {
  name:          string;
  parameterSize: string;
  family:        string;
  sizeGb:        number;
  modifiedAt:    string;
}

// Fallback constants used when not running inside Electron (e.g. browser dev).
// In Electron, the active RuntimeProfile's URLs are used instead via config.getUrls().
export const AGENT_RUNTIME_DEFAULT = "http://192.168.2.101:8008";
export const MEMPALACE_DEFAULT     = "http://192.168.2.102:8200";

/** @deprecated import from the runtime-urls store instead */
export const AGENT_RUNTIME = AGENT_RUNTIME_DEFAULT;
export const MEMPALACE     = MEMPALACE_DEFAULT;

export type ProviderType = "internal" | "external";

export interface RuntimeProfile {
  id:           string;
  name:         string;
  providerType: ProviderType; // "internal" = trusted LAN host, "external" = 3rd-party API
  agentRuntime: string;
  mempalace:    string;
  ollama?:      string;
  /** Last model deliberately selected for this routing profile. */
  defaultModel?: string;
  apiKey?:      string; // only present when providerType === "external"
  readonly?:    boolean;
}

export interface MemexBridge {
  isDesktop: boolean;
  version:   () => Promise<string>;

  identity: {
    get: () => Promise<string>;
    set: (uid: string) => Promise<string>;
  };

  api: {
    request: (request: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
    }>;
    stream: (
      streamId: string,
      request: { url: string; method?: string; headers?: Record<string, string>; body?: string },
      onEvent: (event: { kind: "response" | "chunk" | "done" | "error"; value?: unknown }) => void,
    ) => () => void;
  };

  fs: {
    readFile:     (path: string)                  => Promise<string>;
    previewWrite: (path: string)                  => Promise<string>;
    writeFile:    (path: string, content: string) => Promise<void>;
    readDir:      (path: string)                  => Promise<Array<{ name: string; path: string; isDir: boolean }>>;
    mkdir:        (path: string)                  => Promise<void>;
  };

  shell: {
    exec:         (cmd: string, cwd?: string) => Promise<{ stdout: string; stderr: string; code: number }>;
    openExternal: (url: string) => Promise<void>;
  };

  dialog: { openFolder: () => Promise<string | null> };

  cadPrint: {
    getBridgeConfig: () => Promise<{ configured: boolean; envPath: string; url: string; importedAt: string | null }>;
    importBridgeConfig: () => Promise<{ ok: boolean; canceled: boolean; error?: string; envPath?: string; url?: string; importedAt?: string }>;
  };

  pty: {
    create:  (id: string, cwd?: string)               => Promise<{ pid: number }>;
    write:   (id: string, data: string)               => Promise<void>;
    resize:  (id: string, cols: number, rows: number) => Promise<void>;
    kill:    (id: string)                             => Promise<void>;
    onData:  (id: string, cb: (d: string)  => void)  => () => void;
    onExit:  (id: string, cb: (c: number)  => void)  => () => void;
  };

  autoStart: {
    get: () => Promise<boolean>;
    set: (enable: boolean) => Promise<boolean>;
  };

  updater: {
    getStatus: () => Promise<{
      state: "checking"|"available"|"downloading"|"ready"|"current"|"error";
      version?: string; percent?: number; message?: string;
    }>;
    check: () => Promise<{
      state: "checking"|"available"|"downloading"|"ready"|"current"|"error";
      version?: string; percent?: number; message?: string;
    }>;
    onStatus: (cb: (s: {
      state: "checking"|"available"|"downloading"|"ready"|"current"|"error";
      version?: string; percent?: number; message?: string;
    }) => void) => () => void;
    install: () => Promise<boolean>;
  };

  browser: {
    send:            (msg: Record<string, unknown>) => Promise<void>;
    getExtensionIds: () => Promise<string[]>;
    setExtensionIds: (ids: string[]) => Promise<void>;
    onMessage:       (cb: (msg: Record<string, unknown>) => void) => () => void;
  };

  browserPane: {
    open:      (url?: string) => Promise<BrowserPaneState>;
    navigate:  (url: string) => Promise<BrowserPaneState>;
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
    hide:      () => Promise<void>;
    back:      () => Promise<BrowserPaneState>;
    forward:   () => Promise<BrowserPaneState>;
    reload:    () => Promise<BrowserPaneState>;
    stop:      () => Promise<BrowserPaneState>;
    getState:  () => Promise<BrowserPaneState>;
    onState:   (cb: (state: BrowserPaneState) => void) => () => void;
  };

  remoteAuth: {
    signIn: () => Promise<boolean>;
    signOut: () => Promise<boolean>;
  };

  lsp: {
    start:          (ext: string, rootUri: string) => Promise<boolean>;
    request:        (lang: string, rootUri: string, method: string, params: unknown) => Promise<unknown>;
    notify:         (lang: string, rootUri: string, method: string, params: unknown) => void;
    onNotification: (cb: (data: { lang: string; method: string; params: unknown }) => void) => () => void;
  };

  permissions: {
    request: (opts: { toolName: string; toolInput: Record<string, unknown>; callId: string }) =>
      Promise<{ approved: boolean; scope: "once" | "session" | "workspace" }>;
  };

  health: {
    check:    () => Promise<{ agentRuntime: string; mempalace: string; ollama: string; checkedAt: string }>;
    getLast:  () => Promise<{ agentRuntime: string; mempalace: string; ollama: string; checkedAt: string } | null>;
    onStatus: (cb: (s: { agentRuntime: string; mempalace: string; ollama: string; checkedAt: string }) => void) => () => void;
  };

  workspace: {
    getPolicy:    () => Promise<{ roots: string[]; mode: string; allowShell: boolean; allowWrite: boolean }>;
    setPolicy:    (policy: { roots?: string[]; mode?: string; allowShell?: boolean; allowWrite?: boolean }) => Promise<void>;
    addRoot:      (root: string) => Promise<void>;
    clearSession: () => Promise<void>;
  };

  config: {
    getAll:        () => Promise<RuntimeProfile[]>;
    getActive:     () => Promise<RuntimeProfile>;
    setActive:     (id: string) => Promise<boolean>;
    save:          (profile: Partial<RuntimeProfile> & { name: string; providerType: ProviderType; agentRuntime: string; mempalace: string }) => Promise<RuntimeProfile>;
    delete:        (id: string) => Promise<boolean>;
    getUrls:       () => Promise<{ agentRuntime: string; mempalace: string; ollama: string }>;
    getWizardDone: () => Promise<boolean>;
    setWizardDone: () => Promise<void>;
    onChange:      (cb: (profile: RuntimeProfile) => void) => () => void;
  };

  runs: {
    start:     (opts: Record<string, unknown>) => Promise<RunRecord>;
    end:       (id: string, status: "done" | "error" | "cancelled") => Promise<void>;
    addEvent:  (id: string, type: string, payload: unknown) => Promise<void>;
    getRecent: (limit?: number) => Promise<RunRecord[]>;
    getEvents: (id: string) => Promise<RunEvent[]>;
  };

  artifacts: {
    add:        (rec: Omit<ArtifactRecord, "id" | "createdAt">)  => Promise<ArtifactRecord>;
    forRun:     (runId: string)                                   => Promise<ArtifactRecord[]>;
    forSession: (sessionId: string)                               => Promise<ArtifactRecord[]>;
    recent:     (limit?: number)                                  => Promise<ArtifactRecord[]>;
  };

  ollama: {
    listModels:    () => Promise<OllamaModel[]>;
    contextLength: (model: string) => Promise<number | null>;
  };

  shortcuts: {
    get: () => Promise<ShortcutConfig>;
    set: (sc: Partial<ShortcutConfig>) => Promise<ShortcutConfig>;
  };

  evals: {
    getCases:     ()                                    => Promise<EvalCase[]>;
    saveCase:     (c: Partial<EvalCase>)                => Promise<EvalCase>;
    deleteCase:   (id: string)                          => Promise<void>;
    getResults:   (caseId?: string)                     => Promise<EvalResult[]>;
    startResult:  (caseId: string, runId?: string)      => Promise<EvalResult>;
    updateResult: (id: string, patch: Partial<EvalResult>) => Promise<EvalResult | null>;
  };

  hooks: {
    getAll: ()                                          => Promise<Hook[]>;
    save:   (hook: Partial<Hook> & { name: string; event: HookEvent; command: string }) => Promise<Hook>;
    delete: (id: string)                                => Promise<boolean>;
  };

  openscad: {
    render: (params: RenderParams) => Promise<OpenScadResult>;
    export: (params: RenderParams) => Promise<OpenScadResult>;
  };

  onQuickSubmit: (cb: (text: string) => void) => void;
  onOpenPath:    (cb: (path: string) => void) => void;
}

declare global {
  interface Window { memex?: MemexBridge; }
}

export const isDesktop = (): boolean =>
  typeof window !== "undefined" && window.memex?.isDesktop === true;

export const desktop = (): MemexBridge | null =>
  typeof window !== "undefined" ? (window.memex ?? null) : null;
