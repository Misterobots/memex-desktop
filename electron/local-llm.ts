import { totalmem } from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface LocalServiceStatus { url: string; reachable: boolean; }
export interface LocalGpu { name: string; vramGb: number; }
export interface LocalModelRecommendation { model: string; label: string; reason: string; }
export interface LocalLlmInspection {
  systemRamGb: number;
  gpus: LocalGpu[];
  ollama: LocalServiceStatus & { models: string[] };
  openWebUi: LocalServiceStatus;
  comfyUi: LocalServiceStatus;
  harness: LocalServiceStatus;
  recommendations: LocalModelRecommendation[];
}

export const LOCAL_SERVICE_DEFAULTS = {
  ollama: "http://127.0.0.1:11434", openWebUi: "http://127.0.0.1:3000",
  comfyUi: "http://127.0.0.1:8188", harness: "http://127.0.0.1:8008", mempalace: "http://127.0.0.1:8200",
} as const;

export function recommendLocalModels(gpus: LocalGpu[], systemRamGb: number): LocalModelRecommendation[] {
  const vramGb = Math.max(0, ...gpus.map((gpu) => gpu.vramGb));
  if (vramGb >= 16) return [
    { model: "qwen3:14b", label: "Best local balance", reason: "Fits a 16 GB GPU well and is strong for general work and coding." },
    { model: "qwen3:8b", label: "Faster option", reason: "Leaves more VRAM headroom for image tools and concurrent desktop work." },
  ];
  if (vramGb >= 10) return [
    { model: "qwen3:8b", label: "Recommended", reason: "Good quality and responsive generation within this GPU tier." },
    { model: "gemma4:e4b", label: "Lightweight option", reason: "Useful when you want maximum headroom for image generation." },
  ];
  if (vramGb >= 6 || systemRamGb >= 24) return [
    { model: "qwen3:8b", label: "Recommended", reason: "A practical local model when GPU memory is limited or CPU offload is available." },
    { model: "gemma4:e4b", label: "Fastest option", reason: "Smaller local model for modest hardware." },
  ];
  return [
    { model: "gemma4:e4b", label: "Recommended", reason: "Small enough to be usable on entry-level local hardware." },
    { model: "qwen3:8b", label: "Try with caution", reason: "May require substantial CPU/RAM offload and respond slowly." },
  ];
}

async function reachable(url: string, path: string): Promise<boolean> {
  try { return (await fetch(`${url}${path}`, { signal: AbortSignal.timeout(2_500) })).ok; } catch { return false; }
}

async function detectGpus(): Promise<LocalGpu[]> {
  if (process.platform !== "win32") return [];
  try {
    const command = "Get-CimInstance Win32_VideoController | Select-Object Name,@{N='VramGb';E={[math]::Round($_.AdapterRAM / 1GB,1)}} | ConvertTo-Json -Compress";
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { timeout: 4_000 });
    const raw = JSON.parse(stdout) as Array<{ Name?: string; VramGb?: number }> | { Name?: string; VramGb?: number };
    return (Array.isArray(raw) ? raw : [raw]).filter((gpu) => typeof gpu.Name === "string" && typeof gpu.VramGb === "number")
      .map((gpu) => ({ name: gpu.Name!, vramGb: gpu.VramGb! }));
  } catch { return []; }
}

export async function inspectLocalLlm(): Promise<LocalLlmInspection> {
  const [gpus, ollamaReachable, openWebUiReachable, comfyUiReachable, harnessReachable] = await Promise.all([
    detectGpus(), reachable(LOCAL_SERVICE_DEFAULTS.ollama, "/api/tags"), reachable(LOCAL_SERVICE_DEFAULTS.openWebUi, "/api/config"),
    reachable(LOCAL_SERVICE_DEFAULTS.comfyUi, "/system_stats"), reachable(LOCAL_SERVICE_DEFAULTS.harness, "/api/v1/health/nodes"),
  ]);
  let models: string[] = [];
  if (ollamaReachable) try {
    const body = await (await fetch(`${LOCAL_SERVICE_DEFAULTS.ollama}/api/tags`, { signal: AbortSignal.timeout(2_500) })).json() as { models?: Array<{ name?: string }> };
    models = (body.models ?? []).flatMap((model) => model.name ? [model.name] : []);
  } catch { /* A reachable Ollama service is still useful without a model list. */ }
  const systemRamGb = Math.round(totalmem() / 1024 ** 3);
  return {
    systemRamGb, gpus, ollama: { url: LOCAL_SERVICE_DEFAULTS.ollama, reachable: ollamaReachable, models },
    openWebUi: { url: LOCAL_SERVICE_DEFAULTS.openWebUi, reachable: openWebUiReachable },
    comfyUi: { url: LOCAL_SERVICE_DEFAULTS.comfyUi, reachable: comfyUiReachable },
    harness: { url: LOCAL_SERVICE_DEFAULTS.harness, reachable: harnessReachable },
    recommendations: recommendLocalModels(gpus, systemRamGb),
  };
}

export function normalizeLocalEndpoint(raw: string): string {
  const parsed = new URL(raw.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Local service URLs must use http or https");
  return parsed.origin;
}
