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

async function probe(url: string, headers?: HeadersInit): Promise<boolean> {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch { return false; }
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
  const [ar, mp, ol] = await Promise.all([
    // The public reverse proxy exposes the actual agent health endpoint. The
    // old root probe only saw Authentik redirects and therefore reported a
    // healthy signed-in remote service as unreachable.
    probe(isPublicProfile ? `${agentRuntime}/api/v1/health/nodes` : `${agentRuntime}/`, headers),
    // The Next proxy routes /v1/memories to Hopper's MemPalace internally.
    // There is no public /health route for Hopper by design.
    probe(isPublicProfile ? `${mempalace}/v1/memories?limit=1` : `${mempalace}/health`, headers),
    isPublicProfile ? Promise.resolve(false) : probe(`${ollama}/api/version`),
  ]);
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
