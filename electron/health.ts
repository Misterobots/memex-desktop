/** Native health loop — probes all three endpoints, pushes health:status to renderer. */
import { ipcMain, BrowserWindow } from "electron";
import type { ConfigStore } from "./config-store";
import { MEMEX_PUBLIC_ORIGIN, publicSessionHeaders } from "./remote-auth";
import { classifyHealthResponse, type NativeConnectionStatus } from "./health-status";

export interface HealthStatus {
  agentRuntime: NativeConnectionStatus;
  mempalace:    NativeConnectionStatus;
  ollama:       NativeConnectionStatus;
  checkedAt:    string;
}

let timer:      ReturnType<typeof setInterval> | null = null;
let lastStatus: HealthStatus | null = null;

async function probe(url: string, publicProfile: boolean, headers?: HeadersInit, init?: RequestInit): Promise<NativeConnectionStatus> {
  try {
    // Preserve request-specific headers (notably MemPalace's JSON content
    // type) while adding the Authentik session cookie. Passing `headers`
    // separately used to overwrite init.headers, turning the POST into
    // text/plain and producing a false offline result.
    const mergedHeaders = new Headers(init?.headers);
    for (const [name, value] of new Headers(headers)) mergedHeaders.set(name, value);
    const r = await fetch(url, { ...init, headers: mergedHeaders, redirect: publicProfile ? "manual" : "follow", signal: AbortSignal.timeout(4000) });
    return classifyHealthResponse(r.status, r.headers.get("content-type"), publicProfile);
  } catch { return "disconnected"; }
}

async function agentHealth(url: string, publicProfile: boolean, headers?: HeadersInit): Promise<{ agentRuntime: NativeConnectionStatus; ollama: NativeConnectionStatus }> {
  try {
    const r = await fetch(url, { headers, redirect: publicProfile ? "manual" : "follow", signal: AbortSignal.timeout(4000) });
    const agentRuntime = classifyHealthResponse(r.status, r.headers.get("content-type"), publicProfile);
    if (agentRuntime !== "connected") return { agentRuntime, ollama: agentRuntime === "sign_in_required" ? "sign_in_required" : "disconnected" };
    const body = await r.json() as { nodes?: Array<{ healthy?: boolean }> };
    return {
      agentRuntime,
      // Remote Desktop intentionally has no direct Ollama URL.  The agent
      // runtime owns model routing, so show its reported healthy inference
      // nodes rather than probing an inaccessible private address.
      ollama: Array.isArray(body.nodes) && body.nodes.some((node) => node.healthy === true) ? "connected" : "disconnected",
    };
  } catch {
    return { agentRuntime: "disconnected", ollama: "disconnected" };
  }
}

async function check(config: ConfigStore): Promise<HealthStatus> {
  const { agentRuntime, mempalace } = config.getUrls();
  const isPublicProfile = agentRuntime.startsWith(MEMEX_PUBLIC_ORIGIN);
  const headers = isPublicProfile ? await publicSessionHeaders() : undefined;
  const [runtimeHealth, mp] = await Promise.all([
    // Both local and hosted deployments expose their model-node registry via
    // the harness. This is the authoritative model-health signal; a desktop
    // process cannot reliably reach Docker's internal Ollama listener.
    agentHealth(`${agentRuntime}/api/v1/health/nodes`, isPublicProfile, headers),
    // MemPalace has no public /health endpoint. Its documented, used-in-
    // production contract is POST /v1/memories/search, not GET /v1/memories.
    isPublicProfile
      ? probe(`${mempalace}/v1/memories/search`, true, headers, {
          method: "POST",
          headers: { ...(headers ?? {}), "Content-Type": "application/json" },
          body: JSON.stringify({ query: "healthcheck", limit: 1 }),
        })
      : probe(`${mempalace}/health`, false),
  ]);
  return {
    agentRuntime: runtimeHealth.agentRuntime,
    mempalace:    mp,
    ollama:       runtimeHealth.ollama,
    checkedAt:    new Date().toISOString(),
  };
}

export function startHealthLoop(config: ConfigStore, getMain: () => BrowserWindow | null): void {
  if (timer) clearInterval(timer);
  const tick = async () => {
    lastStatus = await check(config);
    getMain()?.webContents.send("health:status", lastStatus);
  };
  tick();
  timer = setInterval(tick, 30_000);
}

export function registerHealthIpc(config: ConfigStore, getMain: () => BrowserWindow | null): void {
  ipcMain.handle("health:check", async () => {
    lastStatus = await check(config);
    getMain()?.webContents.send("health:status", lastStatus);
    return lastStatus;
  });
  ipcMain.handle("health:getLast", () => lastStatus);
}
