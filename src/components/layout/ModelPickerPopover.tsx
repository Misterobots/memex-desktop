import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api-fetch";
import { desktop, type RuntimeProfile } from "../../lib/desktop";
import { getAgentRuntime } from "../../lib/runtime-urls";
import { useStore } from "../../lib/store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shortName(model: string): string {
  // "qwen3-coder:30b" → "qwen3-coder 30b"
  return model.replace(":", " ");
}

type CatalogModel = {
  id: string;
  label?: string;
  description?: string;
  owned_by?: string;
  available?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ModelPickerPopover() {
  const { selectedModel, setSelectedModel } = useStore();

  const [open,   setOpen]   = useState(false);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessResolved, setAccessResolved] = useState(false);
  const [query,  setQuery]  = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Model choice follows the routing profile.  A remote profile might favour a
  // responsive hosted default while a LAN profile can retain a larger local
  // model; switching profiles must never silently carry the prior choice over.
  useEffect(() => {
    const bridge = desktop();
    if (!bridge) return;
    let alive = true;
    const applyProfile = async (raw: unknown) => {
      const profile = raw as RuntimeProfile;
      if (!alive || !profile?.id) return;
      const model = profile.defaultModel || useStore.getState().selectedModel;
      if (model !== useStore.getState().selectedModel) setSelectedModel(model);
      // Upgrade older profiles lazily so their current explicit selection is
      // captured once and becomes independent of other profiles thereafter.
      if (!profile.defaultModel) {
        await bridge.config.save({ ...profile, defaultModel: model });
      }
    };
    void bridge.config.getActive().then(applyProfile).catch(() => {});
    return bridge.config.onChange((profile) => { void applyProfile(profile); });
  }, [setSelectedModel]);

  useEffect(() => {
    let alive = true;
    apiFetch(`${getAgentRuntime()}/api/v1/identity`, { signal: AbortSignal.timeout(6000) })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!alive) return;
        const level = String(data?.caller_identity?.security_level ?? "").toUpperCase();
        setIsAdmin(level === "L3_ADMIN" || level === "L4_SYSTEM");
      })
      .catch(() => { if (alive) setIsAdmin(false); })
      .finally(() => { if (alive) setAccessResolved(true); });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    const response = await apiFetch(`${getAgentRuntime()}/v1/models`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const data = await response.json();
    setModels(Array.isArray(data?.data) ? data.data : []);
  }, [isAdmin]);

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

  const filtered = models.filter((m) =>
    !query || `${m.label ?? ""} ${m.id}`.toLowerCase().includes(query.toLowerCase())
  );

  const chooseModel = async (model: string) => {
    setSelectedModel(model);
    const bridge = desktop();
    if (bridge) {
      try {
        const profile = await bridge.config.getActive();
        await bridge.config.save({ ...profile, defaultModel: model });
      } catch {
        // The local store is still persisted, so selection remains stable even
        // if the native profile write is temporarily unavailable.
      }
    }
    setOpen(false);
    setQuery("");
  };

  if (!accessResolved || !isAdmin) {
    return <span className="px-2 py-1 text-xs text-muted" title="Memex selects the approved default model">Memex default</span>;
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors
          ${open ? "bg-surface2 text-text" : "text-muted hover:text-text hover:bg-surface2/60"}`}
        title="Select model"
      >
        <span className="font-mono max-w-[120px] truncate">{shortName(selectedModel)}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-72 bg-canvas border border-border/60 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border/40">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Model</span>
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
                  : "No models available"}
              </p>
            )}
            {filtered.map((m) => (
              <button
                key={m.id}
                disabled={m.available === false}
                onClick={() => { void chooseModel(m.id); }}
                className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 transition-colors disabled:opacity-45 disabled:cursor-not-allowed
                  ${m.id === selectedModel ? "bg-accent/10 text-text" : "text-text/80 hover:bg-surface2/60"}`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{m.label ?? m.id}</div>
                  <div className="text-[10px] text-muted truncate">
                    {m.description ?? m.id}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m.available === false && <span className="text-[10px] text-muted">Setup required</span>}
                  {m.id === selectedModel && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent">
                      <path d="M1.5 5l3 3 4-5" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
