/**
 * Token helpers — format counts and resolve a model's context window.
 * Context windows are read live from Ollama (/api/show) and cached per model.
 */
import { desktop } from "./desktop";
import { getOllama } from "./runtime-urls";

const windowCache = new Map<string, number | null>();

/** Compact token count: 1234 → "1.2k", 2_000_000 → "2M". */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

/** Model's max context window in tokens, or null if unknown. Cached per model. */
export async function contextWindowFor(model: string): Promise<number | null> {
  if (windowCache.has(model)) return windowCache.get(model)!;
  let win: number | null = null;
  const b = desktop();
  if (b?.ollama?.contextLength) {
    try { win = await b.ollama.contextLength(model); } catch { win = null; }
  } else {
    // Web: ask Ollama directly via the same-origin /ollama proxy. The context
    // length lives under an architecture-prefixed key (e.g. "qwen3.context_length").
    try {
      const r = await fetch(`${getOllama()}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const data = await r.json();
        const info: Record<string, unknown> = data?.model_info ?? {};
        const key = Object.keys(info).find((k) => k.endsWith(".context_length"));
        if (key && typeof info[key] === "number") win = info[key] as number;
      }
    } catch { win = null; }
  }
  windowCache.set(model, win);
  return win;
}
