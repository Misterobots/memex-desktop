/**
 * Token helpers — format counts and resolve a model's context window.
 * Context windows are read live from Ollama (/api/show) and cached per model.
 */
import { desktop } from "./desktop";

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
  }
  windowCache.set(model, win);
  return win;
}
