/**
 * Shared Friday CAD + print workflow client.
 *
 * Memex Desktop calls the same workstation bridge as Friday voice.  The
 * bridge owns OpenSCAD and printer credentials; this client never does.
 */
import { getAgentRuntime } from "./runtime-urls";
import { apiFetch } from "./api-fetch";

export type CadPart = {
  printable: boolean;
  quantity: number;
  material: string;
};

export type CadBridgeConfig = {
  /** A local URL is intentional: Electron runs on the CAD/printer workstation. */
  url: string;
  token: string;
};

function config(): CadBridgeConfig {
  // Runtime can proxy this in the future. Until then, a local bridge is the
  // safest default; no ambient credentials are sent to Agent_Swarm.
  return {
    url: localStorage.getItem("memex.cadPrintBridgeUrl") || "http://127.0.0.1:8790",
    token: localStorage.getItem("memex.cadPrintBridgeToken") || "",
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, token } = config();
  const response = await apiFetch(`${url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error || `CAD bridge returned ${response.status}`);
  return data as T;
}

export function saveCadBridgeConfig(next: CadBridgeConfig): void {
  localStorage.setItem("memex.cadPrintBridgeUrl", next.url.replace(/\/$/, ""));
  localStorage.setItem("memex.cadPrintBridgeToken", next.token);
}

export const cadPrint = {
  health: () => call<{ ok: boolean; openscad_found: boolean; source_found: boolean }>("/health"),
  parts: () => call<{ ok: boolean; project: string; parts: Record<string, CadPart> }>("/cad/parts"),
  render: (part: string, format: "stl" | "3mf" = "3mf") =>
    call<{ ok: boolean; artifact?: { name: string; path: string; bytes: number; sha256: string }; error?: string }>("/cad/render", {
      method: "POST", body: JSON.stringify({ part, format }),
    }),
  artifacts: () => call<{ ok: boolean; artifacts: Array<{ name: string; path: string; bytes: number; sha256: string }> }>("/cad/artifacts"),
  printStatus: () => call<Record<string, unknown>>("/print/status"),
  printJobs: () => call<Record<string, unknown>>("/print/jobs"),
  preflight: (job_id: string) => call<Record<string, unknown>>("/print/preflight", { method: "POST", body: JSON.stringify({ job_id }) }),
  requestApproval: (job_id: string) => call<Record<string, unknown>>("/print/request-approval", { method: "POST", body: JSON.stringify({ job_id }) }),
  start: (job_id: string, approval_token: string) =>
    call<Record<string, unknown>>("/print/start", { method: "POST", body: JSON.stringify({ job_id, approval_token, confirmed: true }) }),
};

/** Future runtime-proxy base; retained to make the intended shared topology explicit. */
export const CAD_PRINT_RUNTIME_PROXY_BASE = `${getAgentRuntime()}/api/v1/cad-print`;
