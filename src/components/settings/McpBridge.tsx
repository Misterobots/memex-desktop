import { useEffect, useState } from "react";
import { getMcpClientConfig, getMcpHealth, normalizeMcpClientConfig, type McpHealth, type McpClientConfig } from "../../lib/mcp-api";

export function McpBridge() {
  const [health, setHealth] = useState<McpHealth | null>(null);
  const [config, setConfig] = useState<McpClientConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [nextHealth, nextConfig] = await Promise.all([getMcpHealth(), getMcpClientConfig()]);
    setHealth(nextHealth); setConfig(nextConfig ? normalizeMcpClientConfig(nextConfig) : null); setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">HTTP JSON-RPC bridge for MCP tools and skills.</p>
        <button onClick={() => void load()} className="text-xs px-2 py-1 rounded-lg border border-border/60 text-muted hover:text-text">Refresh</button>
      </div>
      {loading ? <p className="text-xs text-muted">Checking…</p> : health ? (
        <div className="rounded-lg border border-border/40 bg-surface2/30 px-3 py-2 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted">Status</span><span className={health.enabled ? "text-green" : "text-yellow"}>{health.enabled ? "Enabled" : "Disabled"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Server</span><span className="text-text">{health.server_name ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Tools</span><span className="text-text">{health.tools_registered ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-muted">Resources</span><span className="text-text">{health.resources_registered ?? (config?.resourcesSupported ? "supported" : 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Prompts</span><span className="text-text">{health.prompts_registered ?? (config?.promptsSupported ? "supported" : 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Transports</span><span className="text-text">{health.transports?.join(", ") || config?.servers.map((server) => server.transport).filter((value, index, list) => list.indexOf(value) === index).join(", ") || "—"}</span></div>
        </div>
      ) : <p className="text-xs text-muted">MCP bridge unavailable for the active profile.</p>}
      {config && <details className="text-xs"><summary className="cursor-pointer text-muted hover:text-text">View client configuration</summary><pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-canvas p-2 text-[10px] text-muted">{JSON.stringify(config, null, 2)}</pre></details>}
    </div>
  );
}
