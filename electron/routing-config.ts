/**
 * The routing table (D2) — `config.json` is the source of truth for model routing.
 *
 * The schema, as it appears in the file. `deriveRoutingFromSetup` is what the D3
 * wizard writes into it, so it is documented here rather than only in the plan:
 *
 * ```jsonc
 * {
 *   "runStyle": "multi",                       // "single" = pinned model, "multi" = swap on demand
 *   "engines": {
 *     "ollama-local": { "kind": "ollama",    "baseUrl": "http://[::1]:11434" },
 *     "llama-local":  { "kind": "llama.cpp", "baseUrl": "http://127.0.0.1:8080", "pinnedModel": "…" }
 *   },
 *   "routing": {
 *     "default":                { "engine": "ollama-local", "model": "qwen3:14b" },
 *     "code":                   { "engine": "ollama-local", "model": "qwen3.8:27b" },
 *     "collective.coordinator": { "engine": "ollama-local", "model": "qwen3.8:27b" },
 *     "collective.critic":      { "engine": "ollama-local", "model": "qwen3:14b" },
 *     "embedding":              { "engine": "ollama-local", "model": "nomic-embed-text:latest" }
 *   }
 * }
 * ```
 *
 * `engines` keys are the ids that `routing.*.engine` refers to, so the user names
 * them; `label` is display text only and `pinnedModel` is what `runStyle: "single"`
 * flattens the table onto. Slot names are deliberately open-ended: D2's example
 * carries five slots while its prose names more (research, image), so an
 * unrecognised slot is left in place rather than rejected as nonsense.
 *
 * Editing this file by hand is a supported action, and that decides what
 * validation may do with a mistake: report every problem in one pass, each with a
 * path to it (`routing.collective.critic.engine`), because a single opaque
 * "invalid config" would send the user back through the whole file. Repair nothing.
 * A silently fixed entry is how a typo ends up pointing a coordinator turn at a
 * model nobody chose — the failure class this app keeps rediscovering.
 *
 * Electron-free by this repo's convention (profile-migration.ts, engine-registry.ts,
 * ollama-residency.ts) so the resolution rules can be *shared* with the picker
 * instead of mirrored into `src/lib` and drift: `resolveRoute` is imported by
 * `ModelPickerPopover.tsx` and called by the main process on the same code.
 */
import type { EngineKind } from "./engine-registry";

/** "single" = one pinned model on one engine; "multi" = swap models on demand. */
export type RunStyle = "single" | "multi";

/** An engine this install runs, as the user declared it. */
export interface EngineConfig {
  kind: EngineKind;
  baseUrl: string;
  label?: string;
  /** The model a `runStyle: "single"` box serves. llama.cpp pins it at launch;
   * Ollama does not need it, which is why it is optional here. */
  pinnedModel?: string;
}

/** What a slot sends: one engine's id plus the model to ask that engine for. */
export interface RouteTarget {
  engine: string;
  model: string;
}

/** The routing block: `runStyle`, `engines` and `routing`, the three keys
 * `config.json` carries at top level. */
export interface RoutingConfig {
  runStyle: RunStyle;
  engines: Record<string, EngineConfig>;
  routing: Record<string, RouteTarget>;
}

/** One problem with one value, addressed by its path in the file. */
export interface RoutingIssue {
  path: string;
  message: string;
}

/** `getRouting()` — the effective table plus whatever is wrong with it. */
export interface RoutingState {
  routing: RoutingConfig;
  errors: RoutingIssue[];
}

/** `saveRouting()` — a rejected write carries the issues that caused it and has
 * left both the stored config and the file on disk untouched. */
export interface RoutingResult {
  ok: boolean;
  routing: RoutingConfig;
  issues: RoutingIssue[];
}

/**
 * The answer to "which slot did this model come from?". `slot` is the entry that
 * actually supplied the target, not the one that was asked for, so the UI can name
 * the origin of a substitution instead of quietly making one.
 */
export interface ResolvedRoute {
  requested: string;
  slot: string | null;
  target: RouteTarget | null;
  usedFallback: boolean;
}

/** The slot everything else falls back to, and the one the model picker follows. */
export const DEFAULT_SLOT = "default";

/** The fallback `ConfigStore.getUrls()` applies when a profile names no Ollama
 * daemon, so a config derived from such a profile probes the same address the old
 * handler would have. */
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/** Kinds this build can discover models for. Anything else is reported, not guessed at. */
const KNOWN_KINDS: readonly string[] = ["ollama", "llama.cpp"];

/** The fields of a `RuntimeProfile` that a routing table can be derived from. */
export interface ProfileRoutingSource {
  ollama?: string;
  llamaCpp?: string;
  defaultModel?: string;
}

// ---------------------------------------------------------------------------
// Reading a stored block
// ---------------------------------------------------------------------------

/**
 * The three routing keys as a config holds them, or null when it has no block.
 * `engines` is the presence test: it is the key nothing else in the file can
 * supply, and a config that has one has been edited to have a routing table —
 * even an unfinished one, which validation then reports on instead of
 * overwriting with a derived default.
 */
export function readRoutingBlock(source: Record<string, unknown> | null | undefined): RoutingConfig | null {
  if (!isRecord(source) || !isRecord(source.engines)) return null;
  return {
    runStyle: source.runStyle as RunStyle,
    engines: source.engines as Record<string, EngineConfig>,
    routing: isRecord(source.routing) ? (source.routing as Record<string, RouteTarget>) : {},
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve one named slot, falling back to `routing.default`.
 *
 * The fallback is returned rather than hidden: `usedFallback` plus the `slot` that
 * answered is how the picker says "qwen3:14b, from slot default" instead of
 * presenting another slot's model as though it had been chosen for this purpose.
 */
export function resolveRoute(routing: RoutingConfig | null | undefined, slot: string): ResolvedRoute {
  const table = routing?.routing ?? {};
  const direct = table[slot];
  if (direct) return { requested: slot, slot, target: direct, usedFallback: false };
  const fallback = table[DEFAULT_SLOT];
  if (fallback) {
    return { requested: slot, slot: DEFAULT_SLOT, target: fallback, usedFallback: true };
  }
  return { requested: slot, slot: null, target: null, usedFallback: false };
}

/**
 * The one model a `runStyle: "single"` box can serve everywhere: the engine named
 * by `routing.default` if it has one, else its only engine. `pinnedModel` wins over
 * the default slot's model, because the pin is what the engine was launched with.
 *
 * null means there is nothing to pin to, which is a validation error rather than a
 * state to invent a model for.
 */
export function pinnedTarget(routing: RoutingConfig): { engineId: string; target: RouteTarget } | null {
  const ids = Object.keys(routing.engines ?? {});
  const preferred = routing.routing?.[DEFAULT_SLOT];
  const engineId = preferred && preferred.engine in routing.engines
    ? preferred.engine
    : ids.length === 1 ? ids[0]! : null;
  if (engineId === null) return null;
  const model = (routing.engines[engineId]?.pinnedModel ?? "").trim() || (preferred?.model ?? "").trim();
  return model ? { engineId, target: { engine: engineId, model } } : null;
}

/**
 * Make the table honest about the run style.
 *
 * `runStyle: "single"` cannot honour a per-slot table — llama.cpp pins one model at
 * launch, so per-slot variety is physically unavailable on such a box. Rather than
 * send a table the engine cannot satisfy, every existing slot is rewritten to the
 * pinned model and the slots that changed come back in `overridden`, so the caller
 * can tell the user what happened. Flattening silently would be the degradation D2
 * names explicitly.
 *
 * `"multi"` returns the same object reference it was given: nothing is rewritten,
 * not even normalised.
 */
export function flattenForRunStyle(routing: RoutingConfig): {
  routing: RoutingConfig;
  pinned: RouteTarget | null;
  overridden: string[];
} {
  if (routing.runStyle !== "single") return { routing, pinned: null, overridden: [] };
  const pin = pinnedTarget(routing);
  if (!pin) return { routing, pinned: null, overridden: [] };

  const overridden: string[] = [];
  const flattened: Record<string, RouteTarget> = {};
  for (const [slot, target] of Object.entries(routing.routing ?? {})) {
    // Only slots that were already there are rewritten: an empty table has nothing
    // to mislead with, and inventing slots is the repair this module refuses to do.
    if (target.engine === pin.target.engine && target.model === pin.target.model) {
      flattened[slot] = target;
    } else {
      flattened[slot] = pin.target;
      overridden.push(slot);
    }
  }
  return { routing: { ...routing, routing: flattened }, pinned: pin.target, overridden };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Every problem with a candidate routing block, in one pass.
 *
 * Takes `unknown` because that is what a hand-edited file and an IPC argument
 * actually are; a well-formed `RoutingConfig` validates to `[]`.
 */
export function validateRouting(candidate: unknown): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  if (!isRecord(candidate)) {
    return [{ path: "(root)", message: "expected an object with runStyle, engines and routing" }];
  }

  const runStyle = candidate.runStyle;
  if (runStyle !== "single" && runStyle !== "multi") {
    issues.push({
      path: "runStyle",
      message: `expected "single" or "multi", found ${describe(runStyle)}`,
    });
  }

  if (!isRecord(candidate.engines)) {
    issues.push({ path: "engines", message: `expected a map of engine id to { kind, baseUrl }, found ${describe(candidate.engines)}` });
  }
  const engines = isRecord(candidate.engines) ? candidate.engines : {};
  const engineIds = Object.keys(engines);
  for (const [id, rawEngine] of Object.entries(engines)) {
    const path = `engines.${id}`;
    if (!isRecord(rawEngine)) {
      issues.push({ path, message: `expected { kind, baseUrl }, found ${describe(rawEngine)}` });
      continue;
    }
    if (typeof rawEngine.kind !== "string" || !KNOWN_KINDS.includes(rawEngine.kind)) {
      issues.push({
        path: `${path}.kind`,
        message: `unknown engine kind ${describe(rawEngine.kind)} — this build discovers ${KNOWN_KINDS.join(" and ")}`,
      });
    }
    const baseUrl = text(rawEngine.baseUrl);
    if (!baseUrl) {
      issues.push({ path: `${path}.baseUrl`, message: "is empty; the engine would be addressed at no address at all" });
    } else if (!isHttpUrl(baseUrl)) {
      issues.push({ path: `${path}.baseUrl`, message: `${describe(rawEngine.baseUrl)} is not a valid http(s) URL` });
    }
    if (rawEngine.pinnedModel !== undefined && !text(rawEngine.pinnedModel)) {
      issues.push({ path: `${path}.pinnedModel`, message: "give it a model name or remove the key; an empty pin pins nothing" });
    }
  }

  if (candidate.routing !== undefined && !isRecord(candidate.routing)) {
    issues.push({ path: "routing", message: `expected a map of slot name to { engine, model }, found ${describe(candidate.routing)}` });
  }
  const table = isRecord(candidate.routing) ? candidate.routing : {};
  for (const [slot, rawTarget] of Object.entries(table)) {
    const path = `routing.${slot}`; // dotted slot names read as the file spells them
    if (!isRecord(rawTarget)) {
      issues.push({ path, message: `expected { engine, model }, found ${describe(rawTarget)}` });
      continue;
    }
    const engine = text(rawTarget.engine);
    if (!engine) {
      issues.push({ path: `${path}.engine`, message: `is empty; expected one of ${engineIds.length ? engineIds.join(", ") : "(no engines configured)"}` });
    } else if (!(engine in engines)) {
      issues.push({
        path: `${path}.engine`,
        message: `${describe(engine)} is not in engines${engineIds.length ? ` — configured: ${engineIds.join(", ")}` : " — engines is empty"}`,
      });
    }
    if (!text(rawTarget.model)) {
      issues.push({ path: `${path}.model`, message: `slot ${slot} names no model` });
    }
  }

  if (runStyle === "single") {
    const block: RoutingConfig = {
      runStyle: "single",
      engines: engines as Record<string, EngineConfig>,
      routing: table as Record<string, RouteTarget>,
    };
    if (!pinnedTarget(block)) {
      issues.push({
        path: engineIds.length === 1 ? `engines.${engineIds[0]}.pinnedModel` : "runStyle",
        message: engineIds.length === 1
          ? 'runStyle "single" needs a model to pin: set this engine\'s pinnedModel or give routing.default a model'
          : 'runStyle "single" pins one model everywhere; name it in routing.default or configure exactly one engine with a pinnedModel',
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Deriving and migrating what exists today
// ---------------------------------------------------------------------------

/**
 * A valid default table from the fields an existing install already has, so an
 * install with no routing block keeps working exactly as it routes now.
 *
 * `runStyle` is "multi" because that is what today's behaviour is: one Ollama
 * daemon from which models swap on demand. Deriving "single" would be inventing a
 * hardware constraint nobody declared — choosing a style is the wizard's job (D3).
 * The engine ids match what `engineDescriptors` produced before this table existed,
 * so the picker's rows and their labels do not change under a user who did not edit
 * anything.
 */
export function deriveRoutingFromProfile(profile: ProfileRoutingSource | null | undefined): RoutingConfig {
  const engines: Record<string, EngineConfig> = {
    ollama: {
      kind: "ollama",
      baseUrl: normaliseBaseUrl(profile?.ollama) || DEFAULT_OLLAMA_BASE_URL,
      label: "Ollama",
    },
  };
  const llamaCpp = normaliseBaseUrl(profile?.llamaCpp);
  if (llamaCpp) engines["llama.cpp"] = { kind: "llama.cpp", baseUrl: llamaCpp, label: "llama.cpp" };

  const model = text(profile?.defaultModel);
  const routing: Record<string, RouteTarget> = {};
  // No default entry rather than one with an empty model: the latter is a
  // validation failure, and a profile that never recorded a model is not one.
  if (model) routing[DEFAULT_SLOT] = { engine: "ollama", model };

  return { runStyle: "multi", engines, routing };
}

/**
 * Give a parsed config the routing block, in `load()`'s path.
 *
 * Unrecognised keys survive because the whole config is copied, not rebuilt — the
 * file holds settings this module has never heard of, and losing one of them to a
 * migration would be a far worse bug than the missing block it fixes. Idempotent:
 * once the block exists it is left alone, so a later hand-edit of `engines` is
 * judged by `validateRouting` instead of overwritten by this.
 */
export function migrateToRouting<T extends Record<string, unknown>>(raw: T): { config: T; changed: boolean } {
  if (readRoutingBlock(raw)) return { config: raw, changed: false };

  const profiles = Array.isArray(raw.profiles) ? (raw.profiles as ProfileRoutingSource[]) : [];
  const active = profiles.find((p) => isRecord(p) && (p as { id?: unknown }).id === raw.activeProfileId) ?? profiles[0];
  const derived = deriveRoutingFromProfile(active);

  return {
    config: { ...raw, runStyle: derived.runStyle, engines: derived.engines, routing: derived.routing } as T,
    changed: true,
  };
}

// ---------------------------------------------------------------------------
// Guided setup (D3): propose a run style, then write the table it implies
// ---------------------------------------------------------------------------

/** The ids this build proposes for the engines it can discover. A stored table that
 * already uses another id for the same kind keeps it — see `deriveRoutingFromSetup`. */
export const DEFAULT_ENGINE_IDS: Record<EngineKind, string> = { ollama: "ollama", "llama.cpp": "llama.cpp" };

/** What the discovery step could see, reduced to the facts a run style depends on.
 * `EngineDiscovery` (engine-discovery.ts) satisfies this structurally; it is declared
 * here rather than imported so this module stays the leaf the renderer and the picker
 * already depend on, and so the rule set can be tested without a probe. */
export interface RunStyleEvidence {
  kind: string;
  running: boolean;
  installed?: "yes" | "inferred" | "unknown";
  models?: readonly string[];
}

export interface RunStyleProposal {
  /** null when the evidence supports neither style, which is a decline rather than a
   * failed answer: the wizard shows both options undecided and asks. A `runStyle` here
   * is read by the UI as a proposal, so nothing may be put in it when nothing is proposed. */
  runStyle: RunStyle | null;
  /** One or two sentences the wizard shows verbatim. Every rule states the evidence
   * it used, because "single" is a promise about what the box cannot do and the user
   * has to be able to disagree with a reason. */
  why: string;
}

/**
 * Propose how this box should run, from what it has and what was found on it.
 *
 * The rules are ordered, and the first match wins:
 *
 * 1. Nothing measurable about VRAM → **no proposal** (`runStyle: null`). An unmeasured
 *    card is not evidence of a small one (`AdapterRAM` used to make exactly that
 *    mistake — see plan D3), and it is not evidence of a large one either: a CPU-only
 *    laptop and a 24 GB card whose counter saturated both land here and want opposite
 *    styles. Nothing distinguishes them from this side of the probe, so proposing
 *    either would be a claim dressed as a disclaimer (plan D3a flaw). Declining is the
 *    answer, and the wizard has to ask.
 * 2. A small card → `single`. One model at a time is the honest shape.
 * 3. Room to hold several models, and more than one thing discovered to run →
 *    `multi`, which is what per-role variety needs.
 * 4. Anything else → `single`.
 *
 * A proposal, never a decision: `SetupWizard` must show this and require the user to
 * confirm or change it (plan C1, no silent default).
 *
 * System RAM is not an input, and used to be in every `why` string while conditioning
 * no rule. What a model has to fit in is video memory; RAM changes how slowly a model
 * runs, not how many fit at once, and quoting a figure that decided nothing made each
 * explanation read as though it had been part of the decision. The wizard still shows
 * the user their RAM as a fact about the machine, where it asks nothing of them.
 */
export function proposeRunStyle(
  gpus: readonly { vramGb: number }[],
  discovered: readonly RunStyleEvidence[],
): RunStyleProposal {
  // A card that reported 0 GB is present but unmeasured, not a 0 GB card. Its memory
  // is left out of the totals rather than counted as zero, which would flatter a
  // measured box and punish an unmeasured one.
  const measured = gpus.filter((gpu) => gpu.vramGb > 0);
  const total = measured.reduce((sum, gpu) => sum + gpu.vramGb, 0);
  const largest = measured.reduce((max, gpu) => Math.max(max, gpu.vramGb), 0);

  if (!measured.length) {
    return {
      runStyle: null,
      why: gpus.length
        ? `The ${gpus.length === 1 ? "graphics card" : `${gpus.length} graphics cards`} reported no usable memory, so video memory could not be measured and this step claims nothing about what fits in it: no run style is proposed. An unmeasured card is not a small one — choose below, on what you know about this box.`
        : `No graphics card was found, so video memory could not be measured and this step claims nothing about it: no run style is proposed. If this box holds models in system RAM, or the probe cannot see its card, the choice below is yours to make.`,
    };
  }

  if (largest < 10 && total < 16) {
    return {
      runStyle: "single",
      why: `${gb(largest)} GB on the largest card and ${gb(total)} GB across ${gpus.length === 1 ? "one card" : `${gpus.length} cards`} will not hold two models at once, so Memex pins one model and serves it everywhere instead of swapping on demand.`,
    };
  }

  const engines = discovered.filter((d) => d.running || d.installed === "yes" || d.installed === "inferred").length;
  // Only a running engine can report an inventory, so a stopped Ollama contributes a
  // lane it has and no models it might have.
  const models = discovered.reduce((sum, d) => sum + (d.running ? (d.models?.length ?? 0) : 0), 0);
  // A model list lives inside its engine, so these are not summed: what matters is
  // whether there is more than one thing this box could serve.
  const swapCandidates = Math.max(engines, models);

  if ((total >= 24 || gpus.length >= 2) && swapCandidates > 1) {
    const room = gpus.length === 1
      ? `${gb(total)} GB on one card`
      : `${gpus.length} cards totalling ${gb(total)} GB`;
    return {
      runStyle: "multi",
      why: `${room} and ${swapCandidates} model${swapCandidates === 1 ? "" : "s"} across ${engines} engine${engines === 1 ? "" : "s"} discovered — enough to hold more than one, so each role can get its own model and Ollama loads and evicts them on demand.`,
    };
  }

  return {
    runStyle: "single",
    why: `${gpus.length === 1 ? `One card with ${gb(largest)} GB` : `${gpus.length} cards totalling ${gb(total)} GB`} and ${swapCandidates} thing${swapCandidates === 1 ? "" : "s"} discovered to swap between: one pinned model is the honest shape here, so Memex will not promise per-role model changes.`,
  };
}

/** One engine the setup step wants in the table, as discovery and the Advanced panel
 * produced it — an `EngineConfig` with no pin decided yet. */
export interface SetupRoutingInput {
  runStyle: RunStyle;
  /** Keyed by the ids this build proposes (`DEFAULT_ENGINE_IDS`). */
  engines: Record<string, EngineConfig>;
  /** The confirmed selection. Without both halves nothing is written to
   * `routing.default` — an invented default is the silent substitution this module
   * exists to prevent. */
  selection?: Partial<RouteTarget> | null;
  /** The table already stored, so a hand-written slot survives running the wizard
   * again (Settings can re-open it via `requireWizard()`). */
  existing?: RoutingConfig | null;
}

/**
 * The table the wizard writes for a confirmed setup (D3 requirement 4).
 *
 * Three things happen at once and all three are load-bearing:
 *
 * - The proposed engine id is re-used from the stored table where the mapping is
 *   unambiguous. Slots name engines by id, so rewriting `ollama-local` as `ollama`
 *   would leave every hand-written slot pointing at an engine the new table does not
 *   have — the write would be refused, and the user's own edits would be the reason.
 * - Hand-written slots are carried over untouched; only `default` is replaced.
 * - In `single` the pin moves with the selection, because `flattenForRunStyle`
 *   resolves every slot onto the pin and would otherwise override this choice under
 *   a different name (the same trap D2 recorded for the picker).
 */
export function deriveRoutingFromSetup(input: SetupRoutingInput): RoutingConfig {
  const existing = input.existing ?? null;
  const existingEngines = existing?.engines ?? {};
  // Start from what the file already has. This step adds and updates the engines it
  // could see; it does not delete lanes it never looked for, because a hand-edited
  // table can hold engines discovery cannot reach and the slots that name them.
  const engines: Record<string, EngineConfig> = { ...existingEngines };
  const idOf = new Map<string, string>();

  for (const [proposedId, candidate] of Object.entries(input.engines ?? {})) {
    const baseUrl = normaliseBaseUrl(candidate?.baseUrl);
    if (!candidate || !baseUrl) continue; // an engine with no address is a half-filled form, not a lane
    const priorId = proposedId in existingEngines ? proposedId : soleEngineIdOfKind(existing, candidate.kind);
    const prior = priorId ? existingEngines[priorId] : undefined;
    const entry: EngineConfig = { kind: candidate.kind, baseUrl };
    const label = text(candidate.label) || text(prior?.label);
    if (label) entry.label = label;
    const carriedPin = text(prior?.pinnedModel);
    if (carriedPin) entry.pinnedModel = carriedPin;
    const id = priorId ?? proposedId;
    engines[id] = entry;
    idOf.set(proposedId, id);
  }

  const routing: Record<string, RouteTarget> = { ...(existing?.routing ?? {}) };
  const chosenEngine = text(input.selection?.engine);
  const engine = idOf.get(chosenEngine) ?? chosenEngine;
  const model = text(input.selection?.model);
  if (engine && model && engine in engines) {
    routing[DEFAULT_SLOT] = { engine, model };
    if (input.runStyle === "single") engines[engine] = { ...engines[engine], pinnedModel: model };
  }

  return { runStyle: input.runStyle, engines, routing };
}

/** The stored id for a kind, when the file holds exactly one — otherwise null,
 * because two engines of a kind is the file knowing something this step does not. */
function soleEngineIdOfKind(existing: RoutingConfig | null, kind: EngineKind): string | null {
  const ids = Object.entries(existing?.engines ?? {}).filter(([, engine]) => engine?.kind === kind).map(([id]) => id);
  return ids.length === 1 ? ids[0]! : null;
}

// ---------------------------------------------------------------------------
// The runtime's roles, and the desktop rows that assign them (owner decision 4)
// ---------------------------------------------------------------------------

/**
 * The seven Team Builder roles, in the runtime's own spelling and its own order —
 * `Memex_Core`'s `_SWARM_ROLES`. These are the things a model gets assigned *to*.
 * The desktop's slots are a different and smaller set, which is the whole reason
 * this list exists separately: decision 4 names the map after the roles, not the
 * slots, because "a map keyed by the slot names would be accepted by a permissive
 * server and bound to nothing".
 */
export type RuneRole =
  | "coordinator" | "architect" | "coder" | "devops" | "researcher" | "analyst" | "verifier";

export const RUNE_ROLES: readonly RuneRole[] = [
  "coordinator", "architect", "coder", "devops", "researcher", "analyst", "verifier",
];

/**
 * The variable that decides each role's model, spelled the way the runtime spells it
 * *today*, on the machine that hosts the runtime.
 *
 * Not the proposed spelling: a patch suggested renaming `CODER_MODEL` and
 * `DEVOPS_MODEL` to `SWARM_*`, and until that happens in `Memex_Core` a row showing
 * `SWARM_CODER_MODEL` would name a variable nothing reads. The proposed names are
 * absent from this table rather than shown as an alias, so what the UI prints is
 * what an operator has to set.
 *
 * `ARCHITECT_MODEL` — unsuffixed — is a separate live variable answering a different
 * code path, and it is **not** `architect`'s binding. It is deliberately not in this
 * map: treating it as the architect's would let the UI report an assignment the
 * architect worker never receives.
 */
export const RUNE_ROLE_ENV: Record<RuneRole, string> = {
  coordinator: "SWARM_COORDINATOR_MODEL",
  architect: "SWARM_ARCHITECT_MODEL",
  coder: "CODER_MODEL",
  devops: "DEVOPS_MODEL",
  researcher: "RESEARCHER_MODEL",
  analyst: "ANALYST_MODEL",
  verifier: "VERIFIER_MODEL",
};

/** One row of the assignment editor: a `routing` slot, plus what it means out there. */
export interface RoutingRow {
  /** The key written inside `routing`. Slots are open-ended by design (D2), so this
   * is a slot name, and the two collisions below are where a slot is *also* a role. */
  key: string;
  /** What the user reads beside the control — the role's name, not the slot's. */
  label: string;
  /** The runtime role this row assigns; null for a slot that is not a role at all. */
  role: RuneRole | null;
  /** The runtime variable this row's value answers, where it has one. */
  env: string | null;
  /** False when no per-role map carries this row to a runtime role. The row still
   * binds something real (an embedding engine answers `EMBED_MODEL`), but it binds no
   * role, so the editor must not present it as though it did. */
  perRoleBindable: boolean;
  /** Said in the row itself, because both collisions below are places where renaming
   * the slot would have hidden what the user is actually changing. */
  note: string | null;
}

/**
 * The rows the assignment editor shows, in the order it shows them: `default`, then
 * the five roles that have no desktop slot of their own, then the slots that *are*
 * roles under a different name, then `embedding`.
 *
 * Two of these names collide with a role and are not renames:
 *
 * - `collective.coordinator` **is** `coordinator` — the same role, one row. It is
 *   listed under the slot the file already uses rather than given a second row keyed
 *   `coordinator`, which would put two answers to one question on screen.
 * - `code` is *not* merely "the coding slot": the runtime reads `CODER_MODEL` for the
 *   DevHarness primary as well as for the swarm coder, so assigning `code` genuinely
 *   changes both at once. The rename this row might have had (`coder`) would have
 *   made that shared effect invisible, which is why the row keeps the slot name and
 *   states the coupling.
 *
 * `collective.critic` is excluded from this list — see `UNPRESENTED_ROWS`.
 */
export const ROUTING_ROWS: readonly RoutingRow[] = [
  {
    key: DEFAULT_SLOT, label: "Everything else", role: null, env: null, perRoleBindable: false,
    note: "The slot this desktop falls back to for anything it has no row for. A role left unassigned here is still decided by the runtime host, not by this file.",
  },
  ...(["architect", "devops", "researcher", "analyst", "verifier"] as const).map<RoutingRow>((role) => ({
    key: role, label: role, role, env: RUNE_ROLE_ENV[role], perRoleBindable: true,
    // Said plainly because it is the load-bearing fact about these five rows: they are
    // new, and nothing in `routing` held them before this editor existed.
    note: `No desktop slot has ever written this — until the runtime accepts a client-supplied map, ${role} keeps reading ${RUNE_ROLE_ENV[role]} on its own host.`,
  })),
  {
    key: "code", label: "Coder", role: "coder", env: RUNE_ROLE_ENV.coder, perRoleBindable: true,
    note: "Shared name, shared effect: the runtime reads CODER_MODEL for the DevHarness primary too, so this row changes both.",
  },
  {
    key: "collective.coordinator", label: "Coordinator", role: "coordinator", env: RUNE_ROLE_ENV.coordinator, perRoleBindable: true,
    note: "The desktop's slot for the coordinator role — the same role as `coordinator`, listed once.",
  },
  {
    key: "embedding", label: "Embeddings", role: null, env: "EMBED_MODEL", perRoleBindable: false,
    note: "Not a role. MemPalace's embedder reads EMBED_MODEL; this row changes it and nothing else.",
  },
];

/**
 * Slots that bind something real but get no row. `collective.critic` is here rather
 * than deleted from the vocabulary: the critic loop is not one of the seven Pioneer
 * roles, and `SWARM_EVALUATOR_MODEL` is the variable that answers it. A row for it
 * would imply an assignment that binds no role, so the editor does not offer one —
 * and `deriveRoutingFromSetup` still carries a hand-written critic slot through
 * untouched, because the file is allowed to say more than this UI can ask.
 */
export const UNPRESENTED_ROWS: readonly RoutingRow[] = [
  {
    key: "collective.critic", label: "Critic", role: null, env: "SWARM_EVALUATOR_MODEL", perRoleBindable: false,
    note: "The Collective's critic loop is not a Team Builder role; SWARM_EVALUATOR_MODEL answers it and the role map does not.",
  },
];

/**
 * What a row actually resolves to, and **which slot answered**.
 *
 * `via` is the entry that supplied the target, not the entry that was asked for, so a
 * row showing `routing.default`'s model can say it is falling back instead of
 * presenting another lane's model as though someone had chosen it for this role.
 * Both fields are null when nothing answers at all — an empty table with no
 * `default` — which is "unassigned", not "falling back".
 */
export function roleTarget(
  routing: RoutingConfig | null | undefined,
  rowKey: string,
): { engine: string | null; model: string | null; via: string | null; usedFallback: boolean } {
  const route = resolveRoute(routing, rowKey);
  return {
    engine: route.target?.engine ?? null,
    model: route.target?.model ?? null,
    via: route.slot,
    usedFallback: route.usedFallback,
  };
}

// ---------------------------------------------------------------------------
// Small readers — a hand-edited file gets judged on what it actually contains
// ---------------------------------------------------------------------------

/** Trims and drops trailing slashes, so `http://host:11434/` is one address. */
function normaliseBaseUrl(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/\/+$/, "");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Rounded the way a sentence about hardware reads: 15.93 GB is 15.9 GB, not 15.9296875. */
function gb(value: number): string {
  return String(Math.round((Number.isFinite(value) ? value : 0) * 10) / 10);
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Quoted so `"ollma-local"` reads as a typo for `ollama-local`, not as nothing. */
function describe(value: unknown): string {
  if (value === undefined) return "(absent)";
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || typeof value !== "object") return String(value);
  return Array.isArray(value) ? "an array" : "an object";
}
