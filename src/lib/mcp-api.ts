import { apiFetch } from "./api-fetch";
import { getAgentRuntime } from "./runtime-urls";

export type McpTransport = "http" | "sse" | "websocket" | "stdio" | "unknown";

export interface McpHealth {
  enabled?: boolean;
  server_name?: string;
  tools_registered?: number;
  resources_registered?: number;
  prompts_registered?: number;
  transports?: McpTransport[];
}

export interface McpServerDescriptor {
  name: string;
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
}

export interface McpClientConfig {
  servers: McpServerDescriptor[];
  resourcesSupported: boolean;
  promptsSupported: boolean;
}

function transportOf(value: unknown): McpTransport {
  if (value === "http" || value === "sse" || value === "websocket" || value === "stdio") return value;
  return "unknown";
}

/** Normalize the common MCP server-config shapes without trusting arbitrary fields. */
export function normalizeMcpClientConfig(raw: Record<string, unknown>): McpClientConfig {
  const source = raw.mcpServers && typeof raw.mcpServers === "object" ? raw.mcpServers : raw.servers;
  const capabilities = raw.capabilities && typeof raw.capabilities === "object" && !Array.isArray(raw.capabilities)
    ? raw.capabilities as Record<string, unknown>
    : {};
  const servers: McpServerDescriptor[] = [];
  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const [name, value] of Object.entries(source)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      const transport = transportOf(item.transport ?? (item.command ? "stdio" : item.url ? "http" : undefined));
      servers.push({
        name,
        transport,
        ...(typeof item.url === "string" ? { url: item.url } : {}),
        ...(typeof item.command === "string" ? { command: item.command } : {}),
        ...(Array.isArray(item.args) ? { args: item.args.filter((arg): arg is string => typeof arg === "string") } : {}),
      });
    }
  }
  return {
    servers,
    resourcesSupported: raw.resources === true || capabilities.resources === true,
    promptsSupported: raw.prompts === true || capabilities.prompts === true,
  };
}

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
