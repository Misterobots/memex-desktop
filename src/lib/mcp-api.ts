import { apiFetch } from "./api-fetch";
import { getAgentRuntime } from "./runtime-urls";

export interface McpHealth { enabled?: boolean; server_name?: string; tools_registered?: number; }

export async function getMcpHealth(): Promise<McpHealth | null> {
  try {
    const response = await apiFetch(`${getAgentRuntime()}/api/v1/mcp/health`, { signal: AbortSignal.timeout(8000) });
    return response.ok ? await response.json() as McpHealth : null;
  } catch { return null; }
}

export async function getMcpClientConfig(): Promise<Record<string, unknown> | null> {
  try {
    const response = await apiFetch(`${getAgentRuntime()}/api/v1/mcp/client-config`, { signal: AbortSignal.timeout(8000) });
    return response.ok ? await response.json() as Record<string, unknown> : null;
  } catch { return null; }
}