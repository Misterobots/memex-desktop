/** Native health loop — probes all three endpoints, pushes health:status to renderer. */
import { ipcMain, BrowserWindow } from "electron";
import type { ConfigStore } from "./config-store";
import { classifyHealthResponse, type NativeConnectionStatus } from "./health-status";

export interface HealthStatus {
  agentRuntime: NativeConnectionStatus;
  mempalace:    NativeConnectionStatus;
  ollama:       NativeConnectionStatus;
  checkedAt:    string;
}

let timer:      ReturnType<typeof setInterval> | null = null;
let lastStatus: HealthStatus | null = null;

async function probe(url: string): Promise<NativeConnectionStatus> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return classifyHealthResponse(r.status);
  } catch { return "disconnected"; }
}

async function agentHealth(url: string): Promise<{ agentRuntime: NativeConnectionStatus; ollama: NativeConnectionStatus }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const agentRuntime = classifyHealthResponse(r.status);
    if (agentRuntime !== "connected") return { agentRuntime, ollama: "disconnected" };
    const body = await r.json() as { nodes?: Array<{ healthy?: boolean }> };
    return {
      agentRuntime,
      // The harness owns model routing, so show the inference nodes it reports
      // as healthy rather than probing a Docker-internal Ollama address a
      // desktop process cannot reliably reach.
      ollama: Array.isArray(body.nodes) && body.nodes.some((node) => node.healthy === true) ? "connected" : "disconnected",
    };
  } catch {
    return { agentRuntime: "disconnected", ollama: "disconnected" };
  }
}

async function check(config: ConfigStore): Promise<HealthStatus> {
  const { agentRuntime, mempalace } = config.getUrls();
  const [runtimeHealth, mp] = await Promise.all([
    // The harness reports its model-node registry; this is the authoritative
    // model-health signal for the active profile.
    agentHealth(`${agentRuntime}/api/v1/health/nodes`),
    probe(`${mempalace}/health`),
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
