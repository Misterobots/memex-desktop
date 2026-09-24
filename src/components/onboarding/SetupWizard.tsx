/**
 * SetupWizard — shown on first launch when AppConfig.wizardComplete is false, and
 * again when Settings calls `config.requireWizard()`.
 *
 * Steps:
 *  0. Local engines — what this machine has (with evidence), the run style it
 *     proposes, the routing table that follows from the confirmed answer, and an
 *     Advanced disclosure of the service addresses for whoever detection cannot see.
 *  1. Assignments — which model each Team Builder role gets (D3a-2). `multi` only:
 *     `single` has one pin and says so, and an unmeasured box says why it is empty.
 *  2. Connection test — probe the harness, memory, Ollama through the main process
 *  3. Workspace root — browse or skip
 *  4. Permission mode — choose Ask / Workspace / Trusted
 *  5. Identity — set uid displayed in X-authentik-uid header
 *
 * Step 0 is the D3 harness gap: it used to ask the user to type five URLs and to
 * inherit this repository's own development addresses. Now the addresses fall out of
 * what was discovered plus what was confirmed, and the only thing *required* of the
 * user is the decision the app cannot make for them — how this box runs.
 *
 * Steps 0 and 1 together are owner decision 5: the wizard's product is a topology
 * *plus* an assignment set, not a model dropdown.
 */
import { useCallback, useEffect, useState } from "react";
import { desktop } from "../../lib/desktop";
import type {
  CapabilityReport, EngineDiscovery, LocalLlmInspection, RoutingConfig, RoutingIssue, RunStyle, RuntimeProfile,
} from "../../lib/desktop";
import {
  DEFAULT_ENGINE_IDS, DEFAULT_SLOT, ROUTING_ROWS, deriveRoutingFromSetup, pinnedTarget,
  proposeRunStyle, roleTarget, type EngineConfig, type RoutingRow, type RouteTarget,
} from "../../../electron/routing-config";
// D4's matrix, imported rather than restated: a role row that carried its own idea of
// what a coder needs would be a second source of truth about a model, which is the
// thing this slice exists to remove.
import {
  capabilityCacheKey, evaluateFeature, FEATURE_REQUIREMENTS, isUnverifiable, requirementForRoutingRow,
  type Evaluation,
} from "../../../electron/model-capabilities";

// ---------------------------------------------------------------------------
// Shared step layout
// ---------------------------------------------------------------------------
function Step({
  index, total, title, children, onNext, onBack, nextLabel = "Continue", nextDisabled = false,
}: {
  index:         number;
  total:         number;
  title:         string;
  children:      React.ReactNode;
  onNext:        () => void;
  onBack?:       () => void;
  nextLabel?:    string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Progress dots */}
      <div className="flex gap-1.5 mb-6">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`h-1 rounded-full transition-all
            ${i === index ? "w-6 bg-accent" : i < index ? "w-3 bg-accent/40" : "w-3 bg-surface2"}`} />
        ))}
      </div>

      <h2 className="text-xl font-semibold text-text mb-1">{title}</h2>
      <p className="text-xs text-muted mb-6">Step {index + 1} of {total}</p>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">{children}</div>

      <div className="flex gap-3 pt-6">
        {onBack && (
          <button onClick={onBack} className="px-4 py-2 rounded-xl border border-border/60 text-sm text-muted hover:text-text">
            Back
          </button>
        )}
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/80 disabled:opacity-40"
        >{nextLabel}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection status line
// ---------------------------------------------------------------------------
function StatusLine({ label, ok, required }: { label: string; ok: boolean; required?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-green" : required ? "bg-red" : "bg-faint"}`} />
      <span className="font-mono text-text/80">{label}</span>
      <span className={`ml-auto text-xs ${ok ? "text-green" : required ? "text-red" : "text-muted"}`}>
        {ok ? "connected" : required ? "not reachable" : "optional · offline"}
      </span>
    </div>
  );
}

/**
 * One engine, as discovery answered it. The verdict and the address are the user's
 * to check; the evidence line is the reason, shown rather than asserted — a wizard
 * that says "found" without saying how is the same trust gap as a model list with no
 * engine on it.
 */
function EngineLine({ engine }: { engine: EngineDiscovery }) {
  const label = engine.kind === "ollama" ? "Ollama" : "llama.cpp";
  const dot = engine.running ? "bg-green" : engine.installed === "unknown" ? "bg-faint" : "bg-yellow";
  const words = engine.running
    ? "running"
    : engine.installed === "unknown"
      ? engine.kind === "llama.cpp" ? "not installed · configurable" : "not found"
      : "installed · not running";
  return (
    <div className="rounded-lg bg-canvas/40 p-2">
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
        <span className="font-mono text-text/80">{label}</span>
        <span className={`ml-auto text-xs ${engine.running ? "text-green" : "text-muted"}`}>{words}</span>
      </div>
      {engine.baseUrl && <div className="mt-0.5 text-[11px] font-mono text-faint">{engine.baseUrl}</div>}
      <div className="mt-0.5 text-[11px] text-muted">{engine.evidence}</div>
    </div>
  );
}

/**
 * The routing problems this write refused, addressed by their path in the file.
 * Shown wherever a write was attempted — the refusal is the step's failure, not a
 * note under a reported success.
 */
function IssuePanel({ issues }: { issues: RoutingIssue[] }) {
  if (!issues.length) return null;
  return (
    <div className="space-y-0.5 rounded-lg border border-red/40 bg-red/5 p-2" role="alert">
      {issues.map((issue) => (
        <p key={issue.path} className="text-[11px] text-red-400">{issue.path}: {issue.message}</p>
      ))}
    </div>
  );
}

/** A picker's options: what the lane reports, plus whatever the slot already names,
 * so a hand-written value is shown and re-selectable rather than dropped from the
 * list — and never silently rewritten into a model that was reported. */
function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

/**
 * One row of the assignment step (D3a-2).
 *
 * It states which slot *answered*, not only what it answered: a row labelled
 * "researcher" showing `routing.default`'s model is a substitution, and `resolveRoute`
 * keeps the origin precisely so this line can name it instead of presenting the
 * fallback as a choice somebody made for this role.
 *
 * A model the lane does not report is warned about and still saved — the file is the
 * source of truth and an unlisted tag is frequently one the user is about to pull. The
 * reason stays visible after the write, because it is derived from the table the write
 * returned rather than from a transient error.
 */
function AssignRow({
  row, table, catalogue, capabilityReports, laneIds, busy, onAssign,
}: {
  row: RoutingRow;
  table: RoutingConfig;
  catalogue: Record<string, string[]>;
  capabilityReports: Record<string, CapabilityReport>;
  laneIds: string[];
  busy: boolean;
  onAssign: (rowKey: string, target: RouteTarget) => void;
}) {
  const at = roleTarget(table, row.key);
  const reported = at.engine ? catalogue[at.engine] : undefined;
  const candidates = dedupe([...(reported ?? []), at.model ?? ""]);
  const unreported = !!at.model && !!reported?.length && !reported.includes(at.model);

  // D4 — this row's own requirement, checked against what the lane reported about the
  // model it names. `embedding` needs an embedder and `code` needs tools; the role rows
  // need a completion model. Nothing here blocks a write: a stated limitation is the
  // deliverable, exactly as `unreported` above states a catalogue miss without refusing
  // it (D3a-2's rule).
  const feature = requirementForRoutingRow(row.key);
  const verdictFor = (model: string | null): Evaluation | null => {
    if (!model || !at.engine) return null;
    const report = capabilityReports[capabilityCacheKey(at.engine, model)];
    return report ? evaluateFeature(feature, report) : null;
  };
  const assigned = verdictFor(at.model);
  const incapable = assigned && !assigned.ok ? assigned.reason : "";
  const unverifiable = assigned && isUnverifiable(assigned) ? assigned.reason : "";
  /** Compact, and read out of the table — the row's own requirement, never a guess
   * about the model. The full sentence appears under the select once it is chosen. */
  const optionHint = (model: string): string => {
    const verdict = verdictFor(model);
    if (!verdict) return "";
    if (!verdict.ok) return ` — needs ${FEATURE_REQUIREMENTS[feature].requires.join(" + ")}`;
    return isUnverifiable(verdict) ? " — cannot verify" : "";
  };

  return (
    <div className="rounded-lg bg-canvas/40 p-2 space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-text">{row.label}</span>
        {row.env && <span className="text-[10px] font-mono text-faint">{row.env}</span>}
        {!row.perRoleBindable && (
          <span className="ml-auto text-[10px] text-muted">not a role binding</span>
        )}
      </div>

      {laneIds.length === 0 ? (
        // No lane to name: the row cannot be filled, so it shows no input rather than
        // an empty select that looks like a machine with nothing on it.
        <p className="text-[11px] text-muted">No engine in config.json yet — confirm step 1 to add one.</p>
      ) : (
        <div className="flex gap-1.5">
          <select
            aria-label={`${row.label} model`}
            value={at.model ?? ""}
            disabled={busy || candidates.length === 0}
            onChange={(e) => onAssign(row.key, { engine: at.engine ?? laneIds[0]!, model: e.target.value })}
            className="flex-1 px-1.5 py-1 rounded-lg bg-canvas border border-border/60 text-xs text-text font-mono"
          >
            {!at.model && <option value="">— choose a model —</option>}
            {candidates.map((model) => <option key={model} value={model}>{model}{optionHint(model)}</option>)}
          </select>
          {/* Moves an existing assignment between lanes. A row with no model has
              nothing to carry, and writing `{ engine, model: "" }` would only be
              refused by validateRouting — so the control says why it is off instead
              of offering a write that cannot land. */}
          <select
            aria-label={`${row.label} engine`}
            value={at.engine ?? laneIds[0]!}
            disabled={busy || !at.model}
            onChange={(e) => onAssign(row.key, { engine: e.target.value, model: at.model ?? "" })}
            className="w-2/5 px-1.5 py-1 rounded-lg bg-canvas border border-border/60 text-xs text-text font-mono"
          >
            {laneIds.map((id) => <option key={id} value={id}>{table.engines[id]?.label ?? id}</option>)}
          </select>
        </div>
      )}

      <p className="text-[11px] text-muted">
        {at.model === null
          ? "Nothing assigned and no fallback — this role is unassigned."
          : at.usedFallback
            ? // The honest version of a fallback: say which slot is answering, in file terms.
              `Falling back to routing.${at.via} — nothing sets ${row.key} yet.`
            : `Set in routing.${at.via}.`}
      </p>
      {unreported && (
        <p className="text-[11px] text-yellow">
          routing.{row.key} names {at.model}, which {at.engine} does not report — it was saved, and will fail
          until that model exists on the lane.
        </p>
      )}
      {incapable && (
        // Said, not blocked: the select stays enabled and the write stays possible,
        // because the app's authority here is the sentence, not the gate.
        <p className="text-[11px] text-red-400" data-capability="missing">
          {at.model}: {incapable}. It can still be assigned here, and this desktop will
          still send it — {FEATURE_REQUIREMENTS[feature].degrade}.
        </p>
      )}
      {unverifiable && (
        <p className="text-[11px] text-muted" data-capability="unknown">
          {at.model}: {unverifiable}. Not assumed either way.
        </p>
      )}
      {reported?.length === 0 && (
        <p className="text-[11px] text-muted">{at.engine} reported no models; nothing here can be confirmed against it.</p>
      )}
      {row.note && <p className="text-[11px] text-faint">{row.note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SetupWizard
// ---------------------------------------------------------------------------
interface Props { onComplete: () => void }

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;
const TOTAL = 6;

/** What each answer costs and buys, in the user's terms. "single" is not a lesser
 * mode — it is the shape of a box with one model in it — so the copy says which box. */
const RUN_STYLES: Array<{ style: RunStyle; title: string; tradeoff: string }> = [
  { style: "multi",  title: "Multi-model",   tradeoff: "Ollama loads and evicts a model per role, so chat, code, and the Collective's coordinator and critic can each run a different model. This is what Team-Builder-style per-role variety needs." },
  { style: "single", title: "One pinned model", tradeoff: "One model pinned to one GPU — the llama.cpp lane, with its KV-cache saved and restored. Nothing swaps on demand: every role gets the same model, and that is the honest shape for a card without room for two." },
];

export function SetupWizard({ onComplete }: Props) {
  const bridge = desktop();
  const [step,     setStep]     = useState<WizardStep>(0);
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [mpStatus, setMpStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [health,   setHealth]   = useState<{ agentRuntime: string; mempalace: string; ollama: string } | null>(null);
  const [root,     setRoot]     = useState("");
  const [mode,     setMode]     = useState<"trusted" | "workspace" | "ask">("workspace");
  const [uid,      setUid]      = useState("");
  // Local-only routing: the retired Memex Anywhere profile left this step with
  // nothing to choose, so the local services panel is what the wizard opens on.
  const [connectionChoice, setConnectionChoice] = useState<"local" | "advanced">("local");
  const [localInspection, setLocalInspection] = useState<LocalLlmInspection | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [localModel, setLocalModel] = useState("qwen3:8b");
  // The run style is proposed by `proposeRunStyle` and chosen here. It starts empty on
  // purpose: no value in this component — and no value already in config.json — may
  // stand in for a decision the plan says is the user's (C1). What the file already
  // says is labelled below, and merged into the draft, but never pre-selected.
  const [runStyle, setRunStyle] = useState<RunStyle | null>(null);
  const [storedRouting, setStoredRouting] = useState<RoutingConfig | null>(null);
  const [routingIssues, setRoutingIssues] = useState<RoutingIssue[]>([]);
  // Step 1's candidate lists, keyed by engine id: what each lane actually reports
  // (`/api/tags`, or `/health` + `/props` + `/v1/models`). Absent until asked, because
  // an engine that is down answers empty and that is a fact worth showing per lane.
  const [catalogue, setCatalogue] = useState<Record<string, string[]>>({});
  /** D4 — what each lane reported about each candidate, keyed `engineId:model`. Asked
   * once per model for the whole session (main caches it), never per render. */
  const [capabilityReports, setCapabilityReports] = useState<Record<string, CapabilityReport>>({});
  const [showAddresses, setShowAddresses] = useState(false);
  const [localUrls, setLocalUrls] = useState({
    harnessUrl: "http://[::1]:8008",
    // No default memory service. The address that used to sit here is one specific
    // machine in one specific house; every other install inherited it and reported
    // its memory as disconnected for a reason nobody could see.
    mempalaceUrl: "",
    ollamaUrl: "http://[::1]:11434",
    llamaCppUrl: "",
    openWebUiUrl: "http://127.0.0.1:3000",
    comfyUiUrl: "http://127.0.0.1:8188",
  });

  useEffect(() => {
    if (!bridge) return;
    Promise.all([bridge.config.getAll(), bridge.config.getActive()]).then(([all, active]) => {
      setProfiles(all);
      setActiveId(active.id);
    });
    bridge.identity?.get().then((u: string) => setUid(u));
    // What the file already says is shown as the current answer and merged into the
    // draft (a hand-written slot survives), but it is *not* pre-selected: a fresh
    // install always has a derived `runStyle: "multi"` in config.json, and treating
    // that as the user's decision would be exactly the silent default C1 forbids.
    if (bridge.routing) {
      void bridge.routing.get().then((state) => setStoredRouting(state.routing))
        .catch(() => { /* no table yet; the proposal below is what the user sees */ });
    }
  }, [bridge]);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL - 1) as WizardStep);
  const back = () => setStep((s) => Math.max(s - 1, 0) as WizardStep);

  const testConnection = async () => {
    if (!bridge) return;
    setMpStatus("testing");
    setHealth(null);
    try {
      // Route through the main process: the renderer can't probe the backends
      // directly because they send no CORS headers. health.check() probes the
      // active profile's agent_runtime, MemPalace, and Ollama from main.
      const h = await bridge.health.check();
      setHealth(h);
      // agent_runtime is the required service; MemPalace/Ollama are optional.
      setMpStatus(h.agentRuntime === "connected" ? "ok" : "fail");
    } catch {
      setMpStatus("fail");
    }
  };

  const inspectLocal = async () => {
    if (!bridge) return;
    setLocalBusy(true);
    setLocalError("");
    try {
      const result = await bridge.localLlm.inspect();
      setLocalInspection(result);
      setLocalModel((current) => result.ollama.models.includes(current) ? current : result.recommendations[0]?.model ?? current);
      // Follow detection, not the address this file happens to ship: a daemon on the
      // port named by OLLAMA_HOST, or a llama-server answering on another one, is the
      // address the rest of the step should use.
      setLocalUrls((urls) => {
        const ollama = result.engines.find((engine) => engine.kind === "ollama" && engine.baseUrl);
        const llama = result.engines.find((engine) => engine.kind === "llama.cpp" && engine.baseUrl);
        return {
          ...urls,
          ollamaUrl: ollama?.baseUrl ?? urls.ollamaUrl,
          llamaCppUrl: urls.llamaCppUrl || llama?.baseUrl || "",
        };
      });
    } catch {
      setLocalError("Could not inspect local services. You can still enter their addresses below.");
    } finally { setLocalBusy(false); }
  };

  // The scan used to be a side effect of clicking the Local LLMs card. That
  // card is gone and its panel is now the opening state, so probe on arrival.
  useEffect(() => { void inspectLocal(); }, [bridge]);

  const proposal = localInspection
    ? proposeRunStyle(localInspection.gpus, localInspection.engines)
    : null;

  // The engines this step would write, and which one the confirmed model belongs to.
  // Ollama is always offered (it is the lane the recommendations and pulls use); a
  // llama.cpp lane appears only when something gave it an address — discovery or you.
  const discovered = (kind: EngineDiscovery["kind"]) => localInspection?.engines.find((engine) => engine.kind === kind);
  const ollamaBaseUrl = localUrls.ollamaUrl.trim() || discovered("ollama")?.baseUrl || localInspection?.ollama.url || "";
  const llamaCppBaseUrl = localUrls.llamaCppUrl.trim() || discovered("llama.cpp")?.baseUrl || "";
  const setupEngines: Record<string, EngineConfig> = {
    [DEFAULT_ENGINE_IDS.ollama]: { kind: "ollama", baseUrl: ollamaBaseUrl, label: "Ollama" },
  };
  if (llamaCppBaseUrl) setupEngines[DEFAULT_ENGINE_IDS["llama.cpp"]] = { kind: "llama.cpp", baseUrl: llamaCppBaseUrl, label: "llama.cpp" };
  const selectionEngine = ollamaBaseUrl || !llamaCppBaseUrl ? DEFAULT_ENGINE_IDS.ollama : DEFAULT_ENGINE_IDS["llama.cpp"];
  // The exact table the confirm writes, shown before it is written. It stays null
  // until a run style is chosen, because there is no style to render until then.
  const routingDraft = runStyle
    ? deriveRoutingFromSetup({
        runStyle,
        engines: setupEngines,
        selection: { engine: selectionEngine, model: localModel },
        existing: storedRouting,
      })
    : null;

  const activateLocal = async () => {
    if (!bridge || !runStyle || !routingDraft) return false;
    setLocalBusy(true);
    setLocalError("");
    setRoutingIssues([]);
    try {
      const profile = await bridge.localLlm.activate({
        harnessUrl: localUrls.harnessUrl, mempalaceUrl: localUrls.mempalaceUrl, ollamaUrl: localUrls.ollamaUrl,
        openWebUiUrl: localUrls.openWebUiUrl, comfyUiUrl: localUrls.comfyUiUrl, model: localModel,
      });
      setActiveId(profile.id);
      setProfiles(await bridge.config.getAll());
      // The routing table is the part that actually decides where a request goes, so
      // its refusal is the step's failure — not a note under a reported success.
      const result = await bridge.routing.set(routingDraft);
      if (!result.ok) {
        setRoutingIssues(result.issues);
        setLocalError("config.json refused this routing table, so nothing was changed in it. Fix what is listed and confirm again.");
        return false;
      }
      setStoredRouting(result.routing);
      return true;
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not save Local LLM settings.");
      return false;
    } finally { setLocalBusy(false); }
  };

  /** One write of the whole table. Every assignment goes through `routing:set`, so a
   * refusal still comes back as `validateRouting`'s issue paths and changes nothing;
   * and the view this step renders is the table the write returned, never a re-read of
   * the store — `saveRouting` broadcasts no `config:changed`, so a re-read would show
   * the table from before the write. */
  const writeTable = async (next: RoutingConfig) => {
    if (!bridge) return;
    setLocalBusy(true);
    try {
      const result = await bridge.routing.set(next);
      if (!result.ok) { setRoutingIssues(result.issues); return; }
      setRoutingIssues([]);
      setStoredRouting(result.routing);
    } finally { setLocalBusy(false); }
  };

  /** One row's assignment. Only that key is replaced, so hand-written slots outside
   * the presented rows — `collective.critic` above all, which has no row — survive a
   * role write untouched. */
  const assignRow = (rowKey: string, target: RouteTarget) => {
    if (!storedRouting) return;
    void writeTable({ ...storedRouting, routing: { ...storedRouting.routing, [rowKey]: target } });
  };

  /** `single` has one answer, so its control is the pin: it moves `routing.default`
   * and the engine's `pinnedModel` together, which is what `flattenForRunStyle`
   * resolves every slot onto. Writing one without the other would have the flatten
   * undo this choice under a different name. */
  const assignPin = (engineId: string, model: string) => {
    if (!storedRouting) return;
    const engine = storedRouting.engines[engineId];
    if (!engine) return;
    void writeTable({
      ...storedRouting,
      engines: { ...storedRouting.engines, [engineId]: { ...engine, pinnedModel: model } },
      routing: { ...storedRouting.routing, [DEFAULT_SLOT]: { engine: engineId, model } },
    });
  };

  // Candidates for the lanes this table names. `modelsFor` rather than `models`: a
  // lane this wizard discovered may still be stored under another id (or not at all),
  // and `engines:models` resolves strictly against the stored key and would answer
  // empty mid-setup — see plan D3a.
  useEffect(() => {
    if (!bridge || step !== 1 || !storedRouting) return;
    const ids = Object.keys(storedRouting.engines);
    if (!ids.length) return;
    let live = true;
    for (const id of ids) {
      void bridge.engines.modelsFor({ id }).then(async (models) => {
        if (live) setCatalogue((current) => ({ ...current, [id]: models.map((model) => model.model) }));
        // D4, asked once per candidate. `?.` because a preload older than the matrix
        // has no such method — and a row then carries no verdict at all, which is not
        // the same as a row that passed.
        const capabilities = bridge.engines.capabilities;
        if (!capabilities) return;
        const answers = await Promise.all(models.map(async (model) => {
          try {
            return [capabilityCacheKey(id, model.model), await capabilities({ id, model: model.model })] as const;
          } catch {
            return null; // a lane that would not answer this model stays unmarked
          }
        }));
        if (!live) return;
        const merged: Record<string, CapabilityReport> = {};
        for (const answer of answers) if (answer) merged[answer[0]] = answer[1];
        if (Object.keys(merged).length) {
          setCapabilityReports((current) => ({ ...current, ...merged }));
        }
      });
    }
    return () => { live = false; };
  }, [bridge, step, storedRouting]);

  const handleFinish = useCallback(async () => {
    if (!bridge) { onComplete(); return; }
    if (root.trim()) await bridge.workspace.addRoot(root.trim());
    await bridge.workspace.setPolicy({ mode });
    if (uid.trim()) await bridge.identity?.set(uid.trim());
    await bridge.config.setActive(activeId);
    onComplete();
  }, [bridge, root, mode, uid, activeId, onComplete]);

  const modelOptions = [...new Set([
    ...(localInspection?.ollama.models ?? []),
    ...(localInspection?.recommendations.map((item) => item.model) ?? []),
    localModel,
  ])].filter(Boolean);

  // The lanes a row's engine select can name, in the file's order, and the pin a
  // `single` box actually serves. Both read `storedRouting` — the in-session view the
  // last write returned — not a fresh `routing:get`.
  const laneIds = Object.keys(storedRouting?.engines ?? {});
  const pinned = storedRouting ? pinnedTarget(storedRouting) : null;
  // Where an unassigned role's answer actually comes from: that process's own
  // environment, which this desktop can describe but not override.
  const hostWords = (() => {
    try { return new URL(profiles.find((profile) => profile.id === activeId)?.agentRuntime ?? "").host || "the runtime host"; }
    catch { return "the runtime host"; }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex items-center justify-center p-6">
      {/* The app uses a hidden native title bar. The regular shell supplies its
          own drag region, but setup replaces that shell completely; keep a
          dedicated strip available throughout onboarding. */}
      <div className="drag-region absolute inset-x-0 top-0 h-10" aria-hidden="true" />
      <div className="no-drag w-full max-w-md bg-surface border border-border/60 rounded-2xl p-8 shadow-2xl flex flex-col min-h-[520px]">

        {/* Step 0: local engines, run style, routing table */}
        {step === 0 && (
          <Step index={0} total={TOTAL} title="Choose how Memex runs" onNext={() => {
            if (connectionChoice === "local") void activateLocal().then((ok) => { if (ok) next(); });
            else next();
          }} nextLabel={connectionChoice === "local" ? (runStyle ? `Confirm ${runStyle} setup` : "Confirm your run style") : "Continue"}
            nextDisabled={connectionChoice === "local" && (!runStyle || !localModel.trim() || localBusy)}>
            <p className="text-sm text-muted">Connect this desktop to the engines and services you run on this computer.</p>
            {connectionChoice === "local" && (
              <div className="space-y-3 rounded-xl border border-border/50 bg-surface2/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-text">This machine</div>
                    <div className="text-xs text-muted">Scanned for engines, then yours to confirm.</div>
                  </div>
                  <button onClick={() => void inspectLocal()} disabled={localBusy} className="text-xs text-accent hover:text-accent/80">
                    {localBusy ? "Checking…" : "Scan machine"}
                  </button>
                </div>
                {localInspection && <>
                  <div className="text-xs text-muted">{localInspection.systemRamGb} GB RAM · {localInspection.gpus.length ? localInspection.gpus.map((gpu) => gpu.vramGb ? `${gpu.name} (${gpu.vramGb} GB)` : `${gpu.name} (memory unknown)`).join(", ") : "GPU details unavailable"}</div>

                  {/* 1. What was found, and how it was known */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted">Engines found</label>
                    {localInspection.engines.map((engine) => <EngineLine key={engine.kind} engine={engine} />)}
                    {localInspection.engines.some((engine) => engine.kind === "ollama" && !engine.running) && (
                      <div className="space-y-1">
                        <button onClick={() => void bridge?.localLlm.openOllamaDownload()} className="text-xs text-accent hover:text-accent/80">Get Ollama ↗</button>
                        <p className="text-[11px] text-muted">Opens ollama.com/download in your browser. Memex does not install anything for you — install it, start it, then scan again.</p>
                      </div>
                    )}
                  </div>

                  {/* 2. The run style: proposed here, decided by the user */}
                  {proposal && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted">Run style · {proposal.runStyle ? (proposal.runStyle === "single" ? "proposed: one pinned model" : "proposed: multi-model") : "not proposed — this probe cannot tell"}</label>
                      <p className="text-[11px] text-muted">{proposal.why}</p>
                      {storedRouting && (
                        // What the file holds is shown as a fact about the file, not as
                        // an answer: on a first run the routing block is derived from the
                        // profile, and a derived value was never decided by anyone.
                        <p className="text-[11px] text-muted">
                          config.json already holds runStyle {JSON.stringify(storedRouting.runStyle)}. Confirm to keep it, or choose the other one.
                        </p>
                      )}
                      {RUN_STYLES.map(({ style, title, tradeoff }) => (
                        <button key={style} onClick={() => setRunStyle(style)} aria-pressed={runStyle === style}
                          className={`w-full text-left px-3 py-2 rounded-xl border transition-colors
                            ${runStyle === style ? "border-accent/50 bg-accent/10" : "border-border/40 hover:bg-surface2/60"}`}>
                          <div className="text-sm font-medium text-text">
                            {title}
                            {proposal.runStyle === style && <span className="ml-1.5 text-[11px] text-accent">proposed for this box</span>}
                          </div>
                          <div className="text-xs text-muted mt-0.5">{tradeoff}</div>
                        </button>
                      ))}
                      {!runStyle && <p className="text-[11px] text-muted">Nothing is selected until you choose — this app will not pick a mode for you.</p>}
                    </div>
                  )}

                  {/* 3. The model, then the exact table this writes */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted">Model</label>
                    <select value={localModel} onChange={(e) => setLocalModel(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-canvas border border-border/60 text-sm text-text">
                      {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                    {localInspection.recommendations.find((item) => item.model === localModel) && (
                      <p className="text-[11px] text-muted">{localInspection.recommendations.find((item) => item.model === localModel)?.reason}</p>
                    )}
                    {localInspection.ollama.reachable && !localInspection.ollama.models.includes(localModel) && (
                      <button onClick={async () => {
                        setLocalBusy(true);
                        const result = await bridge?.localLlm.pullModel(localUrls.ollamaUrl, localModel);
                        setLocalBusy(false);
                        if (!result?.ok) setLocalError(result?.error ?? "Could not pull model");
                        else void inspectLocal();
                      }} disabled={localBusy} className="text-xs text-accent hover:text-accent/80">Pull {localModel}</button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted">Routing table this writes to config.json</label>
                    {routingDraft ? (
                      <pre className="max-h-40 overflow-y-auto rounded-lg bg-canvas/60 p-2 text-[10px] leading-relaxed text-text/80 font-mono">{JSON.stringify(routingDraft, null, 2)}</pre>
                    ) : (
                      <p className="text-[11px] text-muted">Choose a run style above to see the table.</p>
                    )}
                  </div>

                  {/* 4. The addresses, for whoever detection cannot see */}
                  <div className="space-y-1.5">
                    <button onClick={() => setShowAddresses((open) => !open)} aria-expanded={showAddresses} className="text-xs text-muted hover:text-text">
                      {showAddresses ? "Hide service addresses" : "Advanced: edit service addresses"}
                    </button>
                    {!localUrls.mempalaceUrl.trim() && (
                      <p className="text-[11px] text-muted">No memory service is configured, and Memex will not guess one: the memory-backed features report as unavailable until you enter an address.</p>
                    )}
                    {showAddresses && (
                      <div className="grid grid-cols-1 gap-1.5">
                        {([
                          ["harnessUrl", "Memex harness"], ["mempalaceUrl", "Memory service (no default)"],
                          ["ollamaUrl", "Ollama"], ["llamaCppUrl", "llama.cpp / llama-server (optional)"],
                          ["openWebUiUrl", "Open WebUI (optional)"], ["comfyUiUrl", "ComfyUI (optional)"],
                        ] as const).map(([key, label]) => (
                          <label key={key} className="text-[11px] text-muted">{label}
                            <input aria-label={label} value={localUrls[key]} onChange={(e) => setLocalUrls((urls) => ({ ...urls, [key]: e.target.value }))}
                              className="mt-0.5 w-full px-2 py-1.5 rounded-lg bg-canvas border border-border/60 text-xs text-text font-mono" />
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="space-y-1 rounded-lg bg-canvas/40 p-2">
                      <StatusLine label="Local Memex harness" ok={localInspection.harness.reachable} required />
                      <StatusLine label="Open WebUI" ok={localInspection.openWebUi.reachable} />
                      <StatusLine label="ComfyUI" ok={localInspection.comfyUi.reachable} />
                    </div>
                    <p className="text-[11px] text-muted">Ollama supplies models. The local Memex harness provides chat, tools, memory, and workspace workflows. If it is not running, continue and test it on the next step.</p>
                  </div>
                </>}
                <IssuePanel issues={routingIssues} />
                {localError && <p className="text-xs text-red-400">{localError}</p>}
              </div>
            )}
            {connectionChoice === "advanced" && <div className="space-y-2">{profiles.map((p) => <button key={p.id} onClick={() => { setActiveId(p.id); bridge?.config.setActive(p.id); }} className={`w-full text-left px-4 py-3 rounded-xl border ${activeId === p.id ? "border-accent/50 bg-accent/10" : "border-border/40"}`}><div className="text-sm font-medium text-text">{p.name}</div><div className="text-xs text-muted font-mono truncate">{p.agentRuntime}</div></button>)}</div>}
            <button onClick={() => setConnectionChoice(connectionChoice === "advanced" ? "local" : "advanced")}
              className="text-xs text-muted hover:text-text">
              {connectionChoice === "advanced" ? "Back to Local LLM setup" : "Advanced routing profiles"}
            </button>
          </Step>
        )}

        {/* Step 1: the assignment set — decision 5's other half. Step 0 decided the
            topology; this is which model each role gets. */}
        {step === 1 && (
          <Step index={1} total={TOTAL} title="Assign models to roles" onNext={next} onBack={back}>
            {runStyle === null && (
              <div className="space-y-2">
                <p className="text-sm text-muted">Choose a run style first.</p>
                <p className="text-[11px] text-muted">
                  Go back to step 1 and answer how this box runs. Nothing is listed here until then — a lane
                  list built from a table that has no lanes reads as &ldquo;this machine has no models&rdquo;,
                  which is a different claim than &ldquo;nothing has been chosen yet&rdquo;.
                </p>
              </div>
            )}

            {runStyle === "single" && (
              <div className="space-y-2">
                <p className="text-sm text-muted">One pinned model, served everywhere.</p>
                {storedRouting && pinned ? (
                  <div className="rounded-lg bg-canvas/40 p-2 space-y-1">
                    <div className="text-sm font-medium text-text">Pinned model</div>
                    <select
                      aria-label="Pinned model"
                      value={pinned.target.model}
                      disabled={localBusy || !(catalogue[pinned.engineId] ?? []).length}
                      onChange={(e) => assignPin(pinned.engineId, e.target.value)}
                      className="w-full px-1.5 py-1 rounded-lg bg-canvas border border-border/60 text-xs text-text font-mono"
                    >
                      {dedupe([...(catalogue[pinned.engineId] ?? []), pinned.target.model]).map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted">
                      Engine {pinned.engineId}. Every slot in config.json resolves onto this pin.
                    </p>
                    {!(catalogue[pinned.engineId] ?? []).length && (
                      <p className="text-[11px] text-muted">
                        {pinned.engineId} reported no models, so there is nothing to choose from — confirm step 1
                        with the engine running to load its list.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">
                    This table names no pin, so there is nothing to change here. Go back to step 1 and confirm a
                    model.
                  </p>
                )}
                <p className="text-[11px] text-muted">
                  Per-feature assignment is unavailable in this run style: <span className="font-mono">runStyle
                  &quot;single&quot;</span> resolves every slot onto the pin, so a row per role would be an input
                  that changes nothing.
                </p>
                <p className="text-[11px] text-muted">
                  Unassigned roles stay on <span className="font-mono">{hostWords}</span>&apos;s own environment
                  defaults — this desktop cannot override them.
                </p>
              </div>
            )}

            {runStyle === "multi" && storedRouting && (
              <div className="space-y-2">
                <p className="text-sm text-muted">
                  Which model each role runs. The name beside a row is the variable that decides it on the
                  runtime host today, in that runtime&apos;s spelling.
                </p>
                {!laneIds.length && (
                  <p className="text-[11px] text-yellow">
                    config.json holds no engines, so nothing here can be assigned. Go back to step 1 and confirm
                    the setup, which writes the lanes it discovered.
                  </p>
                )}
                {ROUTING_ROWS.map((row) => (
                  <AssignRow
                    key={row.key} row={row} table={storedRouting} catalogue={catalogue}
                    capabilityReports={capabilityReports}
                    laneIds={laneIds} busy={localBusy} onAssign={assignRow}
                  />
                ))}
                <p className="text-[11px] text-muted">
                  Unassigned roles stay on <span className="font-mono">{hostWords}</span>&apos;s own environment
                  defaults — this desktop cannot override them.
                </p>
                <p className="text-[11px] text-yellow">
                  Not on the wire yet: the runtime does not accept a client-supplied role map, so these rows write
                  config.json and are read by this desktop, while each role keeps reading its own host environment
                  until that change lands (plan D1c).
                </p>
              </div>
            )}

            {runStyle === "multi" && !storedRouting && (
              <p className="text-[11px] text-muted">
                config.json has no routing table to assign against yet. Go back to step 1 and confirm the setup,
                which writes one.
              </p>
            )}

            <IssuePanel issues={routingIssues} />
          </Step>
        )}

        {/* Step 2: Connection test */}
        {step === 2 && (
          <Step index={2} total={TOTAL} title="Test connection" onNext={next} onBack={back}>
            <p className="text-sm text-muted">
              Verify the desktop app can reach your Memex backend. <span className="text-text/80">agent_runtime</span> is
              required; MemPalace (long-term memory) and Ollama are optional and can be set up later.
            </p>
            <button onClick={testConnection}
              disabled={mpStatus === "testing"}
              className="w-full py-2.5 rounded-xl border border-border/60 text-sm hover:bg-surface2/60 disabled:opacity-50">
              {mpStatus === "testing" ? "Testing…" : "Test connection"}
            </button>
            {health && (
              <div className="space-y-1.5 rounded-xl border border-border/40 bg-surface2/40 p-3">
                <StatusLine label="agent_runtime" ok={health.agentRuntime === "connected"} required />
                <StatusLine label="MemPalace"     ok={health.mempalace    === "connected"} />
                <StatusLine label="Ollama"        ok={health.ollama       === "connected"} />
              </div>
            )}
            {mpStatus === "fail" && (
              <p className="text-xs text-muted">
                agent_runtime isn't reachable on this profile. Go back to check the URL,
                or continue and adjust it later in Settings.
              </p>
            )}
          </Step>
        )}

        {/* Step 3: Workspace root */}
        {step === 3 && (
          <Step index={3} total={TOTAL} title="Set workspace root" onNext={next} onBack={back}
            nextLabel={root ? "Continue" : "Skip"}>
            <p className="text-sm text-muted">
              The workspace root is the folder the agent can access without extra prompts. Leave empty to configure later.
            </p>
            <div className="flex gap-2">
              <input
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="/Users/you/projects"
                className="flex-1 px-3 py-2 rounded-xl bg-surface2 border border-border/60 text-sm text-text font-mono
                  focus:outline-none focus:ring-1 focus:ring-accent/60"
              />
              <button onClick={async () => {
                const folder = await bridge?.dialog.openFolder();
                if (folder) setRoot(folder);
              }} className="px-3 py-2 rounded-xl border border-border/60 text-sm hover:bg-surface2/60">
                Browse
              </button>
            </div>
          </Step>
        )}

        {/* Step 4: Permission mode */}
        {step === 4 && (
          <Step index={4} total={TOTAL} title="Permission mode" onNext={next} onBack={back}>
            <p className="text-sm text-muted">
              Controls whether the agent can access files and run commands without prompting.
            </p>
            <div className="space-y-2">
              {([
                ["trusted",   "Trusted",   "All operations allowed — fastest, least friction"],
                ["workspace", "Workspace", "Operations inside your workspace root are automatic; outside prompts you (recommended)"],
                ["ask",       "Ask",       "Every file and shell operation requires your approval"],
              ] as [typeof mode, string, string][]).map(([m, label, desc]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors
                    ${mode === m ? "border-accent/50 bg-accent/10" : "border-border/40 hover:bg-surface2/60"}`}>
                  <div className="text-sm font-medium text-text">{label}</div>
                  <div className="text-xs text-muted mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {/* Step 5: Identity */}
        {step === 5 && (
          <Step index={5} total={TOTAL} title="Your identity" onNext={handleFinish}
            onBack={back} nextLabel="Finish setup">
            <p className="text-sm text-muted">
              This UID is sent as <code className="font-mono">X-authentik-uid</code> on every request,
              so the agent knows who is talking. Auto-generated if left empty.
            </p>
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="alice@example.com or leave blank"
              className="w-full px-3 py-2 rounded-xl bg-surface2 border border-border/60 text-sm text-text
                focus:outline-none focus:ring-1 focus:ring-accent/60"
            />
          </Step>
        )}

      </div>
    </div>
  );
}
