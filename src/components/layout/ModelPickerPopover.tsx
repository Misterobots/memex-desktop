import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api-fetch";
import { desktop, type CapabilityReport, type EngineModel, type RuntimeProfile, type LoadedOllamaModel } from "../../lib/desktop";
import { getAgentRuntime } from "../../lib/runtime-urls";
import { useStore } from "../../lib/store";
import { getMyPermissions } from "../../lib/user-permissions";
// Shared with the main process rather than mirrored: the picker must not hold its
// own idea of how a slot resolves. See the header of electron/routing-config.ts.
import { resolveRoute, DEFAULT_SLOT, type ResolvedRoute } from "../../../electron/routing-config";
// Also shared, for the same reason: the matrix is decided in main's module, and a
// renderer copy of it would be a second set of claims about what a model can do.
import { capabilityCacheKey, evaluateFeature, FEATURE_REQUIREMENTS, isUnverifiable } from "../../../electron/model-capabilities";

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

/** How much the picker actually knows about the model list it is holding.
 *
 * The reason this exists is that `models: []` on its own is ambiguous: it is what an
 * empty catalogue looks like *and* what "nobody has asked yet" looks like *and* what
 * "we asked and the lane would not answer" looks like. Rendering "no engine offers this
 * model" from any of the last two would be a new false statement of exactly the class
 * D4 was written to stop, so every claim that depends on absence reads this instead of
 * the array's length.
 *
 * `idle` nothing has been asked (the popover has never been opened);
 * `loading` an ask is in flight;
 * `loaded` every lane that was asked answered, so absence from the list is a fact;
 * `failed` at least one ask did not answer, so absence proves nothing.
 *
 * `failed` on a partly answered list is deliberate: one engine refusing to answer makes
 * the catalogue incomplete, and an incomplete catalogue may not be read as a closed one.
 */
type CatalogueState = "idle" | "loading" | "loaded" | "failed";

/** What was asked to produce the rows — the sentence naming an absence has to name its
 * source, and a provider's model list is not an engine's. */
type CatalogueSource = "engines" | "provider";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ModelPickerPopover() {
  const { selectedModel, setSelectedModel } = useStore();

  const [open,   setOpen]   = useState(false);
  const [models, setModels] = useState<CatalogModel[]>([]);
  /** D4's prerequisite: whether `models` may be read as a closed list at all. Set on
   * every path that writes `models`, and nowhere else. */
  const [catalogueState, setCatalogueState] = useState<CatalogueState>("idle");
  /** Which kind of source answered for the current rows, so an absence can be phrased
   * about the thing that was actually asked. */
  const [catalogueFrom, setCatalogueFrom] = useState<CatalogueSource | null>(null);
  const [canSelectModels, setCanSelectModels] = useState(false);
  const [accessResolved, setAccessResolved] = useState(false);
  const [query,  setQuery]  = useState("");
  const [loadedModels, setLoadedModels] = useState<LoadedOllamaModel[]>([]);
  const [unloading, setUnloading] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  // Why a pick did not reach config.json. Without this a refusal looks like success
  // and the choice quietly reverts on the next launch.
  const [writeNotice, setWriteNotice] = useState("");
  /** D4 — what the engine reported, keyed `engineId:model`. A row with no entry was
   * never probed, which is not the same as a row that passed: the mark is simply
   * absent, and `cannot verify` is reserved for an entry whose source is `unknown`. */
  const [capabilityReports, setCapabilityReports] = useState<Record<string, CapabilityReport>>({});
  /** The routing table's answer for the picker, plus the engine name it came from.
   * Stored together so the label can never describe a different table than the
   * model does. Null when there is no routing block to ask. */
  const [routed, setRouted] = useState<{ route: ResolvedRoute; engineLabel: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Model choice follows the routing profile — and, once there is a routing table,
  // the table: `routing.default` names the model, and the profile's own
  // `defaultModel` is the field it used to be decided from. Switching profiles must
  // never silently carry the prior choice over.
  useEffect(() => {
    const bridge = desktop();
    if (!bridge) return;
    let alive = true;
    const applyProfile = async (raw: unknown) => {
      const profile = raw as RuntimeProfile;
      if (!alive || !profile?.id) return;

      let resolved: { route: ResolvedRoute; engineLabel: string } | null = null;
      try {
        const state = bridge.routing ? await bridge.routing.get() : null;
        if (state && alive) {
          const route = resolveRoute(state.routing, DEFAULT_SLOT);
          const engineLabel = route.target
            ? (state.routing.engines[route.target.engine]?.label ?? route.target.engine)
            : "";
          resolved = route.target ? { route, engineLabel } : null;
        }
      } catch {
        resolved = null; // a routing table that cannot be read is the old state, not a reason to hide the picker
      }
      if (!alive) return;
      setRouted(resolved);

      const model = resolved?.route.target?.model || profile.defaultModel || useStore.getState().selectedModel;
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

      // The two branches below are two different facts, which is why they do not
      // share an outcome. Reaching this line means an *internal* profile — the
      // harness on the user's own box — so:
      //   · it answered: honour `model_selection`. An explicit false hides the
      //     picker exactly as before; a real deny must never be degraded into
      //     silence about a permission the runtime actually withheld.
      //   · it did not answer (stopped, unreachable, or it answered without a
      //     readable policy, which is what `getMyPermissions` throws on): allowed.
      //     Choosing a model here is a local act against the user's own engine, and
      //     a turn cannot be sent to a runtime that is not replying anyway — the
      //     dead orchestrator hiding a live local picker was the symptom that
      //     survived D1.
      // Only this entitlement, and only on internal profiles; every other feature
      // check in the app still reads the policy as authoritative.
      getMyPermissions()
        .then((policy) => { if (alive) setCanSelectModels(Boolean(policy.features.model_selection)); })
        .catch(() => { if (alive) setCanSelectModels(true); })
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

  /** D4 — ask the engine about each row once, after the list exists. Main caches per
   * `engineId:model`, so re-opening the picker costs nothing for rows already asked
   * about; a row whose engine stayed silent is stored as `unknown` and marked. */
  const probeCapabilities = useCallback(async (rows: EngineModel[]) => {
    const capabilities = desktop()?.engines?.capabilities;
    // No bridge method means a preload older than the matrix. Nothing is marked then,
    // which is deliberately different from marking every row as passing.
    if (!capabilities) return;
    const answers = await Promise.all(rows.map(async (row) => {
      try {
        const report = await capabilities({ id: row.engineId, model: row.model });
        return [capabilityCacheKey(row.engineId, row.model), report] as const;
      } catch {
        return null; // one row the main process could not ask about stays unmarked
      }
    }));
    const merged: Record<string, CapabilityReport> = {};
    for (const answer of answers) if (answer) merged[answer[0]] = answer[1];
    if (Object.keys(merged).length) {
      setCapabilityReports((current) => ({ ...current, ...merged }));
    }
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
      setCatalogueFrom("engines");
      setCatalogueState("loading");
      try {
        const descriptors = await engines.list();
        // A lane that would not answer leaves the list short by whatever it holds, and
        // "short" is not "complete": the flag below is what keeps an absent model from
        // being read as an unheld one.
        let unansweredLane = false;
        const perEngine = await Promise.all(descriptors.map(async (descriptor) => {
          try {
            return await engines.models(descriptor.id);
          } catch {
            unansweredLane = true;
            return []; // one unanswerable engine must not empty the list
          }
        }));
        const rows = perEngine.flat();
        setModels(rows.map((row) => ({
          id: row.model,
          engineId: row.engineId,
          engineLabel: row.engineLabel,
        })));
        setCatalogueState(unansweredLane ? "failed" : "loaded");
        void probeCapabilities(rows);
      } catch (e) {
        setModels([{ id: `Engine Error: ${e instanceof Error ? e.message : String(e)}`, label: "Error" }]);
        setCatalogueState("failed");
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

    setCatalogueFrom("provider");
    setCatalogueState("loading");
    try {
      const response = await apiFetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        setModels([{ id: `Error ${response.status}: ${response.statusText}`, label: `Error ${response.status}` }]);
        setCatalogueState("failed");
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
        // An answer that could not be read is not an empty catalogue: both would leave
        // `models` empty, and only one of them licenses a sentence about absence.
        setModels([{ id: "Error: Unrecognized API response", label: "Error" }]);
        setCatalogueState("failed");
      } else {
        setModels(mList);
        setCatalogueState("loaded");
      }
    } catch (e) {
      setModels([{ id: `Fetch Error: ${e instanceof Error ? e.message : String(e)}`, label: "Error" }]);
      setCatalogueState("failed");
    }
  }, [canSelectModels, probeCapabilities]);

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

  const chooseModel = async (model: string, engineId?: string) => {
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
      // The routing table — not the profile — is what this picker follows on the next
      // load, so a choice that never reaches config.json is silently reverted. In
      // "single" style every slot resolves to the engine's pin, so there the choice
      // *is* the pinned model. A refused write says so instead of looking accepted.
      let refused = false;
      try {
        const table = (await bridge.routing?.get?.())?.routing;
        const engine = engineId ?? table?.routing?.default?.engine ?? Object.keys(table?.engines ?? {})[0];
        if (table && engine && table.engines[engine]) {
          const target = { engine, model };
          const next = table.runStyle === "single"
            ? {
                ...table,
                engines: { ...table.engines, [engine]: { ...table.engines[engine], pinnedModel: model } },
                routing: { ...table.routing, default: target },
              }
            : { ...table, routing: { ...table.routing, default: target } };
          const result = await bridge.routing?.set?.(next);
          if (result && result.ok === false) {
            refused = true;
            setWriteNotice(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" · ")
              || "The routing table refused this model, so it will not survive a restart.");
          } else {
            setWriteNotice("");
          }
        }
      } catch {
        refused = true;
        setWriteNotice("The routing table could not be updated — this selection may not survive a restart.");
      }
      // Closing on a refusal would hide the only place the reason is shown.
      if (refused) return;
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

  // Which slot this model came from, spelled the way the user would edit it. Named
  // because a routing table can answer a slot with another slot's model, and the
  // picker showing that model without saying so is the silent substitution D2's
  // `resolveRoute` exists to make visible.
  const routingNote = routed?.route.slot ? `routed from routing.${routed.route.slot} on ${routed.engineLabel}` : "";

  // D4's assertion, read off the entry that answered. It is a claim about one
  // (engine, model) pair, so it can only be applied to the row that pair names:
  // spreading `routing.default`'s assertion across every pulled model would be a guess
  // about all of them, which is the thing the field exists to avoid.
  const assertedFor = routed?.route.target?.capabilities ?? null;
  const routedPair = routed?.route.target ? `${routed.route.target.engine}:${routed.route.target.model}` : "";
  const assertionFor = (engineId: string | undefined, model: string): string[] | null =>
    assertedFor && routedPair === `${engineId ?? ""}:${model}` ? assertedFor : null;

  /** The label D4 left unimplemented, and the reason `catalogueState` had to come first:
   * "no engine reports this model" is a claim about a *closed* list, and until the picker
   * could tell a closed list from an unread one it had no way to know which it was
   * holding. Suppressed for every state but `loaded`, including the case that reads as
   * empty — a catalogue nobody asked for yet, or one a lane refused to answer. */
  const inCatalogue = models.some((row) => matchesModel(row.id, selectedModel));
  const notOffered = catalogueState === "loaded" && !inCatalogue;
  const notOfferedNote = !notOffered ? "" :
    // Phrased about what was actually asked. `engines.list()` answers from the registry,
    // which is not the routing table — a box with lanes but no table would otherwise be
    // told its table is missing a model it never appears in at all.
    `${catalogueFrom === "provider" ? "No model in this profile's list is" : "No engine lane reports"} ${selectedModel}`
    + (routed?.route.target
      // Which slot the table will actually honour, named the way the user would edit it:
      // the unresolved model is not merely missing, it is what this desktop will send.
      ? ` — routing.${routed.route.slot ?? DEFAULT_SLOT} resolves to ${routed.route.target.model} on ${routed.engineLabel}`
      : ", and config.json names no route to resolve instead");

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors
          ${open ? "bg-surface2 text-text" : "text-muted hover:text-text hover:bg-surface2/60"}`}
        title={
          `${isSelectedLoaded
            ? `${shortName(selectedModel)} is resident in VRAM`
            : hasLoadedModels
            ? `${shortName(selectedModel)} (idle) — ${loadedModels.map((m) => shortName(m.name)).join(", ")} in VRAM`
            : `${shortName(selectedModel)} (idle)`}${routingNote ? ` — ${routingNote}` : ""}${notOfferedNote ? ` — ${notOfferedNote}` : ""}`
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
        {notOffered && (
          // Said on the trigger, where the choice was already made, rather than only
          // inside the list the user has to open to discover it. `notOffered` is only
          // ever true on a closed catalogue, which is what makes it a fact and not a
          // guess about a list nobody read.
          <span
            data-catalogue="absent"
            title={notOfferedNote}
            className="px-1 py-0.5 text-[9px] font-mono rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 flex-shrink-0"
          >
            not offered
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-80 max-h-[70vh] bg-canvas border border-border/60 rounded-2xl shadow-2xl z-50 overflow-y-auto">
          {writeNotice && (
            <div className="px-3 py-2 text-[11px] text-amber-400 bg-amber-500/10 border-b border-border/60">{writeNotice}</div>
          )}
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

          {routingNote && (
            <div className="px-3 py-1.5 border-b border-border/40 bg-surface/40">
              {/* One text node, so the engine name in this line cannot be read as a
                  row's own engine chip. */}
              <span className="block text-[10px] font-mono text-muted truncate" title={routingNote}>
                {routingNote}
              </span>
            </div>
          )}
          {notOfferedNote && (
            // The same claim the trigger's chip stands for, spelled out where the user is
            // about to pick: which slot the table will really resolve, in the vocabulary
            // they would edit it in.
            <div className="px-3 py-1.5 border-b border-border/40 bg-amber-500/5">
              <span className="block text-[10px] font-mono text-amber-400" data-catalogue="absent-note">
                {notOfferedNote}.
              </span>
            </div>
          )}

          <div className="p-2 border-b border-border/40">
            {/* Names what the marks below are marks *about*. A row reading "needs a
                model that can complete instructions" without saying which feature was
                checked is its own small version of the ambiguity this slice removes. */}
            <p className="px-1 pb-1.5 text-[10px] text-muted">
              Checked against {FEATURE_REQUIREMENTS.chat.label.toLowerCase()} — this picker writes
              routing.{DEFAULT_SLOT}.
            </p>
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
              // The picker writes `routing.default` — the slot every feature falls back
              // to — so the claim it can check a row against is `chat`'s. Rows with no
              // report are left unmarked rather than shown as passing.
              const report = capabilityReports[capabilityCacheKey(m.engineId ?? "", m.id)] ?? null;
              // The routing entry's assertion reaches exactly one row: the (engine, model)
              // pair it was written about. Every other row is still only what the engine
              // said, because nothing else in the file has claimed anything about it.
              const asserted = assertionFor(m.engineId, m.id);
              const verdict = report || asserted?.length ? evaluateFeature("chat", report, asserted) : null;
              const limitation = verdict && !verdict.ok ? verdict.reason : "";
              const unverified = verdict && isUnverifiable(verdict) ? verdict.reason : "";
              const fromFile = verdict?.origin === "asserted" && !limitation && !unverified
                ? `chat is taken from routing.${routed?.route.slot ?? DEFAULT_SLOT}.capabilities (${[...asserted ?? []].sort().join(", ")}) — your assertion, not ${m.engineLabel ?? m.engineId}'s answer`
                : "";
              const contradicted = verdict?.disagreement ?? "";
              return (
                <button
                  key={`${m.engineId ?? ""}:${m.id}`}
                  disabled={m.available === false}
                  onClick={() => { void chooseModel(m.id, m.engineId); }}
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
                    {/* Stated, not filtered: the row stays listed and stays clickable.
                        An embedding-only model has to remain discoverable, because for
                        the embedding slot it is the correct answer — what changes is
                        that the reason it cannot chat is now on screen before the
                        request rather than inside the transcript after it. */}
                    {limitation && (
                      <div className="text-[10px] text-red-400" data-capability="missing">
                        {limitation}
                      </div>
                    )}
                    {unverified && (
                      <div className="text-[10px] text-muted" data-capability="unknown">
                        {unverified}
                      </div>
                    )}
                    {fromFile && (
                      // Which of the two claims this row is standing on. A row that read
                      // as though the engine had said it is the defect this field could
                      // easily introduce, so the provenance is on the row, not in a tooltip.
                      <div className="text-[10px] text-muted" data-capability="asserted">
                        {fromFile}
                      </div>
                    )}
                    {contradicted && (
                      <div className="text-[10px] text-yellow" data-capability="disagreement">
                        {contradicted} — the engine's answer is what this row was checked against.
                      </div>
                    )}
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
