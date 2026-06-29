import { getAgentRuntime, getMempalace } from "./runtime-urls";
import type { OllamaModel } from "./desktop";

// Re-exported for any legacy imports still using these constants.
// Prefer getAgentRuntime() / getMempalace() for fresh requests.
export { getAgentRuntime as AGENT_RUNTIME_FN, getMempalace as MEMPALACE_FN };

export async function checkHealth(): Promise<{
  agentRuntime: boolean;
  mempalace: boolean;
  ollama: boolean;
}> {
  const ar = getAgentRuntime();
  const mp = getMempalace();

  // agent_runtime liveness AND Ollama node health both come from one endpoint —
  // a real probe (not the SPA root), so the badge reflects the actual backend.
  let agentRuntime = false;
  let ollama = false;
  try {
    const r = await fetch(`${ar}/api/v1/health/nodes`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      agentRuntime = true;
      const data = await r.json();
      ollama = Array.isArray(data.nodes) && data.nodes.some((n: any) => n?.healthy);
    }
  } catch {}

  let mempalace = false;
  try {
    const r = await fetch(`${mp}/health`, { signal: AbortSignal.timeout(3000) });
    mempalace = r.ok;
  } catch {}

  return { agentRuntime, mempalace, ollama };
}

export async function listModels(): Promise<string[]> {
  try {
    const r = await fetch(`${getAgentRuntime()}/v1/models/ollama`);
    const data = await r.json();
    const models = data.models ?? data;
    return models.map((m: any) => m.name ?? m.id ?? String(m));
  } catch {
    return [];
  }
}

/**
 * Rich model list for the model picker — works in web (same-origin /v1/models/ollama
 * proxy) and desktop alike. Maps the agent_runtime registry response (name, vram_gb,
 * tier, …) to the OllamaModel shape the picker renders. The endpoint already filters
 * to pulled, role-assignable models, so everything returned is actually runnable.
 */
export async function fetchOllamaModels(): Promise<OllamaModel[]> {
  try {
    const r = await fetch(`${getAgentRuntime()}/v1/models/ollama`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    const raw: any[] = Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
        ? data
        : [];
    return raw.map((m: any): OllamaModel => {
      const name: string = m.name ?? m.id ?? String(m);
      const tag = name.includes(":") ? name.split(":")[1] : "";
      return {
        name,
        parameterSize: m.parameterSize ?? tag ?? "",
        family: m.family ?? m.tier ?? "",
        sizeGb: m.sizeGb ?? m.vram_gb ?? 0,
        modifiedAt: m.modifiedAt ?? "",
      };
    });
  } catch {
    return [];
  }
}

export async function recallMemory(query: string, limit = 5): Promise<string[]> {
  try {
    const r = await fetch(`${getMempalace()}/v1/memories/search`, {
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
  await fetch(`${getMempalace()}/v1/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, memory_type: "semantic", domain: "general" }),
  });
}
