import { totalmem } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { discoverEngines, type DiscoveryDeps, type EngineDiscovery } from "./engine-discovery";

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
  /** Installed / running / address / evidence per engine kind (engine-discovery.ts).
   * Additive to the status lines above: the wizard reads this for its engine panel and
   * for the run-style proposal, while `ollama`/`harness` keep their old meaning. */
  engines: EngineDiscovery[];
}

/** Addresses this app probes when the user has configured nothing. Memory is
 * deliberately absent: the one address that used to be here belonged to a specific
 * machine in a specific house, and every install that inherited it was told its
 * memory service was "disconnected" for a reason it could not see. An unconfigured
 * memory service is now written as an empty string and reported that way. */
export const LOCAL_SERVICE_DEFAULTS = {
  ollama: "http://[::1]:11434", openWebUi: "http://127.0.0.1:3000",
  comfyUi: "http://127.0.0.1:8188", harness: "http://[::1]:8008",
} as const;

export function recommendLocalModels(gpus: LocalGpu[], systemRamGb: number): LocalModelRecommendation[] {
  const vramGb = Math.max(0, ...gpus.map((gpu) => gpu.vramGb));
  const totalVram = gpus.reduce((sum, gpu) => sum + gpu.vramGb, 0);
  if (totalVram >= 24) return [
    { model: "qwen3.8:27b", label: "Best quality", reason: "Full 27B reasoning model for setups with 24 GB+ total VRAM across GPUs." },
    { model: "qwen3:14b", label: "Faster alternative", reason: "Strong general model that leaves headroom for concurrent image and coding tools." },
  ];
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

/** A GPU that was found but whose memory could not be established. Reported, never guessed. */
const VRAM_UNKNOWN_GB = 0;

/**
 * `Win32_VideoController.AdapterRAM` is a UInt32 that saturates at 4,294,967,295 bytes,
 * so every card of 4 GB or more used to read back as 4.0 GB — which placed a 24 GB card in
 * the entry-level recommendation tier. A saturated or missing value is now reported as
 * unknown instead of as a measurement.
 */
const WMI_ADAPTER_RAM_SATURATED = 4_294_967_295;

export type GpuRunner = (command: string, args: string[]) => Promise<string>;

/** `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` → "NVIDIA GeForce RTX 5060 Ti, 16311" */
export function parseNvidiaSmiCsv(stdout: string): LocalGpu[] {
  const gpus: LocalGpu[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const comma = line.lastIndexOf(",");
    if (comma < 0) continue;
    const name = line.slice(0, comma).trim();
    const mib = Number(line.slice(comma + 1).replace(/[^0-9.]/g, ""));
    if (!name || !Number.isFinite(mib) || mib <= 0) continue;
    gpus.push({ name, vramGb: Math.round((mib / 1024) * 10) / 10 });
  }
  return gpus;
}

/** Raw `Name,AdapterRAM` bytes — divided here so saturation is detectable. */
export function parseWmiGpus(stdout: string): LocalGpu[] {
  let raw: unknown;
  try { raw = JSON.parse(stdout); } catch { return []; }
  const rows = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<{ Name?: unknown; AdapterRAM?: unknown }>;
  return rows.flatMap((row) => {
    if (typeof row.Name !== "string") return [];
    const bytes = typeof row.AdapterRAM === "number" ? row.AdapterRAM : 0;
    if (bytes <= 0 || bytes >= WMI_ADAPTER_RAM_SATURATED) return [{ name: row.Name, vramGb: VRAM_UNKNOWN_GB }];
    return [{ name: row.Name, vramGb: Math.round((bytes / 1024 ** 3) * 10) / 10 }];
  });
}

/** `system_profiler SPDisplaysDataType -json`. Apple Silicon exposes no discrete VRAM field. */
export function parseSystemProfilerGpus(stdout: string): LocalGpu[] {
  let raw: unknown;
  try { raw = JSON.parse(stdout); } catch { return []; }
  const entries = (raw as { SPDisplaysDataType?: unknown })?.SPDisplaysDataType;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    const card = entry as { _name?: unknown; spdisplays_vram?: unknown };
    if (typeof card._name !== "string") return [];
    const size = /([0-9.]+)\s*(GB|MB)/i.exec(typeof card.spdisplays_vram === "string" ? card.spdisplays_vram : "");
    if (!size) return [{ name: card._name, vramGb: VRAM_UNKNOWN_GB }];
    const value = Number(size[1]);
    if (!Number.isFinite(value) || value <= 0) return [{ name: card._name, vramGb: VRAM_UNKNOWN_GB }];
    const vramGb = size[2].toUpperCase() === "MB" ? Math.round((value / 1024) * 10) / 10 : Math.round(value * 10) / 10;
    return [{ name: card._name, vramGb }];
  });
}

const NVIDIA_SMI_ARGS = ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"];
const WMI_COMMAND = "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress";

/** Ordered probes for a platform. A tool that reports real memory outranks one that can only report a saturated ceiling. */
export function gpuProbes(platform: NodeJS.Platform): Array<{ command: string; args: string[]; parse: (stdout: string) => LocalGpu[] }> {
  const nvidia = { command: "nvidia-smi", args: NVIDIA_SMI_ARGS, parse: parseNvidiaSmiCsv };
  const wmi    = { command: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", WMI_COMMAND], parse: parseWmiGpus };
  const mac    = { command: "system_profiler", args: ["SPDisplaysDataType", "-json"], parse: parseSystemProfilerGpus };
  if (platform === "darwin") return [mac, nvidia];
  if (platform === "win32")  return [nvidia, wmi];
  return [nvidia];
}

export async function detectGpusWith(platform: NodeJS.Platform, run: GpuRunner): Promise<LocalGpu[]> {
  for (const probe of gpuProbes(platform)) {
    try {
      const gpus = probe.parse(await run(probe.command, probe.args));
      if (gpus.length) return gpus;
    } catch { /* tool absent or failed here — try the next probe */ }
  }
  return [];
}

async function detectGpus(): Promise<LocalGpu[]> {
  return detectGpusWith(process.platform, async (command, args) =>
    (await execFileAsync(command, args, { timeout: 4_000, windowsHide: true })).stdout);
}

/**
 * The one scan the wizard runs. `deps` is injected rather than built here because
 * `engine-discovery.ts` stays free of `fs` (and therefore testable); the real probes
 * come from `ipc-handlers.ts`, which is already the composition root.
 *
 * `configured` carries the addresses the routing table already names, so a lane the
 * user wrote by hand is probed where it actually lives instead of being reported
 * missing because this app only knew its own defaults.
 */
export async function inspectLocalLlm(
  deps: DiscoveryDeps,
  configured: { ollama?: string[]; llamaCpp?: string[] } = {},
): Promise<LocalLlmInspection> {
  const [gpus, engines, openWebUiReachable, comfyUiReachable, harnessReachable] = await Promise.all([
    detectGpus(),
    discoverEngines({ ollama: { configuredUrls: configured.ollama }, llamaCpp: { configuredUrls: configured.llamaCpp } }, deps),
    reachable(LOCAL_SERVICE_DEFAULTS.openWebUi, "/api/config"),
    reachable(LOCAL_SERVICE_DEFAULTS.comfyUi, "/system_stats"), reachable(LOCAL_SERVICE_DEFAULTS.harness, "/api/v1/health/nodes"),
  ]);
  const ollama = engines.find((engine) => engine.kind === "ollama");
  const systemRamGb = Math.round(totalmem() / 1024 ** 3);
  return {
    systemRamGb, gpus, engines,
    // Same three fields as before, now answered by discovery: the address is the one
    // actually reached (or the one Ollama would use), not the one this file guessed.
    ollama: { url: ollama?.baseUrl ?? LOCAL_SERVICE_DEFAULTS.ollama, reachable: ollama?.running === true, models: ollama?.models ?? [] },
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
