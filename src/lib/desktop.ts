/**
 * Memex Desktop bridge — window.memex exposed by preload-memex.ts.
 * The React app uses this to access native capabilities.
 * Gracefully no-ops when not running in Electron.
 */
import type { RunRecord, RunEvent, EvalCase, EvalResult } from "../types/memex";
export type { RunRecord, RunEvent, EvalCase, EvalResult };

export type PermissionMode = "trusted" | "workspace" | "ask";

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

export interface RuntimeProfile {
  id:           string;
  name:         string;
  agentRuntime: string;
  mempalace:    string;
  ollama?:      string;
  readonly?:    boolean;
}

export interface MemexBridge {
  isDesktop: boolean;
  version:   () => Promise<string>;

  identity: {
    get: () => Promise<string>;
    set: (uid: string) => Promise<string>;
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
    onStatus: (cb: (s: {
      state: "checking"|"available"|"downloading"|"ready"|"current"|"error";
      version?: string; percent?: number; message?: string;
    }) => void) => () => void;
    install: () => void;
  };

  browser: {
    send:            (msg: Record<string, unknown>) => Promise<void>;
    getExtensionIds: () => Promise<string[]>;
    setExtensionIds: (ids: string[]) => Promise<void>;
    onMessage:       (cb: (msg: Record<string, unknown>) => void) => () => void;
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
    save:          (profile: Partial<RuntimeProfile> & { name: string; agentRuntime: string; mempalace: string }) => Promise<RuntimeProfile>;
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

  ollama: {
    listModels: () => Promise<OllamaModel[]>;
  };

  evals: {
    getCases:     ()                                    => Promise<EvalCase[]>;
    saveCase:     (c: Partial<EvalCase>)                => Promise<EvalCase>;
    deleteCase:   (id: string)                          => Promise<void>;
    getResults:   (caseId?: string)                     => Promise<EvalResult[]>;
    startResult:  (caseId: string, runId?: string)      => Promise<EvalResult>;
    updateResult: (id: string, patch: Partial<EvalResult>) => Promise<EvalResult | null>;
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
