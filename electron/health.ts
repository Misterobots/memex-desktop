/** Native health loop — probes all three endpoints, pushes health:status to renderer. */
import { ipcMain, BrowserWindow, session } from "electron";
import type { ConfigStore } from "./config-store";
import { MEMEX_PUBLIC_ORIGIN } from "./remote-auth";

export interface HealthStatus {
  agentRuntime: "connected" | "disconnected";
  mempalace:    "connected" | "disconnected";
  ollama:       "connected" | "disconnected";
  checkedAt:    string;
}

let timer:      ReturnType<typeof setInterval> | null = null;
let lastStatus: HealthStatus | null = null;

async function probe(url: string, headers?: HeadersInit, init?: RequestInit): Promise<boolean> {
  try {
    const r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch { return false; }
}

async function publicAgentHealth(url: string, headers: HeadersInit): Promise<{ agentRuntime: boolean; ollama: boolean }> {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return { agentRuntime: false, ollama: false };
    const body = await r.json() as { nodes?: Array<{ healthy?: boolean }> };
    return {
      agentRuntime: true,
      // Remote Desktop intentionally has no direct Ollama URL.  The agent
      // runtime owns model routing, so show its reported healthy inference
      // nodes rather than probing an inaccessible private address.
      ollama: Array.isArray(body.nodes) && body.nodes.some((node) => node.healthy === true),
    };
  } catch {
    return { agentRuntime: false, ollama: false };
  }
}

/**
 * Node's fetch does not share Electron's browser cookie jar.  The public
 * profile is authenticated through Authentik in the sign-in BrowserWindow, so
 * copy its same-site cookies into the native health probes explicitly.
 */
async function publicSessionHeaders(): Promise<HeadersInit> {
  const cookies = await session.defaultSession.cookies.get({ url: MEMEX_PUBLIC_ORIGIN });
  return cookies.length ? { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } : {};
}

async function check(config: ConfigStore): Promise<HealthStatus> {
  const { agentRuntime, mempalace, ollama } = config.getUrls();
  const isPublicProfile = agentRuntime.startsWith(MEMEX_PUBLIC_ORIGIN);
  const headers = isPublicProfile ? await publicSessionHeaders() : undefined;
  const [publicHealth, mp, lanAr, lanOl] = await Promise.all([
    isPublicProfile
      ? publicAgentHealth(`${agentRuntime}/api/v1/health/nodes`, headers ?? {})
      : Promise.resolve({ agentRuntime: false, ollama: false }),
    // MemPalace has no public /health endpoint. Its documented, used-in-
    // production contract is POST /v1/memories/search, not GET /v1/memories.
    isPublicProfile
      ? probe(`${mempalace}/v1/memories/search`, headers, {
          method: "POST",
          headers: { ...(headers ?? {}), "Content-Type": "application/json" },
          body: JSON.stringify({ query: "healthcheck", limit: 1 }),
        })
      : probe(`${mempalace}/health`),
    isPublicProfile ? Promise.resolve(false) : probe(`${agentRuntime}/`),
    isPublicProfile ? Promise.resolve(false) : probe(`${ollama}/api/version`),
  ]);
  const ar = isPublicProfile ? publicHealth.agentRuntime : lanAr;
  const ol = isPublicProfile ? publicHealth.ollama : lanOl;
  return {
    agentRuntime: ar ? "connected" : "disconnected",
    mempalace:    mp ? "connected" : "disconnected",
    ollama:       ol ? "connected" : "disconnected",
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
