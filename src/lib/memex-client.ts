export const AGENT_RUNTIME = "http://192.168.2.101:8008";
export const MEMPALACE     = "http://192.168.2.102:8200";

export async function checkHealth(): Promise<{
  agentRuntime: boolean;
  mempalace: boolean;
  ollama: boolean;
}> {
  const check = async (url: string) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      return r.ok;
    } catch {
      return false;
    }
  };

  const [agentRuntime, mempalace] = await Promise.all([
    check(`${AGENT_RUNTIME}/`),
    check(`${MEMPALACE}/health`),
  ]);

  // Ollama reachable via agent_runtime health node endpoint
  let ollama = false;
  try {
    const r = await fetch(`${AGENT_RUNTIME}/api/v1/health/nodes`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const data = await r.json();
      ollama = Array.isArray(data.nodes) && data.nodes.length > 0;
    }
  } catch {}

  return { agentRuntime, mempalace, ollama };
}

export async function listModels(): Promise<string[]> {
  try {
    const r = await fetch(`${AGENT_RUNTIME}/v1/models/ollama`);
    const data = await r.json();
    const models = data.models ?? data;
    return models.map((m: any) => m.name ?? m.id ?? String(m));
  } catch {
    return [];
  }
}

export async function recallMemory(query: string, limit = 5): Promise<string[]> {
  try {
    const r = await fetch(`${MEMPALACE}/v1/memories/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    const mems = await r.json();
    return mems.map((m: any) => m.content);
  } catch {
    return [];
  }
}

export async function storeMemory(content: string): Promise<void> {
  await fetch(`${MEMPALACE}/v1/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, memory_type: "semantic", domain: "general" }),
  });
}
