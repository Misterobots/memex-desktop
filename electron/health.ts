/** Native health loop — probes all three endpoints, pushes health:status to renderer. */
import { ipcMain, BrowserWindow } from "electron";
import type { ConfigStore } from "./config-store";

export interface HealthStatus {
  agentRuntime: "connected" | "disconnected";
  mempalace:    "connected" | "disconnected";
  ollama:       "connected" | "disconnected";
  checkedAt:    string;
}

let timer:      ReturnType<typeof setInterval> | null = null;
let lastStatus: HealthStatus | null = null;

async function probe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch { return false; }
}

async function check(config: ConfigStore): Promise<HealthStatus> {
  const { agentRuntime, mempalace, ollama } = config.getUrls();
  const [ar, mp, ol] = await Promise.all([
    probe(`${agentRuntime}/`),
    probe(`${mempalace}/health`),
    probe(`${ollama}/api/version`),
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
