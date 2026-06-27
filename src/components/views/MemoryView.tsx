/**
 * MemoryView — search, inspect, delete, and pin memories in MemPalace.
 * Accessible via the "memory" tab (future) or as a panel in SettingsView.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { desktop } from "../../lib/desktop";

// ---------------------------------------------------------------------------
// Types (matches MemPalace API)
// ---------------------------------------------------------------------------
interface MemRecord {
  id:           string;
  content:      string;
  score?:       number;
  memory_type?: string;
  domain?:      string;
  metadata?:    Record<string, string | number | boolean>;
  created_at?:  string;
  pinned?:      boolean;
}

interface MemStats {
  total:     number;
  breakdown: Array<{ type: string; domain: string; count: number }>;
}

// ---------------------------------------------------------------------------
// MemPalace fetch helpers — all go directly to the active profile URL
// ---------------------------------------------------------------------------
async function mpFetch(bridge: NonNullable<ReturnType<typeof desktop>>, path: string, init?: RequestInit) {
  const urls = await bridge.config.getUrls();
  const base = urls.mempalace ?? "http://localhost:8200";
  return fetch(`${base}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MemoryView() {
  const bridge = desktop();
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<MemRecord[]>([]);
  const [selected, setSelected] = useState<MemRecord | null>(null);
  const [status,   setStatus]   = useState<"idle" | "loading" | "error">("idle");
  const [msg,      setMsg]      = useState<string | null>(null);
  const [stats,    setStats]    = useState<MemStats | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    if (!bridge) return;
    setStatus("loading");
    setMsg(null);
    setSearched(true);
    try {
      const res = await mpFetch(bridge, "/v1/memories/search", {
        method: "POST",
        body: JSON.stringify({ query: q || "*", limit: 30 }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr: MemRecord[] = Array.isArray(data) ? data : (data.results ?? []);
      // MemPalace stores the "pinned" flag inside metadata.
      setResults(arr.map((m) => ({ ...m, pinned: !!(m.metadata && (m.metadata as Record<string, unknown>).pinned) })));
      setStatus("idle");
    } catch (e: any) {
      setStatus("error");
      setMsg(e?.name === "TimeoutError" || e?.name === "AbortError"
        ? "Search timed out — MemPalace's embedding backend may be down."
        : `Search failed: ${e.message}`);
    }
  }, [bridge]);

  // Load the (fast, GET) stats overview on mount. Search is explicit so a slow
  // embedding backend doesn't stall every open.
  const loadStats = useCallback(async () => {
    if (!bridge) return;
    try {
      const res = await mpFetch(bridge, "/v1/memories/stats", { signal: AbortSignal.timeout(6000) });
      if (res.ok) setStats(await res.json());
    } catch { /* stats are best-effort */ }
  }, [bridge]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const deleteMemory = async (id: string) => {
    if (!bridge) return;
    try {
      await mpFetch(bridge, `/v1/memories/${id}`, { method: "DELETE" });
      setResults((r) => r.filter((m) => m.id !== id));
      if (selected?.id === id) setSelected(null);
      setMsg("Memory deleted");
    } catch (e: any) { setMsg(`Delete failed: ${e.message}`); }
  };

  const pinMemory = async (rec: MemRecord) => {
    if (!bridge) return;
    try {
      const pinned = !rec.pinned;
      await mpFetch(bridge, `/v1/memories/${rec.id}`, {
        method: "PATCH",
        body: JSON.stringify({ metadata: { ...rec.metadata, pinned } }),
      });
      setResults((r) => r.map((m) => m.id === rec.id ? { ...m, pinned } : m));
      if (selected?.id === rec.id) setSelected((s) => s ? { ...s, pinned } : s);
      setMsg(pinned ? "Memory pinned" : "Memory unpinned");
    } catch (e: any) { setMsg(`Pin failed: ${e.message}`); }
  };

  if (!bridge) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        Memory management is only available in Memex Desktop.
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: search + list */}
      <div className="w-80 flex flex-col border-r border-border/40 flex-shrink-0">
        <div className="p-3 border-b border-border/40">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(query)}
              placeholder="Search memories…"
              className="flex-1 px-3 py-1.5 text-sm bg-surface2 rounded-xl border border-border/60 text-text
                focus:outline-none focus:ring-1 focus:ring-accent/60 placeholder-muted"
            />
            <button
              onClick={() => search(query)}
              disabled={status === "loading"}
              className="px-3 py-1.5 text-xs rounded-xl bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
            >Search</button>
          </div>
        </div>

        {stats && (
          <div className="px-3 py-2 border-b border-border/40 text-[10px] text-muted">
            <span className="text-text/70 font-medium">{stats.total.toLocaleString()}</span> memories
            {stats.breakdown?.length > 0 && (
              <> · {[...stats.breakdown].sort((a, b) => b.count - a.count).slice(0, 3)
                .map((b) => `${b.domain} (${b.count})`).join(" · ")}</>
            )}
          </div>
        )}

        {msg && status !== "error" && (
          <div className="px-3 py-1.5 text-xs text-muted border-b border-border/40 bg-surface2/40 flex justify-between">
            <span>{msg}</span>
            <button onClick={() => setMsg(null)} className="text-muted hover:text-text">✕</button>
          </div>
        )}

        {status === "error" && (
          <div className="px-3 py-2 text-xs text-red-400 border-b border-border/40">{msg ?? "Search failed"}</div>
        )}

        <div className="flex-1 overflow-y-auto">
          {status === "loading" && (
            <div className="flex justify-center py-8 text-muted text-sm">Searching…</div>
          )}
          {results.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m)}
              className={`w-full text-left px-3 py-2.5 border-b border-border/20 transition-colors
                ${selected?.id === m.id ? "bg-accent/10 border-l-2 border-l-accent" : "hover:bg-surface2/40"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-text/80 line-clamp-2">{m.content}</div>
                  <div className="text-[10px] text-muted mt-0.5 flex gap-2">
                    {m.score !== undefined && <span>score: {m.score.toFixed(3)}</span>}
                    {m.pinned && <span className="text-accent">📌 pinned</span>}
                    {m.created_at && <span>{new Date(m.created_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {results.length === 0 && status === "idle" && (
            <p className="px-3 py-6 text-center text-xs text-muted">
              {searched ? "No memories found" : "Search to explore stored memories"}
            </p>
          )}
        </div>

        <div className="px-3 py-2 border-t border-border/40 text-[10px] text-muted">
          {results.length} result{results.length !== 1 ? "s" : ""} from MemPalace
        </div>
      </div>

      {/* Right: detail pane */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Memory detail</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => pinMemory(selected)}
                title={selected.pinned ? "Unpin" : "Pin"}
                className="p-1 rounded hover:bg-surface2/60 text-sm"
              >{selected.pinned ? "📌" : "📍"}</button>
              <button
                onClick={() => deleteMemory(selected.id)}
                title="Delete memory"
                className="p-1 rounded hover:bg-red/10 text-red-400 text-xs"
              >Delete</button>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-text p-0.5">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2 2l8 8M10 2L2 10" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Content</div>
              <p className="text-sm text-text/90 leading-relaxed whitespace-pre-wrap">{selected.content}</p>
            </div>

            {selected.metadata && Object.keys(selected.metadata).length > 0 && (
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Metadata</div>
                <div className="space-y-1">
                  {Object.entries(selected.metadata).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="text-muted min-w-[100px] font-mono">{k}</span>
                      <span className="text-text/80">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] text-muted uppercase tracking-wide mb-1">ID</div>
              <code className="text-[10px] font-mono text-text/50 break-all">{selected.id}</code>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">
          Select a memory to inspect
        </div>
      )}
    </div>
  );
}
