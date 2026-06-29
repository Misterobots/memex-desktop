import { useCallback, useEffect, useRef, useState } from "react";
import { desktop, type OllamaModel } from "../../lib/desktop";
import { fetchOllamaModels } from "../../lib/memex-client";
import { useStore } from "../../lib/store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shortName(model: string): string {
  // "qwen3-coder:30b" → "qwen3-coder 30b"
  return model.replace(":", " ");
}

function sizeLabel(gb: number): string {
  return gb >= 1 ? `${gb}GB` : `${Math.round(gb * 1000)}MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ModelPickerPopover() {
  const { selectedModel, setSelectedModel, connections } = useStore();
  const bridge = desktop();

  const [open,   setOpen]   = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [query,  setQuery]  = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    // Desktop: Electron bridge. Web: same-origin /v1/models/ollama proxy.
    const list = bridge ? await bridge.ollama.listModels() : await fetchOllamaModels();
    setModels(list);
  }, [bridge]);

  // Reload when popover opens
  useEffect(() => { if (open) load(); }, [open, load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const ollamaOk = connections.ollama === "connected";

  const filtered = models.filter((m) =>
    !query || m.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors
          ${open ? "bg-surface2 text-text" : "text-muted hover:text-text hover:bg-surface2/60"}`}
        title="Select model"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ollamaOk ? "bg-green-400" : "bg-muted"}`} />
        <span className="font-mono max-w-[120px] truncate">{shortName(selectedModel)}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-72 bg-canvas border border-border/60 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Model</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border
              ${ollamaOk
                ? "text-green-400 border-green-400/30 bg-green-400/10"
                : "text-muted border-border/40"}`}>
              {ollamaOk ? "Ollama connected" : "Ollama offline"}
            </span>
          </div>

          <div className="p-2 border-b border-border/40">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter models…"
              autoFocus
              className="w-full px-3 py-1.5 text-xs bg-surface2 rounded-lg border border-border/60 text-text
                focus:outline-none focus:ring-1 focus:ring-accent/60 placeholder-muted"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted text-center">
                {query
                  ? "No models match"
                  : "No models available — type a model name manually below"}
              </p>
            )}
            {filtered.map((m) => (
              <button
                key={m.name}
                onClick={() => { setSelectedModel(m.name); setOpen(false); setQuery(""); }}
                className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 transition-colors
                  ${m.name === selectedModel ? "bg-accent/10 text-text" : "text-text/80 hover:bg-surface2/60"}`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono truncate">{m.name}</div>
                  <div className="text-[10px] text-muted truncate">
                    {[m.family, m.parameterSize].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m.sizeGb > 0 && (
                    <span className="text-[10px] text-muted">{sizeLabel(m.sizeGb)}</span>
                  )}
                  {m.name === selectedModel && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent">
                      <path d="M1.5 5l3 3 4-5" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Manual entry fallback */}
          <div className="p-2 border-t border-border/40">
            <div className="text-[10px] text-muted mb-1">Or type a model name directly:</div>
            <div className="flex gap-1.5">
              <input
                placeholder="model:tag"
                defaultValue={selectedModel}
                id="model-manual-input"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (v) { setSelectedModel(v); setOpen(false); }
                  }
                }}
                className="flex-1 px-2 py-1 text-xs bg-surface2 rounded-lg border border-border/60 text-text font-mono
                  focus:outline-none focus:ring-1 focus:ring-accent/60 placeholder-muted"
              />
              <button
                onClick={() => {
                  const el = document.getElementById("model-manual-input") as HTMLInputElement | null;
                  const v = el?.value.trim();
                  if (v) { setSelectedModel(v); setOpen(false); }
                }}
                className="px-2 py-1 text-xs rounded-lg bg-accent text-white hover:bg-accent/80"
              >Set</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
