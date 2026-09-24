import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api-fetch";
import { desktop, type RuntimeProfile, type LoadedOllamaModel } from "../../lib/desktop";
import { getAgentRuntime } from "../../lib/runtime-urls";
import { useStore } from "../../lib/store";
import { getMyPermissions } from "../../lib/user-permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shortName(model: string): string {
  // "qwen3-coder:30b" → "qwen3-coder 30b"
  return model.replace(":", " ");
}

function hostLabel(host?: string): string {
  if (!host) return "";
  if (host.includes("103")) return "Turing";
  if (host.includes("101") || host.includes("127.0.0.1") || host.includes("localhost")) return "Lovelace";
  return host.replace(/^https?:\/\//, "").split(":")[0];
}

function matchesModel(a: string, b: string): boolean {
  if (!a || !b) return false;
  const cleanA = a.replace(/^ollama\//, "").trim().toLowerCase();
  const cleanB = b.replace(/^ollama\//, "").trim().toLowerCase();
  if (cleanA === cleanB) return true;
  const baseA = cleanA.replace(/:latest$/, "");
  const baseB = cleanB.replace(/:latest$/, "");
  return baseA === baseB;
}

type CatalogModel = {
  id: string;
  label?: string;
  description?: string;
  owned_by?: string;
  available?: boolean;
  /** Which engine produced this row. Two engines can be live at once and can
   * hold the same tag, so the name alone does not identify the entry. */
  engineId?: string;
  engineLabel?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ModelPickerPopover() {
  const { selectedModel, setSelectedModel } = useStore();

  const [open,   setOpen]   = useState(false);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [canSelectModels, setCanSelectModels] = useState(false);
  const [accessResolved, setAccessResolved] = useState(false);
  const [query,  setQuery]  = useState("");
  const [loadedModels, setLoadedModels] = useState<LoadedOllamaModel[]>([]);
  const [unloading, setUnloading] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
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
    const checkAccess = async () => {
      const bridge = desktop();
      let isExternal = false;
      if (bridge) {
        try {
          const profile = await bridge.config.getActive();
          isExternal = profile?.providerType === "external";
        } catch {}
      }

      if (isExternal) {
        if (alive) {
          setCanSelectModels(true);
          setAccessResolved(true);
        }
        return;
      }

      getMyPermissions()
        .then((policy) => { if (alive) setCanSelectModels(Boolean(policy.features.model_selection)); })
        .catch(() => { if (alive) setCanSelectModels(false); })
        .finally(() => { if (alive) setAccessResolved(true); });
    };

    void checkAccess();

    const cleanup = desktop()?.config.onChange(() => {
      if (alive) void checkAccess();
    });

    return () => {
      alive = false;
      cleanup?.();
    };
  }, []);

  const load = useCallback(async () => {
    if (!canSelectModels) return;

    const bridge = desktop();
    let profile: RuntimeProfile | null = null;
    try {
      profile = bridge ? await bridge.config.getActive() : null;
    } catch {}
    const external = profile?.providerType === "external";

    // Desktop with a routing profile that runs local engines: the catalog is
    // those engines, resolved in the main process. The agent runtime is
    // deliberately not asked — it can be stopped while Ollama is up, and a picker
    // that went empty when that happened was the defect. An external provider
    // profile has no local engine to enumerate, so it keeps listing its
    // provider's models, exactly as before.
    const engines = bridge?.engines;
    if (engines && !external) {
      try {
        const descriptors = await engines.list();
        const perEngine = await Promise.all(descriptors.map(async (descriptor) => {
          try {
            return await engines.models(descriptor.id);
          } catch {
            return []; // one unanswerable engine must not empty the list
          }
        }));
        setModels(perEngine.flat().map((row) => ({
          id: row.model,
          engineId: row.engineId,
          engineLabel: row.engineLabel,
        })));
      } catch (e) {
        setModels([{ id: `Engine Error: ${e instanceof Error ? e.message : String(e)}`, label: "Error" }]);
      }
      return;
    }

    // No engine bridge (browser dev mode, or a preload older than the registry):
    // the runtime's list is all that is available, and it stays as it was.
    let url = `${getAgentRuntime()}/v1/models`;
    if (external) {
      let base = getAgentRuntime();
      if (base.endsWith("/")) base = base.slice(0, -1);
      if (base.endsWith("/v1")) url = `${base}/models`;
      else url = `${base}/v1/models`;
    }

    try {
      const response = await apiFetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        setModels([{ id: `Error ${response.status}: ${response.statusText}`, label: `Error ${response.status}` }]);
        return;
      }
      const data = await response.json();
      let mList = [];
      if (Array.isArray(data)) mList = data;
      else if (data && typeof data === "object") {
        if (Array.isArray(data.data)) mList = data.data;
        else if (Array.isArray(data.models)) mList = data.models;
      }

      if (mList.length === 0) {
        setModels([{ id: "Error: Unrecognized API response", label: "Error" }]);
      } else {
        setModels(mList);
      }
    } catch (e) {
      setModels([{ id: `Fetch Error: ${e instanceof Error ? e.message : String(e)}`, label: "Error" }]);
    }
  }, [canSelectModels]);

  const fetchLoadedModels = useCallback(async () => {
    const bridge = desktop();
    if (bridge?.ollama?.getLoadedModels) {
      try {
        const loaded = await bridge.ollama.getLoadedModels();
        setLoadedModels(loaded || []);
        return;
      } catch {
        setLoadedModels([]);
      }
    }
    // Fallback if running in web/browser mode
    try {
      const res = await fetch("http://localhost:11434/api/ps", { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string; model?: string; size: number; size_vram?: number; expires_at?: string }> };
        const list: LoadedOllamaModel[] = (data.models || []).map((m) => ({
          name: m.name,
          model: m.model ?? m.name,
          sizeGb: +((m.size || 0) / 1e9).toFixed(1),
          vramGb: +(((m.size_vram ?? m.size) || 0) / 1e9).toFixed(1),
          host: "http://localhost:11434",
          expiresAt: m.expires_at,
        }));
        setLoadedModels(list);
        return;
      }
    } catch {}
    setLoadedModels([]);
  }, []);

  const handleUnload = async (modelName?: string) => {
    const bridge = desktop();
    setUnloading(true);
    try {
      if (bridge?.ollama?.unloadModel) {
        await bridge.ollama.unloadModel(modelName);
      } else {
        const targets = modelName && modelName !== "all" ? [modelName] : loadedModels.map((m) => m.name);
        for (const t of targets) {
          await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: t, keep_alive: 0 }),
          });
        }
      }
      await fetchLoadedModels();
    } catch (e) {
      console.error("Failed to unload model:", e);
    } finally {
      setUnloading(false);
    }
  };

  const handlePreload = async (modelName: string) => {
    const bridge = desktop();
    setLoadingModel(true);
    try {
      if (bridge?.ollama?.loadModel) {
        await bridge.ollama.loadModel(modelName);
      } else {
        await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelName.replace(/^ollama\//, ""), prompt: "" }),
        });
      }
      await fetchLoadedModels();
    } catch (e) {
      console.error("Failed to load model:", e);
    } finally {
      setLoadingModel(false);
    }
  };

  // Reload catalog when popover opens
  useEffect(() => { if (open) load(); }, [open, load]);

  // Periodically check loaded models (every 10s idle, or every 3s when open)
  useEffect(() => {
    void fetchLoadedModels();
    const interval = setInterval(fetchLoadedModels, open ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [open, fetchLoadedModels]);

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
    !query || `${m.label ?? ""} ${m.id} ${m.engineLabel ?? ""}`.toLowerCase().includes(query.toLowerCase())
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

  if (!accessResolved || !canSelectModels) {
    return <span className="px-2 py-1 text-xs text-muted" title="Memex selects the approved default model">Memex default</span>;
  }

  const isSelectedLoaded = loadedModels.some((lm) => matchesModel(lm.name, selectedModel));
  const hasLoadedModels = loadedModels.length > 0;
  const totalVramGb = loadedModels.reduce((sum, m) => sum + (m.vramGb || m.sizeGb || 0), 0);

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors
          ${open ? "bg-surface2 text-text" : "text-muted hover:text-text hover:bg-surface2/60"}`}
        title={
          isSelectedLoaded
            ? `${shortName(selectedModel)} is resident in VRAM`
            : hasLoadedModels
            ? `${shortName(selectedModel)} (idle) — ${loadedModels.map((m) => shortName(m.name)).join(", ")} in VRAM`
            : `${shortName(selectedModel)} (idle)`
        }
      >
        {isSelectedLoaded && (
          <span className="relative flex h-2 w-2 flex-shrink-0" title={`${shortName(selectedModel)} is resident in VRAM`}>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        )}
        {!isSelectedLoaded && hasLoadedModels && (
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70 flex-shrink-0" title={`Selected model is idle (${loadedModels.length} background model${loadedModels.length > 1 ? "s" : ""} in VRAM)`} />
        )}
        <span className="font-mono max-w-[120px] truncate">{shortName(selectedModel)}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-80 bg-canvas border border-border/60 rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* VRAM Status Banner */}
          {hasLoadedModels ? (
            <div className="p-2.5 bg-emerald-500/5 border-b border-border/60">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[11px] font-semibold text-text uppercase tracking-wider">
                    In VRAM
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted bg-surface2 px-1.5 py-0.5 rounded border border-border/40">
                    {totalVramGb.toFixed(1)} GB
                  </span>
                  {loadedModels.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleUnload("all");
                      }}
                      disabled={unloading || loadingModel}
                      title="Unload all models from GPU memory"
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-colors disabled:opacity-50"
                    >
                      Unload all
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                {loadedModels.map((lm) => (
                  <div
                    key={lm.name}
                    className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg bg-surface2/70 border border-border/50 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="font-mono text-text font-medium text-[11px] truncate" title={lm.name}>
                        {shortName(lm.name)}
                      </span>
                      <span className="text-[10px] text-muted font-mono">
                        ({(lm.vramGb || lm.sizeGb).toFixed(1)} GB)
                      </span>
                      {lm.host && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-surface border border-border/40 text-muted/90 font-mono flex-shrink-0">
                          {hostLabel(lm.host)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleUnload(lm.name);
                      }}
                      disabled={unloading || loadingModel}
                      title={`Unload ${lm.name} and free VRAM`}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-red-400 hover:text-red-300 hover:bg-red-500/15 border border-red-500/25 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {unloading ? (
                        <span className="animate-spin text-[9px]">⏳</span>
                      ) : (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                          <line x1="12" y1="2" x2="12" y2="12"></line>
                        </svg>
                      )}
                      <span>Unload</span>
                    </button>
                  </div>
                ))}
              </div>

              {!isSelectedLoaded && (
                <div className="mt-2 pt-2 border-t border-border/40">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handlePreload(selectedModel);
                    }}
                    disabled={loadingModel || unloading}
                    className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-text text-[11px] font-medium transition-colors disabled:opacity-50"
                    title={`Pre-load ${shortName(selectedModel)} into GPU memory now`}
                  >
                    {loadingModel ? (
                      <>
                        <span className="animate-spin text-[10px]">⏳</span>
                        <span>Loading {shortName(selectedModel)} into VRAM…</span>
                      </>
                    ) : (
                      <>
                        <span className="text-accent font-bold text-xs">⚡</span>
                        <span>Pre-load <strong className="font-mono">{shortName(selectedModel)}</strong> to VRAM</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-2.5 border-b border-border/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted uppercase tracking-wide">Model</span>
                <span className="text-[10px] text-muted font-mono">VRAM idle</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handlePreload(selectedModel);
                }}
                disabled={loadingModel || unloading}
                className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/25 text-text text-[11px] font-medium transition-colors disabled:opacity-50"
              >
                {loadingModel ? (
                  <>
                    <span className="animate-spin text-[10px]">⏳</span>
                    <span>Loading {shortName(selectedModel)} into VRAM…</span>
                  </>
                ) : (
                  <>
                    <span className="text-accent text-xs">⚡</span>
                    <span>Pre-load <strong className="font-mono">{shortName(selectedModel)}</strong> to VRAM</span>
                  </>
                )}
              </button>
            </div>
          )}

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
            {filtered.map((m) => {
              const isLoaded = loadedModels.some((lm) => matchesModel(lm.name, m.id));
              return (
                <button
                  key={`${m.engineId ?? ""}:${m.id}`}
                  disabled={m.available === false}
                  onClick={() => { void chooseModel(m.id); }}
                  title={m.engineLabel ? `${m.id} — on ${m.engineLabel}` : m.id}
                  className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 transition-colors disabled:opacity-45 disabled:cursor-not-allowed
                    ${m.id === selectedModel ? "bg-accent/10 text-text" : "text-text/80 hover:bg-surface2/60"}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{m.label ?? m.id}</span>
                      {m.engineLabel && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-surface border border-border/40 text-muted/90 font-mono flex-shrink-0">
                          {m.engineLabel}
                        </span>
                      )}
                      {isLoaded && (
                        <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                          In VRAM
                        </span>
                      )}
                    </div>
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
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}
